// controllers/portfolioController.js
const { sql, config } = require('../config/database');

const calculatePortfolioValues = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: 'userId is verplicht.' });
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(endDate.getMonth() - 12);

    const query = `
      DECLARE @start_date DATE = @startDate;
      DECLARE @end_date DATE = @endDate;
      DECLARE @user_id INT = @userId;

      DELETE FROM DailyPortfolioValue
      WHERE user_id = @user_id AND date < @start_date;

      WITH DailyDates AS (
        SELECT DISTINCT date
        FROM DailyClosingPrices
        WHERE date BETWEEN @start_date AND @end_date
      ),
      DailyPortfolioValue AS (
        SELECT
          d.date,
          SUM(lt.total_quantity * lcp.closing_price) AS total_value
        FROM DailyDates d
        CROSS APPLY (
          SELECT
            pt.aandeel_id,
            pt.total_quantity,
            ROW_NUMBER() OVER (PARTITION BY pt.aandeel_id ORDER BY pt.purchase_time DESC) AS rn
          FROM
            PF_transactions pt
          WHERE
            pt.purchase_time <= DATEADD(DAY, 1, d.date) AND pt.user_id = @user_id
        ) lt
        CROSS APPLY (
          SELECT
            dcp.aandeel_id,
            dcp.closing_price,
            ROW_NUMBER() OVER (PARTITION BY dcp.aandeel_id ORDER BY dcp.date DESC) AS rn
          FROM
            DailyClosingPrices dcp
          WHERE
            dcp.date = d.date
        ) lcp
        WHERE
          lt.aandeel_id = lcp.aandeel_id AND
          lt.rn = 1 AND
          lcp.rn = 1
        GROUP BY d.date
      )
      SELECT date, ISNULL(total_value, 0) AS total_value
      FROM DailyPortfolioValue
      ORDER BY date
      OPTION (MAXRECURSION 0);
    `;

    const pool = await sql.connect(config);
    const request = pool.request();
    request.input('startDate', sql.Date, startDate);
    request.input('endDate', sql.Date, endDate);
    request.input('userId', sql.Int, userId);

    const result = await request.query(query);
    const dailyValues = result.recordset;

    for (const record of dailyValues) {
      await pool.request()
        .input('user_id', sql.Int, userId)
        .input('date', sql.Date, record.date)
        .input('total_value', sql.Decimal(18, 2), record.total_value)
        .query(`
          MERGE INTO DailyPortfolioValue AS target
          USING (SELECT @user_id AS user_id, @date AS date, @total_value AS total_value) AS source
          ON target.date = source.date AND target.user_id = source.user_id
          WHEN MATCHED THEN UPDATE SET total_value = source.total_value
          WHEN NOT MATCHED THEN INSERT (user_id, date, total_value) VALUES (source.user_id, source.date, source.total_value);
        `);
    }

    res.status(200).json({ message: 'Portfolio waarden succesvol bijgewerkt.' });
  } catch (error) {
    console.error('Fout bij het berekenen van portfolio waarden:', error);
    res.status(500).json({ message: 'Serverfout bij het berekenen van portfolio waarden.' });
  }
};

const getPortfolioValues = async (req, res) => {
  try {
    const { userId, period } = req.query;
    const currentTime = new Date();

    const monthsMap = {
      "1M": 1,
      "3M": 3,
      "6M": 6,
      "1Y": 12,
      "2Y": 24,
      "5Y": 60,
    };

    const startDate = new Date();
    if (period && period !== "All") {
      startDate.setMonth(currentTime.getMonth() - monthsMap[period]);
    } else {
      startDate.setFullYear(1970); // Alle data
    }

    const query = `
      SELECT date, total_value
      FROM DailyPortfolioValue
      WHERE user_id = @userId AND date >= @startDate
      ORDER BY date ASC
    `;

    const pool = await sql.connect(config);
    const request = pool.request();
    request.input('userId', sql.Int, userId);
    request.input('startDate', sql.Date, startDate);

    const result = await request.query(query);
    res.status(200).json(result.recordset);
  } catch (error) {
    console.error("Fout bij het ophalen van portfolio waarden:", error);
    res.status(500).json({ message: "Serverfout bij het ophalen van portfolio waarden." });
  }
};

const calculateReturns = async (req, res) => {
  try {
    const userId = 1; // Haal dit uit een sessie of JWT
    const { period } = req.query;

    let dateFilter;
    switch (period) {
      case '1M': dateFilter = new Date(); dateFilter.setMonth(dateFilter.getMonth() - 1); break;
      case '3M': dateFilter = new Date(); dateFilter.setMonth(dateFilter.getMonth() - 3); break;
      case '6M': dateFilter = new Date(); dateFilter.setMonth(dateFilter.getMonth() - 6); break;
      case '1Y': dateFilter = new Date(); dateFilter.setFullYear(dateFilter.getFullYear() - 1); break;
      case '2Y': dateFilter = new Date(); dateFilter.setFullYear(dateFilter.getFullYear() - 2); break;
      case '5Y': dateFilter = new Date(); dateFilter.setFullYear(dateFilter.getFullYear() - 5); break;
      case 'All': default: dateFilter = null; break;
    }

    const pool = await sql.connect(config);
    const request = pool.request();
    request.input('userId', sql.Int, userId);
    if (dateFilter) {
      request.input('dateFilter', sql.Date, dateFilter);
    }

    const query = `
      WITH TransactionsPerDate AS (
        SELECT
          CONVERT(DATE, t.purchase_time) AS transaction_date,
          SUM(CASE
            WHEN t.transaction_type = 1 THEN t.quantity * t.purchase_price
            WHEN t.transaction_type = 0 THEN -t.quantity * t.purchase_price
            ELSE 0
          END) AS total_transaction_value
        FROM PF_transactions t
        WHERE t.user_id = @userId
        ${dateFilter ? 'AND t.purchase_time >= @dateFilter' : ''}
        GROUP BY CONVERT(DATE, t.purchase_time)
      ),
      DailyReturns AS (
        SELECT
          dpv.date,
          dpv.total_value,
          ISNULL(tpd.total_transaction_value, 0) AS total_transaction_value,
          LAG(dpv.total_value) OVER (PARTITION BY dpv.user_id ORDER BY dpv.date) AS previous_total_value,
          CASE
            WHEN LAG(dpv.total_value) OVER (PARTITION BY dpv.user_id ORDER BY dpv.date) IS NULL THEN 1
            ELSE (dpv.total_value - ISNULL(tpd.total_transaction_value, 0)) /
                 LAG(dpv.total_value) OVER (PARTITION BY dpv.user_id ORDER BY dpv.date)
          END AS return_value
        FROM DailyPortfolioValue dpv
        LEFT JOIN TransactionsPerDate tpd
        ON dpv.date = tpd.transaction_date
        WHERE dpv.user_id = @userId
        ${dateFilter ? 'AND dpv.date >= @dateFilter' : ''}
      ),
      CumulativeReturns AS (
        SELECT
          date,
          total_value,
          total_transaction_value,
          previous_total_value,
          return_value,
          EXP(SUM(LOG(return_value)) OVER (PARTITION BY 1 ORDER BY date)) AS return_value_cumulative
        FROM DailyReturns
      )
      SELECT *
      FROM CumulativeReturns
      ORDER BY date ASC;
    `;

    const result = await request.query(query);
    const calculatedReturns = result.recordset;
    res.status(200).json({ calculatedReturns });
  } catch (error) {
    console.error('Fout bij het berekenen van rendement:', error);
    res.status(500).json({ message: 'Serverfout bij het berekenen van rendement.' });
  }
};

const getPortfolioReturns = async (req, res) => {
  try {
    const { userId } = req.query;
    const pool = await sql.connect(config);

    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT date, return_value
        FROM DailyPortfolioValue
        WHERE user_id = @userId
        ORDER BY date ASC;
      `);

    res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Fout bij het ophalen van rendementen:', error);
    res.status(500).json({ message: 'Fout bij het ophalen van rendementen.' });
  }
};

module.exports = {
  calculatePortfolioValues,
  getPortfolioValues,
  calculateReturns,
  getPortfolioReturns,
};
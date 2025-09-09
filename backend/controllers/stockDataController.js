// controllers/stockDataController.js
const { sql } = require('../config/database');

const getTickersInDb = async (req, res) => {
  try {
    const result = await sql.query('SELECT DISTINCT ticker FROM aandelen_data_ ORDER BY ticker ASC');
    return res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Fout bij het ophalen van tickers in DB:', error);
    res.status(500).json({ message: 'Serverfout bij het ophalen van tickers.' });
  }
};

const getTickers2 = async (req, res) => {
  try {
    const result = await sql.query('SELECT DISTINCT ticker FROM [dbo].[aandelen_data_]');
    const tickers = result.recordset;
    res.json({ tickers });
  } catch (error) {
    console.error('Fout bij ophalen van tickers:', error);
    res.status(500).json({ message: 'Serverfout bij het ophalen van tickers.' });
  }
};

const getTickersWithDataCheck = async (req, res) => {
  try {
    const { dataPeriods } = req.body;

    const stocksResult = await sql.query(`SELECT aandeel_id, ticker_symbol FROM Stocks`);
    const stocks = stocksResult.recordset;

    if (!stocks || stocks.length === 0) {
      return res.status(404).json({ message: "Geen tickers gevonden" });
    }

    let tickerData = [];

    for (const stock of stocks) {
      let totalCount = 0;

      for (const [datatype, months] of Object.entries(dataPeriods)) {
        const countResult = await new sql.Request()
          .input("stock_id", sql.Int, stock.aandeel_id)
          .input("data_type", sql.NVarChar, datatype)
          .input("months", sql.Int, months)
          .query(`
            SELECT COUNT(*) as count
            FROM fundamental_data
            WHERE stock_id = @stock_id
            AND data_type = @data_type
            AND period_end_date >= DATEADD(MONTH, -@months, GETDATE())`
          );

        totalCount += countResult.recordset[0]?.count || 0;
      }

      // **Fast Check 1: NetCashProvidedByUsedInOperatingActivities - PurchasesOfPropertyAndEquipment**
      const fastCheck1Result = await new sql.Request()
        .input("stock_id", sql.Int, stock.aandeel_id)
        .query(`
          SELECT TOP 1 
            period_end_date,
            (SELECT value FROM fundamental_data WHERE stock_id = @stock_id AND data_type = 'NetCashProvidedByUsedInOperatingActivities' AND period_end_date = fd.period_end_date) AS cashFlow,
            (SELECT value FROM fundamental_data WHERE stock_id = @stock_id AND data_type = 'PurchasesOfPropertyAndEquipment' AND period_end_date = fd.period_end_date) AS capex
          FROM fundamental_data fd
          WHERE stock_id = @stock_id AND form_id = 1
          ORDER BY period_end_date DESC`
        );

      let fastCheck1 = "❌";
      let lastNegativeDate = "N/A";
      if (fastCheck1Result.recordset.length > 0) {
        const { period_end_date, cashFlow, capex } = fastCheck1Result.recordset[0];
        if (cashFlow - capex > 0) {
          fastCheck1 = "✔️";
        } else {
          lastNegativeDate = period_end_date.toISOString().split("T")[0];
        }
      }

      // **Fast Check 2: (Liabilities - LiabilitiesCurrent) / StockholdersEquity**
      const fastCheck2Result = await new sql.Request()
        .input("stock_id", sql.Int, stock.aandeel_id)
        .query(`
          SELECT 
            fd.period_end_date,
            MAX(CASE WHEN fd.data_type = 'Liabilities' THEN fd.value END) AS Liabilities,
            MAX(CASE WHEN fd.data_type = 'LiabilitiesCurrent' THEN fd.value END) AS LiabilitiesCurrent,
            MAX(CASE WHEN fd.data_type = 'StockholdersEquity' THEN fd.value END) AS StockholdersEquity,
            (MAX(CASE WHEN fd.data_type = 'Liabilities' THEN fd.value END) - 
            MAX(CASE WHEN fd.data_type = 'LiabilitiesCurrent' THEN fd.value END)) /
            NULLIF(MAX(CASE WHEN fd.data_type = 'StockholdersEquity' THEN fd.value END), 0) AS ratio
          FROM fundamental_data fd
          WHERE fd.stock_id = @stock_id
          AND fd.data_type IN ('Liabilities', 'LiabilitiesCurrent', 'StockholdersEquity')
          AND fd.period_end_date >= DATEADD(MONTH, -3, GETDATE())
          GROUP BY fd.period_end_date
          ORDER BY fd.period_end_date DESC`
        );

      let fastCheck2 = "Niet beschikbaar";
      let fastCheck2Value = "N/A";
      if (fastCheck2Result.recordset.length > 0) {
        const { ratio } = fastCheck2Result.recordset[0];
        fastCheck2 = ratio < 0.5 ? "✔️" : "❌";
        fastCheck2Value = ratio ? ratio.toFixed(2) : "N/A";
      }

      tickerData.push({
        ticker: stock.ticker_symbol,
        count: totalCount,
        fastCheck1,
        lastNegativeDate,
        fastCheck2,
        fastCheck2Value,
      });
    }

    res.json(tickerData);
  } catch (error) {
    console.error("❌ Fout bij ophalen van tickers:", error);
    res.status(500).send("Server error");
  }
};

const getTickerDataDetails = async (req, res) => {
  try {
    const { ticker } = req.params;

    const stockResult = await new sql.Request()
      .input("ticker", sql.NVarChar, ticker)
      .query(`SELECT aandeel_id FROM Stocks WHERE ticker_symbol = @ticker`);

    const stock = stockResult.recordset;

    if (stock.length === 0) {
      return res.status(404).send("Ticker niet gevonden");
    }

    const stockId = stock[0].aandeel_id;

    const dataResult = await new sql.Request()
      .input("stock_id", sql.Int, stockId)
      .query(`
        SELECT period_end_date, form_id, data_type, value
        FROM fundamental_data
        WHERE stock_id = @stock_id
        ORDER BY period_end_date DESC`
      );

    res.json(dataResult.recordset);
  } catch (error) {
    console.error("❌ Fout bij ophalen van ticker data:", error);
    res.status(500).send("Server error");
  }
};

const getLastQuarterData = async (req, res) => {
  const { ticker } = req.params;
  try {
    const request = new sql.Request();
    request.input('ticker', sql.VarChar, ticker);

    const result = await request.query(`
      SELECT TOP 1 * FROM [dbo].[aandelen_data_] 
      WHERE ticker = @ticker 
      ORDER BY period_end_date DESC
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Geen gegevens gevonden voor de opgegeven ticker.' });
    }

    const lastQuarter = result.recordset[0];
    res.json({ lastQuarter });
  } catch (error) {
    console.error('Fout bij ophalen van laatste kwartaal:', error);
    res.status(500).json({ message: 'Serverfout bij het ophalen van het laatste kwartaal.' });
  }
};

const getLatestDataForAllTickers = async (req, res) => {
  try {
    const query = `
      WITH LatestData AS (
        SELECT
          *,
          ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY period_end_date DESC) AS rn
        FROM 
          aandelen_data_
      ),
      NextEarnings AS (
        SELECT 
          ticker, 
          reportDate, 
          fiscalDateEnding,
          ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY reportDate ASC) AS rn
        FROM 
          earningsCalender
        WHERE 
          reportDate > DATEADD(day, -7, GETDATE()) -- Zorg ervoor dat de reportDate maximaal een week geleden is of in de toekomst ligt
      )
      SELECT
        l.ticker,
        l.period_start_date,
        l.period_end_date,
        e.reportDate AS next_report_date,
        e.fiscalDateEnding,
        l.LiabilitiesCurrent,
        l.Liabilities,
        l.StockholdersEquity,
        l.NetIncomeLoss,
        l.NetCashProvidedByUsedInOperatingActivities,
        l.PurchasesOfPropertyAndEquipment,
        l.Revenues,
        l.WeightedAverageNumberOfDilutedSharesOutstanding,
        l.Dividend
      FROM
        LatestData l
      LEFT JOIN
        NextEarnings e ON l.ticker = e.ticker AND e.rn = 1
      WHERE
        l.rn = 1
      ORDER BY
        e.reportDate;
    `;

    const result = await sql.query(query);
    res.json(result.recordset);
  } catch (error) {
    console.error("❌ Fout bij ophalen van laatste data:", error);
    res.status(500).json({ message: "Serverfout bij het ophalen van de laatste data." });
  }
};

module.exports = {
  getTickersInDb,
  getTickers2,
  getTickersWithDataCheck }
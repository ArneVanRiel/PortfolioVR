const sql = require('mssql');
const dbConfig = require('../config/database');

exports.getAllAlerts = async (req, res) => {
    const { stockId, type, ticker, page = 1, limit = 10 } = req.query;

    try {
        const pool = await sql.connect(dbConfig);
        const request = pool.request();
        
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const offset = (pageNum - 1) * limitNum;

        let whereClauses = [];
        if (stockId) {
            whereClauses.push('s.aandeel_id = @stockId');
            request.input('stockId', sql.Int, stockId);
        }
        if (ticker) {
            whereClauses.push("s.ticker_symbol LIKE @ticker");
            request.input('ticker', sql.VarChar, `%${ticker}%`);
        }
        if (type) {
            whereClauses.push('a.type_melding = @type');
            request.input('type', sql.VarChar, type);
        }

        const whereCondition = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Query to get total count with filters
        const countQuery = `
            SELECT COUNT(*) as total
            FROM MACDAlerts a
            JOIN stocks s ON a.aandeel_id = s.aandeel_id
            ${whereCondition}
        `;
        const countResult = await request.query(countQuery);
        const totalCount = countResult.recordset[0].total;

        // Query to get paginated data
        const dataQuery = `
            WITH NumberedRows AS (
                SELECT
                    a.alert_id, a.aandeel_id, s.name, s.ticker_symbol, a.date,
                    a.type_melding, a.status, a.prijs_op_moment, a.signal_line_value, a.trade_amount,
                    (CurrentCalc.waarde_verdeling - PrevCalc.waarde_verdeling) / NULLIF(PrevCalc.waarde_verdeling, 0) as diff_percentage,
                    ROW_NUMBER() OVER (ORDER BY a.date DESC) as row_num
                FROM
                    MACDAlerts a
                JOIN
                    stocks s ON a.aandeel_id = s.aandeel_id
                OUTER APPLY (
                    SELECT TOP 1 sc.waarde_verdeling, sc.period_end_date
                    FROM stock_calculations sc
                    WHERE sc.stock_id = a.aandeel_id AND sc.period_end_date <= a.date
                    ORDER BY sc.period_end_date DESC
                ) as CurrentCalc
                OUTER APPLY (
                    SELECT TOP 1 sc_prev.waarde_verdeling
                    FROM stock_calculations sc_prev
                    WHERE sc_prev.stock_id = a.aandeel_id AND sc_prev.period_end_date < CurrentCalc.period_end_date
                    ORDER BY sc_prev.period_end_date DESC
                ) as PrevCalc
                ${whereCondition}
            )
            SELECT alert_id, aandeel_id, name, ticker_symbol, date, type_melding, status, prijs_op_moment, signal_line_value, trade_amount, diff_percentage
            FROM NumberedRows
            WHERE row_num > ${offset} AND row_num <= ${offset + limitNum};
        `;
        
        // Re-using the same request object is fine as long as the parameters are not cleared and are needed for both queries.
        const dataResult = await request.query(dataQuery);

        res.status(200).json({
            alerts: dataResult.recordset,
            totalCount,
            totalPages: Math.ceil(totalCount / limitNum),
            currentPage: pageNum
        });
    } catch (error) {
        console.error('Error fetching alerts:', error);
        res.status(500).send('Error fetching alerts.');
    }
};

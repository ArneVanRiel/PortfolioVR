const sql = require('mssql');
const dbConfig = require('../config/database');

// This is a placeholder for the calculation logic.
// It will be implemented in the next steps.
async function performCalculations(stockId, periodEndDate = null) {
    // TODO:
    // 1. Fetch fundamental data for the stockId for the given periodEndDate
    // 2. Fetch price data for the stock
    // 3. Pivot the data
    // 4. Implement all calculations from the python script
    // 5. Return the results

    console.log(`Performing calculations for stockId: ${stockId} for period: ${periodEndDate}`);

    // Placeholder result
    const result = {
        stock_id: stockId,
        calculation_date: new Date(),
        period_end_date: periodEndDate ? new Date(periodEndDate) : new Date(), // This should be the latest period_end_date from the data
        gem_groeipercentage_FCF: 0.12, // Changed value to show update
        standaard_deviatie_FCF: 0.06,
        waardefactor_FCF: 2.1,
        gemiddelde_stijging_ROE_10_Y: 0.16,
        standaard_deviatie_ROE: 0.09,
        waardefactor_ROE: 1.6,
        waardefactor_LTD_equity: 0.9,
        intrinsieke_waarde: 110,
        selectiecriteria: 6,
        waarde_verdeling: 11,
        koopmarge: -0.15
    };

    return result;
}


exports.getCalculationsForStock = async (req, res) => {
    const { stockId } = req.params;

    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('stockId', sql.Int, stockId)
            .query('SELECT * FROM stock_calculations WHERE stock_id = @stockId ORDER BY period_end_date DESC');

        res.status(200).json(result.recordset);
    } catch (error) {
        console.error('Error fetching calculations:', error);
        res.status(500).send('Error fetching calculations.');
    }
};

exports.runCalculationForStock = async (req, res) => {
    const { stockId } = req.params;
    const { period_end_date } = req.body; // Extract period_end_date from request body

    try {
        // Perform the complex calculations, passing the specific period_end_date if provided
        const calculationResult = await performCalculations(stockId, period_end_date);

        // Save the result to the database (Upsert logic)
        const pool = await sql.connect(dbConfig);

        // Check if a calculation for this stock and period already exists
        const existingRecord = await pool.request()
            .input('stock_id', sql.Int, stockId)
            .input('period_end_date', sql.Date, calculationResult.period_end_date)
            .query('SELECT id FROM stock_calculations WHERE stock_id = @stock_id AND period_end_date = @period_end_date');

        const request = pool.request();
        Object.keys(calculationResult).forEach(key => {
            if (key.includes('date')) {
                request.input(key, sql.DateTime, calculationResult[key]);
            } else if (Number.isInteger(calculationResult[key])) {
                request.input(key, sql.Int, calculationResult[key]);
            } else {
                request.input(key, sql.Decimal(18, 4), calculationResult[key]);
            }
        });

        let query;
        if (existingRecord.recordset.length > 0) {
            // UPDATE existing record
            const updateId = existingRecord.recordset[0].id;
            request.input('id', sql.Int, updateId);
            const setClauses = Object.keys(calculationResult).map(key => `${key} = @${key}`).join(', ');
            query = `UPDATE stock_calculations SET ${setClauses}, updated_at = GETDATE() WHERE id = @id`;
        } else {
            // INSERT new record
            const columns = Object.keys(calculationResult).join(', ');
            const values = Object.keys(calculationResult).map(key => `@${key}`).join(', ');
            query = `INSERT INTO stock_calculations (${columns}) VALUES (${values})`;
        }

        await request.query(query);

        res.status(201).json({ message: 'Calculation successful and data saved.', data: calculationResult });

    } catch (error) {
        console.error('Error running calculation:', error);
        res.status(500).send('Error running calculation.');
    }
};

const sql = require('mssql');
const dbConfig = require('../config/database');

// This is a placeholder for the calculation logic.
// It will be implemented in the next steps.
async function performCalculations(stockId) {
    // TODO:
    // 1. Fetch fundamental data for the stockId
    // 2. Fetch price data for the stock
    // 3. Pivot the data
    // 4. Implement all calculations from the python script
    // 5. Return the results

    console.log(`Performing calculations for stockId: ${stockId}`);

    // Placeholder result
    const result = {
        stock_id: stockId,
        calculation_date: new Date(),
        period_end_date: new Date(), // This should be the latest period_end_date from the data
        gem_groeipercentage_FCF: 0.1,
        standaard_deviatie_FCF: 0.05,
        waardefactor_FCF: 2,
        gemiddelde_stijging_ROE_10_Y: 0.15,
        standaard_deviatie_ROE: 0.08,
        waardefactor_ROE: 1.5,
        waardefactor_LTD_equity: 0.8,
        intrinsieke_waarde: 100,
        selectiecriteria: 5,
        waarde_verdeling: 10,
        koopmarge: -0.2
    };

    return result;
}


exports.runCalculationForStock = async (req, res) => {
    const { stockId } = req.params;

    try {
        // Perform the complex calculations
        const calculationResult = await performCalculations(stockId);

        // Save the result to the database
        const pool = await sql.connect(dbConfig);
        const request = pool.request();

        // Add all parameters
        Object.keys(calculationResult).forEach(key => {
            // Note: The types might need adjustment based on the actual data
            if (key.includes('date')) {
                request.input(key, sql.DateTime, calculationResult[key]);
            } else if (Number.isInteger(calculationResult[key])) {
                request.input(key, sql.Int, calculationResult[key]);
            } else {
                request.input(key, sql.Decimal(18, 4), calculationResult[key]);
            }
        });
        
        // Construct the dynamic query
        const columns = Object.keys(calculationResult).join(', ');
        const values = Object.keys(calculationResult).map(key => `@${key}`).join(', ');

        const query = `INSERT INTO stock_calculations (${columns}) VALUES (${values})`;

        await request.query(query);

        res.status(201).json({ message: 'Calculation successful and data saved.', data: calculationResult });

    } catch (error) {
        console.error('Error running calculation:', error);
        res.status(500).send('Error running calculation.');
    }
};

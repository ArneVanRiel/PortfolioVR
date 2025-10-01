const sql = require('mssql');
const dbConfig = require('../config/database');

// --- Helper Functions ---
const getShiftedValue = (arr, index, periods) => {
    const targetIndex = index + periods;
    if (targetIndex >= 0 && targetIndex < arr.length) return arr[targetIndex];
    return null;
};

const calculateMean = (arr) => {
    if (!arr || arr.length === 0) return 0;
    const filteredArr = arr.filter(v => typeof v === 'number' && isFinite(v));
    if (filteredArr.length === 0) return 0;
    return filteredArr.reduce((acc, val) => acc + val, 0) / filteredArr.length;
};

const calculateStdDev = (arr) => {
    if (!arr || arr.length < 2) return 0;
    const filteredArr = arr.filter(v => typeof v === 'number' && isFinite(v));
    if (filteredArr.length < 2) return 0;
    const mean = calculateMean(filteredArr);
    const avgSquareDiff = calculateMean(filteredArr.map(v => Math.pow(v - mean, 2)));
    return Math.sqrt(avgSquareDiff);
};

const getRollingWindow = (arr, index, windowSize) => {
    const values = [];
    for (let i = 0; i < windowSize; i++) {
        const targetIndex = index - i;
        if (targetIndex >= 0 && targetIndex < arr.length) {
            values.push(arr[targetIndex]);
        }
    }
    return values;
};

// --- Main Calculation Function ---
async function performCalculations(stockId, periodEndDate = null) {
    console.log(`Performing real calculations for stockId: ${stockId} for period: ${periodEndDate}`);
    const pool = await sql.connect(dbConfig);

    let effectivePeriodEndDate = periodEndDate;
    if (!effectivePeriodEndDate) {
        const latestDateResult = await pool.request().input('stockId', sql.Int, stockId).query('SELECT TOP 1 period_end_date FROM fundamental_data WHERE stock_id = @stockId ORDER BY period_end_date DESC');
        if (latestDateResult.recordset.length === 0) throw new Error('No fundamental data found for this stock.');
        effectivePeriodEndDate = latestDateResult.recordset[0].period_end_date;
    }

    const lookbackDate = new Date(effectivePeriodEndDate);
    lookbackDate.setFullYear(lookbackDate.getFullYear() - 13);

    const fundamentalDataResult = await pool.request()
        .input('stockId', sql.Int, stockId).input('lookbackDate', sql.Date, lookbackDate).input('endDate', sql.Date, new Date(effectivePeriodEndDate))
        .query(`SELECT period_end_date, data_type, value, fp_id FROM fundamental_data WHERE stock_id = @stockId AND data_type IN ('LiabilitiesCurrent', 'Liabilities', 'StockholdersEquity', 'NetIncomeLoss', 'NetCashProvidedByUsedInOperatingActivities', 'PurchasesOfPropertyAndEquipment', 'WeightedAverageNumberOfDilutedSharesOutstanding') AND period_end_date BETWEEN @lookbackDate AND @endDate ORDER BY period_end_date ASC`);

    if (fundamentalDataResult.recordset.length === 0) throw new Error('Not enough fundamental data to perform calculations.');

    const pivotedData = fundamentalDataResult.recordset.reduce((acc, record) => {
        const dateStr = record.period_end_date.toISOString().split('T')[0];
        if (!acc[dateStr]) acc[dateStr] = { period_end_date: dateStr, fp_id: record.fp_id };
        const keyMap = { 'LiabilitiesCurrent': 'liabilitiesCurrent', 'Liabilities': 'liabilities', 'StockholdersEquity': 'stockholdersEquity', 'NetIncomeLoss': 'netIncomeLoss', 'NetCashProvidedByUsedInOperatingActivities': 'netCashProvidedByUsedInOperatingActivities', 'PurchasesOfPropertyAndEquipment': 'purchasesOfPropertyAndEquipment', 'WeightedAverageNumberOfDilutedSharesOutstanding': 'weightedAverageNumberOfDilutedSharesOutstanding' };
        acc[dateStr][keyMap[record.data_type] || record.data_type] = parseFloat(record.value);
        return acc;
    }, {});

    let quarterlyData = Object.values(pivotedData).sort((a, b) => new Date(a.period_end_date) - new Date(b.period_end_date));

    // --- CALCULATIONS (data sorted oldest to newest) ---
    quarterlyData.forEach((row, i) => {
        const prevRow = getShiftedValue(quarterlyData, i, -1);
        const cumulativeFCF = (row.netCashProvidedByUsedInOperatingActivities || 0) - (row.purchasesOfPropertyAndEquipment || 0);
        row.fcf_quarterly = (prevRow && row.fp_id !== 1 && row.fp_id !== 5) ? cumulativeFCF - ((prevRow.netCashProvidedByUsedInOperatingActivities || 0) - (prevRow.purchasesOfPropertyAndEquipment || 0)) : cumulativeFCF;
        const cumulativeNI = row.netIncomeLoss || 0;
        row.netIncome_quarterly = (prevRow && row.fp_id !== 1 && row.fp_id !== 5) ? cumulativeNI - (prevRow.netIncomeLoss || 0) : cumulativeNI;
    });

    quarterlyData.forEach((row, i) => {
        row.fcf_yearly_ttm = getRollingWindow(quarterlyData, i, 4).map(r => r.fcf_quarterly).reduce((s, v) => s + (v || 0), 0);
        row.netIncome_yearly_ttm = getRollingWindow(quarterlyData, i, 4).map(r => r.netIncome_quarterly).reduce((s, v) => s + (v || 0), 0);
        if (row.stockholdersEquity) row.roe_ttm = row.netIncome_yearly_ttm / row.stockholdersEquity;
        row.non_curr_liabilities = (row.liabilities || 0) - (row.liabilitiesCurrent || 0);
        if (row.stockholdersEquity) row.ltd_s_equity = row.non_curr_liabilities / row.stockholdersEquity;
    });

    const latestData = quarterlyData[quarterlyData.length - 1];
    if (!latestData) throw new Error('Could not determine latest data point for calculation.');

    const fcfGrowthRates = [];
    for (let i = 4; i < quarterlyData.length; i += 4) {
        const currentYearFcf = quarterlyData[i].fcf_yearly_ttm;
        const prevYearFcf = getShiftedValue(quarterlyData, i, -4)?.fcf_yearly_ttm;
        if (currentYearFcf && prevYearFcf) fcfGrowthRates.push((currentYearFcf / prevYearFcf) - 1);
    }
    const gem_groeipercentage_FCF = calculateMean(fcfGrowthRates);
    const standaard_deviatie_FCF = calculateStdDev(fcfGrowthRates);
    const waardefactor_FCF = standaard_deviatie_FCF ? gem_groeipercentage_FCF / (standaard_deviatie_FCF * standaard_deviatie_FCF) : 0;

    const roe10YWindow = getRollingWindow(quarterlyData, quarterlyData.length - 1, 40).map(r => r.roe_ttm);
    const gemiddelde_stijging_ROE_10_Y = calculateMean(roe10YWindow);
    const standaard_deviatie_ROE = calculateStdDev(roe10YWindow);
    const waardefactor_ROE = gemiddelde_stijging_ROE_10_Y - standaard_deviatie_ROE;

    const ltdEquity2QWindow = getRollingWindow(quarterlyData, quarterlyData.length - 1, 2).map(r => r.ltd_s_equity);
    const ltdEquityMean = calculateMean(ltdEquity2QWindow);
    const waardefactor_LTD_equity = ltdEquityMean ? 2 * Math.pow(0.5 / (0.5 + ltdEquityMean), 2) : 0;

    const discountRate = 0.15, terminalGrowthRate = 0.02;
    let dcfSum = 0;
    for (let i = 1; i <= 10; i++) {
        const futureFcf = latestData.fcf_yearly_ttm * Math.pow(1 + gem_groeipercentage_FCF, i);
        dcfSum += futureFcf / Math.pow(1 + discountRate, i);
    }
    const terminalValue = (latestData.fcf_yearly_ttm * Math.pow(1 + gem_groeipercentage_FCF, 10) * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate);
    const discountedTerminalValue = terminalValue / Math.pow(1 + discountRate, 10);
    const totalValue = dcfSum + discountedTerminalValue;
    const intrinsieke_waarde = totalValue / latestData.weightedAverageNumberOfDilutedSharesOutstanding;

    const criteria = {
        allFcfPositive: getRollingWindow(quarterlyData, quarterlyData.length - 1, 40).every(r => r.fcf_yearly_ttm > 0),
        fcfGrowthPositive: gem_groeipercentage_FCF > 0,
        avgRoe10Y_gt_15: gemiddelde_stijging_ROE_10_Y >= 0.15,
        roeWaardefactorPositive: waardefactor_ROE > 0,
        ltdWaardefactor_lt_1: waardefactor_LTD_equity < 1
    };
    const selectiecriteria = Object.values(criteria).filter(Boolean).length;

    const waarde_verdeling = waardefactor_FCF * (1 + waardefactor_ROE) * (-2 * waardefactor_LTD_equity + 2);

    return {
        stock_id: stockId,
        calculation_date: new Date(),
        period_end_date: new Date(effectivePeriodEndDate),
        gem_groeipercentage_FCF,
        standaard_deviatie_FCF,
        waardefactor_FCF,
        gemiddelde_stijging_ROE_10_Y,
        standaard_deviatie_ROE,
        waardefactor_ROE,
        waardefactor_LTD_equity,
        intrinsieke_waarde,
        selectiecriteria,
        waarde_verdeling,
        koopmarge: null // Set to null as requested
    };
}

exports.getCalculationsForStock = async (req, res) => {
    const { stockId } = req.params;
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().input('stockId', sql.Int, stockId).query('SELECT * FROM stock_calculations WHERE stock_id = @stockId ORDER BY period_end_date DESC');
        res.status(200).json(result.recordset);
    } catch (error) {
        console.error('Error fetching calculations:', error);
        res.status(500).send('Error fetching calculations.');
    }
};

exports.runCalculationForStock = async (req, res) => {
    const { stockId } = req.params;
    const { period_end_date } = req.body;
    try {
        const calculationResult = await performCalculations(stockId, period_end_date);
        const pool = await sql.connect(dbConfig);
        const existingRecord = await pool.request().input('stock_id', sql.Int, stockId).input('period_end_date', sql.Date, calculationResult.period_end_date).query('SELECT id FROM stock_calculations WHERE stock_id = @stock_id AND period_end_date = @period_end_date');
        const request = pool.request();
        for (const key in calculationResult) {
            const value = calculationResult[key];
            if (value === null || value === undefined) continue;
            let type;
            if (key.includes('date')) type = sql.DateTime;
            else if (Number.isInteger(value)) type = sql.Int;
            else type = sql.Decimal(18, 4);
            request.input(key, type, value);
        }
        let query;
        if (existingRecord.recordset.length > 0) {
            const updateId = existingRecord.recordset[0].id;
            request.input('id', sql.Int, updateId);
            const setClauses = Object.keys(calculationResult).filter(key => calculationResult[key] !== null && calculationResult[key] !== undefined).map(key => `${key} = @${key}`).join(', ');
            query = `UPDATE stock_calculations SET ${setClauses}, updated_at = GETDATE() WHERE id = @id`;
        } else {
            const columns = Object.keys(calculationResult).filter(key => calculationResult[key] !== null && calculationResult[key] !== undefined).join(', ');
            const values = Object.keys(calculationResult).filter(key => calculationResult[key] !== null && calculationResult[key] !== undefined).map(key => `@${key}`).join(', ');
            query = `INSERT INTO stock_calculations (${columns}) VALUES (${values})`;
        }
        await request.query(query);
        res.status(201).json({ message: 'Calculation successful and data saved.', data: calculationResult });
    } catch (error) {
        console.error('Error running calculation:', error);
        res.status(500).send('Error running calculation.');
    }
};
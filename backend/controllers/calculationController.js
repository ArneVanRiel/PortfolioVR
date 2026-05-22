// c:\Arne\ArneVR\PortfolioVR\backend\controllers\calculationController.js
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
    const fcfGrowthRatesDetails = [];
    const shift_yr = 4; // For quarterly data

    // Loop through the past 10 years (40 quarters) to gather historical growth rates
    for (let i = 0; i < 40 && (quarterlyData.length - 1 - i) >= 0; i++) {
        const currentQuarterIndex = quarterlyData.length - 1 - i;
        
        // For each of these historical quarters, calculate growth rates over 1 to 10 years
        for (let years = 1; years <= 10; years++) {
            const periods = years * shift_yr;
            const prevQuarterIndex = currentQuarterIndex - periods;

            if (prevQuarterIndex >= 0) {
                const currentFcf = quarterlyData[currentQuarterIndex].fcf_yearly_ttm;
                const prevFcf = quarterlyData[prevQuarterIndex].fcf_yearly_ttm;

                // Filter: prevFcf moet groot genoeg zijn (bv. > 100k) om extreme percentages door kleine noemers te voorkomen
                if (currentFcf && prevFcf && Math.abs(prevFcf) > 100000) {
                    const growthRate = Math.pow(currentFcf / prevFcf, 1 / years) - 1;
                    // Cap de groei: negeer waarden > 100% of < -90% om het gemiddelde niet te verpesten
                    if (isFinite(growthRate) && growthRate < 1.0 && growthRate > -0.9) {
                        fcfGrowthRates.push(growthRate);
                        fcfGrowthRatesDetails.push({
                            start_date: quarterlyData[prevQuarterIndex].period_end_date,
                            end_date: quarterlyData[currentQuarterIndex].period_end_date,
                            years: years,
                            start_fcf: prevFcf,
                            end_fcf: currentFcf,
                            growth_rate: growthRate
                        });
                    }
                }
            }
        }
    }

    // --- NIEUWE EMA BEREKENING (Side-by-side test) ---
    let sumWeights = 0;
    let sumWeightedGrowth = 0;
    const emaPeriodes = 40;
    const alpha = 2 / (emaPeriodes + 1);

    fcfGrowthRatesDetails.forEach(item => {
        const index = quarterlyData.findIndex(q => q.period_end_date === item.end_date);
        const leeftijdInKwartalen = (quarterlyData.length - 1) - index;
        const weight = Math.pow(1 - alpha, leeftijdInKwartalen);
        
        sumWeights += weight;
        sumWeightedGrowth += item.growth_rate * weight;
    });

    let gem_groeipercentage_FCF_nieuw = sumWeights > 0 ? sumWeightedGrowth / sumWeights : 0;
    if (gem_groeipercentage_FCF_nieuw > 0.5) gem_groeipercentage_FCF_nieuw = 0.5;

    let gem_groeipercentage_FCF_oud = calculateMean(fcfGrowthRates);
    if (gem_groeipercentage_FCF_oud > 0.5) gem_groeipercentage_FCF_oud = 0.5;
    
    // Behoud voorlopig de oude waarde voor de rest van de applicatie
    let gem_groeipercentage_FCF = gem_groeipercentage_FCF_oud;

    const standaard_deviatie_FCF = calculateStdDev(fcfGrowthRates);
    const waardefactor_FCF = standaard_deviatie_FCF ? gem_groeipercentage_FCF / (standaard_deviatie_FCF * standaard_deviatie_FCF) : 0;

    console.table({
        "Stock ID": stockId,
        "FCF Groei (Oud SMA)": gem_groeipercentage_FCF_oud,
        "FCF Groei (Nieuw EMA)": gem_groeipercentage_FCF_nieuw,
        "Verschil": gem_groeipercentage_FCF_nieuw - gem_groeipercentage_FCF_oud
    });

    const roeWindowData = getRollingWindow(quarterlyData, quarterlyData.length - 1, 40);
    const roe10YWindow = roeWindowData.map(r => r.roe_ttm);
    const roeHistoryDetails = roeWindowData.map(r => ({ date: r.period_end_date, roe: r.roe_ttm }));
    const gemiddelde_stijging_ROE_10_Y = calculateMean(roe10YWindow);
    const standaard_deviatie_ROE = calculateStdDev(roe10YWindow);
    const waardefactor_ROE = gemiddelde_stijging_ROE_10_Y - standaard_deviatie_ROE;

    const ltdEquity4QWindow = getRollingWindow(quarterlyData, quarterlyData.length - 1, 4).map(r => r.ltd_s_equity);
    const ltdEquityMean = calculateMean(ltdEquity4QWindow);
    const waardefactor_LTD_equity = ltdEquityMean;

    const discountRate = 0.15, terminalGrowthRate = 0.02;
    let dcfSum = 0;
    const dcfSteps = [];
    for (let i = 1; i <= 10; i++) {
        const futureFcf = latestData.fcf_yearly_ttm * Math.pow(1 + gem_groeipercentage_FCF, i);
        const discounted = futureFcf / Math.pow(1 + discountRate, i);
        dcfSum += discounted;
        dcfSteps.push({ year: i, futureFcf, discounted });
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

        // FCF Growth & Waardefactor
        gem_groeipercentage_FCF,
        standaard_deviatie_FCF,
        waardefactor_FCF,

        // ROE & Waardefactor
        gemiddelde_stijging_ROE_10_Y,
        standaard_deviatie_ROE,
        waardefactor_ROE,

        // LTD Equity & Waardefactor
        ltd_equity_mean: ltdEquityMean,
        waardefactor_LTD_equity,

        // Intrinsic Value Components
        intrinsieke_waarde,
        latest_fcf_yearly_ttm: latestData.fcf_yearly_ttm,
        dcf_sum: dcfSum,
        discounted_terminal_value: discountedTerminalValue,
        total_value: totalValue,
        latest_shares_outstanding: latestData.weightedAverageNumberOfDilutedSharesOutstanding,

        // Final Values
        selectiecriteria,
        criteria, // Voeg het criteria object toe aan de return (voor frontend gebruik direct na berekening)
        waarde_verdeling,
        koopmarge: null,

        // Detailed breakdown for frontend inspection
        calculation_details: {
            fcf_growth_rates: fcfGrowthRates,
            fcf_growth_rates_details: fcfGrowthRatesDetails,
            roe_history: roe10YWindow,
            roe_history_details: roeHistoryDetails,
            ltd_history: ltdEquity4QWindow,
            dcf_steps: dcfSteps,
            terminal_params: {
                terminalGrowthRate, discountRate, terminalValue, discountedTerminalValue
            }
        }
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

exports.getCalculationDetails = async (req, res) => {
    const { stockId } = req.params;
    const { period_end_date } = req.query;

    if (!period_end_date) {
        return res.status(400).json({ message: 'Period end date is required.' });
    }

    try {
        // Run calculation in memory (does not save to DB) to get the details
        const result = await performCalculations(stockId, new Date(period_end_date));
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching calculation details:', error);
        res.status(500).send(`Error fetching calculation details: ${error.message}`);
    }
};

exports.runCalculationForStock = async (req, res) => {
    const { stockId } = req.params;

    // WORKAROUND: Fix voor route conflict waarbij 'generate-sell-alerts' als stockId wordt gezien
    if (isNaN(Number(stockId))) {
        if (stockId === 'generate-sell-alerts') {
            return generateSellAlertsFromHistory(req, res);
        }
        return res.status(400).json({ message: 'Ongeldig aandeel ID.' });
    }

    const { period_end_date } = req.body;
    try {
        // 1. Perform all calculations in memory
        const fullCalculationResult = await performCalculations(stockId, period_end_date);

        // DEBUG: Log waarschuwing als de waarde nog steeds extreem hoog is
        if (fullCalculationResult.intrinsieke_waarde > 1000000) {
            console.warn(`[WARNING] Extreem hoge intrinsieke waarde berekend: ${fullCalculationResult.intrinsieke_waarde} voor stock ${stockId}`);
        }

        const pool = await sql.connect(dbConfig);

        // Get actual columns from the database schema
        const schemaResult = await pool.request().query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'stock_calculations'
        `);
        const dbColumns = schemaResult.recordset.map(row => row.COLUMN_NAME);

        // 2. Filter the results to only include columns that exist in the database
        const dataToSave = {};
        for (const col of dbColumns) {
            if (fullCalculationResult.hasOwnProperty(col)) {
                dataToSave[col] = fullCalculationResult[col];
            }
        }
        
        // Make sure essential keys are present
        if (!dataToSave.stock_id) dataToSave.stock_id = stockId;
        if (!dataToSave.period_end_date) dataToSave.period_end_date = new Date(period_end_date);
        if (!dataToSave.calculation_date) dataToSave.calculation_date = new Date();


        // 3. Save the filtered data to the database
        const existingRecord = await pool.request()
            .input('stock_id', sql.Int, stockId)
            .input('period_end_date', sql.Date, dataToSave.period_end_date)
            .query('SELECT id FROM stock_calculations WHERE stock_id = @stock_id AND period_end_date = @period_end_date');

        const request = pool.request();
        
        for (const key in dataToSave) {
            const value = dataToSave[key];
            if (value === null || value === undefined) continue;
            
            let type;
            if (key.includes('date')) {
                type = sql.DateTime;
            } else if (key === 'selectiecriteria' || key === 'stock_id') {
                type = sql.Int;
            } else if (['latest_fcf_yearly_ttm', 'dcf_sum', 'discounted_terminal_value', 'total_value', 'latest_shares_outstanding', 'intrinsieke_waarde', 'waarde_verdeling'].includes(key)) {
                type = sql.Decimal(38, 4);
            }
            else {
                type = sql.Decimal(18, 4);
            }
            
            request.input(key, type, value);
        }

        let query;
        if (existingRecord.recordset.length > 0) {
            const updateId = existingRecord.recordset[0].id;
            request.input('id', sql.Int, updateId);
            const setClauses = Object.keys(dataToSave).filter(key => dataToSave[key] !== null && dataToSave[key] !== undefined && key !== 'id').map(key => `${key} = @${key}`).join(', ');
            query = `UPDATE stock_calculations SET ${setClauses}, updated_at = GETDATE() WHERE id = @id`;
        } else {
            const columns = Object.keys(dataToSave).filter(key => dataToSave[key] !== null && dataToSave[key] !== undefined && key !== 'id').join(', ');
            const values = Object.keys(dataToSave).filter(key => dataToSave[key] !== null && dataToSave[key] !== undefined && key !== 'id').map(key => `@${key}`).join(', ');
            query = `INSERT INTO stock_calculations (${columns}) VALUES (${values})`;
        }
        
        if (Object.keys(dataToSave).length > 3) { // only run query if there is data to save
             await request.query(query);
        }

        // --- NIEUW: Genereer Verkoopsignaal op basis van Waardeverdeling ---
        // Haal de vorige berekening op (chronologisch de vorige)
        const prevCalcResult = await pool.request()
            .input('stock_id', sql.Int, stockId)
            .input('current_date', sql.Date, dataToSave.period_end_date)
            .query(`SELECT TOP 1 waarde_verdeling FROM stock_calculations WHERE stock_id = @stock_id AND period_end_date < @current_date ORDER BY period_end_date DESC`);

        if (prevCalcResult.recordset.length > 0) {
            const prevWaarde = prevCalcResult.recordset[0].waarde_verdeling;
            const currentWaarde = dataToSave.waarde_verdeling;

            // Als de waarde is gedaald, maak een verkoopsignaal aan
            if (currentWaarde < prevWaarde) {
                const diffPercentage = (currentWaarde - prevWaarde) / prevWaarde; // Dit is een negatief getal (bv -0.05 voor -5%)
                
                // Bepaal de datum voor het signaal: bij voorkeur report_date (publicatiedatum), anders period_end_date
                let alertDate = dataToSave.period_end_date;

                const reportDateResult = await pool.request()
                    .input('stock_id_rd', sql.Int, stockId)
                    .input('period_end_date_rd', sql.Date, dataToSave.period_end_date)
                    .query(`SELECT TOP 1 report_date FROM fundamental_data WHERE stock_id = @stock_id_rd AND period_end_date = @period_end_date_rd AND report_date IS NOT NULL ORDER BY report_date DESC`);
                
                if (reportDateResult.recordset.length > 0) {
                    alertDate = reportDateResult.recordset[0].report_date;
                }

                // Als we een report_date gebruiken die verschilt van de period_end_date,
                // verwijder dan een eventueel bestaand signaal op de period_end_date om dubbels te voorkomen.
                if (alertDate.getTime() !== new Date(dataToSave.period_end_date).getTime()) {
                    await pool.request()
                        .input('aandeel_id_del', sql.Int, stockId)
                        .input('date_del', sql.Date, dataToSave.period_end_date)
                        .query(`DELETE FROM MACDAlerts WHERE aandeel_id = @aandeel_id_del AND date = @date_del AND type_melding = 'Verkoopsignaal'`);
                }

                // Haal de prijs op voor de datum (of de laatst bekende prijs ervoor)
                const priceResult = await pool.request()
                    .input('stock_id_price', sql.Int, stockId)
                    .input('date_price', sql.Date, alertDate)
                    .query(`SELECT TOP 1 closing_price FROM DailyClosingPrices WHERE aandeel_id = @stock_id_price AND date <= @date_price ORDER BY date DESC`);
                
                const currentPrice = priceResult.recordset.length > 0 ? priceResult.recordset[0].closing_price : 0;

                // Voeg toe aan MACDAlerts (we hergebruiken deze tabel voor alle alerts)
                // We gebruiken MERGE om dubbele alerts voor dezelfde datum te voorkomen
                await pool.request()
                    .input('aandeel_id', sql.Int, stockId)
                    .input('date', sql.Date, alertDate)
                    .input('type', sql.VarChar, 'Verkoopsignaal')
                    .input('amount', sql.Decimal(18, 4), diffPercentage)
                    .input('price', sql.Decimal(18, 2), currentPrice)
                    .query(`
                        MERGE INTO MACDAlerts AS target
                        USING (SELECT @aandeel_id AS aandeel_id, @date AS date) AS source
                        ON target.aandeel_id = source.aandeel_id AND target.date = source.date AND target.type_melding = 'Verkoopsignaal'
                        WHEN MATCHED THEN
                            UPDATE SET trade_amount = @amount, signal_line_value = NULL, prijs_op_moment = @price
                        WHEN NOT MATCHED THEN
                            INSERT (aandeel_id, date, type_melding, status, trade_amount, signal_line_value, prijs_op_moment)
                            VALUES (@aandeel_id, @date, @type, 'Nieuw', @amount, NULL, @price);
                    `);
                console.log(`Verkoopsignaal gegenereerd voor stock ${stockId} op ${alertDate}: ${diffPercentage}`);
            }
        }

        // 4. Return the FULL calculation result to the frontend
        res.status(201).json({ message: 'Calculation successful. Data saved to existing columns.', data: fullCalculationResult });

    } catch (error) {
        console.error('Error running calculation:', error);
        res.status(500).send(`Error running calculation: ${error.message}`);
    }
};

// NIEUW: Genereer verkoopsignalen met terugwerkende kracht uit de historie
const generateSellAlertsFromHistory = async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        
        // 1. Haal alle berekeningen op, gesorteerd per aandeel en datum
        const calculationsResult = await pool.request().query(`
            SELECT stock_id, period_end_date, waarde_verdeling 
            FROM stock_calculations 
            ORDER BY stock_id, period_end_date ASC
        `);
        
        const calculations = calculationsResult.recordset;
        let count = 0;

        // 2. Groepeer per aandeel
        const stocksMap = {};
        calculations.forEach(calc => {
            if (!stocksMap[calc.stock_id]) stocksMap[calc.stock_id] = [];
            stocksMap[calc.stock_id].push(calc);
        });

        // 3. Itereer en genereer alerts
        for (const stockId in stocksMap) {
            const stockCalcs = stocksMap[stockId];
            
            // We beginnen bij i = 1, dus de eerste (oudste) waarde wordt overgeslagen voor vergelijking.
            // Als er maar 1 record is, wordt de loop niet uitgevoerd (1 < 1 is false).
            for (let i = 1; i < stockCalcs.length; i++) {
                const prev = stockCalcs[i-1];
                const current = stockCalcs[i];

                // Extra check: beide waarden moeten bestaan en prev mag niet 0 zijn (deling door 0)
                if (prev.waarde_verdeling != null && current.waarde_verdeling != null && prev.waarde_verdeling !== 0) {
                    if (current.waarde_verdeling < prev.waarde_verdeling) {
                        const diffPercentage = (current.waarde_verdeling - prev.waarde_verdeling) / prev.waarde_verdeling;
                        
                        // Bepaal de datum voor het signaal: bij voorkeur report_date (publicatiedatum), anders period_end_date
                        let alertDate = current.period_end_date;

                        const reportDateResult = await pool.request()
                            .input('stock_id_rd', sql.Int, current.stock_id)
                            .input('period_end_date_rd', sql.Date, current.period_end_date)
                            .query(`SELECT TOP 1 report_date FROM fundamental_data WHERE stock_id = @stock_id_rd AND period_end_date = @period_end_date_rd AND report_date IS NOT NULL ORDER BY report_date DESC`);
                        
                        if (reportDateResult.recordset.length > 0) {
                            alertDate = reportDateResult.recordset[0].report_date;
                        }

                        // Als we een report_date gebruiken die verschilt van de period_end_date,
                        // verwijder dan een eventueel bestaand signaal op de period_end_date om dubbels te voorkomen.
                        if (alertDate.getTime() !== new Date(current.period_end_date).getTime()) {
                            await pool.request()
                                .input('aandeel_id_del', sql.Int, current.stock_id)
                                .input('date_del', sql.Date, current.period_end_date)
                                .query(`DELETE FROM MACDAlerts WHERE aandeel_id = @aandeel_id_del AND date = @date_del AND type_melding = 'Verkoopsignaal'`);
                        }

                        // Haal de prijs op
                        const priceResult = await pool.request()
                            .input('stock_id_price', sql.Int, current.stock_id)
                            .input('date_price', sql.Date, alertDate)
                            .query(`SELECT TOP 1 closing_price FROM DailyClosingPrices WHERE aandeel_id = @stock_id_price AND date <= @date_price ORDER BY date DESC`);
                        
                        const currentPrice = priceResult.recordset.length > 0 ? priceResult.recordset[0].closing_price : 0;

                        await pool.request()
                            .input('aandeel_id', sql.Int, current.stock_id)
                            .input('date', sql.Date, alertDate)
                            .input('type', sql.VarChar, 'Verkoopsignaal')
                            .input('amount', sql.Decimal(18, 4), diffPercentage)
                            .input('price', sql.Decimal(18, 2), currentPrice)
                            .query(`
                                MERGE INTO MACDAlerts AS target
                                USING (SELECT @aandeel_id AS aandeel_id, @date AS date) AS source
                                ON target.aandeel_id = source.aandeel_id AND target.date = source.date AND target.type_melding = 'Verkoopsignaal'
                                WHEN MATCHED THEN
                                    UPDATE SET trade_amount = @amount, signal_line_value = NULL, prijs_op_moment = @price
                                WHEN NOT MATCHED THEN
                                    INSERT (aandeel_id, date, type_melding, status, trade_amount, signal_line_value, prijs_op_moment)
                                    VALUES (@aandeel_id, @date, @type, 'Nieuw', @amount, NULL, @price);
                            `);
                        count++;
                    }
                }
            }
        }

        res.status(200).json({ message: `Succesvol ${count} verkoopsignalen gegenereerd uit historie.` });

    } catch (error) {
        console.error('Error generating sell alerts from history:', error);
        res.status(500).send(`Error generating alerts: ${error.message}`);
    }
};

exports.getLatestCalculationsSummary = async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const query = `
            WITH MaxWaarde AS (
                SELECT 
                    stock_id, 
                    MAX(waarde_verdeling) as max_waarde_verdeling,
                    COUNT(id) as num_calculations
                FROM stock_calculations
                GROUP BY stock_id
            ),
            LatestCalculations AS (
                SELECT 
                    sc.*,
                    ROW_NUMBER() OVER(PARTITION BY sc.stock_id ORDER BY sc.period_end_date DESC, sc.calculation_date DESC) as rn
                FROM 
                    stock_calculations sc
            )
            SELECT 
                lc.stock_id,
                s.name,
                s.ticker_symbol,
                lc.waarde_verdeling,
                lc.intrinsieke_waarde,
                lc.period_end_date,
                lc.selectiecriteria,
                mw.max_waarde_verdeling,
                mw.num_calculations
            FROM 
                LatestCalculations lc
            JOIN 
                stocks s ON lc.stock_id = s.aandeel_id
            JOIN
                MaxWaarde mw ON lc.stock_id = mw.stock_id
            WHERE 
                lc.rn = 1
            ORDER BY 
                lc.waarde_verdeling DESC;
        `;
        const result = await pool.request().query(query);
        res.status(200).json(result.recordset);
    } catch (error) {
        console.error('Error fetching latest calculations summary:', error);
        res.status(500).send('Error fetching latest calculations summary.');
    }
};

exports.getPriceHistory = async (req, res) => {
    const { stockId } = req.params;
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('stockId', sql.Int, stockId)
            .query('SELECT date, closing_price FROM DailyClosingPrices WHERE aandeel_id = @stockId ORDER BY date ASC');
        res.status(200).json(result.recordset);
    } catch (error) {
        console.error('Error fetching price history:', error);
        res.status(500).send('Error fetching price history.');
    }
};

exports.getMACDHistory = async (req, res) => {
    const { stockId } = req.params;
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('stockId', sql.Int, stockId)
            .query('SELECT date, macdLine, signalLine FROM MACDValues WHERE aandeel_id = @stockId ORDER BY date ASC');
        res.status(200).json(result.recordset);
    } catch (error) {
        console.error('Error fetching MACD history:', error);
        res.status(500).send('Error fetching MACD history.');
    }
};

exports.getMACDAlerts = async (req, res) => {
    const { stockId } = req.params;
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('stockId', sql.Int, stockId)
            .query(`
                SELECT 
                    a.date, a.type_melding, a.signal_line_value, a.prijs_op_moment, a.trade_amount,
                    (CurrentCalc.waarde_verdeling - PrevCalc.waarde_verdeling) / NULLIF(PrevCalc.waarde_verdeling, 0) as diff_percentage
                FROM MACDAlerts a
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
                WHERE a.aandeel_id = @stockId 
                ORDER BY a.date ASC
            `);
        res.status(200).json(result.recordset);
    } catch (error) {
        console.error('Error fetching MACD alerts:', error);
        res.status(500).send('Error fetching MACD alerts.');
    }
};

exports.getFundamentalDataForCalculation = async (req, res) => {
    const { calculationId } = req.params;
    try {
        const pool = await sql.connect(dbConfig);
        const calculationResult = await pool.request()
            .input('calculationId', sql.Int, calculationId)
            .query('SELECT stock_id, period_end_date FROM stock_calculations WHERE id = @calculationId');

        if (calculationResult.recordset.length === 0) {
            return res.status(404).send('Calculation not found.');
        }

        const { stock_id, period_end_date } = calculationResult.recordset[0];

        const lookbackDate = new Date(period_end_date);
        lookbackDate.setFullYear(lookbackDate.getFullYear() - 13);

        const fundamentalDataResult = await pool.request()
            .input('stockId', sql.Int, stock_id)
            .input('lookbackDate', sql.Date, lookbackDate)
            .input('endDate', sql.Date, new Date(period_end_date))
            .query(`SELECT period_end_date, data_type, value FROM fundamental_data WHERE stock_id = @stockId AND period_end_date BETWEEN @lookbackDate AND @endDate ORDER BY period_end_date DESC, data_type ASC`);

        res.status(200).json(fundamentalDataResult.recordset);
    } catch (error) {
        console.error('Error fetching fundamental data for calculation:', error);
        res.status(500).send('Error fetching fundamental data for calculation.');
    }
};


exports.getSummaryByDate = async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).send('A date is required.');
    }

    try {
        const pool = await sql.connect(dbConfig);
        const query = `
            WITH CalculationsOnOrBeforeDate AS (
                SELECT 
                    sc.*,
                    ROW_NUMBER() OVER(PARTITION BY sc.stock_id ORDER BY sc.period_end_date DESC, sc.calculation_date DESC) as rn
                FROM 
                    stock_calculations sc
                WHERE 
                    CAST(sc.period_end_date AS DATE) <= @date
            ),
            LatestCalculations AS (
                SELECT * FROM CalculationsOnOrBeforeDate WHERE rn = 1
            ),
            HighestPreviousWaarde AS (
                SELECT 
                    lc.id as calculation_id,
                    MAX(prev_sc.waarde_verdeling) as highest_previous_waarde_verdeling
                FROM 
                    LatestCalculations lc
                LEFT JOIN 
                    stock_calculations prev_sc ON lc.stock_id = prev_sc.stock_id AND prev_sc.period_end_date < lc.period_end_date
                GROUP BY
                    lc.id
            ),
            PreviousWaarde AS (
                 SELECT 
                    lc.id as calculation_id,
                    prev.waarde_verdeling as previous_waarde_verdeling
                 FROM LatestCalculations lc
                 OUTER APPLY (
                    SELECT TOP 1 p.waarde_verdeling
                    FROM stock_calculations p
                    WHERE p.stock_id = lc.stock_id AND p.period_end_date < lc.period_end_date
                    ORDER BY p.period_end_date DESC
                 ) prev
            ),
            LatestDailyData AS (
                SELECT 
                    aandeel_id,
                    closing_price as current_price,
                    ROW_NUMBER() OVER(PARTITION BY aandeel_id ORDER BY date DESC) as rn
                FROM
                    DailyClosingPrices
            ),
            LatestMACD AS (
                 SELECT
                    aandeel_id,
                    signalLine as current_signal_line,
                    ROW_NUMBER() OVER(PARTITION BY aandeel_id ORDER BY date DESC) as rn
                FROM
                    MACDValues
            ),
            LatestAlert AS (
                SELECT
                    aandeel_id,
                    date as latest_alert_date,
                    trade_amount as latest_trade_amount,
                    type_melding,
                    ROW_NUMBER() OVER(PARTITION BY aandeel_id ORDER BY date DESC) as rn
                FROM
                    MACDAlerts
                WHERE 
                    (type_melding = 'Koopsignaal' AND signal_line_value < 0)
                    OR (type_melding = 'Verkoopsignaal')
            )
            SELECT 
                s.name,
                s.ticker_symbol,
                at.type_name as asset_type_name,
                lc.id as calculation_id,
                lc.stock_id,
                lc.waarde_verdeling,
                lc.intrinsieke_waarde,
                lc.calculation_date,
                lc.period_end_date,
                lc.selectiecriteria,
                hpw.highest_previous_waarde_verdeling,
                pw.previous_waarde_verdeling,
                ldd.current_price,
                lm.current_signal_line,
                la.latest_alert_date,
                la.latest_trade_amount,
                la.type_melding as latest_alert_type
            FROM 
                LatestCalculations lc
            JOIN 
                stocks s ON lc.stock_id = s.aandeel_id
            LEFT JOIN
                AssetTypes at ON s.asset_type_id = at.asset_type_id
            LEFT JOIN
                HighestPreviousWaarde hpw ON lc.id = hpw.calculation_id
            LEFT JOIN
                PreviousWaarde pw ON lc.id = pw.calculation_id
            LEFT JOIN
                LatestDailyData ldd ON lc.stock_id = ldd.aandeel_id AND ldd.rn = 1
            LEFT JOIN
                LatestMACD lm ON lc.stock_id = lm.aandeel_id AND lm.rn = 1
            LEFT JOIN
                LatestAlert la ON lc.stock_id = la.aandeel_id AND la.rn = 1
            ORDER BY 
                lc.waarde_verdeling DESC;
        `;
        const result = await pool.request()
            .input('date', sql.Date, date)
            .query(query);
        
        res.status(200).json(result.recordset);
    } catch (error) {
        console.error('Error fetching calculations summary by date:', error);
        res.status(500).send('Error fetching calculations summary by date.');
    }
};

exports.deleteCalculation = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM stock_calculations WHERE id = @id');
        
        if (result.rowsAffected[0] > 0) {
            res.status(200).json({ message: 'Calculation deleted successfully.' });
        } else {
            res.status(404).json({ message: 'Calculation not found.' });
        }
    } catch (error) {
        console.error('Error deleting calculation:', error);
        res.status(500).send('Error deleting calculation.');
    }
};

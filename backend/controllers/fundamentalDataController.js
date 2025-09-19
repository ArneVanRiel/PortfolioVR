/*  */// controllers/fundamentalDataController.js
const { sql } = require('../config/database'); // Importeer alleen sql
const { spawn } = require('child_process');
let fetch; // for node-fetch (dynamically imported)

const REQUIRED_QUARTERS_FOR_SUFFICIENCY = 5; // Number of quarters considered 'sufficient'

// This should be your Alpha Vantage API Key
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'YOUR_ALPHA_VANTAGE_API_KEY';

// Helps in mapping SEC Form IDs (internal mapping)
const FORM_TYPES_MAP = {
    '10-K': 1,
    '10-Q': 2,
    // Add more mappings if needed
};

// Maps Alpha Vantage fields to your fundamental_data.data_type names
const ALPHA_VANTAGE_FIELD_MAPPING = {
    // Income Statement
    'comprehensiveIncome': 'ComprehensiveIncome', // Example, must match what you want to store
    'netIncomeLoss': 'NetIncomeLoss', // Match with your FUNDAMENTAL_DATA_TYPES
    // Add more for Income Statement like 'totalRevenue', 'costOfRevenue', etc.

    // Balance Sheet
    'cashAndCashEquivalentsAtCarryingValue': 'CashAndCashEquivalents', // Example
    'stockholdersEquity': 'StockholdersEquity', // Match with your FUNDAMENTAL_DATA_TYPES
    'liabilities': 'Liabilities', // Match with your FUNDAMENTAL_DATA_TYPES
    'liabilitiesCurrent': 'LiabilitiesCurrent', // Match with your FUNDAMENTAL_DATA_TYPES
    // Add more for Balance Sheet like 'assets', 'assetsCurrent', etc.

    // Cash Flow
    'netCashProvidedByUsedInOperatingActivities': 'NetCashProvidedByUsedInOperatingActivities', // Match with your FUNDAMENTAL_DATA_TYPES
    'purchasesOfPropertyAndEquipment': 'PurchasesOfPropertyAndEquipment', // Match with your FUNDAMENTAL_DATA_TYPES
    // Add more for Cash Flow like 'depreciationDepletionAndAmortization', etc.

    // General (if they are in the AV response and you want to store them)
    'weightedAverageNumberOfDilutedSharesOutstanding': 'WeightedAverageNumberOfDilutedSharesOutstanding',
};

// Define the fundamental data types you want to add/analyze (copied from frontend for consistency)
// In a real app, this might come from a shared config or database
const FUNDAMENTAL_DATA_TYPES = [
    { key: 'NetCashProvidedByUsedInOperatingActivities', label: 'Net Cash Provided by/Used in Operating Activities' },
    { key: 'PurchasesOfPropertyAndEquipment', label: 'Purchases of Property and Equipment' },
    { key: 'StockholdersEquity', label: 'Stockholders Equity' },
    { key: 'NetIncomeLoss', label: 'Net Income/Loss' },
    { key: 'Liabilities', label: 'Liabilities' },
    { key: 'LiabilitiesCurrent', label: 'Current Liabilities' },
    { key: 'WeightedAverageNumberOfDilutedSharesOutstanding', label: 'Weighted Average Number of Diluted Shares Outstanding' },
];


// Function to calculate the Exponential Moving Average (EMA) for a series of prices
const calculateEMA_Series = (prices, period) => {
    const emaValues = Array(prices.length).fill(NaN);
    if (prices.length < period) {
        return emaValues; // Not enough data for the period, return array with NaN
    }

    const multiplier = 2 / (period + 1);

    // Calculate the first EMA as a Simple Moving Average (SMA)
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += prices[i];
    }
    emaValues[period - 1] = sum / period;

    // Calculate the next EMAs iteratively
    for (let i = period; i < prices.length; i++) {
        emaValues[i] = (prices[i] - emaValues[i - 1]) * multiplier + emaValues[i - 1];
    }
    return emaValues;
};

// Function to calculate MACD and Signal Line
const calculateMACD = (closingPrices) => {
    const fastLength = 30;
    const slowLength = 90;
    const signalSmoothing = 9;

    const fastEMA = calculateEMA_Series(closingPrices, fastLength);
    const slowEMA = calculateEMA_Series(closingPrices, slowLength); // Corrected typo here

    // MACD Line: Fast EMA - Slow EMA
    const macdLine = closingPrices.map((price, index) => {
        if (isNaN(fastEMA[index]) || isNaN(slowEMA[index])) {
            return NaN;
        }
        return fastEMA[index] - slowEMA[index];
    });

    // Signal Line: EMA of the MACD Line
    const signalLine = calculateEMA_Series(macdLine, signalSmoothing);

    return { macdLine, signalLine };
};


// Function to add/update manual fundamental data
const addManualFundamentalData = async (req, res) => {
    const { stock_id, period_end_date, period_start_date, fy, fp_id, form_id, how_added, data } = req.body;

    if (!stock_id || !period_end_date || !period_start_date || !fy || !fp_id || !data || !Array.isArray(data)) {
        return res.status(400).json({ message: 'Missing or invalid data for manual entry.' });
    }

    let transaction;
    try {
        transaction = new sql.Transaction(sql.pool);
        await transaction.begin();

        for (const dataPoint of data) {
            const { data_type, value } = dataPoint;

            const checkRequest = new sql.Request(transaction);
            const existingData = await checkRequest.input('stock_id', sql.Int, stock_id)
                .input('period_end_date', sql.Date, period_end_date)
                .input('data_type', sql.NVarChar(100), data_type) // Ensure NVarChar length matches DB
                .query`SELECT id FROM fundamental_data WHERE stock_id = @stock_id AND period_end_date = @period_end_date AND data_type = @data_type`;

            if (existingData.recordset.length > 0) {
                const updateRequest = new sql.Request(transaction);
                await updateRequest.input('id', sql.Int, existingData.recordset[0].id)
                    .input('value', sql.Decimal(18, 4), value)
                    .input('how_added', sql.NVarChar(100), how_added)
                    .input('period_start_date', sql.Date, period_start_date)
                    .query`UPDATE fundamental_data SET value = @value, how_added = @how_added, updated_at = GETDATE(), period_start_date = @period_start_date WHERE id = @id`;
            } else {
                const insertRequest = new sql.Request(transaction);
                await insertRequest.input('stock_id', sql.Int, stock_id)
                    .input('period_end_date', sql.Date, period_end_date)
                    .input('period_start_date', sql.Date, period_start_date)
                    .input('fy', sql.Int, fy)
                    .input('fp_id', sql.Int, fp_id)
                    .input('form_id', sql.Int, form_id)
                    .input('data_type', sql.NVarChar(100), data_type)
                    .input('value', sql.Decimal(18, 4), value)
                    .input('how_added', sql.NVarChar(100), how_added)
                    .query`INSERT INTO fundamental_data (stock_id, period_end_date, period_start_date, fy, fp_id, form_id, data_type, value, how_added)
                           VALUES (@stock_id, @period_end_date, @period_start_date, @fy, @fp_id, @form_id, @data_type, @value, @how_added)`;
            }
        }

        await transaction.commit();
        res.status(200).json({ message: 'Fundamental data successfully saved/updated.' });

    } catch (err) {
        console.error('Error during fundamental data transaction:', err);
        if (transaction) {
            try {
                await transaction.rollback();
                console.log('Transaction successfully rolled back.');
            } catch (rollbackErr) {
                console.error('Error during transaction rollback:', rollbackErr);
            }
        }
        res.status(500).json({ message: 'Error saving fundamental data.', error: err.message });
    }
};

// Function to fetch and parse SEC data (This is a simplified version)
const fetchAndParseSecData = async (req, res) => {
    const { stock_id, ticker, cik, year } = req.body;
    if (!stock_id || !cik || !year) {
        return res.status(400).json({ message: 'Stock ID, CIK, and year are required.' });
    }

    if (!fetch) {
        fetch = (await import('node-fetch')).default;
    }

    try {
        console.log(`Fetching SEC data for CIK: ${cik}, Year: ${year} (dummy implementation)`);

        const dummySecData = [
            { period_end_date: `${year}-03-31`, period_start_date: `${year}-01-01`, fy: year, fp_id: FORM_TYPES_MAP['10-Q'], data_type: 'NetIncomeLoss', value: 12000000000 },
            { period_end_date: `${year}-03-31`, period_start_date: `${year}-01-01`, fy: year, fp_id: FORM_TYPES_MAP['10-Q'], data_type: 'LiabilitiesCurrent', value: 150000000000 },
            { period_end_date: `${year}-06-30`, period_start_date: `${year}-04-01`, fy: year, fp_id: FORM_TYPES_MAP['10-Q'], data_type: 'NetIncomeLoss', value: 13000000000 },
            { period_end_date: `${year}-06-30`, period_start_date: `${year}-04-01`, fy: year, fp_id: FORM_TYPES_MAP['10-Q'], data_type: 'LiabilitiesCurrent', value: 160000000000 },
            // Add more dummy data for all 7 types over different quarters and years
        ];


        res.status(200).json({ message: 'SEC data successfully fetched (dummy)', data: dummySecData });

    } catch (err) {
        console.error('Error fetching/parsing SEC data:', err);
        res.status(500).json({ message: 'Error fetching SEC data.', error: err.message });
    }
};

// Function to save fetched SEC data to the database
const saveFetchedSecData = async (req, res) => {
    const { stock_id, data } = req.body;

    if (!stock_id || !data || !Array.isArray(data)) {
        return res.status(400).json({ message: 'Missing or invalid SEC data to save.' });
    }

    let transaction;
    try {
        transaction = new sql.Transaction(sql.pool); // Use global pool
        await transaction.begin();

        for (const dataPoint of data) {
            const { period_end_date, period_start_date, fy, fp_id, form_id, data_type, value } = dataPoint;

            const checkRequest = new sql.Request(transaction); // Linked to transaction
            const existingData = await checkRequest.input('stock_id', sql.Int, stock_id)
                .input('period_end_date', sql.Date, period_end_date)
                .input('data_type', sql.NVarChar(100), data_type)
                .query`SELECT id FROM fundamental_data WHERE stock_id = @stock_id AND period_end_date = @period_end_date AND data_type = @data_type`;

            if (existingData.recordset.length > 0) {
                const updateRequest = new sql.Request(transaction); // Linked to transactio
                await updateRequest.input('id', sql.Int, existingData.recordset[0].id)
                    .input('value', sql.Decimal(18, 4), value)
                    .input('how_added', sql.NVarChar(100), 'SEC API - Auto')
                    .input('period_start_date', sql.Date, period_start_date)
                    .query`UPDATE fundamental_data SET value = @value, how_added = @how_added, updated_at = GETDATE(), period_start_date = @period_start_date WHERE id = @id`;
            } else {
                const insertRequest = new sql.Request(transaction); // Linked to transaction
                await insertRequest.input('stock_id', sql.Int, stock_id)
                    .input('period_end_date', sql.Date, period_end_date)
                    .input('period_start_date', sql.Date, period_start_date)
                    .input('fy', sql.Int, fy)
                    .input('fp_id', sql.Int, fp_id)
                    .input('form_id', sql.Int, form_id)
                    .input('data_type', sql.NVarChar(100), data_type)
                    .input('value', sql.Decimal(18, 4), value)
                    .input('how_added', sql.NVarChar(100), 'SEC API - Auto')
                    .query`INSERT INTO fundamental_data (stock_id, period_end_date, period_start_date, fy, fp_id, form_id, data_type, value, how_added)
                           VALUES (@stock_id, @period_end_date, @period_start_date, @fy, @fp_id, @form_id, @data_type, @value, @how_added)`;
            }
        }

        await transaction.commit();
        res.status(200).json({ message: 'Fetched SEC data successfully saved.' });

    } catch (err) {
        console.error('Error saving fetched SEC data transaction:', err);
        if (transaction) {
            try {
                await transaction.rollback();
                console.log('SEC data transaction successfully rolled back.');
            } catch (rollbackErr) {
                console.error('Error during SEC data transaction rollback:', rollbackErr);
            }
        }
        res.status(500).json({ message: 'Error saving SEC data.', error: err.message });
    }
};

// Function to fetch earnings calendar dates for a ticker
const getEarningsCalendarDatesByTicker = async (req, res) => {
    const { tickerSymbol } = req.params;
    if (!tickerSymbol) {
        return res.status(400).json({ message: 'Ticker symbol is required.' });
    }

    try {
        const request = new sql.Request(); // Use global pool
        const result = await request.input('ticker', sql.NVarChar(50), tickerSymbol)
            .query`SELECT ticker, reportDate, fiscalDateEnding FROM earningsCalender WHERE ticker = @ticker ORDER BY fiscalDateEnding DESC`;

        const formattedDates = result.recordset.map(row => ({
            ticker: row.ticker,
            reportDate: row.reportDate ? row.reportDate.toISOString().split('T')[0] : null,
            fiscalDateEnding: row.fiscalDateEnding ? row.fiscalDateEnding.toISOString().split('T')[0] : null,
            fiscalPeriod: getFiscalPeriodFromDate(row.fiscalDateEnding)
        }));

        res.status(200).json(formattedDates);
    } catch (err) {
        console.error('Error fetching earnings calendar dates:', err);
        res.status(500).json({ message: 'Error fetching earnings calendar dates.', error: err.message });
    }
};

// Helper to determine fiscalPeriod (simplified)
function getFiscalPeriodFromDate(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    const month = d.getMonth() + 1; // Months are 0-indexed
    if (month >= 1 && month <= 3) return 1;
    if (month >= 4 && month <= 6) return 2;
    if (month >= 7 && month <= 9) return 3;
    if (month >= 10 && month <= 12) return 4;
    return 'FY'; // For year-end
}


// Function to fetch and parse Alpha Vantage data
const fetchAndParseAlphaVantageData = async (req, res) => {
    const { stock_id, ticker, function: avFunction, year } = req.body;
    if (!stock_id || !ticker || !avFunction || !year) {
        return res.status(400).json({ message: 'Stock ID, ticker, function, and year are required for Alpha Vantage data.' });
    }

    if (!fetch) {
        fetch = (await import('node-fetch')).default;
    }

    try {
        let url = '';
        if (avFunction === 'INCOME_STATEMENT') {
            url = `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${ticker}&apikey=${ALPHA_VANTAGE_API_KEY}`;
        } else if (avFunction === 'BALANCE_SHEET') {
            url = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${ticker}&apikey=${ALPHA_VANTAGE_API_KEY}`;
        } else if (avFunction === 'CASH_FLOW') {
            url = `https://www.alphavantage.co/query?function=CASH_FLOW&symbol=${ticker}&apikey=${ALPHA_VANTAGE_API_KEY}`;
        } else {
            return res.status(400).json({ message: 'Invalid Alpha Vantage function specified.' });
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Alpha Vantage API HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        if (data['Error Message']) {
            throw new Error(`Alpha Vantage Error: ${data['Error Message']}`);
        }
        if (!data['quarterlyReports']) {
             console.warn(`No quarterly reports found for ${ticker} with function ${avFunction}.`);
             return res.status(404).json({ message: 'No quarterly reports found for the specified ticker and function.', data: [] });
        }

        const parsedData = [];
        FUNDAMENTAL_DATA_TYPES.forEach(dataType => {
            const avFieldName = Object.keys(ALPHA_VANTAGE_FIELD_MAPPING).find(key => ALPHA_VANTAGE_FIELD_MAPPING[key] === dataType.key);
            if (avFieldName) { // Only process if there's a mapping for our defined data type
                data['quarterlyReports'].forEach(report => {
                    const fiscalDateEnding = report.fiscalDateEnding;
                    const fy = new Date(fiscalDateEnding).getFullYear();
                    const fp_id = getFiscalPeriodFromDate(fiscalDateEnding);

                    if (report[avFieldName] !== undefined && report[avFieldName] !== 'None') {
                        parsedData.push({
                            period_end_date: fiscalDateEnding,
                            period_start_date: new Date(new Date(fiscalDateEnding).setMonth(new Date(fiscalDateEnding).getMonth() - 3)).toISOString().split('T')[0],
                            fy: fy,
                            fp_id: fp_id,
                            form_id: FORM_TYPES_MAP['10-Q'],
                            data_type: dataType.key,
                            value: parseFloat(report[avFieldName])
                        });
                    }
                });
            }
        });

        const filteredByYear = parsedData.filter(item => item.fy === year);

        res.status(200).json({ message: 'Alpha Vantage data successfully fetched', data: filteredByYear });

    } catch (err) {
        console.error('Error fetching/parsing Alpha Vantage data:', err);
        res.status(500).json({ message: 'Error fetching Alpha Vantage data.', error: err.message });
    }
};

// Function to save fetched Alpha Vantage data to the database
const saveFetchedAlphaVantageData = async (req, res) => {
    const { stock_id, data } = req.body;

    if (!stock_id || !data || !Array.isArray(data)) {
        return res.status(400).json({ message: 'Missing or invalid Alpha Vantage data to save.' });
    }

    let transaction;
    try {
        transaction = new sql.Transaction(sql.pool);
        await transaction.begin();

        for (const dataPoint of data) {
            const { period_end_date, period_start_date, fy, fp_id, form_id, data_type, value } = dataPoint;

            const checkRequest = new sql.Request(transaction);
            const existingData = await checkRequest.input('stock_id', sql.Int, stock_id)
                .input('period_end_date', sql.Date, period_end_date)
                .input('data_type', sql.NVarChar(100), data_type)
                .query`SELECT id FROM fundamental_data WHERE stock_id = @stock_id AND period_end_date = @period_end_date AND data_type = @data_type`;

            if (existingData.recordset.length > 0) {
                const updateRequest = new sql.Request(transaction);
                await updateRequest.input('id', sql.Int, existingData.recordset[0].id)
                    .input('value', sql.Decimal(18, 4), value)
                    .input('how_added', sql.NVarChar(100), how_added)
                    .input('period_start_date', sql.Date, period_start_date)
                    .query`UPDATE fundamental_data SET value = @value, how_added = @how_added, updated_at = GETDATE(), period_start_date = @period_start_date WHERE id = @id`;
            } else {
                const insertRequest = new sql.Request(transaction);
                await insertRequest.input('stock_id', sql.Int, stock_id)
                    .input('period_end_date', sql.Date, period_end_date)
                    .input('period_start_date', sql.Date, period_start_date)
                    .input('fy', sql.Int, fy)
                    .input('fp_id', sql.Int, fp_id)
                    .input('form_id', sql.Int, form_id)
                    .input('data_type', sql.NVarChar(100), data_type)
                    .input('value', sql.Decimal(18, 4), value)
                    .input('how_added', sql.NVarChar(100), how_added)
                    .query`INSERT INTO fundamental_data (stock_id, period_end_date, period_start_date, fy, fp_id, form_id, data_type, value, how_added)
                           VALUES (@stock_id, @period_end_date, @period_start_date, @fy, @fp_id, @form_id, @data_type, @value, @how_added)`;
            }
        }

        await transaction.commit();
        res.status(200).json({ message: 'Fundamental data successfully saved/updated.' });

    } catch (err) {
        console.error('Error during fundamental data transaction:', err);
        if (transaction) {
            try {
                await transaction.rollback();
                console.log('Transaction successfully rolled back.');
            } catch (rollbackErr) {
                console.error('Error during transaction rollback:', rollbackErr);
            }
        }
        res.status(500).json({ message: 'Error saving fundamental data.', error: err.message });
    }
};


// Function to fetch all fundamental data for a stock
const getAllFundamentalDataForStock = async (req, res) => {
    const { stockId } = req.params;
    try {
        const request = new sql.Request();
        const result = await request.input('stock_id', sql.Int, stockId)
            .query`SELECT id, period_start_date, period_end_date, fy, fp_id, form_id, data_type, value, how_added, created_at, updated_at
                   FROM fundamental_data WHERE stock_id = @stock_id ORDER BY period_end_date DESC, data_type ASC`;
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error fetching all fundamental data for stock:', err);
        res.status(500).json({ message: 'Error fetching fundamental data.', error: err.message });
    }
};

// Function to check data sufficiency (kept for existing AandelenData component, but will be replaced by new analysis)
const checkFundamentalDataSufficiency = async (req, res) => {
    const { stockId } = req.params;
    const sufficiencyResult = {};

    try {
        const request = new sql.Request();
        for (const dataType of FUNDAMENTAL_DATA_TYPES) {
            const result = await request.input('stock_id', sql.Int, stockId)
                .input('data_type', sql.NVarChar(100), dataType.key)
                .query`SELECT COUNT(DISTINCT period_end_date) AS quarter_count
                       FROM fundamental_data WHERE stock_id = @stock_id AND data_type = @data_type AND fp_id LIKE 'Q%'`;
            const count = result.recordset[0].quarter_count;
            sufficiencyResult[dataType.key] = {
                count: count,
                sufficient: count >= REQUIRED_QUARTERS_FOR_SUFFICIENCY
            };
        }
        res.status(200).json(sufficiencyResult);
    } catch (err) {
        console.error('Error checking fundamental data sufficiency:', err);
        res.status(500).json({ message: 'Error checking data sufficiency.', error: err.message });
    }
};


const PERIOD_CHECK_DAYS = 30; // Maximum number of days to check around the entered end date

const checkDateAndFetchData = async (req, res) => {
    const { stockId, periodEndDate } = req.params;

    if (!stockId || !periodEndDate) {
        return res.status(400).json({ message: 'Stock ID and period end date are required.' });
    }

    const inputEndDate = new Date(periodEndDate);
    if (isNaN(inputEndDate.getTime())) {
        return res.status(400).json({ message: 'Invalid period end date format.' });
    }

    try {
        // 1. Search for exact match for period_end_date
        const exactMatchRequest = new sql.Request();
        let exactMatchResult = await exactMatchRequest.input('stock_id', sql.Int, stockId)
            .input('period_end_date', sql.Date, inputEndDate)
            .query`SELECT id, period_start_date, period_end_date, fy, fp_id, form_id, data_type, value
                   FROM fundamental_data
                   WHERE stock_id = @stock_id AND period_end_date = @period_end_date`;

        if (exactMatchResult.recordset.length > 0) {
            const dataForDate = exactMatchResult.recordset;
            const uniqueMetaData = {
                fy: dataForDate[0].fy,
                fp_id: dataForDate[0].fp_id,
                form_id: dataForDate[0].form_id,
                period_start_date: dataForDate[0].period_start_date ? dataForDate[0].period_start_date.toISOString().split('T')[0] : null
            };
            return res.status(200).json({
                foundDate: inputEndDate.toISOString().split('T')[0],
                dataForDate: dataForDate,
                nearbyDate: null,
                message: `Exact data found for ${inputEndDate.toISOString().split('T')[0]}. Fields pre-filled.`,
                ...uniqueMetaData
            });
        }

        // 2. No exact match, search for nearby period_end_date
        const minEndDate = new Date(inputEndDate);
        minEndDate.setDate(inputEndDate.getDate() - PERIOD_CHECK_DAYS);
        const maxEndDate = new Date(inputEndDate);
        maxEndDate.setDate(inputEndDate.getDate() + PERIOD_CHECK_DAYS);

        const nearbyDateQueryRequest = new sql.Request();
        let nearbyDateQueryResult = await nearbyDateQueryRequest.input('stock_id', sql.Int, stockId)
            .input('input_end_date_for_diff', sql.Date, inputEndDate)
            .input('min_end_date', sql.Date, minEndDate)
            .input('max_end_date', sql.Date, maxEndDate)
            .query`SELECT TOP 1 period_start_date, period_end_date, fy, fp_id, form_id
                   FROM fundamental_data
                   WHERE stock_id = @stock_id AND period_end_date IS NOT NULL
                   AND period_end_date BETWEEN @min_end_date AND @max_end_date
                   ORDER BY ABS(ISNULL(DATEDIFF(day, period_end_date, @input_end_date_for_diff), 999999999)) ASC`;

        if (nearbyDateQueryResult.recordset.length > 0) {
            const nearbyRecord = nearbyDateQueryResult.recordset[0];
            const nearbyActualEndDate = nearbyRecord.period_end_date;
            const formattedNearbyEndDate = nearbyActualEndDate.toISOString().split('T')[0];

            const nearbyDataRequest = new sql.Request();
            const nearbyDataResult = await nearbyDataRequest.input('stock_id', sql.Int, stockId)
                .input('period_end_date', sql.Date, nearbyActualEndDate)
                .query`SELECT period_start_date, period_end_date, fy, fp_id, form_id, data_type, value
                       FROM fundamental_data
                       WHERE stock_id = @stock_id AND period_end_date = @period_end_date`;

            const dataForDate = nearbyDataResult.recordset;
            const uniqueMetaData = {
                fy: nearbyRecord.fy,
                fp_id: nearbyRecord.fp_id,
                form_id: nearbyRecord.form_id,
                period_start_date: nearbyRecord.period_start_date ? nearbyRecord.period_start_date.toISOString().split('T')[0] : null
            };

            return res.status(200).json({
                foundDate: formattedNearbyEndDate,
                dataForDate: dataForDate,
                nearbyDate: formattedNearbyEndDate,
                message: `No exact data for ${inputEndDate.toISOString().split('T')[0]}. Data found for a nearby date: ${formattedNearbyEndDate}.`,
                ...uniqueMetaData
            });
        }

        // 3. No exact or nearby period_end_date found, generate a suggestedPeriodStartDate
        let suggestedPeriodStartDate = new Date(inputEndDate);
        suggestedPeriodStartDate.setDate(inputEndDate.getDate() - 90); // Default to quarter

        // Search for the most recent period_end_date in the past for this stock
        const lastPeriodRequest = new sql.Request();
        const lastPeriodResult = await lastPeriodRequest.input('stock_id', sql.Int, stockId)
            .input('input_end_date', sql.Date, inputEndDate)
            .query`SELECT TOP 1 period_end_date
                   FROM fundamental_data
                   WHERE stock_id = @stock_id AND period_end_date < @input_end_date
                   ORDER BY period_end_date DESC`;

        if (lastPeriodResult.recordset.length > 0) {
            const lastRecordedEndDate = new Date(lastPeriodResult.recordset[0].period_end_date);
            suggestedPeriodStartDate = new Date(lastRecordedEndDate);
            suggestedPeriodStartDate.setDate(lastRecordedEndDate.getDate() + 1); // Day after previous end date
        }

        // Ensure suggestedPeriodStartDate is not more than 1 year before inputEndDate
        const oneYearBeforeEndDate = new Date(inputEndDate);
        oneYearBeforeEndDate.setFullYear(inputEndDate.getFullYear() - 1);
        if (suggestedPeriodStartDate < oneYearBeforeEndDate) {
            suggestedPeriodStartDate = oneYearBeforeEndDate; // Cap at 1 year back
        }

        // Ensure suggestedPeriodStartDate is always before inputEndDate
        if (suggestedPeriodStartDate >= inputEndDate) {
            suggestedPeriodStartDate = new Date(inputEndDate);
            suggestedPeriodStartDate.setDate(inputEndDate.getDate() - 1); // At least 1 day before
        }


        res.status(200).json({
            foundDate: null,
            dataForDate: [],
            nearbyDate: null,
            fy: null,
            fp_id: null,
            form_id: null,
            suggestedPeriodStartDate: suggestedPeriodStartDate.toISOString().split('T')[0],
            message: 'No existing data found for this date or nearby. You can add new data.'
        });

    } catch (err) {
        console.error('Error in checkDateAndFetchData (CATCH BLOCK HIT):', err);
        res.status(500).json({ message: 'Internal server error during date check.', error: err.message });
    }
};

// NEW: Function to delete fundamental data for a specific stock and period end date
const deleteFundamentalData = async (req, res) => {
    const idParam = req.params.id; // Get the ID from the URL parameters (as string)
    console.log('Received ID for deletion (string):', idParam);
    console.log('Type of received ID:', typeof idParam);

    const id = parseInt(idParam, 10); // Convert to an integer

    if (isNaN(id)) { // Check if the conversion was successful
        return res.status(400).json({ message: 'Invalid Item ID provided. Must be a number.' });
    }

    try {
        const request = new sql.Request();
        // Delete based on the unique 'id'
        const result = await request.input('id', sql.Int, id) // Use the parsed integer ID
            .query`DELETE FROM fundamental_data WHERE id = @id`;

        if (result.rowsAffected[0] > 0) {
            res.status(200).json({ message: 'Fundamental data successfully deleted.' });
        } else {
            res.status(404).json({ message: 'No matching fundamental data found to delete.' });
        }
    } catch (err) {
        console.error('Error deleting fundamental data:', err);
        res.status(500).json({ message: 'Error deleting fundamental data.', error: err.message });
    }
};


// NEW: Function to get all fiscal periods from the FiscalPeriods table
const getFiscalPeriods = async (req, res) => {
    try {
        const request = new sql.Request();
        const result = await request.query`SELECT fp_id, fp FROM FiscalPeriods ORDER BY fp_id ASC`;
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error fetching fiscal periods:', err);
        res.status(500).json({ message: 'Error fetching fiscal periods.', error: err.message });
    }
};

// NEW: Function to get all form types from the Forms table
const getForms = async (req, res) => {
    try {
        const request = new sql.Request();
        const result = await request.query`SELECT form_id AS id, form AS name FROM Forms ORDER BY form_id ASC`;
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error fetching form types:', err);
        res.status(500).json({ message: 'Error fetching form types.', error: err.message });
    }
};

/**
 * Helper function to format a Date object to "YYYY-MM-DD" string.
 * @param {Date} date - The date object to format.
 * @returns {string} The formatted date string.
 */
const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Helper function to get the fiscal period ID (1-4) from a date.
 * Assumes Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec.
 * @param {Date} date - The date.
 * @returns {number} The fiscal period ID (1-4).
 */
const getFiscalPeriodIdFromDate = (date) => {
    const month = date.getMonth() + 1;
    if (month >= 1 && month <= 3) return 1;
    if (month >= 4 && month <= 6) return 2;
    if (month >= 7 && month <= 9) return 3;
    if (month >= 10 && month <= 12) return 4;
    return 0; // Should not happen for valid dates
};


/**
 * NEW: Function to get an overview of fundamental data analysis for multiple tickers.
 * Includes data completeness, multiple entries per quarter, and fiscal period sequence checks.
 * @param {object} req - The request object. Expects { dataPeriods, selectedDate, maxLookbackMonths } in body.
 * @param {object} res - The response object.
 */
const getTickerOverviewAnalysis = async (req, res) => {
    const { dataPeriods, selectedDate, maxLookbackMonths } = req.body;

    if (!dataPeriods || !selectedDate || !maxLookbackMonths) {
        return res.status(400).json({ message: 'Missing required parameters: dataPeriods, selectedDate, maxLookbackMonths.' });
    }

    const referenceDate = new Date(selectedDate);
    const earliestAllowedDate = new Date(referenceDate);
    earliestAllowedDate.setMonth(earliestAllowedDate.getMonth() - maxLookbackMonths);

    try {
        const request = new sql.Request();
        // Fetch all stocks that are in watchlist or ideal portfolio
        const stocksToAnalyze = (await request.query`
            SELECT s.aandeel_id, s.ticker_symbol, s.name
            FROM [dbo].[Stocks] s
            WHERE s.inWatchlist = 1 OR s.inIdealePortfolio = 1;
        `).recordset;

        const analysisResults = [];

        for (const stock of stocksToAnalyze) {
            const stockId = stock.aandeel_id;
            
            // Fetch all fundamental data for the current stock within the lookback period
            const fundamentalData = (await request.input('stock_id', sql.Int, stockId)
                .input('earliest_date', sql.Date, earliestAllowedDate)
                .input('latest_date', sql.Date, referenceDate)
                .query`
                    SELECT period_end_date, fy, fp_id, data_type, value
                    FROM fundamental_data
                    WHERE stock_id = @stock_id
                    AND period_end_date BETWEEN @earliest_date AND @latest_date
                    ORDER BY period_end_date ASC, data_type ASC
                `).recordset;

            // Filter fundamentalData to only include types defined in FUNDAMENTAL_DATA_TYPES
            const relevantFundamentalData = fundamentalData.filter(item =>
                FUNDAMENTAL_DATA_TYPES.some(type => type.key === item.data_type)
            );

            // --- Analysis Logic ---

            // 1. Data Type Completeness
            const dataTypeCompleteness = {};
            let totalExpectedDataPoints = 0;
            let totalFoundDataPoints = 0;

            for (const dataTypeConfig of FUNDAMENTAL_DATA_TYPES) {
                const expectedMonths = dataPeriods[dataTypeConfig.key];
                const expectedQuarters = expectedMonths / 3; // Assuming 3 months per quarter

                // Calculate the earliest expected date for this specific data type's lookback
                const earliestExpectedDateForType = new Date(referenceDate);
                earliestExpectedDateForType.setMonth(earliestExpectedDateForType.getMonth() - expectedMonths);

                // Filter data for the current data type AND within its specific expected period
                const relevantDataForThisSpecificType = relevantFundamentalData.filter(d =>
                    d.data_type === dataTypeConfig.key &&
                    d.period_end_date >= earliestExpectedDateForType &&
                    d.period_end_date <= referenceDate
                );

                // Count unique period_end_date for this data type within its specific lookback period
                const foundCount = new Set(relevantDataForThisSpecificType.map(d => d.period_end_date.toISOString().split('T')[0])).size;


                dataTypeCompleteness[dataTypeConfig.key] = {
                    foundCount: foundCount,
                    expectedCount: expectedQuarters,
                    percentage: expectedQuarters > 0 ? (foundCount / expectedQuarters) * 100 : 100,
                    earliestExpectedDate: formatDate(earliestExpectedDateForType) // Add earliest expected date
                };
                totalExpectedDataPoints += expectedQuarters;
                totalFoundDataPoints += foundCount;
            }
            const overallCompletenessPercentage = totalExpectedDataPoints > 0 ? (totalFoundDataPoints / totalExpectedDataPoints) * 100 : 100;


            // 2. Multiple Dates Per Quarter (Anomaly)
            const multipleDatesPerQuarter = [];
            const quarterMap = new Map(); // Key: `${year_from_period_end_date}-${fp_id}-${data_type}`, Value: Set of period_end_dates

            relevantFundamentalData.forEach(item => {
                // Only consider quarterly periods (fp_id 1-4)
                if (item.fp_id >= 1 && item.fp_id <= 4) {
                    const yearFromPeriodEndDate = new Date(item.period_end_date).getFullYear(); // Use year from period_end_date
                    const key = `${yearFromPeriodEndDate}-${item.fp_id}-${item.data_type}`;
                    if (!quarterMap.has(key)) {
                        quarterMap.set(key, new Set());
                    }
                    quarterMap.get(key).add(item.period_end_date.toISOString().split('T')[0]);
                }
            });

            quarterMap.forEach((datesSet, key) => {
                if (datesSet.size > 1) {
                    const [year, fp_id, data_type] = key.split('-');
                    multipleDatesPerQuarter.push({
                        dataType: data_type,
                        fy: parseInt(year), // Use year from period_end_date
                        fp_id: parseInt(fp_id),
                        dates: Array.from(datesSet).sort()
                    });
                }
            });


            // 3. Fiscal Period (FP ID) Sequence Check
            const brokenQuarterSequenceDetails = [];
            const quarterlyDataGroupedByDataType = new Map(); // Key: data_type, Value: Array of {period_end_date, fy_from_period_end_date, fp_id}

            relevantFundamentalData.forEach(item => {
                if (item.fp_id >= 1 && item.fp_id <= 4) { // Only consider quarterly periods
                    if (!quarterlyDataGroupedByDataType.has(item.data_type)) {
                        quarterlyDataGroupedByDataType.set(item.data_type, []);
                    }
                    quarterlyDataGroupedByDataType.get(item.data_type).push({
                        period_end_date: item.period_end_date,
                        fy_from_period_end_date: new Date(item.period_end_date).getFullYear(), // Use year from period_end_date
                        fp_id: item.fp_id
                    });
                }
            });

            quarterlyDataGroupedByDataType.forEach((periods, dataType) => {
                // Sort periods ascending by date
                const sortedPeriods = [...periods].sort((a, b) => a.period_end_date.getTime() - b.period_end_date.getTime());

                for (let i = 1; i < sortedPeriods.length; i++) {
                    const prevPeriod = sortedPeriods[i - 1];
                    const currentPeriod = sortedPeriods[i];

                    // Determine expected next FP ID (1-4 cycle)
                    const expectedNextFpId = (prevPeriod.fp_id % 4) + 1;

                    const diffDays = Math.ceil(Math.abs(currentPeriod.period_end_date.getTime() - prevPeriod.period_end_date.getTime()) / (1000 * 60 * 60 * 24));

                    // Check if FP ID sequence is correct
                    const isFpIdSequenceCorrect = (currentPeriod.fp_id === expectedNextFpId);

                    // Check if time gap is correct for a regular quarter (approx 3 months)
                    const isTimeGapCorrect = (diffDays >= 60 && diffDays <= 120);

                    // Check if time gap is correct for a year transition (Q4 to Q1, approx 12-13 months)
                    const isYearTransition = (prevPeriod.fp_id === 4 && currentPeriod.fp_id === 1);
                    // Allow a wider range for year transition, e.g., 11 to 13 months (335 to 395 days)
                    const isTimeGapCorrectForYearTransition = (diffDays >= 335 && diffDays <= 395);

                    // Anomaly is detected if FP ID sequence is broken OR
                    // if the time gap is not correct for a regular quarter AND not correct for a year transition
                    if (!isFpIdSequenceCorrect || (!isTimeGapCorrect && !isTimeGapCorrectForYearTransition)) {
                        const reason = [];
                        if (!isFpIdSequenceCorrect) reason.push("FP ID sequence incorrect");
                        // Removed strict year sequence check as requested
                        if (!isTimeGapCorrect && !isTimeGapCorrectForYearTransition) reason.push("Time gap not typical for a quarter/year transition");

                        brokenQuarterSequenceDetails.push({
                            dataType: dataType,
                            prevDate: formatDate(prevPeriod.period_end_date),
                            prevFpId: prevPeriod.fp_id,
                            prevFy: prevPeriod.fy_from_period_end_date, // Keep for context
                            currentDate: formatDate(currentPeriod.period_end_date),
                            currentFpId: currentPeriod.fp_id,
                            currentFy: currentPeriod.fy_from_period_end_date, // Keep for context
                            expectedFpId: expectedNextFpId,
                            daysDifference: diffDays,
                            reason: reason.join(" & ")
                        });
                    }
                }
            });

            // 4. Missing Recent Quarters (Anomaly) - Reverted to previous logic for iteration and gap detection
            const missingRecentQuarters = [];
            const today = new Date();
            const missingCutoffDate = new Date(referenceDate); // Keep referenceDate
            const diffDaysFromToday = Math.ceil(Math.abs(referenceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDaysFromToday <= 60) {
                missingCutoffDate.setDate(referenceDate.getDate() - 60);
            } else {
                missingCutoffDate.setDate(referenceDate.getDate());
            }

            for (const dataTypeConfig of FUNDAMENTAL_DATA_TYPES) {
                const relevantDataForType = relevantFundamentalData.filter(d => d.data_type === dataTypeConfig.key);
                const sortedDataForType = [...relevantDataForType].sort((a, b) => a.period_end_date.getTime() - b.period_end_date.getTime());

                const actualPeriodEndDates = sortedDataForType.map(d => d.period_end_date);
                const actualPeriodEndDatesStrings = actualPeriodEndDates.map(d => formatDate(d));

                // Bepaal de meest recente werkelijke datum voor dit datatype
                const latestActualDateForType = actualPeriodEndDates.length > 0 ? actualPeriodEndDates[actualPeriodEndDates.length - 1] : null;

                // Startpunt voor het genereren van verwachte kwartalen
                let currentExpectedDate;
                if (latestActualDateForType) {
                    currentExpectedDate = new Date(latestActualDateForType);
                    currentExpectedDate.setMonth(currentExpectedDate.getMonth() + 3); // Begin met de eerste verwachte kwartaal na de laatste bekende
                } else {
                    // Als er geen data is voor dit datatype, begin dan vanaf de referenceDate en ga 3 maanden terug
                    currentExpectedDate = new Date(referenceDate);
                    // Pas aan naar het einde van het kwartaal (bijv. als referenceDate 2024-07-15 is, start vanaf 2024-06-30)
                    const currentMonth = currentExpectedDate.getMonth();
                    if (currentMonth >= 0 && currentMonth <= 2) currentExpectedDate.setMonth(2, 31); // Maart 31
                    else if (currentMonth >= 3 && currentMonth <= 5) currentExpectedDate.setMonth(5, 30); // Juni 30
                    else if (currentMonth >= 6 && currentMonth <= 8) currentExpectedDate.setMonth(8, 30); // September 30
                    else currentExpectedDate.setMonth(11, 31); // December 31
                }

                // Genereer verwachte kwartalen vooruit in de tijd (vanaf laatste bekende of referenceDate)
                // en controleer op ontbrekende kwartalen tot aan de referenceDate
                while (currentExpectedDate <= referenceDate) {
                    // Alleen overwegen als de verwachte datum vóór of op de missingCutoffDate ligt
                    if (currentExpectedDate <= missingCutoffDate) {
                        const formattedExpectedDate = formatDate(currentExpectedDate);
                        const found = actualPeriodEndDatesStrings.some(itemDateStr => {
                            const itemDate = new Date(itemDateStr);
                            const diff = Math.abs(itemDate.getTime() - currentExpectedDate.getTime());
                            const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
                            return diffDays <= 30; // Tolerantie van +/- 30 dagen
                        });

                        if (!found) {
                            missingRecentQuarters.push({
                                dataType: dataTypeConfig.key,
                                expectedDate: formattedExpectedDate,
                                reason: "Missing recent quarter"
                            });
                        }
                    }
                    currentExpectedDate.setMonth(currentExpectedDate.getMonth() + 3); // Ga naar het volgende kwartaal
                }

                // Controleer op gaten in de historische data (tussen bestaande datapunten)
                for (let i = 0; i < sortedDataForType.length - 1; i++) {
                    const prevPeriod = sortedDataForType[i];
                    const nextPeriod = sortedDataForType[i + 1];

                    const prevDate = prevPeriod.period_end_date;
                    const nextDate = nextPeriod.period_end_date;

                    const diffDays = Math.ceil((nextDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

                    // Als het tijdsverschil groter is dan een normaal kwartaal (bijv. > 120 dagen),
                    // dan is er een of meer kwartalen overgeslagen.
                    if (diffDays > 120) {
                        let expectedMissingDate = new Date(prevDate);
                        expectedMissingDate.setMonth(expectedMissingDate.getMonth() + 3); // Begin met het eerste potentieel ontbrekende kwartaal

                        // Blijf 3 maanden toevoegen totdat we de volgende werkelijke datapunt bereiken of passeren
                        while (expectedMissingDate < nextDate) {
                            if (expectedMissingDate >= earliestAllowedDate && expectedMissingDate <= missingCutoffDate) {
                                const formattedExpectedDate = formatDate(expectedMissingDate);
                                const found = actualPeriodEndDatesStrings.some(itemDateStr => {
                                    const itemDate = new Date(itemDateStr);
                                    const diff = Math.abs(itemDate.getTime() - expectedMissingDate.getTime());
                                    return diff <= (30 * 24 * 60 * 60 * 1000); // 30 dagen tolerantie
                                });

                                if (!found) {
                                    missingRecentQuarters.push({
                                        dataType: dataTypeConfig.key,
                                        expectedDate: formattedExpectedDate,
                                        reason: "Missing historical quarter (gap detected)"
                                    });
                                }
                            }
                            expectedMissingDate.setMonth(expectedMissingDate.getMonth() + 3);
                        }
                    }
                }
            }
            // Sorteer ontbrekende recente kwartalen op datum (oplopend)
            missingRecentQuarters.sort((a, b) => new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime());
        }

        res.status(200).json(analysisResults);

    } catch (err) {
        console.error('Error in getTickerOverviewAnalysis:', err);
        res.status(500).json({ message: 'Error performing ticker overview analysis.', error: err.message });
    }
};

/**
 * NEW: Function to get fundamental data analysis for a single ticker.
 * This is a specialized version of getTickerOverviewAnalysis for a single stock.
 * @param {object} req - The request object. Expects stockId in params, { dataPeriods, selectedDate, maxLookbackMonths } in body.
 * @param {object} res - The response object.
 */
const getSingleStockAnalysis = async (req, res) => {
    const { stockId } = req.params;
    const { dataPeriods, selectedDate, maxLookbackMonths } = req.body;

    if (!stockId || !dataPeriods || !selectedDate || !maxLookbackMonths) {
        return res.status(400).json({ message: 'Missing required parameters: stockId, dataPeriods, selectedDate, maxLookbackMonths.' });
    }

    const referenceDate = new Date(selectedDate);
    const earliestAllowedDate = new Date(referenceDate);
    earliestAllowedDate.setMonth(earliestAllowedDate.getMonth() - maxLookbackMonths);
    const today = new Date(); // Correctly define 'today' here

    try {
        // Create a new request for fetching stock ticker
        const stockInfoRequest = new sql.Request();
        // Fetch stock ticker to determine fiscal year end
        const stockInfo = (await stockInfoRequest.input('stock_id', sql.Int, stockId)
            .query`SELECT ticker_symbol FROM [dbo].[Stocks] WHERE aandeel_id = @stock_id`).recordset[0];

        const tickerSymbol = stockInfo ? stockInfo.ticker_symbol : '';

        // Create a new request for fetching fundamental data
        const fundamentalDataRequest = new sql.Request();
        // Fetch all fundamental data for the current stock within the lookback period
        const fundamentalData = (await fundamentalDataRequest.input('stock_id', sql.Int, stockId)
            .input('earliest_date', sql.Date, earliestAllowedDate)
            .input('latest_date', sql.Date, referenceDate)
            .query`
                SELECT period_end_date, fy, fp_id, data_type, value
                FROM fundamental_data
                WHERE stock_id = @stock_id
                AND period_end_date BETWEEN @earliest_date AND @latest_date
                ORDER BY period_end_date ASC, data_type ASC
            `).recordset;

        // Filter fundamentalData to only include types defined in FUNDAMENTAL_DATA_TYPES
        const relevantFundamentalData = fundamentalData.filter(item =>
            FUNDAMENTAL_DATA_TYPES.some(type => type.key === item.data_type)
        );

        // --- Analysis Logic (copied from getTickerOverviewAnalysis and adapted for single stock) ---

        // 1. Data Type Completeness
        const dataTypeCompleteness = {};
        let totalExpectedDataPoints = 0;
        let totalFoundDataPoints = 0;
        let allData100PercentComplete = true; // Nieuwe vlag

        for (const dataTypeConfig of FUNDAMENTAL_DATA_TYPES) {
            const expectedMonths = dataPeriods[dataTypeConfig.key];
            const expectedQuarters = expectedMonths / 3; // Assuming 3 months per quarter

            // Calculate the earliest expected date for this specific data type's lookback
            const earliestExpectedDateForType = new Date(referenceDate);
            earliestExpectedDateForType.setMonth(earliestExpectedDateForType.getMonth() - expectedMonths);

            // Filter data for the current data type AND within its specific expected period
            const relevantDataForThisSpecificType = relevantFundamentalData.filter(d =>
                d.data_type === dataTypeConfig.key &&
                d.period_end_date >= earliestExpectedDateForType &&
                d.period_end_date <= referenceDate
            );

            // Count unique period_end_date for this data type within its specific lookback period
            const foundCount = new Set(relevantDataForThisSpecificType.map(d => d.period_end_date.toISOString().split('T')[0])).size;

            const percentage = expectedQuarters > 0 ? (foundCount / expectedQuarters) * 100 : 100;
            if (percentage < 100) {
                allData100PercentComplete = false; // Als één percentage niet 100% is, zet de vlag op false
            }

            dataTypeCompleteness[dataTypeConfig.key] = {
                foundCount: foundCount,
                expectedCount: expectedQuarters,
                percentage: percentage,
                earliestExpectedDate: formatDate(earliestExpectedDateForType) // Add earliest expected date
            };
            totalExpectedDataPoints += expectedQuarters;
            totalFoundDataPoints += foundCount;
        }
        const overallCompletenessPercentage = totalExpectedDataPoints > 0 ? (totalFoundDataPoints / totalExpectedDataPoints) * 100 : 100;


        // 2. Multiple Dates Per Quarter (Anomaly)
        const multipleDatesPerQuarter = [];
        const quarterMap = new Map(); // Key: `${year_from_period_end_date}-${fp_id}-${data_type}`, Value: Set of period_end_dates

        relevantFundamentalData.forEach(item => {
            // Only consider quarterly periods (fp_id 1-4)
            if (item.fp_id >= 1 && item.fp_id <= 4) {
                const yearFromPeriodEndDate = new Date(item.period_end_date).getFullYear(); // Use year from period_end_date
                const key = `${yearFromPeriodEndDate}-${item.fp_id}-${item.data_type}`;
                if (!quarterMap.has(key)) {
                    quarterMap.set(key, new Set());
                }
                quarterMap.get(key).add(item.period_end_date.toISOString().split('T')[0]);
            }
        });

        quarterMap.forEach((datesSet, key) => {
            if (datesSet.size > 1) {
                const [year, fp_id, data_type] = key.split('-');
                multipleDatesPerQuarter.push({
                    dataType: data_type,
                    fy: parseInt(year), // Use year from period_end_date
                    fp_id: parseInt(fp_id),
                    dates: Array.from(datesSet).sort()
                });
            }
        });


        // 3. Fiscal Period (FP ID) Sequence Check
        const brokenQuarterSequenceDetails = [];
        const quarterlyDataGroupedByDataType = new Map(); // Key: data_type, Value: Array of {period_end_date, fy_from_period_end_date, fp_id}

        relevantFundamentalData.forEach(item => {
            if (item.fp_id >= 1 && item.fp_id <= 4) { // Only consider quarterly periods
                if (!quarterlyDataGroupedByDataType.has(item.data_type)) {
                    quarterlyDataGroupedByDataType.set(item.data_type, []);
                }
                quarterlyDataGroupedByDataType.get(item.data_type).push({
                    period_end_date: item.period_end_date,
                    fy_from_period_end_date: new Date(item.period_end_date).getFullYear(), // Use year from period_end_date
                    fp_id: item.fp_id
                });
            }
        });

        quarterlyDataGroupedByDataType.forEach((periods, dataType) => {
            // Sort periods ascending by date
            const sortedPeriods = [...periods].sort((a, b) => a.period_end_date.getTime() - b.period_end_date.getTime());

            for (let i = 1; i < sortedPeriods.length; i++) {
                const prevPeriod = sortedPeriods[i - 1];
                const currentPeriod = sortedPeriods[i];

                // Determine expected next FP ID (1-4 cycle)
                const expectedNextFpId = (prevPeriod.fp_id % 4) + 1;

                const diffDays = Math.ceil(Math.abs(currentPeriod.period_end_date.getTime() - prevPeriod.period_end_date.getTime()) / (1000 * 60 * 60 * 24));

                // Check if FP ID sequence is correct
                const isFpIdSequenceCorrect = (currentPeriod.fp_id === expectedNextFpId);

                // Check if time gap is correct for a regular quarter (approx 3 months)
                const isTimeGapCorrect = (diffDays >= 60 && diffDays <= 120);

                // Check if time gap is correct for a year transition (Q4 to Q1, approx 12-13 months)
                const isYearTransition = (prevPeriod.fp_id === 4 && currentPeriod.fp_id === 1);
                // Allow a wider range for year transition, e.g., 11 to 13 months (335 to 395 days)
                const isTimeGapCorrectForYearTransition = (diffDays >= 335 && diffDays <= 395);

                // Anomaly is detected if FP ID sequence is broken OR
                // if the time gap is not correct for a regular quarter AND not correct for a year transition
                if (!isFpIdSequenceCorrect || (!isTimeGapCorrect && !isTimeGapCorrectForYearTransition)) {
                    const reason = [];
                    if (!isFpIdSequenceCorrect) reason.push("FP ID sequence incorrect");
                    // Removed strict year sequence check as requested
                    if (!isTimeGapCorrect && !isTimeGapCorrectForYearTransition) reason.push("Time gap not typical for a quarter/year transition");

                    brokenQuarterSequenceDetails.push({
                        dataType: dataType,
                        prevDate: formatDate(prevPeriod.period_end_date),
                        prevFpId: prevPeriod.fp_id,
                        prevFy: prevPeriod.fy_from_period_end_date, // Keep for context
                        currentDate: formatDate(currentPeriod.period_end_date),
                        currentFpId: currentPeriod.fp_id,
                        currentFy: currentPeriod.fy_from_period_end_date, // Keep for context
                        expectedFpId: expectedNextFpId,
                        daysDifference: diffDays,
                        reason: reason.join(" & ")
                    });
                }
            }
        });

        // 4. Missing Recent Quarters (Anomaly) - Reverted to previous logic for iteration and gap detection
        const missingRecentQuarters = [];
        const missingCutoffDate = new Date(referenceDate); // Keep referenceDate
        const diffDaysFromToday = Math.ceil(Math.abs(referenceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDaysFromToday <= 60) {
            missingCutoffDate.setDate(referenceDate.getDate() - 60);
        } else {
            missingCutoffDate.setDate(referenceDate.getDate());
        }

        for (const dataTypeConfig of FUNDAMENTAL_DATA_TYPES) {
            const relevantDataForType = relevantFundamentalData.filter(d => d.data_type === dataTypeConfig.key);
            const sortedDataForType = [...relevantDataForType].sort((a, b) => a.period_end_date.getTime() - b.period_end_date.getTime());

            const actualPeriodEndDates = sortedDataForType.map(d => d.period_end_date);
            const actualPeriodEndDatesStrings = actualPeriodEndDates.map(d => formatDate(d));

            // Bepaal de meest recente werkelijke datum voor dit datatype
            const latestActualDateForType = actualPeriodEndDates.length > 0 ? actualPeriodEndDates[actualPeriodEndDates.length - 1] : null;

            // Startpunt voor het genereren van verwachte kwartalen
            let currentExpectedDate;
            if (latestActualDateForType) {
                currentExpectedDate = new Date(latestActualDateForType);
                currentExpectedDate.setMonth(currentExpectedDate.getMonth() + 3); // Begin met de eerste verwachte kwartaal na de laatste bekende
            } else {
                // Als er geen data is voor dit datatype, begin dan vanaf de referenceDate en ga 3 maanden terug
                currentExpectedDate = new Date(referenceDate);
                // Pas aan naar het einde van het kwartaal (bijv. als referenceDate 2024-07-15 is, start vanaf 2024-06-30)
                const currentMonth = currentExpectedDate.getMonth();
                if (currentMonth >= 0 && currentMonth <= 2) currentExpectedDate.setMonth(2, 31); // Maart 31
                else if (currentMonth >= 3 && currentMonth <= 5) currentExpectedDate.setMonth(5, 30); // Juni 30
                else if (currentMonth >= 6 && currentMonth <= 8) currentExpectedDate.setMonth(8, 30); // September 30
                else currentExpectedDate.setMonth(11, 31); // December 31
            }

            // Genereer verwachte kwartalen vooruit in de tijd (vanaf laatste bekende of referenceDate)
            // en controleer op ontbrekende kwartalen tot aan de referenceDate
            while (currentExpectedDate <= referenceDate) {
                // Alleen overwegen als de verwachte datum vóór of op de missingCutoffDate ligt
                if (currentExpectedDate <= missingCutoffDate) {
                    const formattedExpectedDate = formatDate(currentExpectedDate);
                    const found = actualPeriodEndDatesStrings.some(itemDateStr => {
                        const itemDate = new Date(itemDateStr);
                        const diff = Math.abs(itemDate.getTime() - currentExpectedDate.getTime());
                        const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
                        return diffDays <= 30; // Tolerantie van +/- 30 dagen
                    });

                    if (!found) {
                        missingRecentQuarters.push({
                            dataType: dataTypeConfig.key,
                            expectedDate: formattedExpectedDate,
                            reason: "Missing recent quarter"
                        });
                    }
                }
                currentExpectedDate.setMonth(currentExpectedDate.getMonth() + 3); // Ga naar het volgende kwartaal
            }

            // Controleer op gaten in de historische data (tussen bestaande datapunten)
            for (let i = 0; i < sortedDataForType.length - 1; i++) {
                const prevPeriod = sortedDataForType[i];
                const nextPeriod = sortedDataForType[i + 1];

                const prevDate = prevPeriod.period_end_date;
                const nextDate = nextPeriod.period_end_date;

                const diffDays = Math.ceil((nextDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

                // Als het tijdsverschil groter is dan een normaal kwartaal (bijv. > 120 dagen),
                // dan is er een of meer kwartalen overgeslagen.
                if (diffDays > 120) {
                    let expectedMissingDate = new Date(prevDate);
                    expectedMissingDate.setMonth(expectedMissingDate.getMonth() + 3); // Begin met het eerste potentieel ontbrekende kwartaal

                    // Blijf 3 maanden toevoegen totdat we de volgende werkelijke datapunt bereiken of passeren
                    while (expectedMissingDate < nextDate) {
                        if (expectedMissingDate >= earliestAllowedDate && expectedMissingDate <= missingCutoffDate) {
                            const formattedExpectedDate = formatDate(expectedMissingDate);
                            const found = actualPeriodEndDatesStrings.some(itemDateStr => {
                                const itemDate = new Date(itemDateStr);
                                const diff = Math.abs(itemDate.getTime() - expectedMissingDate.getTime());
                                return diff <= (30 * 24 * 60 * 60 * 1000); // 30 dagen tolerantie
                            });

                            if (!found) {
                                missingRecentQuarters.push({
                                    dataType: dataTypeConfig.key,
                                    expectedDate: formattedExpectedDate,
                                    reason: "Missing historical quarter (gap detected)"
                                });
                            }
                        }
                        expectedMissingDate.setMonth(expectedMissingDate.getMonth() + 3);
                    }
                }
            }
        }
        // Sorteer ontbrekende recente kwartalen op datum (oplopend)
        missingRecentQuarters.sort((a, b) => new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime());


        const singleStockAnalysisResult = {
            aandeel_id: parseInt(stockId),
            ticker_symbol: tickerSymbol, // Voeg ticker_symbol toe
            selected_date: formatDate(referenceDate), // Voeg selected_date toe
            overallCompletenessPercentage: overallCompletenessPercentage,
            dataTypeCompleteness: dataTypeCompleteness,
            multipleDatesPerQuarter: multipleDatesPerQuarter,
            quarterSequenceBroken: brokenQuarterSequenceDetails.length > 0,
            brokenQuarterSequenceDetails: brokenQuarterSequenceDetails,
            missingRecentQuarters: missingRecentQuarters, // Add new anomaly
            allData100PercentComplete: allData100PercentComplete // Nieuwe vlag
        };

        res.status(200).json(singleStockAnalysisResult);

    } catch (err) {
        console.error('Error in getSingleStockAnalysis:', err);
        res.status(500).json({ message: 'Error performing single stock analysis.', error: err.message });
    }
};


const getSingleStockAnalysis = async (req, res) => {
    const { stockId } = req.params;
    const { dataPeriods, selectedDate, maxLookbackMonths } = req.body;

    if (!stockId || !dataPeriods || !selectedDate || !maxLookbackMonths) {
        return res.status(400).json({ message: 'Missing required parameters: stockId, dataPeriods, selectedDate, maxLookbackMonths.' });
    }

    const referenceDate = new Date(selectedDate);
    const earliestAllowedDate = new Date(referenceDate);
    earliestAllowedDate.setMonth(earliestAllowedDate.getMonth() - maxLookbackMonths);
    const today = new Date(); // Correctly define 'today' here

    try {
        // Create a new request for fetching stock ticker
        const stockInfoRequest = new sql.Request();
        // Fetch stock ticker to determine fiscal year end
        const stockInfo = (await stockInfoRequest.input('stock_id', sql.Int, stockId)
            .query`SELECT ticker_symbol FROM [dbo].[Stocks] WHERE aandeel_id = @stock_id`).recordset[0];

        const tickerSymbol = stockInfo ? stockInfo.ticker_symbol : '';

        // Create a new request for fetching fundamental data
        const fundamentalDataRequest = new sql.Request();
        // Fetch all fundamental data for the current stock within the lookback period
        const fundamentalData = (await fundamentalDataRequest.input('stock_id', sql.Int, stockId)
            .input('earliest_date', sql.Date, earliestAllowedDate)
            .input('latest_date', sql.Date, referenceDate)
            .query`
                SELECT period_end_date, fy, fp_id, data_type, value
                FROM fundamental_data
                WHERE stock_id = @stock_id
                AND period_end_date BETWEEN @earliest_date AND @latest_date
                ORDER BY period_end_date ASC, data_type ASC
            `).recordset;

        // Filter fundamentalData to only include types defined in FUNDAMENTAL_DATA_TYPES
        const relevantFundamentalData = fundamentalData.filter(item =>
            FUNDAMENTAL_DATA_TYPES.some(type => type.key === item.data_type)
        );

        // --- Analysis Logic (copied from getTickerOverviewAnalysis and adapted for single stock) ---

        // 1. Data Type Completeness
        const dataTypeCompleteness = {};
        let totalExpectedDataPoints = 0;
        let totalFoundDataPoints = 0;
        let allData100PercentComplete = true; // Nieuwe vlag

        for (const dataTypeConfig of FUNDAMENTAL_DATA_TYPES) {
            const expectedMonths = dataPeriods[dataTypeConfig.key];
            const expectedQuarters = expectedMonths / 3; // Assuming 3 months per quarter

            // Calculate the earliest expected date for this specific data type's lookback
            const earliestExpectedDateForType = new Date(referenceDate);
            earliestExpectedDateForType.setMonth(earliestExpectedDateForType.getMonth() - expectedMonths);

            // Filter data for the current data type AND within its specific expected period
            const relevantDataForThisSpecificType = relevantFundamentalData.filter(d =>
                d.data_type === dataTypeConfig.key &&
                d.period_end_date >= earliestExpectedDateForType &&
                d.period_end_date <= referenceDate
            );

            // Count unique period_end_date for this data type within its specific lookback period
            const foundCount = new Set(relevantDataForThisSpecificType.map(d => d.period_end_date.toISOString().split('T')[0])).size;

            const percentage = expectedQuarters > 0 ? (foundCount / expectedQuarters) * 100 : 100;
            if (percentage < 100) {
                allData100PercentComplete = false; // Als één percentage niet 100% is, zet de vlag op false
            }

            dataTypeCompleteness[dataTypeConfig.key] = {
                foundCount: foundCount,
                expectedCount: expectedQuarters,
                percentage: percentage,
                earliestExpectedDate: formatDate(earliestExpectedDateForType) // Add earliest expected date
            };
            totalExpectedDataPoints += expectedQuarters;
            totalFoundDataPoints += foundCount;
        }
        const overallCompletenessPercentage = totalExpectedDataPoints > 0 ? (totalFoundDataPoints / totalExpectedDataPoints) * 100 : 100;


        // 2. Multiple Dates Per Quarter (Anomaly)
        const multipleDatesPerQuarter = [];
        const quarterMap = new Map(); // Key: `${year_from_period_end_date}-${fp_id}-${data_type}`, Value: Set of period_end_dates

        relevantFundamentalData.forEach(item => {
            // Only consider quarterly periods (fp_id 1-4)
            if (item.fp_id >= 1 && item.fp_id <= 4) {
                const yearFromPeriodEndDate = new Date(item.period_end_date).getFullYear(); // Use year from period_end_date
                const key = `${yearFromPeriodEndDate}-${item.fp_id}-${item.data_type}`;
                if (!quarterMap.has(key)) {
                    quarterMap.set(key, new Set());
                }
                quarterMap.get(key).add(item.period_end_date.toISOString().split('T')[0]);
            }
        });

        quarterMap.forEach((datesSet, key) => {
            if (datesSet.size > 1) {
                const [year, fp_id, data_type] = key.split('-');
                multipleDatesPerQuarter.push({
                    dataType: data_type,
                    fy: parseInt(year), // Use year from period_end_date
                    fp_id: parseInt(fp_id),
                    dates: Array.from(datesSet).sort()
                });
            }
        });


        // 3. Fiscal Period (FP ID) Sequence Check
        const brokenQuarterSequenceDetails = [];
        const quarterlyDataGroupedByDataType = new Map(); // Key: data_type, Value: Array of {period_end_date, fy_from_period_end_date, fp_id}

        relevantFundamentalData.forEach(item => {
            if (item.fp_id >= 1 && item.fp_id <= 4) { // Only consider quarterly periods
                if (!quarterlyDataGroupedByDataType.has(item.data_type)) {
                    quarterlyDataGroupedByDataType.set(item.data_type, []);
                }
                quarterlyDataGroupedByDataType.get(item.data_type).push({
                    period_end_date: item.period_end_date,
                    fy_from_period_end_date: new Date(item.period_end_date).getFullYear(), // Use year from period_end_date
                    fp_id: item.fp_id
                });
            }
        });

        quarterlyDataGroupedByDataType.forEach((periods, dataType) => {
            // Sort periods ascending by date
            const sortedPeriods = [...periods].sort((a, b) => a.period_end_date.getTime() - b.period_end_date.getTime());

            for (let i = 1; i < sortedPeriods.length; i++) {
                const prevPeriod = sortedPeriods[i - 1];
                const currentPeriod = sortedPeriods[i];

                // Determine expected next FP ID (1-4 cycle)
                const expectedNextFpId = (prevPeriod.fp_id % 4) + 1;

                const diffDays = Math.ceil(Math.abs(currentPeriod.period_end_date.getTime() - prevPeriod.period_end_date.getTime()) / (1000 * 60 * 60 * 24));

                // Check if FP ID sequence is correct
                const isFpIdSequenceCorrect = (currentPeriod.fp_id === expectedNextFpId);

                // Check if time gap is correct for a regular quarter (approx 3 months)
                const isTimeGapCorrect = (diffDays >= 60 && diffDays <= 120);

                // Check if time gap is correct for a year transition (Q4 to Q1, approx 12-13 months)
                const isYearTransition = (prevPeriod.fp_id === 4 && currentPeriod.fp_id === 1);
                // Allow a wider range for year transition, e.g., 11 to 13 months (335 to 395 days)
                const isTimeGapCorrectForYearTransition = (diffDays >= 335 && diffDays <= 395);

                // Anomaly is detected if FP ID sequence is broken OR
                // if the time gap is not correct for a regular quarter AND not correct for a year transition
                if (!isFpIdSequenceCorrect || (!isTimeGapCorrect && !isTimeGapCorrectForYearTransition)) {
                    const reason = [];
                    if (!isFpIdSequenceCorrect) reason.push("FP ID sequence incorrect");
                    // Removed strict year sequence check as requested
                    if (!isTimeGapCorrect && !isTimeGapCorrectForYearTransition) reason.push("Time gap not typical for a quarter/year transition");

                    brokenQuarterSequenceDetails.push({
                        dataType: dataType,
                        prevDate: formatDate(prevPeriod.period_end_date),
                        prevFpId: prevPeriod.fp_id,
                        prevFy: prevPeriod.fy_from_period_end_date, // Keep for context
                        currentDate: formatDate(currentPeriod.period_end_date),
                        currentFpId: currentPeriod.fp_id,
                        currentFy: currentPeriod.fy_from_period_end_date, // Keep for context
                        expectedFpId: expectedNextFpId,
                        daysDifference: diffDays,
                        reason: reason.join(" & ")
                    });
                }
            }
        });

        // 4. Missing Recent Quarters (Anomaly) - Reverted to previous logic for iteration and gap detection
        const missingRecentQuarters = [];
        const today = new Date();
        const missingCutoffDate = new Date(referenceDate); // Keep referenceDate
        const diffDaysFromToday = Math.ceil(Math.abs(referenceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDaysFromToday <= 60) {
            missingCutoffDate.setDate(referenceDate.getDate() - 60);
        } else {
            missingCutoffDate.setDate(referenceDate.getDate());
        }

        for (const dataTypeConfig of FUNDAMENTAL_DATA_TYPES) {
            const relevantDataForType = relevantFundamentalData.filter(d => d.data_type === dataTypeConfig.key);
            const sortedDataForType = [...relevantDataForType].sort((a, b) => a.period_end_date.getTime() - b.period_end_date.getTime());

            const actualPeriodEndDates = sortedDataForType.map(d => d.period_end_date);
            const actualPeriodEndDatesStrings = actualPeriodEndDates.map(d => formatDate(d));

            // Bepaal de meest recente werkelijke datum voor dit datatype
            const latestActualDateForType = actualPeriodEndDates.length > 0 ? actualPeriodEndDates[actualPeriodEndDates.length - 1] : null;

            // Startpunt voor het genereren van verwachte kwartalen
            let currentExpectedDate;
            if (latestActualDateForType) {
                currentExpectedDate = new Date(latestActualDateForType);
                currentExpectedDate.setMonth(currentExpectedDate.getMonth() + 3); // Begin met de eerste verwachte kwartaal na de laatste bekende
            } else {
                // Als er geen data is voor dit datatype, begin dan vanaf de referenceDate en ga 3 maanden terug
                currentExpectedDate = new Date(referenceDate);
                // Pas aan naar het einde van het kwartaal (bijv. als referenceDate 2024-07-15 is, start vanaf 2024-06-30)
                const currentMonth = currentExpectedDate.getMonth();
                if (currentMonth >= 0 && currentMonth <= 2) currentExpectedDate.setMonth(2, 31); // Maart 31
                else if (currentMonth >= 3 && currentMonth <= 5) currentExpectedDate.setMonth(5, 30); // Juni 30
                else if (currentMonth >= 6 && currentMonth <= 8) currentExpectedDate.setMonth(8, 30); // September 30
                else currentExpectedDate.setMonth(11, 31); // December 31
            }

            // Genereer verwachte kwartalen vooruit in de tijd (vanaf laatste bekende of referenceDate)
            // en controleer op ontbrekende kwartalen tot aan de referenceDate
            while (currentExpectedDate <= referenceDate) {
                // Alleen overwegen als de verwachte datum vóór of op de missingCutoffDate ligt
                if (currentExpectedDate <= missingCutoffDate) {
                    const formattedExpectedDate = formatDate(currentExpectedDate);
                    const found = actualPeriodEndDatesStrings.some(itemDateStr => {
                        const itemDate = new Date(itemDateStr);
                        const diff = Math.abs(itemDate.getTime() - currentExpectedDate.getTime());
                        const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
                        return diffDays <= 30; // Tolerantie van +/- 30 dagen
                    });

                    if (!found) {
                        missingRecentQuarters.push({
                            dataType: dataTypeConfig.key,
                            expectedDate: formattedExpectedDate,
                            reason: "Missing recent quarter"
                        });
                    }
                }
                currentExpectedDate.setMonth(currentExpectedDate.getMonth() + 3);
            }

            // Controleer op gaten in de historische data (tussen bestaande datapunten)
            for (let i = 0; i < sortedDataForType.length - 1; i++) {
                const prevPeriod = sortedDataForType[i];
                const nextPeriod = sortedDataForType[i + 1];

                const prevDate = prevPeriod.period_end_date;
                const nextDate = nextPeriod.period_end_date;

                const diffDays = Math.ceil((nextDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

                // Als het tijdsverschil groter is dan een normaal kwartaal (bijv. > 120 dagen),
                // dan is er een of meer kwartalen overgeslagen.
                if (diffDays > 120) {
                    let expectedMissingDate = new Date(prevDate);
                    expectedMissingDate.setMonth(expectedMissingDate.getMonth() + 3); // Begin met het eerste potentieel ontbrekende kwartaal

                    // Blijf 3 maanden toevoegen totdat we de volgende werkelijke datapunt bereiken of passeren
                    while (expectedMissingDate < nextDate) {
                        if (expectedMissingDate >= earliestAllowedDate && expectedMissingDate <= missingCutoffDate) {
                            const formattedExpectedDate = formatDate(expectedMissingDate);
                            const found = actualPeriodEndDatesStrings.some(itemDateStr => {
                                const itemDate = new Date(itemDateStr);
                                const diff = Math.abs(itemDate.getTime() - expectedMissingDate.getTime());
                                return diff <= (30 * 24 * 60 * 60 * 1000); // 30 dagen tolerantie
                            });

                            if (!found) {
                                missingRecentQuarters.push({
                                    dataType: dataTypeConfig.key,
                                    expectedDate: formattedExpectedDate,
                                    reason: "Missing historical quarter (gap detected)"
                                });
                            }
                        }
                        expectedMissingDate.setMonth(expectedMissingDate.getMonth() + 3);
                    }
                }
            }
        }
        // Sorteer ontbrekende recente kwartalen op datum (oplopend)
        missingRecentQuarters.sort((a, b) => new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime());


        const singleStockAnalysisResult = {
            aandeel_id: parseInt(stockId),
            ticker_symbol: tickerSymbol, // Voeg ticker_symbol toe
            selected_date: formatDate(referenceDate), // Voeg selected_date toe
            overallCompletenessPercentage: overallCompletenessPercentage,
            dataTypeCompleteness: dataTypeCompleteness,
            multipleDatesPerQuarter: multipleDatesPerQuarter,
            quarterSequenceBroken: brokenQuarterSequenceDetails.length > 0,
            brokenQuarterSequenceDetails: brokenQuarterSequenceDetails,
            missingRecentQuarters: missingRecentQuarters, // Add new anomaly
            allData100PercentComplete: allData100PercentComplete // Nieuwe vlag
        };

        res.status(200).json(singleStockAnalysisResult);

    } catch (err) {
        console.error('Error in getSingleStockAnalysis:', err);
        res.status(500).json({ message: 'Error performing single stock analysis.', error: err.message });
    }
};

const runPythonSecScript = async (req, res) => {
    const { ticker } = req.body;

    if (!ticker) {
        return res.status(400).json({ message: 'Ticker symbol is required.' });
    }

    const pythonScriptPath = 'c:\\Arne\\ArneVR\\PortfolioVR\\backend\\insertDataToDatabaseFromSec20250302.py';

    try {
        const pythonProcess = spawn('python', [pythonScriptPath, ticker]);

        let scriptOutput = '';
        let scriptError = '';

        pythonProcess.stdout.on('data', (data) => {
            scriptOutput += data.toString();
            console.log(`Python stdout: ${data.toString()}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            scriptError += data.toString();
            console.error(`Python stderr: ${data.toString()}`);
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                res.status(200).json({ message: 'Python script executed successfully.', output: scriptOutput });
            } else {
                res.status(500).json({ message: `Python script exited with code ${code}.`, error: scriptError, output: scriptOutput });
            }
        });

        pythonProcess.on('error', (err) => {
            console.error('Failed to start Python subprocess:', err);
            res.status(500).json({ message: 'Failed to start Python script.', error: err.message });
        });

    } catch (err) {
        console.error('Error in runPythonSecScript:', err);
        res.status(500).json({ message: 'Internal server error.', error: err.message });
    }
};


module.exports = {
    addManualFundamentalData,
    fetchAndParseSecData,
    saveFetchedSecData,
    getEarningsCalendarDatesByTicker,
    fetchAndParseAlphaVantageData,
    saveFetchedAlphaVantageData,
    getAllFundamentalDataForStock,
    checkFundamentalDataSufficiency, // Kept for existing AandelenData component
    checkDateAndFetchData,
    deleteFundamentalData,
    getFiscalPeriods,
    getForms,
    getTickerOverviewAnalysis,
    getSingleStockAnalysis, // Export the new function
    runPythonSecScript,
};

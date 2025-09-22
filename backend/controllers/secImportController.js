// backend/controllers/secImportController.js
const axios = require('axios');
const { sql } = require('../config/database');

// Headers for SEC API Requests
const HEADERS = { 'User-Agent': "arne.van.riel@hotmail.be" };

// Data mapping with fallback keys from the python script
const FIELDS_TO_CHECK = {
    "AssetsCurrent": ["AssetsCurrent"],
    "Assets": ["Assets"],
    "LiabilitiesCurrent": ["LiabilitiesCurrent"],
    "Liabilities": ["Liabilities"],
    "StockholdersEquity": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    "NetIncomeLoss": ["NetIncomeLoss"],
    "NetCashProvidedByUsedInOperatingActivities": ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
    "NetCashProvidedByUsedInInvestingActivities": ["NetCashProvidedByUsedInInvestingActivities"],
    "NetCashProvidedByUsedInFinancingActivities": ["NetCashProvidedByUsedInFinancingActivities"],
    "PurchasesOfPropertyAndEquipment": ["PurchasesOfPropertyAndEquipment"],
    "Revenues": ["Revenues"],
    "WeightedAverageNumberOfDilutedSharesOutstanding": ["WeightedAverageNumberOfDilutedSharesOutstanding"],
    "Dividend": ["PaymentsOfDividends", "CommonStockDividendsPerShareDeclared"]
};

// Helper function to get CIK number
const getCik = async (ticker) => {
    const response = await axios.get("https://www.sec.gov/files/company_tickers.json", { headers: HEADERS });
    const companyTickers = response.data;
    for (const key in companyTickers) {
        if (companyTickers[key].ticker === ticker) {
            return `${companyTickers[key].cik_str}`.padStart(10, '0');
        }
    }
    return null;
};

// Helper function to get financial data from SEC
const getFinancialData = async (cik) => {
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const response = await axios.get(url, { headers: HEADERS });
    return response.data.facts['us-gaap'] || {};
};

// Helper function to process the financial data
const processFinancialData = (financialData, ticker) => {
    const processedData = [];
    for (const [columnName, possibleApiKeys] of Object.entries(FIELDS_TO_CHECK)) {
        for (const key of possibleApiKeys) {
            if (financialData[key] && financialData[key].units && financialData[key].units.USD) {
                const dataEntries = financialData[key].units.USD;
                for (const entry of dataEntries) {
                    if (entry.end && entry.val && entry.fy && entry.fp && entry.form) {
                        processedData.push({
                            period_start_date: entry.start || entry.end,
                            period_end_date: entry.end,
                            value: entry.val,
                            metric: columnName,
                            how_added: `SEC API - ${key}`,
                            fy: entry.fy,
                            fp: entry.fp,
                            form: entry.form,
                            ticker: ticker
                        });
                    }
                }
                break; // Found data for this metric, move to the next
            }
        }
    }
    return processedData;
};

// Helper function to get IDs from the database
const getStockId = async (ticker, request) => {
    const result = await request.input('ticker_symbol', sql.NVarChar, ticker).query("SELECT aandeel_id FROM Stocks WHERE ticker_symbol = @ticker_symbol");
    return result.recordset.length > 0 ? result.recordset[0].aandeel_id : null;
};

const getFpId = async (fp, request) => {
    const result = await request.input('fp', sql.NVarChar, fp).query("SELECT fp_id FROM FiscalPeriods WHERE fp = @fp");
    return result.recordset.length > 0 ? result.recordset[0].fp_id : null;
};

const getFormId = async (form, request) => {
    const result = await request.input('form', sql.NVarChar, form).query("SELECT form_id FROM Forms WHERE form = @form");
    return result.recordset.length > 0 ? result.recordset[0].form_id : null;
};

// Main import function
const importSecData = async (req, res) => {
    const { ticker } = req.body;
    if (!ticker) {
        return res.status(400).json({ message: 'Ticker symbol is required' });
    }

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    const write = (message) => res.write(message + '\n');

    try {
        write(`Starting import for ${ticker}...`);

        write('Fetching CIK number...');
        const cik = await getCik(ticker);
        if (!cik) {
            write(`❌ CIK not found for ${ticker}`);
            return res.end();
        }
        write(`✅ CIK found: ${cik}`);

        write('Fetching financial data from SEC...');
        const financialData = await getFinancialData(cik);
        write('✅ Financial data fetched.');

        write('Processing financial data...');
        const processedData = processFinancialData(financialData, ticker);
        if (processedData.length === 0) {
            write('❌ No data to process.');
            return res.end();
        }
        write(`✅ Processed ${processedData.length} data points.`);
        write(`TOTAL_ITEMS:${processedData.length}`);

        write('Storing data in database...');
        const request = new sql.Request();
        const stockId = await getStockId(ticker, request);
        if (!stockId) {
            write(`❌ Stock ID not found for ${ticker}`);
            return res.end();
        }

        for (const row of processedData) {
            const fpId = await getFpId(row.fp, new sql.Request());
            const formId = await getFormId(row.form, new sql.Request());

            if (!fpId || !formId) {
                write(`❌ fp_id or form_id not found for ${row.fp}, ${row.form}`);
                continue;
            }

            const checkReq = new sql.Request();
            const existingResult = await checkReq
                .input('stock_id', sql.Int, stockId)
                .input('period_end_date', sql.Date, row.period_end_date)
                .input('data_type', sql.NVarChar, row.metric)
                .query("SELECT value FROM fundamental_data WHERE stock_id = @stock_id AND period_end_date = @period_end_date AND data_type = @data_type");

            if (existingResult.recordset.length > 0) {
                const existingValue = existingResult.recordset[0].value;
                if (existingValue != row.value) {
                    const updateReq = new sql.Request();
                    await updateReq
                        .input('period_start_date', sql.Date, row.period_start_date)
                        .input('value', sql.Decimal(18, 4), row.value)
                        .input('how_added', sql.NVarChar, row.how_added)
                        .input('fy', sql.Int, row.fy)
                        .input('fp_id', sql.Int, fpId)
                        .input('form_id', sql.Int, formId)
                        .input('stock_id', sql.Int, stockId)
                        .input('period_end_date', sql.Date, row.period_end_date)
                        .input('data_type', sql.NVarChar, row.metric)
                        .query("UPDATE fundamental_data SET period_start_date = @period_start_date, value = @value, how_added = @how_added, fy = @fy, fp_id = @fp_id, form_id = @form_id, updated_at = SYSDATETIME() WHERE stock_id = @stock_id AND period_end_date = @period_end_date AND data_type = @data_type");
                    write(`🔄 Updated: ${row.ticker} ${row.period_end_date} ${row.metric}`);
                } else {
                    write(`✅ No update needed: ${row.ticker} ${row.period_end_date} ${row.metric}`);
                }
            } else {
                const insertReq = new sql.Request();
                await insertReq
                    .input('period_start_date', sql.Date, row.period_start_date)
                    .input('period_end_date', sql.Date, row.period_end_date)
                    .input('fy', sql.Int, row.fy)
                    .input('fp_id', sql.Int, fpId)
                    .input('form_id', sql.Int, formId)
                    .input('stock_id', sql.Int, stockId)
                    .input('data_type', sql.NVarChar, row.metric)
                    .input('value', sql.Decimal(18, 4), row.value)
                    .input('how_added', sql.NVarChar, row.how_added)
                    .query("INSERT INTO fundamental_data (period_start_date, period_end_date, fy, fp_id, form_id, stock_id, data_type, value, how_added, created_at, updated_at) VALUES (@period_start_date, @period_end_date, @fy, @fp_id, @form_id, @stock_id, @data_type, @value, @how_added, SYSDATETIME(), SYSDATETIME())");
                write(`✅ Inserted: ${row.ticker} ${row.period_end_date} ${row.metric}`);
            }
        }
        write('\nImport process finished successfully.');
        res.end();

    } catch (err) {
        console.error('Failed to import SEC data:', err);
        write(`\n--- ERROR ---\n${err.message}`);
        res.end();
    }
};

module.exports = {
    importSecData,
};
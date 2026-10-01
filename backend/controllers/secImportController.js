// backend/controllers/secImportController.js
const axios = require('axios');
const { sql } = require('../config/database');

// Headers voor SEC API-verzoeken (User-Agent is verplicht door SEC)
const HEADERS = { 'User-Agent': "arne.van.riel@hotmail.be" };

// Data mapping met fallback sleutels en berekeningen, analoog aan het Python script
const FIELDS_TO_CHECK = {
    "AssetsCurrent": ["AssetsCurrent"],
    "Assets": ["Assets"],
    "LiabilitiesCurrent": [
        "LiabilitiesCurrent",
        {
            formula: "EmployeeRelatedLiabilitiesCurrentAndNoncurrent + AccountsPayableAndAccruedLiabilitiesCurrentAndNoncurrent",
            requiredKeys: ["EmployeeRelatedLiabilitiesCurrentAndNoncurrent", "AccountsPayableAndAccruedLiabilitiesCurrentAndNoncurrent"]
        },
        {
            formula: "UnearnedPremiums + LiabilityForClaimsAndClaimsAdjustmentExpense + AccountsPayableAndAccruedLiabilitiesCurrentAndNoncurrent",
            requiredKeys: ["UnearnedPremiums", "LiabilityForClaimsAndClaimsAdjustmentExpense", "AccountsPayableAndAccruedLiabilitiesCurrentAndNoncurrent"]
        }
    ],
    "Liabilities": ["Liabilities",
        {
            formula: "LiabilitiesAndStockholdersEquity - StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
            requiredKeys: ["LiabilitiesAndStockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]
        },
        {
            formula: "LiabilitiesAndStockholdersEquity - StockholdersEquity",
            requiredKeys: ["LiabilitiesAndStockholdersEquity", "StockholdersEquity"]
        },
        {
            formula: "Assets - StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
            requiredKeys: ["Assets", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]
        },
        {
            formula: "Assets - StockholdersEquity",
            requiredKeys: ["Assets", "StockholdersEquity"]
        }
    ],
    "StockholdersEquity": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    "NetIncomeLoss": ["NetIncomeLoss", "ProfitLoss","NetIncomeLossAvailableToCommonStockholdersBasic"],
    "NetCashProvidedByUsedInOperatingActivities": ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
    "NetCashProvidedByUsedInInvestingActivities": ["NetCashProvidedByUsedInInvestingActivities"],
    "NetCashProvidedByUsedInFinancingActivities": ["NetCashProvidedByUsedInFinancingActivities"],
    "PurchasesOfPropertyAndEquipment": ["PurchasesOfPropertyAndEquipment", "PaymentsToAcquirePropertyPlantAndEquipment", "PurchasesOfPropertyAndEquipmentAndIntangibleAssets", "PaymentsToAcquireProductiveAssets", ],
    "Revenues": ["Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerExcludingAssessedTax", "RegulatedAndUnregulatedOperatingRevenues"],
    "WeightedAverageNumberOfDilutedSharesOutstanding": [
        "WeightedAverageNumberOfDilutedSharesOutstanding",
        "WeightedAverageNumberOfSharesOutstandingDiluted",
        "WeightedAverageNumberOfSharesOutstandingBasicAndDiluted",
        "WeightedAverageSharesOutstandingDiluted",
        "CommonStockSharesOutstanding",
        "CommonStockSharesIssued",
        "WeightedAverageNumberOfSharesOutstandingBasic"
    ],
    "Dividend": ["PaymentsOfDividends", "CommonStockDividendsPerShareDeclared"]
};

// Velden die een momentopname vertegenwoordigen en geen startdatum hebben (balansposten)
const NO_START_FIELDS = new Set(["AssetsCurrent", "Assets", "LiabilitiesCurrent", "Liabilities", "StockholdersEquity"]);

// Helper functie om het CIK-nummer op te halen op basis van de ticker
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

// Helper functie om financiële data (XBRL facts) op te halen van de SEC
const getFinancialData = async (cik) => {
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const response = await axios.get(url, { headers: HEADERS });
    const facts = response.data.facts || {};
    return { ...(facts['us-gaap'] || {}), ...(facts['dei'] || {}) };
};

// Helper om units entries robuust op te halen ongeacht sleutel
const getUnitsEntries = (fieldObj) => {
    if (!fieldObj || !fieldObj.units) return null;
    const u = fieldObj.units;
    return u.USD || u.shares || u.Shares || u.pure || (Object.keys(u).length > 0 ? u[Object.keys(u)[0]] : null);
};

// Helper functie om de financiële data te verwerken, inclusief berekeningen en datumlogica
const processFinancialData = (financialData, ticker, write = () => {}) => {
    const processedData = [];

    for (const [columnName, possibleApiKeys] of Object.entries(FIELDS_TO_CHECK)) {
        let foundForColumn = false;
        // We houden bij welke datums we al hebben gevonden voor deze metriek.
        // Hierdoor krijgt de eerste key in de lijst voorrang, maar vullen latere keys de gaten in de data op (per datum).
        const datesCovered = new Set(); 
        for (const key of possibleApiKeys) {
            // Verwerk berekende velden (formules)
            if (typeof key === 'object' && key.formula) {
                const { formula, requiredKeys } = key;
                
                // Check of alle benodigde keys bestaan in de data
                const allKeysExist = requiredKeys.every(reqKey => 
                    financialData[reqKey] && getUnitsEntries(financialData[reqKey])
                );

                if (!allKeysExist) continue;

                const primaryKey = requiredKeys[0];
                const primaryUnits = getUnitsEntries(financialData[primaryKey]);
                let calculationAdded = false;

                for (const entry of primaryUnits) {
                    const targetDate = entry.end;
                    if (datesCovered.has(targetDate)) continue; // Sla over als datum al bestaat

                    const values = { [primaryKey]: entry.val };
                    let match = true;

                    for (let i = 1; i < requiredKeys.length; i++) {
                        const otherKey = requiredKeys[i];
                        const otherUnits = getUnitsEntries(financialData[otherKey]);
                        const matchingEntry = otherUnits ? otherUnits.find(u => u.end === targetDate) : null;
                        
                        if (matchingEntry) {
                            values[otherKey] = matchingEntry.val;
                        } else {
                            match = false;
                            break;
                        }
                    }

                    if (match) {
                        const tokens = formula.split(' ');
                        let computedValue = values[tokens[0]] || 0;

                        for (let i = 1; i < tokens.length; i += 2) {
                            const operator = tokens[i];
                            const nextKey = tokens[i + 1];
                            const nextValue = values[nextKey] || 0;

                            if (operator === '+') {
                                computedValue += nextValue;
                            } else if (operator === '-') {
                                computedValue -= nextValue;
                            }
                        }

                        processedData.push({
                            period_start_date: entry.end,
                            period_end_date: entry.end,
                            value: computedValue,
                            metric: columnName,
                            how_added: `Computed: ${formula}`,
                            fy: entry.fy,
                            fp: entry.fp,
                            form: entry.form,
                            report_date: entry.filed,
                            ticker: ticker
                        });
                        datesCovered.add(targetDate); // Markeer datum als gevonden
                        calculationAdded = true;
                    }
                }

                if (calculationAdded) {
                    write(`[DEBUG] ${columnName}: Calculated using formula`);
                    foundForColumn = true;
                }
            }
            // Verwerk directe velden (strings)
            else if (typeof key === 'string' && financialData[key]) {
                const dataEntries = getUnitsEntries(financialData[key]);
                if (!dataEntries) continue;

                let dataAdded = false;
                for (const entry of dataEntries) {
                    if (!entry.end || !entry.val || !entry.fy || !entry.fp || !entry.form) {
                        continue;
                    }

                    if (datesCovered.has(entry.end)) continue; // Sla over als datum al bestaat

                    let period_start_date = entry.end; // Standaard voor balansposten (momentopname)

                    if (!NO_START_FIELDS.has(columnName) && entry.start) {
                        const startDate = new Date(entry.start);
                        const endDate = new Date(entry.end);
                        let offset = 0;
                        if (entry.fp === "Q1") offset = 3;
                        else if (entry.fp === "Q2") offset = 6;
                        else if (entry.fp === "Q3") offset = 9;
                        else if (entry.fp === "FY") offset = 12;

                        const checkDate = new Date(endDate);
                        checkDate.setMonth(checkDate.getMonth() - offset);
                        checkDate.setDate(checkDate.getDate() + 30);

                        if (startDate < checkDate) {
                            period_start_date = entry.start;
                        } else {
                            continue; // Sla invoer over die niet aan de datumcriteria voldoet
                        }
                    }

                    processedData.push({
                        period_start_date: period_start_date,
                        period_end_date: entry.end,
                        value: entry.val,
                        metric: columnName,
                        how_added: `SEC API - ${key}`,
                        fy: entry.fy,
                        fp: entry.fp,
                        form: entry.form,
                        report_date: entry.filed,
                        ticker: ticker
                    });
                    datesCovered.add(entry.end); // Markeer datum als gevonden
                    dataAdded = true;
                }
                if (dataAdded) {
                    write(`[DEBUG] ${columnName}: Found direct data using key '${key}'`);
                    foundForColumn = true;
                }
            }
        }
        if (!foundForColumn) {
            write(`[DEBUG] ⚠️ No data found for ${columnName}`);
        }
    }

    // Auto forward-fill voor WeightedAverageNumberOfDilutedSharesOutstanding indien er gaten zijn tussen kwartalen
    const sharesEntries = processedData.filter(d => d.metric === "WeightedAverageNumberOfDilutedSharesOutstanding");
    if (sharesEntries.length > 0) {
        const sortedShares = [...sharesEntries].sort((a, b) => new Date(a.period_end_date) - new Date(b.period_end_date));
        const knownDates = new Set(sharesEntries.map(d => d.period_end_date));
        const latestKnownShare = sortedShares[sortedShares.length - 1];

        const allQuarterEndDates = [...new Set(processedData.map(d => d.period_end_date))].sort();

        for (const qDate of allQuarterEndDates) {
            if (!knownDates.has(qDate) && latestKnownShare) {
                const sample = processedData.find(d => d.period_end_date === qDate && d.metric === "NetIncomeLoss") || latestKnownShare;
                processedData.push({
                    period_start_date: qDate,
                    period_end_date: qDate,
                    value: latestKnownShare.value,
                    metric: "WeightedAverageNumberOfDilutedSharesOutstanding",
                    how_added: `Auto Forward-fill (${latestKnownShare.how_added})`,
                    fy: sample.fy,
                    fp: sample.fp,
                    form: sample.form,
                    report_date: sample.report_date,
                    ticker: ticker
                });
                knownDates.add(qDate);
            }
        }
    }

    return processedData;
};


// Helper functie om IDs uit de database te halen
const getStockId = async (ticker) => {
    const request = new sql.Request();
    const result = await request.input('ticker_symbol', sql.NVarChar, ticker).query("SELECT aandeel_id FROM Stocks WHERE ticker_symbol = @ticker_symbol");
    return result.recordset.length > 0 ? result.recordset[0].aandeel_id : null;
};

const getFpId = async (fp) => {
    if (fp === null) return null;
    const request = new sql.Request();
    const result = await request.input('fp', sql.NVarChar, fp).query("SELECT fp_id FROM FiscalPeriods WHERE fp = @fp");
    return result.recordset.length > 0 ? result.recordset[0].fp_id : null;
};

const getFormId = async (form) => {
    if (form === null) return null;
    const request = new sql.Request();
    const result = await request.input('form', sql.NVarChar, form).query("SELECT form_id FROM Forms WHERE form = @form");
    return result.recordset.length > 0 ? result.recordset[0].form_id : null;
};

// Hoofd import functie
const importSecData = async (req, res) => {
    const { ticker, periodOption = 'all' } = req.body; // Standaard naar 'all'
    if (!ticker) {
        return res.status(400).json({ message: 'Ticker symbol is required' });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const write = (message) => res.write(message + '\n');

    try {
        write(`Starting import for ${ticker} (Period: ${periodOption})...`);

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
        let processedData = processFinancialData(financialData, ticker, write);
        
        // --- PERIODE FILTER LOGICA ---
        if (periodOption === 'last' && processedData.length > 0) {
            processedData.sort((a, b) => new Date(b.period_end_date) - new Date(a.period_end_date));
            const lastDate = processedData[0].period_end_date;
            processedData = processedData.filter(d => d.period_end_date === lastDate);
            write(`ℹ️ Filtering for last period: ${lastDate}`);
        } else if (periodOption === 'lastYear' && processedData.length > 0) {
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            
            // DEBUG: Check of Liabilities aanwezig zijn VOOR het filteren
            const liabilitiesBefore = processedData.filter(d => d.metric === 'Liabilities').length;

            processedData = processedData.filter(d => new Date(d.period_end_date) >= oneYearAgo);
            
            const liabilitiesAfter = processedData.filter(d => d.metric === 'Liabilities').length;
            if (liabilitiesBefore > 0 && liabilitiesAfter === 0) {
                 write(`[DEBUG] ⚠️ All calculated Liabilities were filtered out (older than ${oneYearAgo.toISOString().split('T')[0]}). Trying fallback formulas...`);
            }

            write(`ℹ️ Filtering for entries since ${oneYearAgo.toISOString().split('T')[0]}`);
        }
        // --- EINDE PERIODE FILTERING ---

        if (processedData.length === 0) {
            write('❌ No data to process after filtering.');
            return res.end();
        }
        write(`✅ Processed ${processedData.length} data points.`);
        write(`TOTAL_ITEMS:${processedData.length}`);

        write('Storing data in database...');
        const stockId = await getStockId(ticker);
        if (!stockId) {
            write(`❌ Stock ID not found for ${ticker}`);
            return res.end();
        }

        for (const row of processedData) {
            const fpId = await getFpId(row.fp);
            const formId = await getFormId(row.form);

            if ((row.fp && !fpId) || (row.form && !formId)) {
                write(`❌ fp_id or form_id not found for ${row.fp}, ${row.form}. Skipping.`);
                continue;
            }

            const checkReq = new sql.Request();
            const existingResult = await checkReq
                .input('stock_id', sql.Int, stockId)
                .input('period_end_date', sql.Date, row.period_end_date)
                .input('data_type', sql.NVarChar, row.metric)
                .query("SELECT value, report_date FROM fundamental_data WHERE stock_id = @stock_id AND period_end_date = @period_end_date AND data_type = @data_type");

            if (existingResult.recordset.length > 0) {
                const existingValue = existingResult.recordset[0].value;
                const existingReportDate = existingResult.recordset[0].report_date;
                
                let shouldUpdate = false;

                // Gebruik parseFloat voor vergelijking om typeproblemen te voorkomen
                if (parseFloat(existingValue) !== parseFloat(row.value)) {
                    shouldUpdate = true;
                } else if (row.report_date) {
                    if (!existingReportDate) {
                        shouldUpdate = true;
                    } else {
                        const existingDateStr = existingReportDate.toISOString().split('T')[0];
                        if (existingDateStr !== row.report_date) shouldUpdate = true;
                    }
                }

                if (shouldUpdate) {
                    const updateReq = new sql.Request();
                    await updateReq
                        .input('period_start_date', sql.Date, row.period_start_date)
                        .input('value', sql.Decimal(20, 4), row.value)
                        .input('how_added', sql.NVarChar, row.how_added ? row.how_added.substring(0, 100) : '')
                        .input('fy', sql.Int, row.fy)
                        .input('fp_id', sql.Int, fpId)
                        .input('form_id', sql.Int, formId)
                        .input('report_date', sql.Date, row.report_date)
                        .input('stock_id', sql.Int, stockId)
                        .input('period_end_date', sql.Date, row.period_end_date)
                        .input('data_type', sql.NVarChar, row.metric)
                        .query("UPDATE fundamental_data SET period_start_date = @period_start_date, value = @value, how_added = @how_added, fy = @fy, fp_id = @fp_id, form_id = @form_id, report_date = @report_date, updated_at = SYSDATETIME() WHERE stock_id = @stock_id AND period_end_date = @period_end_date AND data_type = @data_type");
                    write(`🔄 Updated: ${row.ticker} ${row.period_end_date.split('T')[0]} ${row.metric}`);
                } else {
                    write(`✅ No update needed: ${row.ticker} ${row.period_end_date.split('T')[0]} ${row.metric}`);
                }
            } else {
                const insertReq = new sql.Request();
                await insertReq
                    .input('period_start_date', sql.Date, row.period_start_date)
                    .input('period_end_date', sql.Date, row.period_end_date)
                    .input('fy', sql.Int, row.fy)
                    .input('fp_id', sql.Int, fpId)
                    .input('form_id', sql.Int, formId)
                    .input('report_date', sql.Date, row.report_date)
                    .input('stock_id', sql.Int, stockId)
                    .input('data_type', sql.NVarChar, row.metric)
                    .input('value', sql.Decimal(20, 4), row.value)
                    .input('how_added', sql.NVarChar, row.how_added ? row.how_added.substring(0, 100) : '')
                    .query("INSERT INTO fundamental_data (period_start_date, period_end_date, fy, fp_id, form_id, report_date, stock_id, data_type, value, how_added, created_at, updated_at) VALUES (@period_start_date, @period_end_date, @fy, @fp_id, @form_id, @report_date, @stock_id, @data_type, @value, @how_added, SYSDATETIME(), SYSDATETIME())");
                write(`✅ Inserted: ${row.ticker} ${row.period_end_date.split('T')[0]} ${row.metric}`);
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

const saveProcessedDataToDb = async (stockId, processedData, write = () => {}) => {
    if (!processedData || processedData.length === 0) return;

    const fpMap = { 'Q1': 1, 'Q2': 2, 'Q3': 3, 'FY': 4 };
    const formMap = { '10-Q': 1, '10-K': 2 };

    const chunkSize = 80;
    for (let i = 0; i < processedData.length; i += chunkSize) {
        const chunk = processedData.slice(i, i + chunkSize);
        const req = new sql.Request();
        req.input('stock_id', sql.Int, stockId);

        const valueSelects = chunk.map((row, idx) => {
            const fpId = fpMap[row.fp] || 1;
            const formId = formMap[row.form] || 1;
            const fyVal = row.fy || (row.period_end_date ? new Date(row.period_end_date).getFullYear() : 2024);
            const pStart = row.period_start_date ? row.period_start_date.split('T')[0] : null;
            const pEnd = row.period_end_date ? row.period_end_date.split('T')[0] : null;
            const rDate = row.report_date ? row.report_date.split('T')[0] : null;
            const howAdded = row.how_added ? row.how_added.substring(0, 100) : '';

            req.input(`ps_${idx}`, sql.Date, pStart);
            req.input(`pe_${idx}`, sql.Date, pEnd);
            req.input(`fy_${idx}`, sql.Int, fyVal);
            req.input(`fp_${idx}`, sql.Int, fpId);
            req.input(`fm_${idx}`, sql.Int, formId);
            req.input(`rd_${idx}`, sql.Date, rDate);
            req.input(`dt_${idx}`, sql.NVarChar(100), row.metric);
            req.input(`vl_${idx}`, sql.Decimal(20, 4), row.value);
            req.input(`ha_${idx}`, sql.NVarChar(100), howAdded);

            return `SELECT @stock_id AS stock_id, @ps_${idx} AS period_start_date, @pe_${idx} AS period_end_date, @fy_${idx} AS fy, @fp_${idx} AS fp_id, @fm_${idx} AS form_id, @rd_${idx} AS report_date, @dt_${idx} AS data_type, @vl_${idx} AS value, @ha_${idx} AS how_added`;
        });

        await req.query(`
            MERGE INTO fundamental_data AS target
            USING (${valueSelects.join(' UNION ALL ')}) AS source
            ON target.stock_id = source.stock_id AND target.period_end_date = source.period_end_date AND target.data_type = source.data_type
            WHEN MATCHED THEN
                UPDATE SET period_start_date = source.period_start_date, value = source.value, how_added = source.how_added, fy = source.fy, fp_id = source.fp_id, form_id = source.form_id, report_date = source.report_date, updated_at = SYSDATETIME()
            WHEN NOT MATCHED THEN
                INSERT (period_start_date, period_end_date, fy, fp_id, form_id, report_date, stock_id, data_type, value, how_added, created_at, updated_at)
                VALUES (source.period_start_date, source.period_end_date, source.fy, source.fp_id, source.form_id, source.report_date, source.stock_id, source.data_type, source.value, source.how_added, SYSDATETIME(), SYSDATETIME());
        `);
    }
};

module.exports = {
    importSecData,
    getCik,
    getFinancialData,
    processFinancialData,
    saveProcessedDataToDb
};


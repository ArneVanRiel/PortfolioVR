const axios = require('axios');
const { sql, config } = require('../config/database');

const HEADERS = { 'User-Agent': "PortfolioVR arne.van.riel@hotmail.be" };

const { getCik, getFinancialData, processFinancialData, saveProcessedDataToDb } = require('./secImportController');
const { calculateAndSaveStockHistory } = require('./screenerController');
const { clearAdvisorCache } = require('./portfolioController');

// Map om bij te houden wanneer elk aandeel voor het laatst bij SEC is gecheckt (ticker -> timestamp)
const lastCheckedTimeByStock = new Map();
let isCheckRunning = false;

// Automatische controle & import van nieuwe SEC kwartaalcijfers (10-Q / 10-K)
const checkNewSecQuarters = async ({ force = false } = {}) => {
    if (isCheckRunning) {
        console.log('[Auto-SEC] SEC controle is reeds actief op de achtergrond. Tweede aanroep overgeslagen.');
        return { running: true };
    }
    isCheckRunning = true;
    console.log(`[Auto-SEC] Starten met ${force ? 'geforceerde' : 'automatische'} controle op nieuwe SEC kwartaalcijfers...`);

    const updatedStocks = [];
    try {
        const pool = await sql.connect(config);
        
        // 1. Haal alle relevante aandelen op (Watchlist, Ideale Portfolio, Huidige Portefeuille)
        // Sluit ETF's en Europese beurzen (.AS, .DE) uit
        const stocksResult = await pool.request().query(`
            SELECT DISTINCT s.aandeel_id, s.ticker_symbol, s.name 
            FROM Stocks s 
            WHERE (s.inWatchlist = 1 OR s.inIdealePortfolio = 1 OR s.aandeel_id IN (
                SELECT DISTINCT aandeel_id FROM PF_transactions
            ))
            AND (s.asset_type_id = 1 OR s.asset_type_id IS NULL)
            AND s.ticker_symbol NOT LIKE '%.AS'
            AND s.ticker_symbol NOT LIKE '%.DE'
            ORDER BY s.ticker_symbol ASC
        `);
        const stocks = stocksResult.recordset;

        const now = Date.now();
        const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

        for (const stock of stocks) {
            const { aandeel_id, ticker_symbol } = stock;
            
            // Debounce: als aandeel in de afgelopen 4 uur al is gecheckt en niet geforceerd, sla over
            if (!force && lastCheckedTimeByStock.has(ticker_symbol)) {
                const lastTime = lastCheckedTimeByStock.get(ticker_symbol);
                if (now - lastTime < FOUR_HOURS_MS) {
                    continue;
                }
            }

            // 2. Haal de laatste period_end_date op uit fundamental_data
            const latestDataQuery = await pool.request()
                .input('stock_id', sql.Int, aandeel_id)
                .query(`
                    SELECT MAX(period_end_date) as max_pe, MAX(report_date) as max_rd 
                    FROM fundamental_data 
                    WHERE stock_id = @stock_id
                `);
            
            const maxPe = latestDataQuery.recordset[0]?.max_pe;
            const lastPeriodEndDateStr = maxPe ? (maxPe instanceof Date ? maxPe.toISOString().split('T')[0] : String(maxPe).split('T')[0]) : null;

            const CIK = await getCik(ticker_symbol);
            if (!CIK) continue;

            lastCheckedTimeByStock.set(ticker_symbol, now);

            // Rate limit bescherming voor SEC API (max 10 calls/sec)
            await new Promise(r => setTimeout(r, 120));

            let secResponse;
            try {
                secResponse = await axios.get(`https://data.sec.gov/submissions/CIK${CIK}.json`, { 
                    headers: HEADERS, 
                    timeout: 8000 
                });
            } catch (netErr) {
                console.warn(`[Auto-SEC] Kon submissions niet ophalen voor ${ticker_symbol}: ${netErr.message}`);
                continue;
            }

            const filings = secResponse.data?.filings?.recent;
            if (!filings || !filings.form) continue;

            for (let i = 0; i < filings.form.length; i++) {
                const form = filings.form[i];
                if (form === '10-Q' || form === '10-K') {
                    const reportDate = filings.reportDate[i]; // Periode einddatum (bv. 2026-09-30)
                    const filingDate = filings.filingDate[i]; // Datum van indiening (bv. 2026-10-22)

                    // Check of deze filing nieuwer is dan onze database
                    if (!lastPeriodEndDateStr || reportDate > lastPeriodEndDateStr) {
                        const reportDateObj = new Date(reportDate);
                        const fy = reportDateObj.getFullYear();
                        const month = reportDateObj.getMonth() + 1;
                        
                        let quarterLabel = 'FY';
                        if (form === '10-Q') {
                            if (month >= 2 && month <= 4) quarterLabel = 'Q1';
                            else if (month >= 5 && month <= 7) quarterLabel = 'Q2';
                            else if (month >= 8 && month <= 10) quarterLabel = 'Q3';
                            else quarterLabel = 'Q4';
                        }
                        
                        console.log(`[Auto-SEC] 🚀 Nieuwe ${form} filing gedetecteerd voor ${ticker_symbol} (${quarterLabel} ${fy}, eindigend op ${reportDate}, ingediend op ${filingDate})!`);

                        try {
                            // 1. Download financiële facts van SEC
                            const financialData = await getFinancialData(CIK);
                            
                            // 2. Verwerk financiële data
                            const allProcessed = processFinancialData(financialData, ticker_symbol);

                            // 3. Filter voor deze nieuwe periode
                            const newQuarterData = allProcessed.filter(d => d.period_end_date && d.period_end_date.startsWith(reportDate));

                            if (newQuarterData.length > 0) {
                                // Sla exacte filingDate als report_date op!
                                newQuarterData.forEach(d => { d.report_date = filingDate; });

                                // 4. Sla op in fundamental_data
                                await saveProcessedDataToDb(aandeel_id, newQuarterData);

                                // 5. Volledige 10-jaar kwartaalberekeningen & Waardeverdeling synchroniseren in stock_calculations
                                await calculateAndSaveStockHistory(aandeel_id, ticker_symbol);

                                console.log(`[Auto-SEC] ✅ ${newQuarterData.length} datapunten opgeslagen & berekend voor ${ticker_symbol} (${quarterLabel} ${fy})!`);

                                // 6. Notificatie toevoegen
                                const alertMessage = `Nieuwe cijfers (${quarterLabel} ${fy}, eindigend op ${reportDate}) automatisch geïmporteerd & berekend voor ${ticker_symbol}!`;
                                await pool.request()
                                    .input('stock_id', sql.Int, aandeel_id)
                                    .input('ticker', sql.NVarChar, ticker_symbol)
                                    .input('message', sql.NVarChar, alertMessage)
                                    .input('new_quarter', sql.NVarChar, form)
                                    .input('new_year', sql.Int, fy)
                                    .query(`
                                        INSERT INTO PF_Notifications (stock_id, ticker, message, is_read, new_quarter, new_year)
                                        VALUES (@stock_id, @ticker, @message, 0, @new_quarter, @new_year)
                                    `);

                                updatedStocks.push({ ticker: ticker_symbol, form, quarterLabel, fy, reportDate, filingDate });
                            }
                        } catch (importErr) {
                            console.error(`[Auto-SEC] Fout bij importeren van facts voor ${ticker_symbol}:`, importErr.message);
                        }

                        break; // Enkel de meest recente filing verwerken
                    }
                }
            }
        }

        if (updatedStocks.length > 0) {
            clearAdvisorCache();
            console.log(`[Auto-SEC] 🎉 Automatische SEC check voltooid: ${updatedStocks.length} aandeel/aandelen succesvol bijgewerkt! Strategy Advisor cache geleegd.`);
        } else {
            console.log('[Auto-SEC] Automatische SEC check voltooid: Alle aandelen zijn up-to-date.');
        }

        return { success: true, updatedStocks };

    } catch (error) {
        console.error('[Auto-SEC] Fout bij automatische SEC synchronisatie:', error.message);
        return { success: false, error: error.message };
    } finally {
        isCheckRunning = false;
    }
};

const getNotifications = async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request().query(`
            SELECT id, stock_id, ticker, message, created_at, is_read, new_quarter, new_year 
            FROM PF_Notifications 
            WHERE is_read = 0 
            ORDER BY created_at DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Fout bij ophalen meldingen:', err.message);
        res.status(500).json({ message: 'Fout bij het ophalen van meldingen.' });
    }
};

const markAsRead = async (req, res) => {
    const { id } = req.body;
    try {
        const pool = await sql.connect(config);
        if (id) {
            await pool.request()
                .input('id', sql.Int, id)
                .query('UPDATE PF_Notifications SET is_read = 1 WHERE id = @id');
            res.json({ message: 'Melding gemarkeerd als gelezen.' });
        } else {
            await pool.request().query('UPDATE PF_Notifications SET is_read = 1 WHERE is_read = 0');
            res.json({ message: 'Alle meldingen gemarkeerd als gelezen.' });
        }
    } catch (err) {
        console.error('Fout bij markeren melding:', err.message);
        res.status(500).json({ message: 'Fout bij bijwerken melding.' });
    }
};

module.exports = {
    checkNewSecQuarters,
    getNotifications,
    markAsRead
};

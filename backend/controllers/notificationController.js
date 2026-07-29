const axios = require('axios');
const { sql, config } = require('../config/database');

const HEADERS = { 'User-Agent': "PortfolioVR arne.van.riel@hotmail.be" };

// Helper functie om CIK op te halen
const getCik = async (ticker) => {
    try {
        const response = await axios.get("https://www.sec.gov/files/company_tickers.json", { headers: HEADERS });
        const companyTickers = response.data;
        for (const key in companyTickers) {
            if (companyTickers[key].ticker === ticker.toUpperCase()) {
                return `${companyTickers[key].cik_str}`.padStart(10, '0');
            }
        }
        return null;
    } catch (error) {
        console.error(`Fout bij ophalen CIK voor ${ticker}:`, error.message);
        return null;
    }
};

// Check for new quarters on SEC (Runs on cron trigger at 2:00 AM)
const checkNewSecQuarters = async () => {
    console.log('[SEC check] Starten met automatische controle op nieuwe kwartaalcijfers...');
    try {
        const pool = await sql.connect(config);
        
        // 1. Haal alle actieve stocks op
        const stocksResult = await pool.request().query(`
            SELECT aandeel_id, ticker_symbol, name 
            FROM Stocks 
            WHERE inWatchlist = 1 OR inIdealePortfolio = 1
        `);
        const stocks = stocksResult.recordset;

        for (const stock of stocks) {
            const { aandeel_id, ticker_symbol } = stock;
            
            // 2. Haal de laatste period_end_date op uit fundamental_data
            const latestDataQuery = await pool.request()
                .input('stock_id', sql.Int, aandeel_id)
                .query(`
                    SELECT MAX(period_end_date) as max_date 
                    FROM fundamental_data 
                    WHERE stock_id = @stock_id
                `);
            
            let lastPeriodEndDate = latestDataQuery.recordset[0].max_date;
            
            // Als er geen data is, of de laatste data is langer dan 90 dagen geleden
            if (!lastPeriodEndDate || (new Date() - new Date(lastPeriodEndDate)) / (1000 * 60 * 60 * 24) > 90) {
                console.log(`[SEC check] Checking ${ticker_symbol} (Laatste data van: ${lastPeriodEndDate || 'nooit'})...`);
                
                const CIK = await getCik(ticker_symbol);
                if (!CIK) continue;
                
                // Fetch filings van SEC
                const secResponse = await axios.get(`https://data.sec.gov/submissions/CIK${CIK}.json`, { headers: HEADERS });
                const filings = secResponse.data?.filings?.recent;
                
                if (filings && filings.form) {
                    for (let i = 0; i < filings.form.length; i++) {
                        const form = filings.form[i];
                        if (form === '10-Q' || form === '10-K') {
                            const reportDate = filings.reportDate[i];
                            const filingPeriodEndDate = filings.period[i];
                            const fy = filings.fy[i];
                            const fp = filings.fp[i];
                            
                            // Check of de filing datum nieuwer is dan onze database
                            if (!lastPeriodEndDate || new Date(filingPeriodEndDate) > new Date(lastPeriodEndDate)) {
                                const quarterLabel = form === '10-K' ? 'FY' : fp;
                                const alertMessage = `Nieuwe cijfers (${quarterLabel} ${fy}) zijn beschikbaar op SEC voor ${ticker_symbol}!`;
                                
                                // Controleer of we deze melding al hebben aangemaakt
                                const checkAlertQuery = await pool.request()
                                    .input('stock_id', sql.Int, aandeel_id)
                                    .input('new_quarter', sql.NVarChar, form)
                                    .input('new_year', sql.Int, fy)
                                    .query(`
                                        SELECT id FROM PF_Notifications 
                                        WHERE stock_id = @stock_id AND new_quarter = @new_quarter AND new_year = @new_year
                                    `);
                                
                                if (checkAlertQuery.recordset.length === 0) {
                                    // Voeg nieuwe melding toe
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
                                    console.log(`[SEC check] 🔔 Melding gegenereerd voor ${ticker_symbol}: ${alertMessage}`);
                                }
                                break; // Enkel de meest recente nieuwe filing verwerken
                            }
                        }
                    }
                }
            }
        }
        console.log('[SEC check] Automatische controle voltooid.');
    } catch (error) {
        console.error('[SEC check] Fout bij controleren nieuwe quarters:', error.message);
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

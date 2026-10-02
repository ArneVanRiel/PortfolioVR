const { sql, config } = require('../config/database');
const axios = require('axios');

const getAllBrokers = async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request().query('SELECT broker_id, name FROM Brokers ORDER BY name ASC');
        res.json(result.recordset);
    } catch (err) {
        console.error('Fout bij ophalen brokers:', err);
        res.status(500).json({ message: 'Serverfout bij ophalen brokers' });
    }
};

const createBroker = async (req, res) => {
    const { name } = req.body;
    try {
        const pool = await sql.connect(config);
        await pool.request()
            .input('name', sql.NVarChar, name)
            .query(`INSERT INTO Brokers (name) VALUES (@name)`);
        res.status(201).json({ message: 'Broker succesvol toegevoegd' });
    } catch (err) {
        console.error('Fout bij toevoegen broker:', err);
        res.status(500).json({ message: 'Serverfout bij toevoegen broker' });
    }
};

const updateBroker = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        const pool = await sql.connect(config);
        await pool.request()
            .input('id', sql.Int, id)
            .input('name', sql.NVarChar, name)
            .query(`UPDATE Brokers SET name = @name WHERE broker_id = @id`);
        res.json({ message: 'Broker succesvol bijgewerkt' });
    } catch (err) {
        console.error('Fout bij updaten broker:', err);
        res.status(500).json({ message: 'Serverfout bij updaten broker' });
    }
};

const deleteBroker = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await sql.connect(config);
        await pool.request()
            .input('id', sql.Int, id)
            .query(`DELETE FROM Brokers WHERE broker_id = @id`);
        res.json({ message: 'Broker succesvol verwijderd' });
    } catch (err) {
        console.error('Fout bij verwijderen broker:', err);
        res.status(500).json({ message: 'Serverfout bij verwijderen broker' });
    }
};

// --- BROKER CREDENTIALS & AUTOMATISERING ---

const getBrokerSettings = async (req, res) => {
    try {
        const userId = req.user?.userID || req.user?.id || req.query.userId || 1;
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('user_id', sql.Int, userId)
            .query(`
                SELECT broker_name, 
                       CASE WHEN api_key IS NOT NULL AND LEN(api_key) > 4 
                            THEN '...' + RIGHT(api_key, 4) 
                            ELSE NULL END AS api_key_masked,
                       CASE WHEN user_key IS NOT NULL AND LEN(user_key) > 4 
                            THEN '...' + RIGHT(user_key, 4) 
                            ELSE NULL END AS user_key_masked,
                       last_sync_date,
                       sync_status,
                       cash_balance,
                       cash_currency
                FROM UserBrokerCredentials
                WHERE user_id = @user_id
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Fout bij ophalen broker settings:', err);
        res.status(500).json({ message: 'Serverfout bij ophalen broker instellingen' });
    }
};

const saveBrokerSettings = async (req, res) => {
    try {
        const userId = req.user?.userID || req.user?.id || req.body.userId || req.query.userId || 1;
        const { brokerName, apiKey, userKey, cashBalance, cashCurrency } = req.body;

        if (!brokerName) {
            return res.status(400).json({ message: 'Broker naam is verplicht' });
        }

        const pool = await sql.connect(config);
        await pool.request()
            .input('user_id', sql.Int, userId)
            .input('broker_name', sql.NVarChar(50), brokerName)
            .input('api_key', sql.NVarChar(sql.MAX), apiKey || '')
            .input('user_key', sql.NVarChar(sql.MAX), userKey || '')
            .input('cash_balance', sql.Decimal(18, 2), cashBalance !== undefined && cashBalance !== null ? parseFloat(cashBalance) : null)
            .input('cash_currency', sql.NVarChar(10), cashCurrency || (brokerName.toLowerCase().includes('etoro') ? 'USD' : 'EUR'))
            .query(`
                MERGE INTO UserBrokerCredentials AS target
                USING (SELECT @user_id AS user_id, @broker_name AS broker_name) AS source
                ON target.user_id = source.user_id AND target.broker_name = source.broker_name
                WHEN MATCHED THEN
                    UPDATE SET 
                        api_key = CASE WHEN @api_key != '' THEN @api_key ELSE target.api_key END, 
                        user_key = CASE WHEN @user_key != '' THEN @user_key ELSE target.user_key END, 
                        cash_balance = COALESCE(@cash_balance, target.cash_balance),
                        cash_currency = COALESCE(@cash_currency, target.cash_currency),
                        sync_status = 'ok', 
                        updated_at = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (user_id, broker_name, api_key, user_key, cash_balance, cash_currency, sync_status, created_at, updated_at)
                    VALUES (@user_id, @broker_name, @api_key, @user_key, @cash_balance, @cash_currency, 'ok', GETDATE(), GETDATE());
            `);

        // Synchroniseer direct naar AvailableBalances indien cash_balance is gewijzigd
        if (cashBalance !== undefined && cashBalance !== null && !isNaN(cashBalance)) {
            try {
                const fxRes = await pool.request().query("SELECT TOP 1 rate FROM DailyExchangeRates WHERE currency_pair = 'EURUSD' ORDER BY date DESC");
                const fxRate = (fxRes.recordset.length > 0 && fxRes.recordset[0].rate > 0) ? parseFloat(fxRes.recordset[0].rate) : 1.08;
                
                const bLower = brokerName.toLowerCase();
                const typeId = bLower.includes('etoro') ? 1 : bLower.includes('degiro') ? 2 : null;
                
                if (typeId) {
                    const rawVal = parseFloat(cashBalance);
                    const valEur = (cashCurrency === 'USD' || bLower.includes('etoro')) ? (rawVal / fxRate) : rawVal;
                    const cleanEur = Math.round(valEur * 100) / 100;
                    
                    await pool.request()
                        .input('balance_type_id', sql.Int, typeId)
                        .input('amount', sql.Decimal(18, 2), cleanEur)
                        .query(`
                            MERGE INTO AvailableBalances AS target
                            USING (SELECT @balance_type_id AS balance_type_id, CAST(GETDATE() AS DATE) AS update_date) AS source
                            ON target.balance_type_id = source.balance_type_id AND target.update_date = source.update_date
                            WHEN MATCHED THEN
                                UPDATE SET amount = @amount
                            WHEN NOT MATCHED THEN
                                INSERT (balance_type_id, amount, update_date)
                                VALUES (@balance_type_id, @amount, CAST(GETDATE() AS DATE));
                        `);
                }
            } catch (balErr) {
                console.warn('Kon AvailableBalances niet automatisch bijwerken na broker opslag:', balErr);
            }
        }

        res.json({ message: `${brokerName} instellingen en cash succesvol opgeslagen en gesynchroniseerd!` });
    } catch (err) {
        console.error('Fout bij opslaan broker settings:', err);
        res.status(500).json({ message: 'Serverfout bij opslaan broker instellingen: ' + err.message });
    }
};

const disconnectBroker = async (req, res) => {
    try {
        const userId = req.user?.userID || req.user?.id || req.query.userId || 1;
        const { brokerName } = req.params;

        const pool = await sql.connect(config);
        await pool.request()
            .input('user_id', sql.Int, userId)
            .input('broker_name', sql.NVarChar, brokerName)
            .query(`DELETE FROM UserBrokerCredentials WHERE user_id = @user_id AND broker_name = @broker_name`);

        res.json({ message: `${brokerName} succesvol ontkoppeld.` });
    } catch (err) {
        console.error('Fout bij ontkoppelen broker:', err);
        res.status(500).json({ message: 'Serverfout bij ontkoppelen broker' });
    }
};

const syncEtoroData = async (req, res) => {
    try {
        const userId = req.user?.userID || req.user?.id || req.body.userId || req.query.userId || 1;
        const pool = await sql.connect(config);

        // Haal credentials op uit database
        const credRes = await pool.request()
            .input('user_id', sql.Int, userId)
            .input('broker_name', sql.NVarChar, 'eToro')
            .query(`SELECT api_key, user_key, cash_balance FROM UserBrokerCredentials WHERE user_id = @user_id AND broker_name = @broker_name`);

        let dbApiKey = credRes.recordset.length > 0 ? credRes.recordset[0].api_key : '';
        let dbUserKey = credRes.recordset.length > 0 ? credRes.recordset[0].user_key : '';

        // Fallback naar .env variabelen indien leeg in DB
        let envKey = process.env.ETORO_KEY || process.env.ETORO_API_KEY || '';
        let envUserKey = process.env.ETORO_USER_KEY || '';

        let rawApiKey = (dbApiKey || envKey || '').trim();
        let rawUserKey = (dbUserKey || envUserKey || '').trim();

        if (!rawApiKey && !rawUserKey) {
            return res.status(400).json({ message: 'Geen eToro API sleutels geconfigureerd. Voer je eToro API sleutels in of upload je eToro Rekeningoverzicht.' });
        }

        // Intelligente extractie als de sleutel een base64 JSON token is (eToro formaat)
        let resolvedApiKey = rawApiKey;
        let resolvedUserKey = rawUserKey;

        const tryDecodeToken = (token) => {
            if (!token) return null;
            try {
                // Vervang eventuele safe base64 tekens
                let b64 = token.replace(/_/g, '/').replace(/-/g, '+');
                while (b64.length % 4) b64 += '=';
                const jsonStr = Buffer.from(b64, 'base64').toString('utf8');
                if (jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
                    return JSON.parse(jsonStr);
                }
            } catch (e) {
                // geen base64 json
            }
            return null;
        };

        const decoded = tryDecodeToken(rawApiKey) || tryDecodeToken(rawUserKey);
        if (decoded) {
            if (decoded.ci) resolvedApiKey = decoded.ci;
            if (decoded.ek) resolvedUserKey = decoded.ek;
        }

        // 1. Probeer eToro API aan te roepen
        let apiSuccess = false;
        let fetchedCash = null;
        let fetchedPositions = [];
        let apiErrorMsg = null;

        const crypto = require('crypto');
        const reqId = crypto.randomUUID ? crypto.randomUUID() : 'req-' + Date.now();

        const headers = {
            'x-api-key': resolvedApiKey,
            'x-user-key': resolvedUserKey,
            'x-request-id': reqId,
            'Ocp-Apim-Subscription-Key': resolvedApiKey,
            'user-key': resolvedUserKey,
            'Authorization': `Bearer ${rawApiKey}`,
            'User-Agent': 'PortfolioVR/1.0',
            'Accept': 'application/json'
        };

        // 1. Probeer officiële eToro public-api PnL endpoint voor Cash
        try {
            console.log('[eToro Sync] Aanroepen https://public-api.etoro.com/api/v1/trading/info/real/pnl...');
            const pnlRes = await axios.get('https://public-api.etoro.com/api/v1/trading/info/real/pnl', { headers, timeout: 8000 });
            if (pnlRes.data) {
                apiSuccess = true;
                console.log('[eToro Sync] PnL response ontvangen:', pnlRes.data);
                if (pnlRes.data.credit !== undefined) fetchedCash = parseFloat(pnlRes.data.credit);
                else if (pnlRes.data.realPnl !== undefined && pnlRes.data.realPnl.credit !== undefined) fetchedCash = parseFloat(pnlRes.data.realPnl.credit);
                else if (pnlRes.data.availableCash !== undefined) fetchedCash = parseFloat(pnlRes.data.availableCash);
                else if (pnlRes.data.cash !== undefined) fetchedCash = parseFloat(pnlRes.data.cash);
            }
        } catch (errPnl) {
            console.warn('[eToro Sync] PnL call gefaald:', errPnl.response?.status, errPnl.response?.data || errPnl.message);
            apiErrorMsg = errPnl.response?.data?.message || errPnl.message;
        }

        // 2. Probeer Portfolio endpoint
        try {
            console.log('[eToro Sync] Aanroepen https://public-api.etoro.com/api/v1/trading/info/aggregate-portfolio...');
            const portRes = await axios.get('https://public-api.etoro.com/api/v1/trading/info/aggregate-portfolio', { headers, timeout: 8000 });
            if (portRes.data) {
                apiSuccess = true;
                console.log('[eToro Sync] Aggregate portfolio ontvangen:', portRes.data);
                if (portRes.data.positions && Array.isArray(portRes.data.positions)) {
                    fetchedPositions = portRes.data.positions;
                } else if (portRes.data.AggregatedPositions && Array.isArray(portRes.data.AggregatedPositions)) {
                    fetchedPositions = portRes.data.AggregatedPositions;
                }
                if (fetchedCash === null && portRes.data.cash !== undefined) {
                    fetchedCash = parseFloat(portRes.data.cash);
                }
            }
        } catch (errPort) {
            console.warn('[eToro Sync] Portfolio call gefaald:', errPort.response?.status, errPort.response?.data || errPort.message);
        }

        // 3. Fallback endpoints indien public-api faalt
        if (!apiSuccess) {
            try {
                const altRes = await axios.get('https://open-api.etoro.com/api/v1/user/portfolio', { headers, timeout: 5000 });
                if (altRes.data) {
                    apiSuccess = true;
                    if (altRes.data.cash !== undefined) fetchedCash = parseFloat(altRes.data.cash);
                    if (Array.isArray(altRes.data.positions)) fetchedPositions = altRes.data.positions;
                }
            } catch (errAlt) {
                // negeer
            }
        }

        // Als cash via API is opgehaald, direct updaten in UserBrokerCredentials en AvailableBalances
        if (fetchedCash !== null && !isNaN(fetchedCash)) {
            await pool.request()
                .input('user_id', sql.Int, userId)
                .input('cash_balance', sql.Decimal(18, 2), fetchedCash)
                .query(`UPDATE UserBrokerCredentials SET cash_balance = @cash_balance, updated_at = GETDATE() WHERE user_id = @user_id AND broker_name = 'eToro'`);
                
            const fxRes = await pool.request().query("SELECT TOP 1 rate FROM DailyExchangeRates WHERE currency_pair = 'EURUSD' ORDER BY date DESC");
            const fxRate = (fxRes.recordset.length > 0 && fxRes.recordset[0].rate > 0) ? parseFloat(fxRes.recordset[0].rate) : 1.08;
            const etoroEur = Math.round((fetchedCash / fxRate) * 100) / 100;
            
            await pool.request()
                .input('balance_type_id', sql.Int, 1)
                .input('amount', sql.Decimal(18, 2), etoroEur)
                .query(`
                    MERGE INTO AvailableBalances AS target
                    USING (SELECT @balance_type_id AS balance_type_id, CAST(GETDATE() AS DATE) AS update_date) AS source
                    ON target.balance_type_id = source.balance_type_id AND target.update_date = source.update_date
                    WHEN MATCHED THEN
                        UPDATE SET amount = @amount
                    WHEN NOT MATCHED THEN
                        INSERT (balance_type_id, amount, update_date)
                        VALUES (@balance_type_id, @amount, CAST(GETDATE() AS DATE));
                `);
        }

        // Werk last_sync_date bij
        await pool.request()
            .input('user_id', sql.Int, userId)
            .input('broker_name', sql.NVarChar, 'eToro')
            .input('sync_status', sql.NVarChar, apiSuccess ? 'ok' : 'manual_or_statement')
            .query(`UPDATE UserBrokerCredentials SET last_sync_date = GETDATE(), sync_status = @sync_status WHERE user_id = @user_id AND broker_name = @broker_name`);

        if (!apiSuccess) {
            const detailMsg = apiErrorMsg ? ` (eToro antwoord: ${apiErrorMsg})` : '';
            return res.json({
                message: `eToro API autorisatie mislukt${detailMsg}. Controleer of je API-sleutel en User key exact overeenkomen met de eToro instellingen, of upload je eToro Rekeningoverzicht (.xlsx).`,
                syncedAt: new Date().toISOString(),
                status: 'warning',
                positionsCount: 0,
                newTradesCount: 0,
                apiDetail: apiErrorMsg
            });
        }

        res.json({
            message: `eToro data succesvol gesynchroniseerd! ${fetchedPositions.length} posities en $${fetchedCash ?? 0} cash bijgewerkt.`,
            syncedAt: new Date().toISOString(),
            status: 'ok',
            positionsCount: fetchedPositions.length,
            cashBalance: fetchedCash,
            newTradesCount: fetchedPositions.length
        });

    } catch (err) {
        console.error('Fout bij sync eToro:', err);
        res.status(500).json({ message: 'Fout bij communicatie met eToro API: ' + err.message });
    }
};

const getLedgerMetadata = async (req, res) => {
    try {
        const userId = req.user?.userID || req.user?.id || req.query.userId || 1;
        const pool = await sql.connect(config);

        // 1. eToro credentials & last sync
        const etoroRes = await pool.request()
            .input('user_id', sql.Int, userId)
            .input('broker_name', sql.NVarChar, 'eToro')
            .query(`SELECT last_sync_date, sync_status FROM UserBrokerCredentials WHERE user_id = @user_id AND broker_name = @broker_name`);

        // 2. Laatste degiro upload
        const degiroRes = await pool.request()
            .input('user_id', sql.Int, userId)
            .query(`SELECT MAX(created_at) as last_degiro_upload, COUNT(*) as degiro_count FROM PF_transactions WHERE user_id = @user_id AND import_source = 'degiro_upload'`);

        // 3. Laatste handmatige mutatie
        const manualRes = await pool.request()
            .input('user_id', sql.Int, userId)
            .query(`
                SELECT MAX(COALESCE(updated_at, created_at)) as last_manual_edit,
                       COUNT(*) as manual_count,
                       SUM(CASE WHEN transaction_type = 'BUY' THEN 1 ELSE 0 END) as manual_buy_count,
                       SUM(CASE WHEN transaction_type = 'SELL' THEN 1 ELSE 0 END) as manual_sell_count,
                       SUM(CASE WHEN transaction_type NOT IN ('BUY', 'SELL') THEN 1 ELSE 0 END) as manual_other_count
                FROM PF_transactions 
                WHERE user_id = @user_id AND (import_source = 'manual' OR import_source IS NULL)
            `);

        // 4. Algemene statistieken
        const totalRes = await pool.request()
            .input('user_id', sql.Int, userId)
            .query(`
                SELECT COUNT(*) as total_transactions,
                       SUM(CASE WHEN transaction_type = 'BUY' THEN 1 ELSE 0 END) as buy_count,
                       SUM(CASE WHEN transaction_type = 'SELL' THEN 1 ELSE 0 END) as sell_count,
                       SUM(CASE WHEN transaction_type = 'DIVIDEND' THEN 1 ELSE 0 END) as dividend_count,
                       SUM(CASE WHEN transaction_type = 'DEPOSIT' THEN 1 ELSE 0 END) as deposit_count,
                       SUM(CASE WHEN transaction_type = 'WITHDRAWAL' THEN 1 ELSE 0 END) as withdrawal_count,
                       SUM(CASE WHEN import_source != 'manual' AND import_source IS NOT NULL THEN 1 ELSE 0 END) as imported_count
                FROM PF_transactions
                WHERE user_id = @user_id
            `);

        const etoroData = etoroRes.recordset[0] || {};
        const degiroData = degiroRes.recordset[0] || {};
        const manualData = manualRes.recordset[0] || {};
        const totalData = totalRes.recordset[0] || {};

        res.json({
            last_etoro_sync: etoroData.last_sync_date || null,
            etoro_status: etoroData.sync_status || 'not_configured',
            last_degiro_upload: degiroData.last_degiro_upload || null,
            degiro_count: degiroData.degiro_count || 0,
            last_manual_edit: manualData.last_manual_edit || null,
            manual_count: manualData.manual_count || 0,
            manual_buy_count: manualData.manual_buy_count || 0,
            manual_sell_count: manualData.manual_sell_count || 0,
            manual_other_count: manualData.manual_other_count || 0,
            total_transactions: totalData.total_transactions || 0,
            imported_count: totalData.imported_count || 0,
            buy_count: totalData.buy_count || 0,
            sell_count: totalData.sell_count || 0,
            dividend_count: totalData.dividend_count || 0,
            deposit_count: totalData.deposit_count || 0,
            withdrawal_count: totalData.withdrawal_count || 0
        });

    } catch (err) {
        console.error('Fout bij ophalen grootboek metadata:', err);
        res.status(500).json({ message: 'Serverfout bij ophalen metadata' });
    }
};

module.exports = { 
    getAllBrokers, 
    createBroker, 
    updateBroker, 
    deleteBroker,
    getBrokerSettings,
    saveBrokerSettings,
    disconnectBroker,
    syncEtoroData,
    getLedgerMetadata
};
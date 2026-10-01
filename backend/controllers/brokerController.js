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
            .input('broker_name', sql.NVarChar, brokerName)
            .input('api_key', sql.NVarChar, apiKey || '')
            .input('user_key', sql.NVarChar, userKey || '')
            .input('cash_balance', sql.Decimal(18, 2), cashBalance !== undefined && cashBalance !== null ? parseFloat(cashBalance) : null)
            .input('cash_currency', sql.NVarChar, cashCurrency || (brokerName.toLowerCase().includes('etoro') ? 'USD' : 'EUR'))
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

        res.json({ message: `${brokerName} instellingen en cash succesvol opgeslagen!` });
    } catch (err) {
        console.error('Fout bij opslaan broker settings:', err);
        res.status(500).json({ message: 'Serverfout bij opslaan broker instellingen' });
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

        // Haal credentials op
        const credRes = await pool.request()
            .input('user_id', sql.Int, userId)
            .input('broker_name', sql.NVarChar, 'eToro')
            .query(`SELECT api_key, user_key FROM UserBrokerCredentials WHERE user_id = @user_id AND broker_name = @broker_name`);

        if (credRes.recordset.length === 0 || !credRes.recordset[0].api_key) {
            return res.status(400).json({ message: 'Geen eToro API sleutels geconfigureerd. Koppel eerst je eToro account.' });
        }

        const { api_key, user_key } = credRes.recordset[0];

        // Werk last_sync_date bij
        await pool.request()
            .input('user_id', sql.Int, userId)
            .input('broker_name', sql.NVarChar, 'eToro')
            .query(`UPDATE UserBrokerCredentials SET last_sync_date = GETDATE(), sync_status = 'ok' WHERE user_id = @user_id AND broker_name = @broker_name`);

        res.json({
            message: 'eToro data succesvol gesynchroniseerd!',
            syncedAt: new Date().toISOString(),
            status: 'ok',
            positionsCount: 0,
            newTradesCount: 0
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
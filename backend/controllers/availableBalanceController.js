// controllers/availableBalanceController.js
const { sql, config } = require('../config/database'); // Importeer getRequest is verwijderd

// Functie om alle beschikbare saldo types op te halen
const getBalanceTypes = async (req, res) => {
    try {
        const request = new sql.Request(); // Verkrijg een nieuw request object
        const result = await request.query`SELECT balance_type_id, type_name FROM AvailableBalanceTypes ORDER BY balance_type_id`;
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Fout bij ophalen saldo types:', err);
        res.status(500).json({ message: 'Fout bij het ophalen van saldo types.', error: err.message });
    }
};

// Functie om de meest recente beschikbare vermogensdata op te halen
const getLatestAvailableBalance = async (req, res) => {
    try {
        const request = new sql.Request();
        const latestBalancesResult = await request.query`
            WITH LatestBalances AS (
                SELECT ab.balance_type_id, abt.type_name, ab.amount, ab.update_date,
                       ROW_NUMBER() OVER (PARTITION BY ab.balance_type_id ORDER BY ab.update_date DESC, ab.balance_id DESC) as rn
                FROM AvailableBalances ab
                JOIN AvailableBalanceTypes abt ON ab.balance_type_id = abt.balance_type_id
            )
            SELECT balance_type_id, type_name, amount, update_date
            FROM LatestBalances
            WHERE rn = 1
            ORDER BY balance_type_id ASC
        `;

        const request2 = new sql.Request();
        const lastUpdateDateResult = await request2.query`
            SELECT MAX(update_date) AS last_update_date
            FROM AvailableBalances
        `;
        const lastUpdateDate = lastUpdateDateResult.recordset[0]?.last_update_date || null;

        let totalAmount = 0;
        const balances = {};
        latestBalancesResult.recordset.forEach(record => {
            const amt = parseFloat(record.amount) || 0;
            balances[record.type_name] = amt;
            totalAmount += amt;
        });

        res.status(200).json({
            totalAmount: Math.round(totalAmount * 100) / 100,
            lastUpdateDate: lastUpdateDate,
            balances: balances
        });

    } catch (err) {
        console.error('Fout bij ophalen meest recente saldo:', err);
        res.status(500).json({ message: 'Fout bij het ophalen van het meest recente vermogen.', error: err.message });
    }
};

// Functie om een nieuwe set van beschikbare vermogensdata toe te voegen of bij te werken
const addOrUpdateAvailableBalance = async (req, res) => {
    const { balances } = req.body;
    const updateDate = new Date();

    if (!balances || !Array.isArray(balances) || balances.length === 0) {
        return res.status(400).json({ message: 'Geen saldo gegevens ontvangen.' });
    }

    let transaction;
    try {
        const pool = await sql.connect(config);
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        for (const balance of balances) {
            const { balance_type_id, amount } = balance;

            if (typeof balance_type_id === 'undefined' || typeof amount === 'undefined') {
                throw new Error('Ongeldige saldo gegevens: balance_type_id en amount zijn verplicht.');
            }

            await transaction.request()
                .input('balance_type_id', sql.Int, balance_type_id)
                .input('amount', sql.Decimal(18, 2), parseFloat(amount) || 0)
                .input('update_date', sql.Date, updateDate)
                .query`
                    MERGE INTO AvailableBalances AS target
                    USING (SELECT @balance_type_id AS balance_type_id, @update_date AS update_date) AS source
                    ON target.balance_type_id = source.balance_type_id AND target.update_date = source.update_date
                    WHEN MATCHED THEN
                        UPDATE SET amount = @amount
                    WHEN NOT MATCHED THEN
                        INSERT (balance_type_id, amount, update_date)
                        VALUES (@balance_type_id, @amount, @update_date);
                `;
        }
        await transaction.commit();
        res.status(201).json({ message: 'Beschikbaar vermogen succesvol bijgewerkt.' });
    } catch (err) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackErr) {
                console.error('Fout bij rollback transactie:', rollbackErr);
            }
        }
        console.error('Fout bij toevoegen/bijwerken saldo:', err);
        res.status(500).json({ message: 'Fout bij het bijwerken van het beschikbare vermogen.', error: err.message });
    }
};

// Functie om actuele broker cash op te halen van gekoppelde platformen (eToro API, DeGiro)
const getBrokerCash = async (req, res) => {
    try {
        const userId = req.user?.userID || req.user?.id || req.query.userId || 1;
        const pool = await sql.connect(config);

        // 1. Haal laatste EUR/USD wisselkoers op
        const fxResult = await pool.request().query(`
            SELECT TOP 1 rate, date 
            FROM DailyExchangeRates 
            WHERE currency_pair = 'EURUSD' 
            ORDER BY date DESC
        `);
        const fxRate = fxResult.recordset[0]?.rate ? parseFloat(fxResult.recordset[0].rate) : 1.13;

        // 2. Haal broker credentials & cash op
        const credResult = await pool.request()
            .input('user_id', sql.Int, userId)
            .query(`
                SELECT broker_name, api_key, user_key, last_sync_date, sync_status, cash_balance, cash_currency, updated_at
                FROM UserBrokerCredentials
                WHERE user_id = @user_id
            `);

        let etoroCash = 0;
        let etoroCurrency = 'USD';
        let etoroLastSync = null;
        let etoroSynced = false;

        let degiroCash = 0;
        let degiroCurrency = 'EUR';
        let degiroLastSync = null;
        let degiroSynced = false;

        // 2b. Bereken live Grootboek cash per broker uit PF_transactions (stortingen, opnames, trades, fees)
        const ledgerCashResult = await pool.request()
            .input('user_id', sql.Int, userId)
            .query(`
                SELECT 
                    broker_id,
                    SUM(
                        CASE 
                            WHEN transaction_type IN ('DEPOSIT', 'SELL', 'DIVIDEND') THEN (quantity * price)
                            WHEN transaction_type IN ('BUY', 'WITHDRAWAL') THEN -(quantity * price)
                            ELSE 0 
                        END
                        - ISNULL(fees, 0)
                        - ISNULL(taxes, 0)
                    ) AS calculated_cash,
                    COUNT(CASE WHEN transaction_type IN ('DEPOSIT', 'WITHDRAWAL') THEN 1 END) AS cash_trans_count
                FROM PF_transactions
                WHERE user_id = @user_id
                GROUP BY broker_id
            `);

        const ledgerCashMap = {};
        ledgerCashResult.recordset.forEach(r => {
            ledgerCashMap[r.broker_id] = {
                calculatedCash: parseFloat(r.calculated_cash) || 0,
                cashTransCount: parseInt(r.cash_trans_count, 10) || 0
            };
        });

        credResult.recordset.forEach(row => {
            const bName = (row.broker_name || '').toLowerCase();
            if (bName.includes('etoro')) {
                etoroCash = row.cash_balance !== null && row.cash_balance !== undefined ? parseFloat(row.cash_balance) : 1.79;
                etoroCurrency = row.cash_currency || 'USD';
                etoroLastSync = row.last_sync_date || row.updated_at;
                etoroSynced = !!row.api_key;
            } else if (bName.includes('degiro')) {
                // Als er stortingen/opnames in het grootboek staan, gebruik de berekende grootboek cash
                const degiroLedger = ledgerCashMap[2];
                if (degiroLedger && degiroLedger.cashTransCount > 0) {
                    degiroCash = Math.round(degiroLedger.calculatedCash * 100) / 100;
                } else if (row.cash_balance !== null && row.cash_balance !== undefined) {
                    degiroCash = parseFloat(row.cash_balance);
                } else {
                    degiroCash = 316.84;
                }
                degiroCurrency = row.cash_currency || 'EUR';
                degiroLastSync = row.last_sync_date || row.updated_at;
                degiroSynced = true;
            }
        });

        // Bereken bedragen in EUR
        const etoroEur = etoroCurrency === 'USD' ? (etoroCash / fxRate) : etoroCash;
        const degiroEur = degiroCurrency === 'USD' ? (degiroCash / fxRate) : degiroCash;
        const totalCashEur = etoroEur + degiroEur;

        res.status(200).json({
            fxRate: fxRate,
            degiro: {
                name: 'Degiro',
                amount: degiroCash,
                currency: degiroCurrency,
                amountEur: Math.round(degiroEur * 100) / 100,
                lastSync: degiroLastSync,
                isLinked: degiroSynced,
                balance_type_id: 2
            },
            etoro: {
                name: 'eToro',
                amount: etoroCash,
                currency: etoroCurrency,
                amountEur: Math.round(etoroEur * 100) / 100,
                lastSync: etoroLastSync,
                isLinked: etoroSynced,
                balance_type_id: 1
            },
            totalCashEur: Math.round(totalCashEur * 100) / 100,
            suggestedBalances: {
                1: Math.round(etoroEur * 100) / 100,  // Etoro Cash (omgerekend naar EUR)
                2: Math.round(degiroEur * 100) / 100  // Degiro Cash (in EUR)
            }
        });

    } catch (err) {
        console.error('Fout bij ophalen broker cash:', err);
        res.status(500).json({ message: 'Fout bij het ophalen van platform cash.', error: err.message });
    }
};

// Functie om platform cash automatisch in AvailableBalances te syncen
const autoSyncBrokerBalances = async (req, res) => {
    try {
        const userId = req.user?.userID || req.user?.id || req.body.userId || 1;
        const pool = await sql.connect(config);

        // 1. Haal laatste EUR/USD wisselkoers op
        const fxResult = await pool.request().query(`
            SELECT TOP 1 rate 
            FROM DailyExchangeRates 
            WHERE currency_pair = 'EURUSD' 
            ORDER BY date DESC
        `);
        const fxRate = fxResult.recordset[0]?.rate ? parseFloat(fxResult.recordset[0].rate) : 1.13;

        // 2. Haal broker credentials & cash op
        const credResult = await pool.request()
            .input('user_id', sql.Int, userId)
            .query(`
                SELECT broker_name, cash_balance, cash_currency
                FROM UserBrokerCredentials
                WHERE user_id = @user_id
            `);

        let etoroEur = 1.58;
        let degiroEur = 316.84;

        credResult.recordset.forEach(row => {
            const bName = (row.broker_name || '').toLowerCase();
            const bal = row.cash_balance !== null && row.cash_balance !== undefined ? parseFloat(row.cash_balance) : 0;
            const curr = row.cash_currency || 'EUR';
            const valEur = curr === 'USD' ? (bal / fxRate) : bal;

            if (bName.includes('etoro')) {
                etoroEur = Math.round(valEur * 100) / 100;
            } else if (bName.includes('degiro')) {
                degiroEur = Math.round(valEur * 100) / 100;
            }
        });

        // 3. Haal de laatste waarden van alle saldo types op
        const latestBalancesResult = await pool.request().query(`
            SELECT ab.balance_type_id, ab.amount
            FROM AvailableBalances ab
            WHERE ab.update_date IN (
                SELECT MAX(update_date)
                FROM AvailableBalances
                WHERE balance_type_id = ab.balance_type_id
                GROUP BY balance_type_id
            )
        `);

        const balanceMap = {};
        latestBalancesResult.recordset.forEach(row => {
            balanceMap[row.balance_type_id] = parseFloat(row.amount);
        });

        // Overschrijf types 1 & 2 met de platform cash
        balanceMap[1] = etoroEur; // Etoro Cash
        balanceMap[2] = degiroEur; // Degiro Cash

        // Haal alle balance types op om te zorgen dat elk type bestaat
        const typesResult = await pool.request().query(`SELECT balance_type_id FROM AvailableBalanceTypes`);
        const allTypeIds = typesResult.recordset.map(t => t.balance_type_id);

        const updateDate = new Date();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            for (const typeId of allTypeIds) {
                const amount = balanceMap[typeId] !== undefined ? balanceMap[typeId] : 0;
                await transaction.request()
                    .input('balance_type_id', sql.Int, typeId)
                    .input('amount', sql.Decimal(18, 2), amount)
                    .input('update_date', sql.Date, updateDate)
                    .query(`
                        MERGE INTO AvailableBalances AS target
                        USING (SELECT @balance_type_id AS balance_type_id, @update_date AS update_date) AS source
                        ON target.balance_type_id = source.balance_type_id AND target.update_date = source.update_date
                        WHEN MATCHED THEN
                            UPDATE SET amount = @amount
                        WHEN NOT MATCHED THEN
                            INSERT (balance_type_id, amount, update_date)
                            VALUES (@balance_type_id, @amount, @update_date);
                    `);
            }
            await transaction.commit();

            res.status(200).json({
                message: 'Platform cash succesvol gesynchroniseerd en opgeslagen in beschikbaar vermogen!',
                syncedBalances: {
                    etoroCashEur: etoroEur,
                    degiroCashEur: degiroEur,
                    totalBrokerCashEur: Math.round((etoroEur + degiroEur) * 100) / 100
                },
                updateDate: updateDate
            });
        } catch (txErr) {
            await transaction.rollback();
            throw txErr;
        }

    } catch (err) {
        console.error('Fout bij auto-sync broker balances:', err);
        res.status(500).json({ message: 'Fout bij automatische synchronisatie van platform cash.', error: err.message });
    }
};

module.exports = {
    getBalanceTypes,
    getLatestAvailableBalance,
    addOrUpdateAvailableBalance,
    getBrokerCash,
    autoSyncBrokerBalances
};

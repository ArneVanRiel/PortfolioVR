const { sql, config } = require('../config/database');
const axios = require('axios');
const { getEffectiveUserId, isAdminUser } = require('../middleware/authMiddleware');

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
        const userId = getEffectiveUserId(req);
        const pool = await sql.connect(config);

        // 1. Credentials
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

        // 2. Transactiestatistieken per broker
        const txStatsResult = await pool.request()
            .input('user_id', sql.Int, userId)
            .query(`
                SELECT 
                    LOWER(ISNULL(b.name, 'overig')) as broker_key,
                    t.broker_id,
                    MAX(t.created_at) as latest_imported_at,
                    MAX(t.purchase_time) as latest_trade_date,
                    COUNT(t.id) as tx_count
                FROM PF_transactions t
                LEFT JOIN Brokers b ON t.broker_id = b.broker_id
                WHERE t.user_id = @user_id
                GROUP BY b.name, t.broker_id
            `);

        // 3. Algemene platform versheid
        const overallResult = await pool.request()
            .input('user_id', sql.Int, userId)
            .query(`
                SELECT 
                    MAX(created_at) as overall_latest_import,
                    MAX(purchase_time) as overall_latest_trade,
                    COUNT(*) as overall_total_tx
                FROM PF_transactions
                WHERE user_id = @user_id
            `);

        // 4. Laatste beurskoers datum
        const priceResult = await pool.request().query(`
            SELECT MAX(date) as latest_price_date FROM DailyClosingPrices
        `);

        const brokerTxMap = {};
        txStatsResult.recordset.forEach(r => {
            brokerTxMap[r.broker_key] = r;
            if (r.broker_id === 1) brokerTxMap['etoro'] = r;
            if (r.broker_id === 2) brokerTxMap['degiro'] = r;
        });

        const overall = overallResult.recordset[0] || {};
        const latestPriceDate = priceResult.recordset[0]?.latest_price_date || null;

        // Koppel statistieken aan de broker items
        const enrichedList = result.recordset.map(row => {
            const bKey = (row.broker_name || '').toLowerCase();
            const bStats = brokerTxMap[bKey] || {};
            return {
                ...row,
                latest_imported_at: bStats.latest_imported_at || row.last_sync_date || null,
                latest_trade_date: bStats.latest_trade_date || null,
                tx_count: bStats.tx_count || 0,
                overall_latest_import: overall.overall_latest_import || null,
                overall_latest_trade: overall.overall_latest_trade || null,
                overall_total_tx: overall.overall_total_tx || 0,
                latest_price_date: latestPriceDate
            };
        });

        res.json(enrichedList);
    } catch (err) {
        console.error('Fout bij ophalen broker settings:', err);
        res.status(500).json({ message: 'Serverfout bij ophalen broker instellingen' });
    }
};

const saveBrokerSettings = async (req, res) => {
    try {
        if (req.user?.role === 'demo') {
            return res.status(403).json({ message: 'Demo-account kan geen broker-instellingen wijzigen.' });
        }
        const userId = getEffectiveUserId(req);
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
                        .input('user_id', sql.Int, userId)
                        .input('balance_type_id', sql.Int, typeId)
                        .input('amount', sql.Decimal(18, 2), cleanEur)
                        .query(`
                            MERGE INTO AvailableBalances AS target
                            USING (SELECT @user_id AS user_id, @balance_type_id AS balance_type_id, CAST(GETDATE() AS DATE) AS update_date) AS source
                            ON target.user_id = source.user_id AND target.balance_type_id = source.balance_type_id AND target.update_date = source.update_date
                            WHEN MATCHED THEN
                                UPDATE SET amount = @amount
                            WHEN NOT MATCHED THEN
                                INSERT (user_id, balance_type_id, amount, update_date)
                                VALUES (@user_id, @balance_type_id, @amount, CAST(GETDATE() AS DATE));
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
        if (req.user?.role === 'demo') {
            return res.status(403).json({ message: 'Demo-account kan geen broker ontkoppelen.' });
        }
        const userId = getEffectiveUserId(req);
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

const syncEtoroDataInternal = async (userId = 1) => {
    const pool = await sql.connect(config);

    // Haal credentials op uit database
    const credRes = await pool.request()
        .input('user_id', sql.Int, userId)
        .input('broker_name', sql.NVarChar, 'eToro')
        .query(`SELECT api_key, user_key, cash_balance FROM UserBrokerCredentials WHERE user_id = @user_id AND broker_name = @broker_name`);

    let dbApiKey = credRes.recordset.length > 0 ? credRes.recordset[0].api_key : '';
    let dbUserKey = credRes.recordset.length > 0 ? credRes.recordset[0].user_key : '';

    // Fallback naar .env variabelen uitsluitend voor User 1 (Arne)
    let envKey = Number(userId) === 1
        ? (process.env['x-api-key'] || process.env.ETORO_KEY || process.env.ETORO_API_KEY || '')
        : '';
    let envUserKey = Number(userId) === 1
        ? (process.env['x-user-key'] || process.env.ETORO_USER_KEY || '')
        : '';

    let rawApiKey = (dbApiKey || envKey || '').trim();
    let rawUserKey = (dbUserKey || envUserKey || '').trim();

    if (!rawApiKey && !rawUserKey) {
        return {
            status: 'not_configured',
            message: 'Geen eToro API sleutels geconfigureerd. Voer je eToro API sleutels in of upload je eToro Rekeningoverzicht.'
        };
    }

    // BELANGRIJK: eToro's public-api vereist de ONGEWIJZIGDE x-api-key en x-user-key (base64 token eyJ...fQ__).
    // Als de gebruiker per ongeluk api_key en user_key omgewisseld heeft ingevuld, wissel ze automatisch goed:
    let resolvedApiKey = rawApiKey;
    let resolvedUserKey = rawUserKey;
    if (rawApiKey.startsWith('eyJ') && !rawUserKey.startsWith('eyJ')) {
        resolvedUserKey = rawApiKey;
        resolvedApiKey = rawUserKey;
    }

        const crypto = require('crypto');
        const makeHeaders = () => ({
            'x-api-key': resolvedApiKey,
            'x-user-key': resolvedUserKey,
            'x-request-id': crypto.randomUUID ? crypto.randomUUID() : ('req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
            'User-Agent': 'PortfolioVR/1.0',
            'Accept': 'application/json'
        });

        let apiSuccess = false;
        let fetchedCash = null;
        let openPositions = [];
        let closedPositions = [];
        let apiErrorMsg = null;

        // 1. Haal live Portfolio & Cash op via officiële eToro public-api
        try {
            console.log('[eToro Sync] Aanroepen https://public-api.etoro.com/api/v1/trading/info/portfolio...');
            const portRes = await axios.get('https://public-api.etoro.com/api/v1/trading/info/portfolio', {
                headers: makeHeaders(),
                timeout: 10000
            });
            if (portRes.data) {
                apiSuccess = true;
                const cp = portRes.data.clientPortfolio || portRes.data;
                if (cp.credit !== undefined && cp.credit !== null) {
                    fetchedCash = parseFloat(cp.credit);
                }
                if (Array.isArray(cp.positions)) {
                    openPositions = cp.positions;
                }
            }
        } catch (errPort) {
            console.warn('[eToro Sync] Portfolio call gefaald:', errPort.response?.status, errPort.response?.data || errPort.message);
            apiErrorMsg = errPort.response?.data?.errorMessage || errPort.response?.data?.message || errPort.message;
        }

        // 2. Fallback / aanvulling via Aggregate Portfolio & Real PnL
        if (fetchedCash === null || !apiSuccess) {
            try {
                const aggRes = await axios.get('https://public-api.etoro.com/api/v1/trading/info/aggregate-portfolio', {
                    headers: makeHeaders(),
                    timeout: 10000
                });
                if (aggRes.data) {
                    apiSuccess = true;
                    if (aggRes.data.accountTotals?.accountAvailableCash !== undefined) {
                        fetchedCash = parseFloat(aggRes.data.accountTotals.accountAvailableCash);
                    }
                }
            } catch (errAgg) {
                console.warn('[eToro Sync] Aggregate portfolio call gefaald:', errAgg.response?.status, errAgg.response?.data || errAgg.message);
            }
        }

        // 3. Haal gesloten posities (verkopen & historische trades) op via /trading/info/trade/history
        if (apiSuccess) {
            try {
                console.log('[eToro Sync] Aanroepen https://public-api.etoro.com/api/v1/trading/info/trade/history...');
                const histRes = await axios.get('https://public-api.etoro.com/api/v1/trading/info/trade/history?minDate=2020-01-01', {
                    headers: makeHeaders(),
                    timeout: 10000
                });
                if (Array.isArray(histRes.data)) {
                    closedPositions = histRes.data;
                }
            } catch (errHist) {
                console.warn('[eToro Sync] Trade history call gefaald:', errHist.response?.status, errHist.response?.data || errHist.message);
            }
        }

        // 4. Synchroniseer open én gesloten posities naar PF_transactions zodat het grootboek synchroon loopt
        let newTradesInserted = [];
        if (apiSuccess && (openPositions.length > 0 || closedPositions.length > 0)) {
            try {
                // Haal eToro instrument metadata op (mapping van instrumentID -> Ticker & Naam)
                const instMap = new Map();
                try {
                    const metaRes = await axios.get('https://api.etorostatic.com/sapi/instrumentsmetadata/V1.1/instruments', { timeout: 10000 });
                    const list = metaRes.data?.InstrumentDisplayDatas || [];
                    for (const inst of list) {
                        instMap.set(Number(inst.InstrumentID), {
                            symbol: String(inst.SymbolFull || '').trim().toUpperCase(),
                            name: String(inst.InstrumentDisplayName || inst.SymbolFull || '').trim(),
                            typeId: Number(inst.InstrumentTypeID)
                        });
                    }
                } catch (metaErr) {
                    const fallbackMeta = await axios.get('https://public-api.etoro.com/api/v1/market-data/instruments', {
                        headers: makeHeaders(),
                        timeout: 10000
                    });
                    const list = fallbackMeta.data?.instrumentDisplayDatas || [];
                    for (const inst of list) {
                        instMap.set(Number(inst.instrumentID), {
                            symbol: String(inst.symbolFull || inst.instrumentDisplayName || '').trim().toUpperCase(),
                            name: String(inst.instrumentDisplayName || '').trim(),
                            typeId: Number(inst.instrumentTypeID)
                        });
                    }
                }

                // Haal bestaande aandelen en transacties van deze gebruiker op
                const [stocksRes, existingTxRes] = await Promise.all([
                    pool.request().query(`SELECT aandeel_id, ticker_symbol, name FROM Stocks`),
                    pool.request()
                        .input('user_id', sql.Int, userId)
                        .query(`
                            SELECT t.id, t.aandeel_id, UPPER(s.ticker_symbol) AS ticker_symbol, t.transaction_type,
                                   t.quantity, t.price, t.purchase_time, t.broker_id, t.import_source
                            FROM PF_transactions t
                            LEFT JOIN Stocks s ON t.aandeel_id = s.aandeel_id
                            WHERE t.user_id = @user_id
                        `)
                ]);

                const stockByTicker = new Map();
                for (const st of stocksRes.recordset) {
                    if (st.ticker_symbol) {
                        stockByTicker.set(String(st.ticker_symbol).trim().toUpperCase(), st.aandeel_id);
                    }
                }

                const existingTxs = existingTxRes.recordset || [];

                const ensureStockId = async (ticker, displayName, isEtf = false) => {
                    const cleanTicker = String(ticker || '').trim().toUpperCase();
                    if (!cleanTicker) return null;
                    if (stockByTicker.has(cleanTicker)) return stockByTicker.get(cleanTicker);
                    // Maak aandeel aan in Stocks indien nog niet aanwezig
                    const ins = await pool.request()
                        .input('ticker', sql.NVarChar, cleanTicker)
                        .input('name', sql.NVarChar, displayName || cleanTicker)
                        .input('asset_type_id', sql.Int, isEtf ? 2 : 1)
                        .input('stock_exchange_id', sql.Int, 1)
                        .query(`
                            INSERT INTO Stocks (ticker_symbol, name, asset_type_id, stock_exchange_id, inWatchlist, inIdealePortfolio)
                            OUTPUT INSERTED.aandeel_id
                            VALUES (@ticker, @name, @asset_type_id, @stock_exchange_id, 0, 0)
                        `);
                    const newId = ins.recordset?.[0]?.aandeel_id || null;
                    if (newId) stockByTicker.set(cleanTicker, newId);
                    return newId;
                };

                const hasMatchingTx = (ticker, type, candidateQtys, price, isoDateStr) => {
                    const dayStr = new Date(isoDateStr).toISOString().split('T')[0];
                    return existingTxs.some(t => {
                        if (!t.purchase_time) return false;
                        const tDay = new Date(t.purchase_time).toISOString().split('T')[0];
                        if (t.ticker_symbol !== ticker || t.transaction_type !== type || tDay !== dayStr) return false;
                        const priceDiff = Math.abs(Number(t.price) - Number(price));
                        if (priceDiff > 0.5) return false;
                        return candidateQtys.some(q => Math.abs(Number(t.quantity) - Number(q)) < 0.005);
                    });
                };

                const insertEtoroApiTx = async (ticker, name, type, qty, price, dateStr, fees = 0, isEtf = false) => {
                    const aandeelId = await ensureStockId(ticker, name, isEtf);
                    if (!aandeelId) return;
                    const purchaseTime = new Date(dateStr);
                    await pool.request()
                        .input('user_id', sql.Int, userId)
                        .input('aandeel_id', sql.Int, aandeelId)
                        .input('broker_id', sql.Int, 1)
                        .input('transaction_type', sql.VarChar, type)
                        .input('quantity', sql.Decimal(18, 5), Number(qty))
                        .input('currency', sql.VarChar, 'USD')
                        .input('price', sql.Decimal(18, 4), Number(price))
                        .input('purchase_time', sql.DateTime, purchaseTime)
                        .input('fees', sql.Decimal(18, 4), Math.abs(Number(fees) || 0))
                        .input('taxes', sql.Decimal(18, 4), 0)
                        .input('exchange_rate', sql.Decimal(18, 6), 1)
                        .input('import_source', sql.NVarChar, 'etoro_api')
                        .query(`
                            INSERT INTO PF_transactions (
                                user_id, aandeel_id, broker_id, transaction_type, quantity,
                                currency, price, purchase_time, fees, taxes, exchange_rate,
                                import_source, created_at, updated_at
                            )
                            VALUES (
                                @user_id, @aandeel_id, @broker_id, @transaction_type, @quantity,
                                @currency, @price, @purchase_time, @fees, @taxes, @exchange_rate,
                                @import_source, GETDATE(), GETDATE()
                            )
                        `);
                    existingTxs.push({
                        aandeel_id: aandeelId,
                        ticker_symbol: ticker,
                        transaction_type: type,
                        quantity: Number(qty),
                        price: Number(price),
                        purchase_time: purchaseTime,
                        broker_id: 1,
                        import_source: 'etoro_api'
                    });
                    newTradesInserted.push({
                        ticker,
                        name,
                        type,
                        quantity: Number(qty),
                        price: Number(price),
                        date: purchaseTime.toISOString()
                    });
                };

                // A. Verwerk alle open posities uit /trading/info/portfolio (BUY op openDateTime)
                for (const pos of openPositions) {
                    const info = instMap.get(Number(pos.instrumentID));
                    if (!info || !info.symbol) continue;
                    const ticker = info.symbol;
                    const origUnits = Number(pos.initialUnits || pos.units || 0);
                    const curUnits = Number(pos.units || 0);
                    const openRate = Number(pos.openRate || 0);
                    if (origUnits <= 0 || openRate <= 0 || !pos.openDateTime) continue;

                    // Check of deze BUY (met initialUnits of resterende units) al in PF_transactions staat
                    if (!hasMatchingTx(ticker, 'BUY', [origUnits, curUnits], openRate, pos.openDateTime)) {
                        await insertEtoroApiTx(
                            ticker,
                            info.name,
                            'BUY',
                            origUnits,
                            openRate,
                            pos.openDateTime,
                            pos.totalExternalFees || 0,
                            info.typeId === 6
                        );
                    }
                }

                // B. Verwerk alle gesloten posities uit /trading/info/trade/history (SELL op closeTimestamp + eventueel BUY op openTimestamp)
                for (const closed of closedPositions) {
                    const info = instMap.get(Number(closed.instrumentId));
                    if (!info || !info.symbol) continue;
                    const ticker = info.symbol;
                    const units = Number(closed.units || 0);
                    const closeRate = Number(closed.closeRate || 0);
                    const openRate = Number(closed.openRate || 0);

                    // 1. Controleer of er op de openTimestamp al een BUY voor dit aandeel op deze koers bestaat (ook bij deelverkoop van een grotere positie)
                    if (units > 0 && openRate > 0 && closed.openTimestamp) {
                        const openDayStr = new Date(closed.openTimestamp).toISOString().split('T')[0];
                        const anyBuyOnOpenDayAtRate = existingTxs.some(t => {
                            if (!t.purchase_time) return false;
                            const tDay = new Date(t.purchase_time).toISOString().split('T')[0];
                            return t.ticker_symbol === ticker &&
                                   t.transaction_type === 'BUY' &&
                                   tDay === openDayStr &&
                                   Math.abs(Number(t.price) - openRate) <= 0.5;
                        });
                        if (!anyBuyOnOpenDayAtRate) {
                            await insertEtoroApiTx(
                                ticker,
                                info.name,
                                'BUY',
                                units,
                                openRate,
                                closed.openTimestamp,
                                0,
                                info.typeId === 6
                            );
                        }
                    }

                    // 2. Controleer of de SELL op closeTimestamp al in PF_transactions staat
                    if (units > 0 && closeRate > 0 && closed.closeTimestamp) {
                        if (!hasMatchingTx(ticker, 'SELL', [units], closeRate, closed.closeTimestamp)) {
                            await insertEtoroApiTx(
                                ticker,
                                info.name,
                                'SELL',
                                units,
                                closeRate,
                                closed.closeTimestamp,
                                closed.fees || 0,
                                info.typeId === 6
                            );
                        }
                    }
                }
            } catch (txSyncErr) {
                console.error('[eToro Sync] Fout bij synchroniseren van posities naar PF_transactions:', txSyncErr);
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
                .input('user_id', sql.Int, userId)
                .input('balance_type_id', sql.Int, 1)
                .input('amount', sql.Decimal(18, 2), etoroEur)
                .query(`
                    MERGE INTO AvailableBalances AS target
                    USING (SELECT @user_id AS user_id, @balance_type_id AS balance_type_id, CAST(GETDATE() AS DATE) AS update_date) AS source
                    ON target.user_id = source.user_id AND target.balance_type_id = source.balance_type_id AND target.update_date = source.update_date
                    WHEN MATCHED THEN
                        UPDATE SET amount = @amount
                    WHEN NOT MATCHED THEN
                        INSERT (user_id, balance_type_id, amount, update_date)
                        VALUES (@user_id, @balance_type_id, @amount, CAST(GETDATE() AS DATE));
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
            return {
                message: `eToro API autorisatie mislukt${detailMsg}. Controleer of je API-sleutel en User key exact overeenkomen met de eToro instellingen, of upload je eToro Rekeningoverzicht (.xlsx).`,
                syncedAt: new Date().toISOString(),
                status: 'warning',
                positionsCount: 0,
                newTradesCount: 0,
                apiDetail: apiErrorMsg
            };
        }

        if (newTradesInserted.length > 0) {
            try {
                const { clearPortfolioCache, clearAdvisorCache } = require('./portfolioController');
                if (clearPortfolioCache) clearPortfolioCache(userId);
                if (clearAdvisorCache) clearAdvisorCache();
            } catch (cacheErr) {
                // ignore
            }
        }

        const newTxMsg = newTradesInserted.length > 0
            ? ` ${newTradesInserted.length} nieuwe transactie(s) toegevoegd aan je grootboek (${newTradesInserted.map(t => `${t.type} ${t.quantity} ${t.ticker}`).join(', ')})!`
            : ' Alle transacties waren al up-to-date in je grootboek.';

        return {
            message: `eToro API succesvol gesynchroniseerd! ${openPositions.length} open posities gecontroleerd, $${(fetchedCash ?? 0).toFixed(2)} cash bijgewerkt.${newTxMsg}`,
            syncedAt: new Date().toISOString(),
            status: 'ok',
            positionsCount: openPositions.length,
            closedPositionsCount: closedPositions.length,
            cashBalance: fetchedCash,
            newTradesCount: newTradesInserted.length,
            newTrades: newTradesInserted
        };
};

// Synchroniseer eToro API automatisch voor alle gekoppelde gebruikers (achtergrond-scheduler & Data-Sync)
const syncAllUsersEtoroData = async () => {
    try {
        const pool = await sql.connect(config);
        const usersRes = await pool.request().query(`
            SELECT DISTINCT user_id
            FROM UserBrokerCredentials
            WHERE LOWER(broker_name) = 'etoro'
              AND (LEN(ISNULL(api_key, '')) > 5 OR LEN(ISNULL(user_key, '')) > 5)
        `);
        const userIds = new Set((usersRes.recordset || []).map(r => Number(r.user_id)));
        if (process.env['x-api-key'] || process.env.ETORO_KEY || process.env.ETORO_API_KEY) {
            userIds.add(1);
        }

        const results = [];
        for (const uid of userIds) {
            try {
                const r = await syncEtoroDataInternal(uid);
                results.push({ userId: uid, ...r });
            } catch (uErr) {
                console.warn(`[eToro Auto-Sync] Fout voor user ${uid}:`, uErr.message);
            }
        }
        return results;
    } catch (err) {
        console.warn('[eToro Auto-Sync] Fout bij ophalen gekoppelde eToro gebruikers:', err.message);
        return [];
    }
};

const syncEtoroData = async (req, res) => {
    try {
        if (req.user?.role === 'demo') {
            return res.status(403).json({ message: 'Demo-account kan niet synchroniseren.' });
        }
        const userId = getEffectiveUserId(req);
        const result = await syncEtoroDataInternal(userId);
        if (result.status === 'not_configured') {
            return res.status(400).json({ message: result.message });
        }
        return res.json(result);
    } catch (err) {
        console.error('Fout bij sync eToro:', err);
        res.status(500).json({ message: 'Fout bij communicatie met eToro API: ' + err.message });
    }
};

const getLedgerMetadata = async (req, res) => {
    try {
        const userId = getEffectiveUserId(req);
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
    syncEtoroDataInternal,
    syncAllUsersEtoroData,
    getLedgerMetadata
};
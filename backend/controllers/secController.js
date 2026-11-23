// controllers/secController.js
const { sql } = require('../config/database');
const axios = require('axios');
const { fetchAndStorePricesForStock } = require('./portfolioController');

/**
 * Slimme hulpfunctie die op basis van Yahoo Finance exchange code / display name én de ticker-suffix (.AS, .BR, .DE, .PA, -EUR)
 * automatisch de juiste stock_exchange_id uit de StockExchange tabel zoekt (of aanmaakt als het een nieuwe beurs is).
 */
const resolveOrCreateStockExchangeId = async (rawExchangeName = '', tickerSymbol = '', quoteType = '') => {
  try {
    const exRes = await sql.query`SELECT stock_exchange_id, name FROM StockExchange ORDER BY stock_exchange_id ASC`;
    const list = exRes.recordset || [];
    if (list.length === 0) return 1;

    const exUpper = String(rawExchangeName || '').trim().toUpperCase();
    const tickUpper = String(tickerSymbol || '').trim().toUpperCase();
    const qTypeUpper = String(quoteType || '').trim().toUpperCase();

    const findByPattern = (patterns) => {
      for (const pat of patterns) {
        const found = list.find(e => String(e.name || '').toUpperCase().includes(pat));
        if (found) return found.stock_exchange_id;
      }
      return null;
    };

    // 1. Directe match op bestaande naam in StockExchange
    const exactMatch = list.find(e => String(e.name || '').trim().toUpperCase() === exUpper);
    if (exactMatch) return exactMatch.stock_exchange_id;

    // 2. Match op Crypto
    if (qTypeUpper === 'CRYPTOCURRENCY' || exUpper.includes('CCC') || exUpper.includes('CRYPTO') || tickUpper.endsWith('-EUR') || tickUpper.endsWith('-USD')) {
      const cryptoId = findByPattern(['CRYPTO', 'COINBASE', 'CCC']);
      if (cryptoId) return cryptoId;
      // Maak beurs 'CRYPTO' aan als die nog niet bestond
      const ins = await new sql.Request()
        .input('name', sql.NVarChar, 'CRYPTO')
        .query(`INSERT INTO StockExchange (name) OUTPUT INSERTED.stock_exchange_id VALUES (@name)`);
      return ins.recordset?.[0]?.stock_exchange_id || list[0].stock_exchange_id;
    }

    // 3. Match op Ticker Suffix (.AS, .BR, .DE, .PA, .L, .MI) of Yahoo Exchange Code
    if (tickUpper.endsWith('.AS') || exUpper.includes('AMS') || exUpper.includes('AMSTERDAM')) {
      const id = findByPattern(['EURONEXTAMS', 'AMS', 'AMSTERDAM']);
      if (id) return id;
    }
    if (tickUpper.endsWith('.BR') || exUpper.includes('BRU') || exUpper.includes('BRUSSELS')) {
      const id = findByPattern(['EURONEXTBRU', 'BRU', 'BRUSSEL']);
      if (id) return id;
    }
    if (tickUpper.endsWith('.DE') || exUpper.includes('GER') || exUpper.includes('XETRA') || exUpper.includes('FRA')) {
      const id = findByPattern(['XETRA', 'GER', 'FRANKFURT']);
      if (id) return id;
    }
    if (tickUpper.endsWith('.TI') || exUpper.includes('TRADEGATE') || exUpper.includes('TDG')) {
      const id = findByPattern(['TRADEGATE']);
      if (id) return id;
    }
    if (tickUpper.endsWith('.PA') || exUpper.includes('PAR') || exUpper.includes('PARIS')) {
      const id = findByPattern(['EURONEXTPAR', 'PARIS']);
      if (id) return id;
      const ins = await new sql.Request()
        .input('name', sql.NVarChar, 'EURONEXTPAR')
        .query(`INSERT INTO StockExchange (name) OUTPUT INSERTED.stock_exchange_id VALUES (@name)`);
      return ins.recordset?.[0]?.stock_exchange_id || list[0].stock_exchange_id;
    }

    // 4. Amerikaanse beurzen (NASDAQ vs NYSE)
    if (exUpper.includes('NYQ') || exUpper.includes('NYSE') || exUpper.includes('PCX') || exUpper.includes('ASE') || exUpper.includes('ARCA')) {
      const id = findByPattern(['NYSE']);
      if (id) return id;
    }
    if (exUpper.includes('NMS') || exUpper.includes('NGM') || exUpper.includes('NCM') || exUpper.includes('NAS') || exUpper.includes('NASDAQ')) {
      const id = findByPattern(['NASDAQ']);
      if (id) return id;
    }

    // 5. Als Yahoo een duidelijke nieuwe beursnaam meestuurt (bijv. "LSE" of "Milan" of "SIX"), maak deze automatisch aan
    if (exUpper && exUpper !== 'BEURS' && exUpper !== 'HANDMATIG' && exUpper.length >= 2 && exUpper.length <= 25) {
      const partial = findByPattern([exUpper]);
      if (partial) return partial;
      const ins = await new sql.Request()
        .input('name', sql.NVarChar, exUpper)
        .query(`INSERT INTO StockExchange (name) OUTPUT INSERTED.stock_exchange_id VALUES (@name)`);
      if (ins.recordset?.[0]?.stock_exchange_id) {
        return ins.recordset[0].stock_exchange_id;
      }
    }

    // Fallback naar NASDAQ (id = 1)
    return list[0].stock_exchange_id;
  } catch (err) {
    console.warn('Kon beurs niet automatisch koppelen, gebruik default (1):', err.message);
    return 1;
  }
};

const getAllStocks = async (req, res) => {
  try {
    // Haal alle aandelen op inclusief Beursnaam, Asset Type, én door hoeveel gebruikers het aandeel momenteel in bezit is (plus de namen voor de beheerder)
    const result = await sql.query(`
      WITH UserStockHoldings AS (
        SELECT
          t.aandeel_id,
          t.user_id,
          u.username,
          SUM(CASE WHEN t.transaction_type = 'BUY' THEN t.quantity WHEN t.transaction_type = 'SELL' THEN -t.quantity ELSE 0 END) AS net_qty
        FROM PF_transactions t
        LEFT JOIN PF_Users u ON t.user_id = u.id
        WHERE t.aandeel_id IS NOT NULL
        GROUP BY t.aandeel_id, t.user_id, u.username
      ),
      ActiveHolders AS (
        SELECT
          aandeel_id,
          COUNT(DISTINCT user_id) AS holder_count,
          STRING_AGG(ISNULL(username, CONCAT('User #', user_id)), ', ') AS holder_names
        FROM UserStockHoldings
        WHERE net_qty > 0.0001
        GROUP BY aandeel_id
      ),
      TxStats AS (
        SELECT
          aandeel_id,
          COUNT(*) AS total_tx_count
        FROM PF_transactions
        WHERE aandeel_id IS NOT NULL
        GROUP BY aandeel_id
      )
      SELECT
        s.aandeel_id AS stock_id,
        s.ticker_symbol AS ticker,
        s.name,
        s.isin,
        s.asset_type_id,
        ISNULL(at.type_name, 'STOCK') AS asset_type_name,
        s.stock_exchange_id,
        ISNULL(se.name, 'NASDAQ') AS exchange_name,
        ISNULL(s.inWatchlist, 0) AS inWatchlist,
        ISNULL(s.inIdealePortfolio, 0) AS inIdealePortfolio,
        ISNULL(ah.holder_count, 0) AS holder_count,
        ah.holder_names,
        ISNULL(ts.total_tx_count, 0) AS total_tx_count
      FROM Stocks s
      LEFT JOIN AssetTypes at ON s.asset_type_id = at.asset_type_id
      LEFT JOIN StockExchange se ON s.stock_exchange_id = se.stock_exchange_id
      LEFT JOIN ActiveHolders ah ON s.aandeel_id = ah.aandeel_id
      LEFT JOIN TxStats ts ON s.aandeel_id = ts.aandeel_id
      ORDER BY ISNULL(ah.holder_count, 0) DESC, s.ticker_symbol ASC
    `);
    res.json(result.recordset);
  } catch (error) {
    console.error('Fout bij het ophalen van alle aandelen:', error);
    res.status(500).send('Serverfout bij het ophalen van alle aandelen.');
  }
};

// Wereldwijd zoeken naar aandelen, ETF's en crypto via Yahoo Finance (zoals Portfolio Dividend Tracker & De Belegger)
const searchGlobalTickers = async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.json([]);
  }

  // Herken automatisch als de zoekopdracht zelf een geldige ISIN-code (12 tekens, bijv. US0378331005 of IE00B4L5Y983) is
  const isIsinQuery = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(q);
  const detectedIsin = isIsinQuery ? q.toUpperCase() : null;

  try {
    const yResponse = await axios.get(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 6000
    });

    const quotes = (yResponse.data?.quotes || []).filter(item =>
      item.symbol && ['EQUITY', 'ETF', 'MUTUALFUND', 'CRYPTOCURRENCY'].includes(item.quoteType)
    );

    const mapped = quotes.map(item => {
      const qType = String(item.quoteType || 'EQUITY').toUpperCase();
      let assetTypeId = 1; // STOCK
      let assetTypeName = 'STOCK';
      if (qType === 'ETF' || qType === 'MUTUALFUND') {
        assetTypeId = 2;
        assetTypeName = 'ETF';
      } else if (qType === 'CRYPTOCURRENCY') {
        assetTypeId = 3;
        assetTypeName = 'CRYPTO';
      }
      return {
        ticker: String(item.symbol).toUpperCase(),
        name: item.longname || item.shortname || item.symbol,
        exchange: item.exchDisp || item.exchange || 'NASDAQ',
        exchangeCode: item.exchange || '',
        quoteType: qType,
        asset_type_id: assetTypeId,
        asset_type_name: assetTypeName,
        isin: item.isin || detectedIsin || null
      };
    });

    res.json(mapped);
  } catch (error) {
    console.error('Fout bij wereldwijd zoeken via Yahoo Finance:', error.message);
    res.status(200).json([]);
  }
};

// Voegt een aandeel/ETF/Crypto automatisch toe aan de gedeelde Stocks catalogus (met inWatchlist=0, inIdealePortfolio=0, juiste Beurs!) en haalt direct 10 jaar koershistorie op
const ensureStockFromGlobal = async (req, res) => {
  const { ticker_symbol, name, asset_type_id = 1, isin = null, stock_exchange_id = null, exchange = '', quoteType = '' } = req.body;
  const cleanTicker = String(ticker_symbol || '').trim().toUpperCase();
  const cleanName = String(name || cleanTicker).trim();
  const cleanIsin = isin && String(isin).trim() ? String(isin).trim().toUpperCase() : null;

  if (!cleanTicker) {
    return res.status(400).json({ message: 'Ticker symbool is verplicht.' });
  }

  try {
    // Bepaal automatisch de juiste beurs op basis van Yahoo Finance exchange + ticker-suffix
    const resolvedExchangeId = stock_exchange_id
      ? Number(stock_exchange_id)
      : await resolveOrCreateStockExchangeId(exchange, cleanTicker, quoteType);

    const checkReq = new sql.Request();
    checkReq.input('ticker', sql.NVarChar, cleanTicker);
    const existing = await checkReq.query(`
      SELECT s.aandeel_id as stock_id, s.ticker_symbol as ticker, s.name, s.isin, s.asset_type_id, s.stock_exchange_id, se.name as exchange_name
      FROM Stocks s
      LEFT JOIN StockExchange se ON s.stock_exchange_id = se.stock_exchange_id
      WHERE UPPER(s.ticker_symbol) = @ticker
    `);

    if (existing.recordset.length > 0) {
      const found = existing.recordset[0];
      if (cleanIsin && !found.isin) {
        await new sql.Request()
          .input('id', sql.Int, found.stock_id)
          .input('isin', sql.NVarChar, cleanIsin)
          .query('UPDATE Stocks SET isin = @isin WHERE aandeel_id = @id');
        found.isin = cleanIsin;
      }
      if (typeof fetchAndStorePricesForStock === 'function') {
        fetchAndStorePricesForStock(found.stock_id);
      }
      return res.status(200).json({
        stock: found,
        created: false,
        message: `${cleanTicker} stond al in de database.`
      });
    }

    const insertReq = new sql.Request();
    insertReq.input('ticker', sql.NVarChar, cleanTicker);
    insertReq.input('name', sql.NVarChar, cleanName);
    insertReq.input('isin', sql.NVarChar, cleanIsin);
    insertReq.input('asset_type_id', sql.Int, Number(asset_type_id) || 1);
    insertReq.input('exchange_id', sql.Int, resolvedExchangeId || 1);

    const insRes = await insertReq.query(`
      INSERT INTO Stocks (ticker_symbol, name, isin, asset_type_id, stock_exchange_id, inWatchlist, inIdealePortfolio)
      OUTPUT INSERTED.aandeel_id AS stock_id, INSERTED.ticker_symbol AS ticker, INSERTED.name, INSERTED.isin, INSERTED.asset_type_id, INSERTED.stock_exchange_id
      VALUES (@ticker, @name, @isin, @asset_type_id, @exchange_id, 0, 0)
    `);

    const newStock = insRes.recordset[0];

    if (newStock?.stock_id && typeof fetchAndStorePricesForStock === 'function') {
      fetchAndStorePricesForStock(newStock.stock_id);
    }

    return res.status(201).json({
      stock: newStock,
      created: true,
      message: `${cleanTicker} (${cleanName}) is automatisch gekoppeld aan de juiste beurs en de koershistorie wordt opgehaald!`
    });
  } catch (error) {
    console.error('Fout bij automatisch toevoegen van aandeel:', error);
    res.status(500).json({ message: 'Kon het aandeel niet automatisch aanmaken.' });
  }
};

const createStock = async (req, res) => {
  const { name, ticker_symbol, stock_exchange_id, asset_type_id, isin, exchange_raw } = req.body;

  if (!name || !ticker_symbol || !asset_type_id) {
    return res.status(400).json({ message: 'Naam, ticker en asset type zijn verplicht.' });
  }

  try {
    const cleanTicker = String(ticker_symbol).trim().toUpperCase();
    const resolvedExchangeId = stock_exchange_id
      ? Number(stock_exchange_id)
      : await resolveOrCreateStockExchangeId(exchange_raw || '', cleanTicker, Number(asset_type_id) === 3 ? 'CRYPTOCURRENCY' : '');

    const request = new sql.Request();
    const insRes = await request
      .input('name', sql.NVarChar, String(name).trim())
      .input('ticker_symbol', sql.NVarChar, cleanTicker)
      .input('stock_exchange_id', sql.Int, resolvedExchangeId || 1)
      .input('asset_type_id', sql.Int, asset_type_id)
      .input('isin', sql.NVarChar, isin && String(isin).trim() ? String(isin).trim().toUpperCase() : null)
      .query(`
        INSERT INTO Stocks (name, ticker_symbol, stock_exchange_id, asset_type_id, isin, inWatchlist, inIdealePortfolio)
        OUTPUT INSERTED.aandeel_id AS stock_id
        VALUES (@name, @ticker_symbol, @stock_exchange_id, @asset_type_id, @isin, 0, 0)
      `);

    const newId = insRes.recordset?.[0]?.stock_id;
    if (newId && typeof fetchAndStorePricesForStock === 'function') {
      fetchAndStorePricesForStock(newId);
    }

    res.status(201).json({ message: 'Aandeel succesvol toegevoegd en koershistorie wordt opgehaald.' });
  } catch (error) {
    if (error.number === 2627 || error.number === 2601) {
      return res.status(409).json({ message: 'Aandeel met deze ticker bestaat al.' });
    }
    console.error('Fout bij het aanmaken van aandeel:', error);
    res.status(500).json({ message: 'Serverfout bij het aanmaken van aandeel.' });
  }
};

const updateStock = async (req, res) => {
  const { id } = req.params;
  const { name, ticker, isin, stock_exchange_id, asset_type_id } = req.body;

  try {
    const request = new sql.Request();
    await request
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, String(name || '').trim())
      .input('ticker', sql.NVarChar, String(ticker || '').trim().toUpperCase())
      .input('isin', sql.NVarChar, isin && String(isin).trim() ? String(isin).trim().toUpperCase() : null)
      .input('stock_exchange_id', sql.Int, stock_exchange_id ? Number(stock_exchange_id) : null)
      .input('asset_type_id', sql.Int, asset_type_id ? Number(asset_type_id) : null)
      .query(`
        UPDATE Stocks 
        SET name = @name,
            ticker_symbol = @ticker,
            isin = @isin,
            stock_exchange_id = COALESCE(@stock_exchange_id, stock_exchange_id),
            asset_type_id = COALESCE(@asset_type_id, asset_type_id)
        WHERE aandeel_id = @id
      `);
    res.status(200).json({ message: 'Aandeel succesvol bijgewerkt.' });
  } catch (error) {
    console.error('Fout bij het bijwerken van aandeel:', error);
    res.status(500).json({ message: 'Serverfout bij het bijwerken van aandeel.' });
  }
};

const deleteStock = async (req, res) => {
  const { id } = req.params;
  try {
    const request = new sql.Request();
    const result = await request.input('id', sql.Int, id).query(`DELETE FROM Stocks WHERE aandeel_id = @id`);
    if (result.rowsAffected[0] > 0) {
      res.status(200).json({ message: 'Aandeel succesvol verwijderd.' });
    } else {
      res.status(404).json({ message: 'Aandeel niet gevonden.' });
    }
  } catch (error) {
    console.error('Fout bij het verwijderen van aandeel:', error);
    if (error.number === 547) {
      res.status(409).json({ message: 'Kan aandeel niet verwijderen omdat er nog transacties of berekeningen aan gekoppeld zijn.' });
    } else {
      res.status(500).json({ message: 'Serverfout bij het verwijderen van aandeel.' });
    }
  }
};

module.exports = {
  getAllStocks,
  createStock,
  updateStock,
  deleteStock,
  searchGlobalTickers,
  ensureStockFromGlobal,
  resolveOrCreateStockExchangeId
};

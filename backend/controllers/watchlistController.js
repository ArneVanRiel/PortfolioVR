// c:\Arne\ArneVR\PortfolioVR\backend\controllers\watchlistController.js
const { sql, config } = require('../config/database'); // Importeer getRequest is verwijderd

// Functie om de Exponential Moving Average (EMA) voor een serie prijzen te berekenen
const calculateEMA_Series = (prices, period) => {
    const emaValues = Array(prices.length).fill(NaN);
    if (prices.length < period) {
        return emaValues; // Niet genoeg data voor de periode, retourneer array met NaN
    }

    const multiplier = 2 / (period + 1);

    // Bereken de eerste EMA als een Simple Moving Average (SMA)
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += prices[i];
    }
    emaValues[period - 1] = sum / period;

    // Bereken de volgende EMA's iteratief
    for (let i = period; i < prices.length; i++) {
        emaValues[i] = (prices[i] - emaValues[i - 1]) * multiplier + emaValues[i - 1];
    }
    return emaValues;
};

// Functie om de volledige serie MACD en Signaal Lijn te berekenen voor optimalisatie
const calculateFullMACDSeries = (closingPrices) => {
    const fastLength = 30;
    const slowLength = 90;
    const signalSmoothing = 9;

    const pricesOnly = closingPrices.map(p => p.closing_price);

    const fastEMAs = calculateEMA_Series(pricesOnly, fastLength);
    const slowEMAs = calculateEMA_Series(pricesOnly, slowLength);

    const macdLines = [];
    for (let i = 0; i < pricesOnly.length; i++) {
        if (i >= fastLength - 1 && i >= slowLength - 1 && !isNaN(fastEMAs[i]) && !isNaN(slowEMAs[i])) {
            macdLines.push(fastEMAs[i] - slowEMAs[i]);
        } else {
            macdLines.push(NaN);
        }
    }

    let signalLines = [];
    const validMacdStartIndex = macdLines.findIndex(val => !isNaN(val));
    
    if (validMacdStartIndex !== -1) {
        const validMacdLines = macdLines.slice(validMacdStartIndex);
        const validSignalLines = calculateEMA_Series(validMacdLines, signalSmoothing);
        signalLines = Array(validMacdStartIndex).fill(NaN).concat(validSignalLines);
    } else {
        signalLines = Array(pricesOnly.length).fill(NaN);
    }

    return macdLines.map((macd, index) => ({
        date: closingPrices[index].date,
        price: closingPrices[index].closing_price,
        macdLine: macd,
        signalLine: signalLines[index]
    }));
};

/**
 * Haalt een lijst met aandelen op basis van de 'view' parameter (watchlist of idealePortfolio).
 * Inclusief de laatste slotkoers, laatste MACD-waarden, en de laatste melding voor elk aandeel.
 * Nu inclusief asset_type_name.
 * @param {object} req - Het request object.
 * @param {object} res - Het response object.
 */
const getStocksByView = async (req, res) => {
  const { view } = req.query;

  if (!view || (view !== 'watchlist' && view !== 'idealePortfolio')) {
    return res.status(400).json({ message: 'De "view" parameter is vereist (watchlist of idealePortfolio).' });
  }

  let whereClause = '';
  if (view === 'watchlist') {
    whereClause = ' WHERE s.inWatchlist = 1';
  } else if (view === 'idealePortfolio') {
    whereClause = ' WHERE s.inIdealePortfolio = 1';
  }

  try {
    const request = new sql.Request(); // Gebruik new sql.Request()
    const query = `
      SELECT
            s.aandeel_id,
            s.name,
            s.ticker_symbol,
            s.stock_exchange_id,
            s.inWatchlist,
            s.inIdealePortfolio,
            at.type_name AS asset_type_name, -- NIEUW: type_name ophalen
            s.tob_rate,
            s.dividend_tax_rate,
            LATEST_PRICE.closing_price AS current_price,
            LATEST_MACD.macdLine AS current_macd_line,
            LATEST_MACD.signalLine AS current_signal_line,
            LATEST_ALERT.date AS latest_alert_date,
            LATEST_ALERT.type_melding AS latest_alert_type,
            LATEST_ALERT.signal_line_value AS latest_alert_signal_line_value,
            LATEST_ALERT.trade_amount AS latest_trade_amount,
            LATEST_FUNDAMENTAL.period_end_date AS latest_fundamental_data_period_end_date -- NIEUW: laatste fundamental_data_period_end_date
        FROM
            [dbo].[Stocks] s
        JOIN [dbo].[AssetTypes] at ON s.asset_type_id = at.asset_type_id -- JOIN met AssetTypes
        LEFT JOIN (
            SELECT
                aandeel_id,
                closing_price,
                date,
                ROW_NUMBER() OVER(PARTITION BY aandeel_id ORDER BY date DESC) as rn
            FROM
                [dbo].[DailyClosingPrices]
        ) AS LATEST_PRICE ON s.aandeel_id = LATEST_PRICE.aandeel_id AND LATEST_PRICE.rn = 1
        LEFT JOIN (
            SELECT
                aandeel_id,
                date,
                macdLine,
                signalLine,
                ROW_NUMBER() OVER(PARTITION BY aandeel_id ORDER BY date DESC) as rn
            FROM
                [dbo].[MACDValues]
        ) AS LATEST_MACD ON s.aandeel_id = LATEST_MACD.aandeel_id AND LATEST_MACD.rn = 1
        LEFT JOIN (
            SELECT
                alert_id,
                aandeel_id,
                date,
                type_melding,
                signal_line_value,
                trade_amount,
                ROW_NUMBER() OVER(PARTITION BY aandeel_id ORDER BY date DESC) as rn
            FROM
                [dbo].[MACDAlerts]
            WHERE 
                (type_melding = 'Koopsignaal' AND signal_line_value < 0)
                OR (type_melding = 'Verkoopsignaal')
        ) AS LATEST_ALERT ON s.aandeel_id = LATEST_ALERT.aandeel_id AND LATEST_ALERT.rn = 1
        LEFT JOIN ( -- NIEUW: LEFT JOIN voor de meest recente fundamental_data
            SELECT
                stock_id,
                period_end_date,
                ROW_NUMBER() OVER(PARTITION BY stock_id ORDER BY period_end_date DESC) as rn
            FROM
                [dbo].[fundamental_data]
        ) AS LATEST_FUNDAMENTAL ON s.aandeel_id = LATEST_FUNDAMENTAL.stock_id AND LATEST_FUNDAMENTAL.rn = 1
      ${whereClause};
    `;
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('Fout bij ophalen stocks in watchlistController (getStocksByView):', err.message);
    res.status(500).json({ message: 'Fout bij het ophalen van aandelen.' });
  }
};

/**
 * Haalt alle stocks op uit de database met hun watchlist/ideale portfolio status.
 * Dit wordt gebruikt om stocks te tonen die beschikbaar zijn om toe te voegen.
 * Nu inclusief asset_type_name.
 * @param {object} req - Het request object.
 * @param {object} res - Het response object.
 */
const getAvailableStocks = async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const query = `
            SELECT 
                s.aandeel_id, 
                s.name, 
                s.ticker_symbol, 
                s.inWatchlist, 
                s.inIdealePortfolio, 
                at.type_name AS asset_type_name, 
                s.asset_type_id,
                s.tob_rate
            FROM [dbo].[Stocks] s
            JOIN [dbo].[AssetTypes] at ON s.asset_type_id = at.asset_type_id
            ORDER BY s.name ASC;
        `;
        const result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Fout bij ophalen beschikbare stocks:', err.message);
        res.status(500).json({ message: 'Fout bij het ophalen van beschikbare stocks.' });
    }
};

/**
 * Haalt alle beschikbare asset types op (Stock, ETF, Crypto).
 * @param {object} req - Het request object.
 * @param {object} res - Het response object.
 */
const getAssetTypes = async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request().query('SELECT asset_type_id, type_name FROM [dbo].[AssetTypes] ORDER BY type_name;');
        res.json(result.recordset);
    } catch (err) {
        console.error('Fout bij ophalen asset types:', err.message);
        res.status(500).json({ message: 'Fout bij het ophalen van asset types.' });
    }
};

/**
 * Haalt alle beschikbare stock exchanges op.
 * @param {object} req - Het request object.
 * @param {object} res - Het response object.
 */
const getStockExchanges = async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request().query('SELECT stock_exchange_id, name FROM [dbo].[StockExchange] ORDER BY name;');
        res.json(result.recordset);
    } catch (err) {
        console.error('Fout bij ophalen stock exchanges:', err.message);
        res.status(500).json({ message: 'Fout bij het ophalen van stock exchanges.' });
    }
};

/**
 * Controleert of de prijsupdate voor vandaag al is uitgevoerd voor minstens één aandeel.
 * @param {object} req - Het request object.
 * @param {object} res - Het response object.
 */
const getDailyUpdateStatus = async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const todayFormatted = new Date().toISOString().split("T")[0];

        // Controleer of de update VANDAAG is gedraaid, niet of er prijzen VAN vandaag zijn.
        const query = `
            SELECT COUNT(*) AS count
            FROM [dbo].[MACDValues]
            WHERE CAST(last_updated_at AS DATE) = CAST(@todayFormatted AS DATE);
        `;
        const result = (await pool.request()
            .input('todayFormatted', sql.VarChar, todayFormatted)
            .query(query)).recordset[0].count;

        const isUpdatedToday = result > 0;
        res.json({ isUpdatedToday });
    } catch (err) {
        console.error('Fout bij controleren dagelijkse update status:', err.message);
        res.status(500).json({ message: 'Fout bij controleren status.' });
    }
};

/**
 * Voegt een stock toe aan de database en markeert deze voor watchlist of ideale portfolio.
 * Accepteert nu asset_type_id.
 * @param {object} req - Het request object met { aandeel_id, viewType, asset_type_id }
 * @param {object} res - Het response object.
 */
const addStockToPortfolio = async (req, res) => {
    const { aandeel_id, viewType, asset_type_id } = req.body; // NIEUW: asset_type_id ontvangen

    if (!aandeel_id || !viewType || !asset_type_id) {
        return res.status(400).json({ message: 'Aandeel ID, weergave type en asset type ID zijn vereist.' });
    }
    if (viewType !== 'watchlist' && viewType !== 'idealePortfolio') {
        return res.status(400).json({ message: 'Ongeldig weergave type. Kies "watchlist" of "idealePortfolio".' });
    }

    try {
        const pool = await sql.connect(config);

        // Controleer eerst het huidige aantal stocks in watchlist of ideale portfolio
        const totalStocksQuery = `
            SELECT COUNT(*) AS count
            FROM [dbo].[Stocks]
            WHERE inWatchlist = 1 OR inIdealePortfolio = 1;
        `;
        const totalStocksResult = (await pool.request().query(totalStocksQuery)).recordset[0].count;

        if (totalStocksResult >= 99) {
            return res.status(400).json({ message: 'Maximaal 99 stocks toegestaan in watchlist/ideale portfolio gecombineerd.' });
        }

        // De stock bestaat al (aangezien we aandeel_id ontvangen), dus update alleen de flag en asset_type_id
        const updateFlagColumn = viewType === 'watchlist' ? 'inWatchlist' : 'inIdealePortfolio';
        await pool.request()
            .input('aandeel_id', sql.Int, aandeel_id)
            .input('flagValue', sql.Bit, 1) // Zet de flag op true (1)
            .input('asset_type_id', sql.Int, asset_type_id) // NIEUW: asset_type_id bijwerken
            .query(`UPDATE [dbo].[Stocks] SET ${updateFlagColumn} = @flagValue, asset_type_id = @asset_type_id WHERE aandeel_id = @aandeel_id;`);

        res.status(200).json({ message: `Stock succesvol toegevoegd aan ${viewType}.` });

    } catch (err) {
        console.error('Fout bij toevoegen stock:', err.message);
        res.status(500).json({ message: 'Fout bij het toevoegen van de stock.' });
    }
};

/**
 * Verwijdert een stock uit de watchlist of ideale portfolio (zet de flag op 0).
 * @param {object} req - Het request object met { aandeel_id, viewType }
 * @param {object} res - Het response object.
 */
const removeStockFromPortfolio = async (req, res) => {
    const { aandeel_id } = req.params; // Haal aandeel_id uit de URL parameters
    const { viewType } = req.body; // Haal viewType uit de request body

    if (!aandeel_id || !viewType || (viewType !== 'watchlist' && viewType !== 'idealePortfolio')) {
        return res.status(400).json({ message: 'Ongeldige parameters: aandeel_id en weergave type zijn vereist.' });
    }

    try {
        const pool = await sql.connect(config);
        const updateFlag = viewType === 'watchlist' ? 'inWatchlist = 0' : 'inIdealePortfolio = 0';

        await pool.request()
            .input('aandeel_id', sql.Int, aandeel_id)
            .query(`UPDATE [dbo].[Stocks] SET ${updateFlag} WHERE aandeel_id = @aandeel_id;`);

        res.status(200).json({ message: `Stock succesvol verwijderd uit ${viewType}.` });
    } catch (err) {
        console.error('Fout bij verwijderen stock:', err.message);
        res.status(500).json({ message: 'Fout bij het verwijderen van de stock.' });
    }
};

/**
 * Update de prijzen van aandelen, berekent MACD, slaat MACD-waarden op en genereert meldingen.
 * Kan op aanvraag worden aangeroepen of bij server startup.
 * @param {object} [req] - Het request object (optioneel).
 * @param {object} [res] - Het response object (optioneel).
 * @param {boolean} isStartup - Geeft aan of de functie wordt aangeroepen bij server startup.
 * @returns {Promise<void>}
 */
const updateAndProcessStocks = async (req = null, res = null, isStartup = false) => {
  // Gebruik require voor node-fetch in CommonJS module
  const fetch = require('node-fetch');

  
  console.log(`[${isStartup ? 'Startup' : 'Manual'}] Starten met het bijwerken en verwerken van aandelen.`);
  
  // Als er een response object is (niet startup), stel headers in voor streaming
  if (res) {
      res.setHeader('Content-Type', 'application/json'); // Of text/event-stream, maar NDJSON werkt goed met fetch readers
      res.setHeader('Transfer-Encoding', 'chunked');
  }

  try {
    const pool = await sql.connect(config);

    const today = new Date();
    const todayFormatted = today.toISOString().split("T")[0];

    // --- 0.1 Update EUR/USD Exchange Rate ---
    try {
        const fxUpdateCheckQuery = `SELECT MAX(last_updated_at) as max_updated_at FROM DailyExchangeRates WHERE currency_pair = 'EURUSD'`;
        const fxUpdateCheckResult = await pool.request().query(fxUpdateCheckQuery);
        const fxLastUpdated = fxUpdateCheckResult.recordset[0].max_updated_at;
        
        let fxNeedsUpdate = true;
        if (fxLastUpdated) {
            if (new Date(fxLastUpdated).toISOString().split('T')[0] === todayFormatted) {
                fxNeedsUpdate = false;
            }
        }

        if (fxNeedsUpdate) {
            console.log("Ophalen van EUR/USD wisselkoersen via Profit.com...");
            
            // Bepaal startdatum (laatste in DB of 10 jaar terug)
            const latestFxQuery = await pool.request().query(`SELECT MAX(date) as max_date FROM DailyExchangeRates WHERE currency_pair = 'EURUSD'`);
            let fxStartDate = new Date();
            if (latestFxQuery.recordset[0].max_date) {
                fxStartDate = new Date(latestFxQuery.recordset[0].max_date);
                fxStartDate.setDate(fxStartDate.getDate() - 5); // 5 dagen overlap
            } else {
                fxStartDate.setFullYear(fxStartDate.getFullYear() - 10);
            }
            const fxStartDateFormatted = fxStartDate.toISOString().split("T")[0];
            const fxEndDateFormatted = new Date().toISOString().split("T")[0];

            const apiKey = process.env.PROFIT_COM_API_KEY;
            const fxUrl = `https://api.profit.com/data-api/market-data/historical/daily/EURUSD.FOREX?start_date=${fxStartDateFormatted}&end_date=${fxEndDateFormatted}&token=${apiKey}`;

            // --- BACKUP: Frankfurter API (Open source, geen API key nodig, gebaseerd op Europese Centrale Bank) ---
            // const fxUrlFrankfurter = `https://api.frankfurter.app/${fxStartDateFormatted}..${fxEndDateFormatted}?from=EUR&to=USD`;
            
            const fxResponse = await fetch(fxUrl);
            if (fxResponse.ok) {
                const fxData = await fxResponse.json();
                if (fxData && fxData.length > 0) {
                    let insertedCount = 0;
                    for (const record of fxData) {
                        if (!record || !record.t) continue;
                        const recordDateStr = new Date(record.t * 1000).toISOString().split('T')[0];
                        const rate = parseFloat(record.c);
                        await pool.request()
                            .input('currency_pair', sql.VarChar, 'EURUSD')
                            .input('date', sql.VarChar, recordDateStr)
                            .input('rate', sql.Decimal(18, 6), rate)
                            .query(`
                                MERGE INTO DailyExchangeRates AS target
                                USING (SELECT @currency_pair AS currency_pair, CAST(@date AS DATE) AS date, @rate AS rate) AS source
                                ON target.date = source.date AND target.currency_pair = source.currency_pair
                                WHEN MATCHED THEN UPDATE SET rate = source.rate, last_updated_at = GETDATE()
                                WHEN NOT MATCHED THEN INSERT (date, currency_pair, rate, last_updated_at) VALUES (source.date, source.currency_pair, source.rate, GETDATE());
                            `);
                        insertedCount++;
                    }
                    console.log(`EUR/USD wisselkoersen succesvol bijgewerkt via Profit.com (${insertedCount} records).`);
                    if (res) res.write(JSON.stringify({ type: 'info', message: "EUR/USD wisselkoersen bijgewerkt." }) + '\n');
                }
                
                /* BACKUP: Frankfurter API Verwerking
                if (fxData && fxData.rates) {
                    let insertedCount = 0;
                    for (const [dateStr, rates] of Object.entries(fxData.rates)) {
                        const rate = parseFloat(rates.USD);
                        await pool.request()
                            .input('date', sql.Date, dateStr)
                            .input('rate', sql.Decimal(18, 6), rate)
                            .query(`
                                MERGE INTO DailyExchangeRates AS target
                                USING (SELECT 'EURUSD' AS currency_pair, @date AS date, @rate AS rate) AS source
                                ON target.date = source.date AND target.currency_pair = source.currency_pair
                                WHEN MATCHED THEN UPDATE SET rate = source.rate, last_updated_at = GETDATE()
                                WHEN NOT MATCHED THEN INSERT (date, currency_pair, rate, last_updated_at) VALUES (source.date, source.currency_pair, source.rate, GETDATE());
                            `);
                        insertedCount++;
                    }
                    console.log(\`EUR/USD wisselkoersen succesvol bijgewerkt via Frankfurter API (\${insertedCount} records).\`);
                    if (res) res.write(JSON.stringify({ type: 'info', message: "EUR/USD wisselkoersen bijgewerkt." }) + '\\n');
                }
                */
            } else {
                console.warn(`Profit.com FX API error: ${fxResponse.statusText}`);
            }
        } else {
            console.log("EUR/USD wisselkoersen zijn vandaag al bijgewerkt. API overgeslagen.");
            if (res) res.write(JSON.stringify({ type: 'info', message: "EUR/USD wisselkoersen waren al actueel." }) + '\n');
        }
    } catch (fxErr) {
        console.error("Fout bij ophalen wisselkoersen:", fxErr);
    }

    const stocksQuery = `
      SELECT DISTINCT s.aandeel_id, s.ticker_symbol, s.name, at.type_name AS asset_type
      FROM [dbo].[Stocks] s
      JOIN [dbo].[AssetTypes] at ON s.asset_type_id = at.asset_type_id
      LEFT JOIN (
          SELECT aandeel_id, SUM(CASE WHEN transaction_type = 'BUY' THEN quantity WHEN transaction_type = 'SELL' THEN -quantity ELSE 0 END) AS total_qty
          FROM [dbo].[PF_transactions]
          GROUP BY aandeel_id
      ) pt ON s.aandeel_id = pt.aandeel_id
      WHERE s.inWatchlist = 1 OR s.inIdealePortfolio = 1 OR pt.total_qty > 0.00001;
    `;
    const stocksToProcess = (await new sql.Request().query(stocksQuery)).recordset;
    const totalStocks = stocksToProcess.length;

    const tenYearsAgo = new Date(today); // Wijzigd naar 10 jaar voor langere historie
    tenYearsAgo.setFullYear(today.getFullYear() - 10);
    const tenYearsAgoFormatted = tenYearsAgo.toISOString().split("T")[0];

    // --- NIEUW: Optimalisatie - Haal de laatst bekende datums op voor alle aandelen ---
    const latestPricesQuery = `SELECT aandeel_id, MAX(date) as max_date, MAX(last_updated_at) as max_updated_at FROM DailyClosingPrices GROUP BY aandeel_id`;
    const latestPricesResult = await pool.request().query(latestPricesQuery);
    const latestDatesMap = {};
    const latestUpdatedMap = {};
    latestPricesResult.recordset.forEach(row => {
        latestDatesMap[row.aandeel_id] = row.max_date;
        latestUpdatedMap[row.aandeel_id] = row.max_updated_at;
    });

    const latestMacdQuery = `SELECT aandeel_id, MAX(date) as max_date FROM MACDValues GROUP BY aandeel_id`;
    const latestMacdResult = await pool.request().query(latestMacdQuery);
    const latestMacdDatesMap = {};
    latestMacdResult.recordset.forEach(row => {
        latestMacdDatesMap[row.aandeel_id] = row.max_date;
    });
    // --- EINDE Optimalisatie ---

    // 0.5 Haal het totale beschikbare vermogen op voor tradeAmount berekening
    const balanceQuery = `
        SELECT SUM(amount) as total
        FROM AvailableBalances ab
        WHERE ab.update_date = (
            SELECT MAX(update_date)
            FROM AvailableBalances ab2
            WHERE ab2.balance_type_id = ab.balance_type_id
        )
    `;
    const balanceResult = await pool.request().query(balanceQuery);
    const baseTradeAmount = balanceResult.recordset[0].total || 30000; // Fallback naar 30000 als er geen saldo is

    // 0. Verwijder oude data (ouder dan 2 jaar) uit de database
    console.log(`Verwijderen van data ouder dan ${tenYearsAgoFormatted}...`);
    await pool.request().query(`
        DELETE FROM [dbo].[DailyClosingPrices]
        WHERE date < '${tenYearsAgoFormatted}';
    `);
    console.log(`Verwijderde DailyClosingPrices ouder dan ${tenYearsAgoFormatted}.`);

    await pool.request().query(`
        DELETE FROM [dbo].[MACDValues]
        WHERE date < '${tenYearsAgoFormatted}';
    `);
    console.log(`Verwijderde MACDValues ouder dan ${tenYearsAgoFormatted}.`);

    await pool.request().query(`
        DELETE FROM [dbo].[MACDAlerts]
        WHERE date < '${tenYearsAgoFormatted}';
    `);
    console.log(`Verwijderde MACDAlerts ouder dan ${tenYearsAgoFormatted}.`);


    for (const [index, stock] of stocksToProcess.entries()) {
      console.log(`Verwerken van ${stock.ticker_symbol} (${stock.name})...`);

      // HIER KOMT LATER LOGICA VOOR VERSCHILLENDE API'S PER ASSET_TYPE
      if (stock.asset_type === 'STOCK' || stock.asset_type === 'ETF') {
          let needsApiFetch = true;
          const lastUpdatedAt = latestUpdatedMap[stock.aandeel_id];
          if (lastUpdatedAt) {
              if (new Date(lastUpdatedAt).toISOString().split('T')[0] === todayFormatted) {
                  needsApiFetch = false;
              }
          }
          
          let apiData = [];
           if (needsApiFetch) {
              // 1. Prijsdata ophalen en bijwerken: Bepaal dynamisch de startdatum
              let apiFetchStartDate = new Date(today);
              const latestDbDate = latestDatesMap[stock.aandeel_id];
              
              if (latestDbDate) {
                  // Als we al data hebben, haal alleen de laatste paar dagen op om te updaten
                  apiFetchStartDate = new Date(latestDbDate);
                  apiFetchStartDate.setDate(apiFetchStartDate.getDate() - 5); // 5 dagen overlap
              } else {
                  // Geen data? Haal 10 jaar op
                  apiFetchStartDate.setFullYear(today.getFullYear() - 10);
              }
              const apiFetchStartDateFormatted = apiFetchStartDate.toISOString().split("T")[0];

              const apiFetchEndDate = todayFormatted;

              const apiKey = process.env.PROFIT_COM_API_KEY;
              const apiUrl = `https://api.profit.com/data-api/market-data/historical/daily/${stock.ticker_symbol}?start_date=${apiFetchStartDateFormatted}&end_date=${apiFetchEndDate}&token=${apiKey}`;

              try {
                console.log(`Ophalen van data voor ${stock.ticker_symbol} via API: ${apiUrl}`);
                const response = await fetch(apiUrl);
                if (!response.ok) {
                  console.warn(`API error voor ${stock.ticker_symbol} (Status: ${response.status}): ${response.statusText}`);
                } else {
                    apiData = await response.json();
                    console.log(`API data ontvangen voor ${stock.ticker_symbol}. Aantal records: ${apiData ? apiData.length : 0}`);
                    
                    // Stuur voortgang naar client
                    if (res) {
                        const progress = ((index + 1) / totalStocks) * 100;
                        const progressPayload = {
                            type: 'progress',
                            message: `Verwerken ${stock.ticker_symbol} (${index + 1}/${totalStocks})`,
                            progress: progress.toFixed(0)
                        };
                        res.write(JSON.stringify(progressPayload) + '\n');
                    }
                }
              } catch (apiError) {
                console.error(`Fout bij het ophalen van data voor ${stock.ticker_symbol}:`, apiError.message);
              }

              // 2. Voeg nieuwe / werk bestaande DailyClosingPrices bij
              if (apiData && apiData.length > 0) {
                for (const record of apiData) {
                  if (!record || !record.t) continue;
                  const recordDateStr = new Date(record.t * 1000).toISOString().split('T')[0];

                  await pool.request()
                    .input("aandeel_id", sql.Int, stock.aandeel_id)
                    .input("closing_price", sql.Decimal(18, 2), record.c)
                    .input("date", sql.VarChar, recordDateStr)
                    .input("last_updated_at", sql.DateTime, new Date())
                    .query(`
                      MERGE INTO DailyClosingPrices AS target
                      USING (SELECT @aandeel_id AS aandeel_id, @closing_price AS closing_price, CAST(@date AS DATE) AS date) AS source
                      ON target.date = source.date AND target.aandeel_id = source.aandeel_id
                      WHEN MATCHED THEN UPDATE SET closing_price = source.closing_price, last_updated_at = @last_updated_at
                      WHEN NOT MATCHED THEN INSERT (aandeel_id, closing_price, date, last_updated_at) VALUES (source.aandeel_id, source.closing_price, source.date, @last_updated_at);
                    `);
                }
                console.log(`DailyClosingPrices bijgewerkt met ${apiData.length} records voor ${stock.ticker_symbol}.`);
              } else {
                console.log(`Geen nieuwe prijsdata via API voor ${stock.ticker_symbol} tussen ${apiFetchStartDateFormatted} en ${apiFetchEndDate}.`);
              }
          } else {
              console.log(`Prijsdata voor ${stock.ticker_symbol} is vandaag al bijgewerkt. API call overgeslagen.`);
              if (res) {
                  const progress = ((index + 1) / totalStocks) * 100;
                  res.write(JSON.stringify({
                      type: 'progress',
                      message: `Controleren ${stock.ticker_symbol} (${index + 1}/${totalStocks}) - Al actueel`,
                      progress: progress.toFixed(0)
                  }) + '\n');
              }
          }


          // 3. Haal voldoende historische prijzen op uit DB voor MACD berekening (minimaal 200 dagen)
          const totalDaysForMacdHistory = 200;
          const lookbackDaysForInitialEMA = 90 + 30;
          const requiredDbPrices = totalDaysForMacdHistory + lookbackDaysForInitialEMA;

          const macdPricesQuery = `
            SELECT closing_price, date
            FROM [dbo].[DailyClosingPrices]
            WHERE aandeel_id = @aandeel_id
            AND date <= CAST(@current_date AS DATE)
            AND date >= DATEADD(day, -${requiredDbPrices}, CAST(@current_date AS DATE))
            ORDER BY date ASC;
          `;
          let historicalPricesForMacd = (await pool.request()
            .input('aandeel_id', sql.Int, stock.aandeel_id)
            .input('current_date', sql.VarChar, todayFormatted)
            .query(macdPricesQuery)).recordset;

          if (historicalPricesForMacd.length < (90 + 9 - 1)) {
            console.log(`Onvoldoende historische prijzen in DB voor volledige MACD berekening voor ${stock.ticker_symbol}. Nodig: ${90 + 9 - 1}, Huidig: ${historicalPricesForMacd.length}`);
            continue;
          }

          // --- NIEUW: Batch MACD Berekening en Optimalisatie ---
          const fullMacdSeries = calculateFullMACDSeries(historicalPricesForMacd);
          
          let latestDbDateForMacd = latestMacdDatesMap[stock.aandeel_id];
          let cutoffDateStr = '1970-01-01';
          if (latestDbDateForMacd) {
              const cutoffDate = new Date(latestDbDateForMacd);
              cutoffDate.setDate(cutoffDate.getDate() - 3); // 3 days overlap
              cutoffDateStr = cutoffDate.toISOString().split('T')[0];
          }

          const seriesToProcess = fullMacdSeries.filter(d => new Date(d.date).toISOString().split('T')[0] >= cutoffDateStr);

          for (let i = 0; i < seriesToProcess.length; i++) {
              const currentData = seriesToProcess[i];
              const fullSeriesIndex = fullMacdSeries.findIndex(d => d.date === currentData.date);
              const previousData = fullSeriesIndex > 0 ? fullMacdSeries[fullSeriesIndex - 1] : { macdLine: NaN, signalLine: NaN };
              
              const formattedLoopDate = new Date(currentData.date).toISOString().split("T")[0];
              const { macdLine, signalLine, price: currentPrice } = currentData;
              const previousMacdLine = previousData.macdLine;
              const previousSignalLine = previousData.signalLine;

              let alertType = null;
              let tradeAmount = null;

              await pool.request()
                  .input('aandeel_id', sql.Int, stock.aandeel_id)
                  .input('date', sql.VarChar, formattedLoopDate)
                  .input('macdLine', sql.Decimal(18, 4), isNaN(macdLine) ? null : macdLine)
                  .input('signalLine', sql.Decimal(18, 4), isNaN(signalLine) ? null : signalLine)
                  .input('last_updated_at', sql.DateTime, new Date())
                  .query(`
                      MERGE INTO [dbo].[MACDValues] AS target
                      USING (SELECT @aandeel_id AS aandeel_id, CAST(@date AS DATE) AS date, @macdLine AS macdLine, @signalLine AS signalLine) AS source
                      ON target.date = source.date AND target.aandeel_id = source.aandeel_id
                      WHEN MATCHED THEN UPDATE SET macdLine = source.macdLine, signalLine = source.signalLine, last_updated_at = @last_updated_at
                      WHEN NOT MATCHED THEN INSERT (aandeel_id, date, macdLine, signalLine, last_updated_at) VALUES (source.aandeel_id, source.date, source.macdLine, source.signalLine, @last_updated_at);
                  `);

              if (!isNaN(macdLine) && !isNaN(signalLine) && !isNaN(previousMacdLine) && !isNaN(previousSignalLine)) {
                  if (macdLine > signalLine && previousMacdLine <= previousSignalLine) {
                      if (signalLine < 0) alertType = 'Koopsignaal';
                  }

                  if (alertType) {
                      if (!isNaN(signalLine) && currentPrice > 0) {
                          tradeAmount = baseTradeAmount * (1 + (-signalLine / currentPrice) * 4);
                          tradeAmount = Math.max(0, tradeAmount);
                      } else {
                          tradeAmount = null;
                      }

                      const existingAlertQuery = `SELECT alert_id FROM [dbo].[MACDAlerts] WHERE aandeel_id = @aandeel_id AND date = CAST(@date AS DATE) AND type_melding = @alert_type;`;
                      const existingAlert = (await pool.request().input('aandeel_id', sql.Int, stock.aandeel_id).input('date', sql.VarChar, formattedLoopDate).input('alert_type', sql.VarChar, alertType).query(existingAlertQuery)).recordset;

                      if (existingAlert.length === 0) {
                          const insertAlertQuery = `INSERT INTO [dbo].[MACDAlerts] (aandeel_id, date, type_melding, status, prijs_op_moment, signal_line_value, trade_amount) VALUES (@aandeel_id, CAST(@date AS DATE), @type_melding, 'Nieuw', @prijs_op_moment, @signal_line_value, @trade_amount);`;
                          await pool.request().input('aandeel_id', sql.Int, stock.aandeel_id).input('date', sql.VarChar, formattedLoopDate).input('type_melding', sql.VarChar, alertType).input('prijs_op_moment', sql.Decimal(18, 2), currentPrice).input('signal_line_value', sql.Decimal(18, 4), isNaN(signalLine) ? null : signalLine).input('trade_amount', sql.Decimal(18, 2), isNaN(tradeAmount) ? null : tradeAmount).query(insertAlertQuery);
                          console.log(`NIEUWE ${alertType} Alert gegenereerd voor ${stock.ticker_symbol} op ${formattedLoopDate}.`);
                      }
                  }
              }

              if (res && i === seriesToProcess.length - 1) {
                  const updatePayload = JSON.stringify({ type: 'stock_update', aandeel_id: stock.aandeel_id, current_price: currentPrice, current_signal_line: signalLine, latest_alert_type: alertType, latest_alert_date: formattedLoopDate }) + '\n';
                  res.write(updatePayload);
              }
          }
          
          if (res && seriesToProcess.length === 0 && fullMacdSeries.length > 0) {
              const lastData = fullMacdSeries[fullMacdSeries.length - 1];
              const prevData = fullMacdSeries.length > 1 ? fullMacdSeries[fullMacdSeries.length - 2] : { macdLine: NaN, signalLine: NaN };
              const alertType = !isNaN(lastData.macdLine) && !isNaN(lastData.signalLine) && !isNaN(prevData.macdLine) && !isNaN(prevData.signalLine) && lastData.macdLine > lastData.signalLine && prevData.macdLine <= prevData.signalLine && lastData.signalLine < 0 ? 'Koopsignaal' : null;
              const updatePayload = JSON.stringify({ type: 'stock_update', aandeel_id: stock.aandeel_id, current_price: lastData.price, current_signal_line: lastData.signalLine, latest_alert_type: alertType, latest_alert_date: new Date(lastData.date).toISOString().split("T")[0] }) + '\n';
              res.write(updatePayload);
          }
      } else if (stock.asset_type === 'CRYPTO') {
          console.log(`Ophalen van data voor CRYPTO (${stock.ticker_symbol}) wordt later geïmplementeerd.`);
          // Hier komt logica voor het ophalen van crypto data van een crypto API
          // en het verwerken hiervan.
      }
    }

    if (res) {
      res.write(JSON.stringify({ type: 'complete', message: "Prijzen, MACD en meldingen succesvol bijgewerkt." }) + '\n');
      res.end();
    }
    console.log(`[${isStartup ? 'Startup' : 'Manual'}] Aandelenverwerking voltooid.`);

  } catch (error) {
    console.error('Fout in updateAndProcessStocks:', error);
    if (res) {
      // Als headers al verzonden zijn, kunnen we geen status 500 meer sturen, maar wel een error bericht in de stream
      if (!res.headersSent) res.status(500);
      res.write(JSON.stringify({ type: 'error', message: 'Fout bij het bijwerken en verwerken van aandelen.' }));
      res.end();
    }
  }
};


module.exports = {
  getStocksByView,
  updateAndProcessStocks,
  getDailyUpdateStatus,
  addStockToPortfolio,
  removeStockFromPortfolio,
  getAvailableStocks,
  getAssetTypes,
  getStockExchanges
};

// controllers/watchlistController.js
const { sql, config } = require('../config/database'); // Importeer getRequest is verwijderd
let fetch;

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

// Functie om de MACD en Signaal Lijn te berekenen
const calculateMACD = (closingPrices) => {
    const fastLength = 30;
    const slowLength = 90;
    const signalSmoothing = 9;

    const pricesOnly = closingPrices.map(p => p.closing_price);

    if (pricesOnly.length < slowLength + signalSmoothing - 1) {
        return { macdLine: NaN, signalLine: NaN, histogram: NaN, previousMacdLine: NaN, previousPreviousMacdLine: NaN, previousSignalLine: NaN, previousPreviousSignalLine: NaN };
    }

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

    const validMacdLinesForSignal = macdLines.filter(val => !isNaN(val));

    let signalLines = [];
    if (validMacdLinesForSignal.length >= signalSmoothing) {
        signalLines = calculateEMA_Series(validMacdLinesForSignal, signalSmoothing);
    } else {
        signalLines = Array(validMacdLinesForSignal.length).fill(NaN);
    }

    const latestMacdLine = macdLines[macdLines.length - 1];
    const latestSignalLine = signalLines[signalLines.length - 1];
    const latestHistogram = latestMacdLine - latestSignalLine;

    let previousMacdLine = NaN;
    if (macdLines.length > 1) {
        previousMacdLine = macdLines[macdLines.length - 2];
    }

    let previousSignalLine = NaN;
    if (signalLines.length > 1) {
        previousSignalLine = signalLines[signalLines.length - 2];
    }

    return {
        macdLine: latestMacdLine,
        signalLine: latestSignalLine,
        histogram: latestHistogram,
        previousMacdLine: previousMacdLine,
        previousSignalLine: previousSignalLine
    };
};


// Nieuwe helperfunctie om het aanbevolen bedrag te berekenen
const calculateRecommendedAmount = (signalLine, currentPrice) => {
    if (!isNaN(signalLine) && currentPrice > 0) {
        let tradeAmount = 1000 * (1 + (-signalLine / currentPrice) * 4);
        return Math.max(0, tradeAmount); // Zorg ervoor dat het bedrag niet negatief is
    }
    return null;
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
            SELECT s.aandeel_id, s.name, s.ticker_symbol, s.inWatchlist, s.inIdealePortfolio, at.type_name AS asset_type_name
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
 * Controleert of de prijsupdate voor vandaag al is uitgevoerd voor minstens één aandeel.
 * @param {object} req - Het request object.
 * @param {object} res - Het response object.
 */
const getDailyUpdateStatus = async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const todayFormatted = new Date().toISOString().split("T")[0];

        const query = `
            SELECT COUNT(*) AS count
            FROM [dbo].[MACDValues]
            WHERE date = @todayFormatted;
        `;
        const result = (await pool.request()
            .input('todayFormatted', sql.Date, todayFormatted)
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
  if (!fetch) {
      try {
          const nodeFetchModule = await import('node-fetch');
          fetch = nodeFetchModule.default;
      } catch (e) {
          console.error("Fout bij het dynamisch importeren van 'node-fetch':", e);
          if (res) return res.status(500).json({ message: "Server configuratiefout: kan 'node-fetch' niet laden." });
          throw e;
      }
  }

  console.log(`[${isStartup ? 'Startup' : 'Manual'}] Starten met het bijwerken en verwerken van aandelen.`);
  try {
    const stocksQuery = `
      SELECT s.aandeel_id, s.ticker_symbol, s.name, at.type_name AS asset_type
      FROM [dbo].[Stocks] s
      JOIN [dbo].[AssetTypes] at ON s.asset_type_id = at.asset_type_id
      WHERE s.inWatchlist = 1 OR s.inIdealePortfolio = 1;
    `;
    // Gebruik new sql.Request() voor de stocksQuery
    const stocksToProcess = (await new sql.Request().query(stocksQuery)).recordset;

    const today = new Date();
    const todayFormatted = today.toISOString().split("T")[0];

    const twoYearsAgo = new Date(today);
    twoYearsAgo.setFullYear(today.getFullYear() - 2);
    const twoYearsAgoFormatted = twoYearsAgo.toISOString().split("T")[0];

    const pool = await sql.connect(config);

    // 0. Verwijder oude data (ouder dan 2 jaar) uit de database
    console.log(`Verwijderen van data ouder dan ${twoYearsAgoFormatted}...`);
    await pool.request().query(`
        DELETE FROM [dbo].[DailyClosingPrices]
        WHERE date < '${twoYearsAgoFormatted}';
    `);
    console.log(`Verwijderde DailyClosingPrices ouder dan ${twoYearsAgoFormatted}.`);

    await pool.request().query(`
        DELETE FROM [dbo].[MACDValues]
        WHERE date < '${twoYearsAgoFormatted}';
    `);
    console.log(`Verwijderde MACDValues ouder dan ${twoYearsAgoFormatted}.`);

    await pool.request().query(`
        DELETE FROM [dbo].[MACDAlerts]
        WHERE date < '${twoYearsAgoFormatted}';
    `);
    console.log(`Verwijderde MACDAlerts ouder dan ${twoYearsAgoFormatted}.`);


    for (const stock of stocksToProcess) {
      console.log(`Verwerken van ${stock.ticker_symbol} (${stock.name})...`);

      // HIER KOMT LATER LOGICA VOOR VERSCHILLENDE API'S PER ASSET_TYPE
      if (stock.asset_type === 'STOCK' || stock.asset_type === 'ETF') {
          // 1. Prijsdata ophalen en bijwerken: Haal ALTIJD data op vanaf 250 dagen terug tot vandaag.
          // MERGE statement zal dubbele records voorkomen.
          const daysToFetchFromAPI = 250; // Haal altijd minstens deze hoeveelheid dagen op
          const apiFetchStartDate = new Date(today);
          apiFetchStartDate.setDate(today.getDate() - daysToFetchFromAPI);
          const apiFetchStartDateFormatted = apiFetchStartDate.toISOString().split("T")[0];

          const apiFetchEndDate = todayFormatted;

          const apiKey = process.env.PROFIT_COM_API_KEY || '3a6089f7212f4ad383160a4860499dae';
          const apiUrl = `https://api.profit.com/data-api/market-data/historical/daily/${stock.ticker_symbol}?start_date=${apiFetchStartDateFormatted}&end_date=${apiFetchEndDate}&token=${apiKey}`;

          let apiData = [];
          try {
            console.log(`Ophalen van data voor ${stock.ticker_symbol} via API: ${apiUrl}`);
            const response = await fetch(apiUrl);
            if (!response.ok) {
              console.warn(`API error voor ${stock.ticker_symbol} (Status: ${response.status}): ${response.statusText}`);
            } else {
                apiData = await response.json();
                console.log(`API data ontvangen voor ${stock.ticker_symbol}. Aantal records: ${apiData ? apiData.length : 0}`);
            }
          } catch (apiError) {
            console.error(`Fout bij het ophalen van data voor ${stock.ticker_symbol}:`, apiError.message);
          }

          // 2. Voeg nieuwe / werk bestaande DailyClosingPrices bij
          if (apiData && apiData.length > 0) {
            for (const record of apiData) {
              const recordDate = new Date(record.t * 1000);
              const formattedRecordDate = recordDate.toISOString().split("T")[0];

              await pool.request()
                .input("aandeel_id", sql.Int, stock.aandeel_id)
                .input("closing_price", sql.Decimal(18, 2), record.c)
                .input("date", sql.Date, formattedRecordDate)
                .input("last_updated_at", sql.DateTime, new Date())
                .query(`
                  MERGE INTO DailyClosingPrices AS target
                  USING (SELECT @aandeel_id AS aandeel_id, @closing_price AS closing_price, @date AS date) AS source
                  ON target.date = source.date AND target.aandeel_id = source.aandeel_id
                  WHEN MATCHED THEN UPDATE SET closing_price = source.closing_price, last_updated_at = @last_updated_at
                  WHEN NOT MATCHED THEN INSERT (aandeel_id, closing_price, date, last_updated_at) VALUES (source.aandeel_id, source.closing_price, source.date, @last_updated_at);
                `);
            }
            console.log(`DailyClosingPrices bijgewerkt met ${apiData.length} records voor ${stock.ticker_symbol}.`);
          } else {
            console.log(`Geen nieuwe prijsdata via API voor ${stock.ticker_symbol} tussen ${apiFetchStartDateFormatted} en ${apiFetchEndDate}.`);
          }


          // 3. Haal voldoende historische prijzen op uit DB voor MACD berekening (minimaal 200 dagen)
          const totalDaysForMacdHistory = 200;
          const lookbackDaysForInitialEMA = 90 + 30;
          const requiredDbPrices = totalDaysForMacdHistory + lookbackDaysForInitialEMA;

          const macdPricesQuery = `
            SELECT closing_price, date
            FROM [dbo].[DailyClosingPrices]
            WHERE aandeel_id = @aandeel_id
            AND date <= @current_date
            AND date >= DATEADD(day, -${requiredDbPrices}, @current_date)
            ORDER BY date ASC;
          `;
          let historicalPricesForMacd = (await pool.request()
            .input('aandeel_id', sql.Int, stock.aandeel_id)
            .input('current_date', sql.Date, todayFormatted)
            .query(macdPricesQuery)).recordset;

          if (historicalPricesForMacd.length < (90 + 9 - 1)) {
            console.log(`Onvoldoende historische prijzen in DB voor volledige MACD berekening voor ${stock.ticker_symbol}. Nodig: ${90 + 9 - 1}, Huidig: ${historicalPricesForMacd.length}`);
            continue;
          }

          const firstValidMacdIndex = (90 + 9 - 1) - 1;

          for (let i = firstValidMacdIndex; i < historicalPricesForMacd.length; i++) {
            const currentDayPrices = historicalPricesForMacd.slice(0, i + 1);
            const currentDayDate = historicalPricesForMacd[i].date;
            const currentPrice = historicalPricesForMacd[i].closing_price;

            const macdResult = calculateMACD(currentDayPrices);
            const { macdLine, signalLine, previousMacdLine, previousSignalLine } = macdResult;

            const formattedLoopDate = new Date(currentDayDate).toISOString().split("T")[0];

            await pool.request()
                .input('aandeel_id', sql.Int, stock.aandeel_id)
                .input('date', sql.Date, formattedLoopDate)
                .input('macdLine', sql.Decimal(18, 4), isNaN(macdLine) ? null : macdLine)
                .input('signalLine', sql.Decimal(18, 4), isNaN(signalLine) ? null : signalLine)
                .input('last_updated_at', sql.DateTime, new Date())
                .query(`
                    MERGE INTO [dbo].[MACDValues] AS target
                    USING (SELECT @aandeel_id AS aandeel_id, @date AS date, @macdLine AS macdLine, @signalLine AS signalLine) AS source
                    ON target.date = source.date AND target.aandeel_id = source.aandeel_id
                    WHEN MATCHED THEN UPDATE SET macdLine = source.macdLine, signalLine = source.signalLine, last_updated_at = @last_updated_at
                    WHEN NOT MATCHED THEN INSERT (aandeel_id, date, macdLine, signalLine, last_updated_at) VALUES (source.aandeel_id, source.date, source.macdLine, source.signalLine, @last_updated_at);
                `);

            if (!isNaN(macdLine) && !isNaN(signalLine) && !isNaN(previousMacdLine) && !isNaN(previousSignalLine)) {
                let alertType = null;
                let tradeAmount = null;

                if (macdLine > signalLine && previousMacdLine <= previousSignalLine) {
                    alertType = 'Koopsignaal';
                }
                else if (macdLine < signalLine && previousMacdLine >= previousSignalLine) {
                    alertType = 'Verkoopsignaal';
                }

                if (alertType) {
                    if (!isNaN(signalLine) && currentPrice > 0) {
                        tradeAmount = 1000 * (1 + (-signalLine / currentPrice) * 4);
                        tradeAmount = Math.max(0, tradeAmount);
                    } else {
                        tradeAmount = null;
                    }

                    const existingAlertQuery = `
                        SELECT alert_id FROM [dbo].[MACDAlerts]
                        WHERE aandeel_id = @aandeel_id
                        AND date = @date
                        AND type_melding = @alert_type;
                    `;
                    const existingAlert = (await pool.request()
                        .input('aandeel_id', sql.Int, stock.aandeel_id)
                        .input('date', sql.Date, formattedLoopDate)
                        .input('alert_type', sql.VarChar, alertType)
                        .query(existingAlertQuery)).recordset;

                    if (existingAlert.length === 0) {
                        const insertAlertQuery = `
                            INSERT INTO [dbo].[MACDAlerts] (aandeel_id, date, type_melding, status, prijs_op_moment, signal_line_value, trade_amount)
                            VALUES (@aandeel_id, @date, @type_melding, 'Nieuw', @prijs_op_moment, @signal_line_value, @trade_amount);
                        `;
                        await pool.request()
                            .input('aandeel_id', sql.Int, stock.aandeel_id)
                            .input('date', sql.Date, formattedLoopDate)
                            .input('type_melding', sql.VarChar, alertType)
                            .input('prijs_op_moment', sql.Decimal(18, 2), currentPrice)
                            .input('signal_line_value', sql.Decimal(18, 4), isNaN(signalLine) ? null : signalLine)
                            .input('trade_amount', sql.Decimal(18, 2), isNaN(tradeAmount) ? null : tradeAmount)
                            .query(insertAlertQuery);
                        console.log(`NIEUWE ${alertType} Alert gegenereerd voor ${stock.ticker_symbol} op ${formattedLoopDate} (Prijs: ${currentPrice.toFixed(2)}, Signaal: ${signalLine.toFixed(4)}, Bedrag: ${tradeAmount ? tradeAmount.toFixed(2) : 'N/A'}).`);
                    } else {
                        // console.log(`${alertType} Alert voor ${stock.ticker_symbol} op ${formattedLoopDate} bestaat al.`);
                    }
                }
            } else {
                console.log(`MACD/Signal Line kan niet berekend worden voor crossover check voor ${stock.ticker_symbol} op ${formattedLoopDate} (onvoldoende data of NaN waarden).`);
            }
          }
      } else if (stock.asset_type === 'CRYPTO') {
          console.log(`Ophalen van data voor CRYPTO (${stock.ticker_symbol}) wordt later geïmplementeerd.`);
          // Hier komt logica voor het ophalen van crypto data van een crypto API
          // en het verwerken hiervan.
      }
    }

    if (res) {
      res.status(200).json({ message: "Prijzen, MACD en meldingen succesvol bijgewerkt." });
    }
    console.log(`[${isStartup ? 'Startup' : 'Manual'}] Aandelenverwerking voltooid.`);

  } catch (error) {
    console.error('Fout in updateAndProcessStocks:', error);
    if (res) {
      res.status(500).json({ message: 'Fout bij het bijwerken en verwerken van aandelen.' });
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
  getAssetTypes // NIEUW: Exporteer de functie voor asset types
};

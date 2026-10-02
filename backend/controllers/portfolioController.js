// controllers/portfolioController.js
const { sql, config } = require('../config/database');
const xirr = require('xirr');
const fetch = require('node-fetch');
const axios = require('axios');

const recalculateAndStorePortfolioHistory = async (req, res) => {
  try {
    const { userId, fromDate } = req.body;
    if (!userId) {
      return res.status(400).json({ message: 'userId is verplicht.' });
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    const write = (payload) => res.write(JSON.stringify(payload) + '\n');

    // Helper to format cashflow arrays for logging
    const formatCashflowsForLog = (cashflows) => 
        JSON.stringify(cashflows.map(c => ({ amount: c.amount, date: new Date(c.date).toISOString().split('T')[0] })));

    // Helper to group cashflows by date to prevent 0-day duration issues
    const groupCashflowsByDate = (cashflows) => {
        const map = {};
        for (const cf of cashflows) {
            const dateStr = (cf.date instanceof Date ? cf.date : new Date(cf.date)).toISOString().split('T')[0];
            if (!map[dateStr]) map[dateStr] = 0;
            map[dateStr] += cf.amount;
        }
        return Object.keys(map).map(dateStr => {
            const d = new Date(dateStr);
            // Voeg zowel 'date' (onze logica) als 'when' (voor de xirr library) toe
            return { amount: map[dateStr], date: d, when: d };
        }).filter(cf => Math.abs(cf.amount) > 0.00001);
    };

    // Robuuste XIRR wrapper die meerdere 'guesses' probeert als het algoritme vastloopt
    const tryCalculateXIRR = (cashflows) => {
        const guesses = [0.1, -0.1, 0, 0.25, -0.25, 0.5, -0.5, 1.0, -0.9, -0.99];
        let lastError = null;
        for (const guess of guesses) {
            try {
                const result = xirr(cashflows, { guess });
                if (isFinite(result)) return result;
            } catch (e) {
                lastError = e;
            }
        }
        throw lastError || new Error("Newton-Raphson failed to converge");
    };

    const pool = await sql.connect(config);
    
    // --- NEW: Fetch EURUSD Exchange Rates from Profit.com ---
    try {
        write({ type: 'info', message: 'Controleren op ontbrekende EUR/USD wisselkoersen...' });
        const fxUpdateCheckQuery = `SELECT MAX(last_updated_at) as max_updated_at FROM DailyExchangeRates WHERE currency_pair = 'EURUSD'`;
        const fxUpdateCheckResult = await pool.request().query(fxUpdateCheckQuery);
        const fxLastUpdated = fxUpdateCheckResult.recordset[0].max_updated_at;
        
        const todayFormatted = new Date().toISOString().split("T")[0];
        let fxNeedsUpdate = true;
        if (fxLastUpdated) {
            if (new Date(fxLastUpdated).toISOString().split('T')[0] === todayFormatted) {
                fxNeedsUpdate = false;
            }
        }

        if (fxNeedsUpdate) {
            write({ type: 'info', message: 'Ophalen van historische EUR/USD wisselkoersen via Profit.com...' });
            
            const latestFxQuery = await pool.request().query(`SELECT MAX(date) as max_date FROM DailyExchangeRates WHERE currency_pair = 'EURUSD'`);
            let fxStartDate = new Date();
            if (latestFxQuery.recordset[0].max_date) {
                fxStartDate = new Date(latestFxQuery.recordset[0].max_date);
                fxStartDate.setDate(fxStartDate.getDate() - 5);
            } else {
                fxStartDate.setFullYear(fxStartDate.getFullYear() - 10);
            }
            const fxStartDateFormatted = fxStartDate.toISOString().split("T")[0];

            const apiKey = process.env.PROFIT_COM_API_KEY;
            const fxUrl = `https://api.profit.com/data-api/market-data/historical/daily/EURUSD.FOREX?start_date=${fxStartDateFormatted}&end_date=${todayFormatted}&token=${apiKey}`;

            // --- BACKUP: Frankfurter API (Open source, geen API key nodig, gebaseerd op Europese Centrale Bank) ---
            // const fxUrlFrankfurter = `https://api.frankfurter.app/${fxStartDateFormatted}..${todayFormatted}?from=EUR&to=USD`;
            
            const fxResponse = await fetch(fxUrl);
            if (fxResponse.ok) {
                const fxData = await fxResponse.json();
                if (fxData && fxData.length > 0) {
                    let insertedFx = 0;
                    for (const record of fxData) {
                        if (!record || !record.t) continue; // Voorkom Invalid Dates als de API een leeg veld stuurt
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
                                WHEN NOT MATCHED THEN INSERT (date, currency_pair, rate, last_updated_at) VALUES (source.date, source.currency_pair, source.rate, GETDATE());
                            `);
                        insertedFx++;
                    }
                    write({ type: 'info', message: `EUR/USD wisselkoersen succesvol bijgewerkt via Profit.com (${insertedFx} records).` });
                }
                
                /* BACKUP: Frankfurter API Verwerking
                if (fxData && fxData.rates) {
                    let insertedFx = 0;
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
                                WHEN NOT MATCHED THEN INSERT (date, currency_pair, rate, last_updated_at) VALUES (source.currency_pair, source.date, source.rate, GETDATE());
                            `);
                        insertedFx++;
                    }
                    write({ type: 'info', message: \`EUR/USD wisselkoersen succesvol bijgewerkt (\${insertedFx} records).\` });
                }
                */
            } else {
                write({ type: 'warn', message: `Profit.com FX API error: ${fxResponse.statusText}` });
            }
        } else {
            write({ type: 'info', message: 'EUR/USD wisselkoersen zijn al up-to-date.' });
        }
    } catch (fxErr) {
        write({ type: 'error', message: `Fout bij ophalen wisselkoersen: ${fxErr.message}` });
    }
    // --- END NEW ---

    // Step 1: Fetch all cashflows for XIRR calculation (including transaction currency)
    const cashflowRequest = pool.request();
    cashflowRequest.input('userId', sql.Int, userId);
    const cashflowResult = await cashflowRequest.query(`
        SELECT aandeel_id, purchase_time, transaction_type, quantity, price, fees, taxes, currency
        FROM PF_transactions
        WHERE user_id = @userId
        ORDER BY purchase_time ASC
    `);
    const allCashflows = cashflowResult.recordset;

    // Step 2: Determine start date
    const firstDateResult = await pool.request()
      .input('userId', sql.Int, userId)
      .input('fromDate', sql.Date, fromDate ? new Date(fromDate) : null)
      .query(`
        DECLARE @actualFirstTx DATE;
        SELECT @actualFirstTx = MIN(CAST(purchase_time AS DATE)) FROM PF_transactions WHERE user_id = @userId;

        -- Ruim eventuele lege/foutieve datums uit eerdere runs (zoals vanaf 1970) direct op
        IF @actualFirstTx IS NOT NULL
            DELETE FROM DailyPortfolioValue WHERE user_id = @userId AND date < @actualFirstTx;

        DECLARE @firstTransactionDate DATE;
        IF @fromDate IS NOT NULL
            SET @firstTransactionDate = CAST(@fromDate AS DATE);
        ELSE BEGIN
            SELECT @firstTransactionDate = DATEADD(day, -2, MAX(date)) FROM DailyPortfolioValue WHERE user_id = @userId;
            IF @firstTransactionDate IS NULL
                SET @firstTransactionDate = @actualFirstTx;
        END

        -- Voorkom dat de berekening onnodig ver in het verleden start
        IF @actualFirstTx IS NOT NULL AND (@firstTransactionDate < @actualFirstTx OR @firstTransactionDate IS NULL)
            SET @firstTransactionDate = @actualFirstTx;

        IF @firstTransactionDate IS NULL SET @firstTransactionDate = GETDATE();
        SELECT @firstTransactionDate AS first_date;
      `);
    const firstDateStr = new Date(firstDateResult.recordset[0].first_date).toISOString().split('T')[0];

    // Step 3: Fetch all daily closing prices to do interpolation in memory
    const userStockIds = [...new Set(allCashflows.map(t => t.aandeel_id).filter(id => id != null))];
    let dailyPrices = [];
    if (userStockIds.length > 0) {
        const pricesResult = await pool.request().query(`
            SELECT aandeel_id, CAST(date AS DATE) as date, closing_price
            FROM DailyClosingPrices
            WHERE aandeel_id IN (${userStockIds.join(',')})
        `);
        dailyPrices = pricesResult.recordset;
    }

    // Step 3b: Query EUR-denominated stock details to map currencies
    const isStockEurMap = {};
    if (userStockIds.length > 0) {
        const stocksResult = await pool.request().query(`
            SELECT s.aandeel_id, s.ticker_symbol, at.type_name as asset_type
            FROM Stocks s
            LEFT JOIN AssetTypes at ON s.asset_type_id = at.asset_type_id
            WHERE s.aandeel_id IN (${userStockIds.join(',')})
        `);
        stocksResult.recordset.forEach(s => {
            const ticker = s.ticker_symbol || '';
            const isEur = ticker.endsWith('.DE') || ticker.endsWith('.AS') || ticker.endsWith('.BR') || s.asset_type === 'ETF';
            isStockEurMap[s.aandeel_id] = isEur;
        });
    }

    // Step 3c: Query EURUSD exchange rates once into memory
    const fxResult = await pool.request().query(`
        SELECT CAST(date AS DATE) as date, rate
        FROM DailyExchangeRates
        WHERE currency_pair = 'EURUSD'
    `);
    const fxMap = {};
    fxResult.recordset.forEach(row => {
        const dateStr = new Date(row.date).toISOString().split('T')[0];
        fxMap[dateStr] = row.rate;
    });

    const getExchangeRateForDate = (dateStr) => {
        if (fxMap[dateStr]) return Number(fxMap[dateStr]);
        const dates = Object.keys(fxMap).filter(d => d <= dateStr).sort();
        if (dates.length > 0) return Number(fxMap[dates[dates.length - 1]]);
        return 1.0;
    };

    // Step 4: Build price timeline for each stock for linear interpolation
    const priceTimeline = {};
    userStockIds.forEach(id => { priceTimeline[id] = []; });

    dailyPrices.forEach(dp => {
        const dateStr = new Date(dp.date).toISOString().split('T')[0];
        priceTimeline[dp.aandeel_id].push({ dateStr, timestamp: new Date(dateStr).getTime(), price: dp.closing_price });
    });

    allCashflows.forEach(tx => {
        if (tx.aandeel_id && ['BUY', 'SELL'].includes(tx.transaction_type)) {
            const dateStr = new Date(tx.purchase_time).toISOString().split('T')[0];
            priceTimeline[tx.aandeel_id].push({ dateStr, timestamp: new Date(dateStr).getTime(), price: tx.price });
        }
    });

    // Sort timelines and remove duplicates (latest value for a day wins)
    for (const id of userStockIds) {
        const byDate = {};
        for (const pt of priceTimeline[id]) {
            byDate[pt.dateStr] = { timestamp: pt.timestamp, price: pt.price };
        }
        priceTimeline[id] = Object.values(byDate).sort((a,b) => a.timestamp - b.timestamp);
    }

    const getInterpolatedPrice = (aandeel_id, timestamp) => {
        const timeline = priceTimeline[aandeel_id];
        if (!timeline || timeline.length === 0) return 0;
        
        let before = null;
        let after = null;

        for (let i = 0; i < timeline.length; i++) {
            if (timeline[i].timestamp === timestamp) return timeline[i].price;
            if (timeline[i].timestamp < timestamp) before = timeline[i];
            if (timeline[i].timestamp > timestamp) {
                after = timeline[i];
                break;
            }
        }

        if (before && after) {
            const range = after.timestamp - before.timestamp;
            const progress = timestamp - before.timestamp;
            return before.price + (after.price - before.price) * (progress / range);
        } else if (before) {
            return before.price;
        } else if (after) {
            return after.price;
        }
        return 0;
    };

    // Step 5: Calculate daily values iteratively
    const dailyValues = [];
    let currentProcessDate = new Date(`${firstDateStr}T00:00:00.000Z`); // explicitly UTC
    const todayIsoStr = new Date().toISOString().split('T')[0]; 
    const endDateObj = new Date(`${todayIsoStr}T00:00:00.000Z`);

    const holdings = {};
    let txIndex = 0;

    // Fast-forward transactions up to currentProcessDate (excluding the day itself)
    while (txIndex < allCashflows.length) {
        const tx = allCashflows[txIndex];
        const txDateStr = new Date(tx.purchase_time).toISOString().split('T')[0];
        if (txDateStr < firstDateStr) {
            if (tx.aandeel_id) {
                if (!holdings[tx.aandeel_id]) holdings[tx.aandeel_id] = 0;
                if (tx.transaction_type === 'BUY') holdings[tx.aandeel_id] += tx.quantity;
                if (tx.transaction_type === 'SELL') holdings[tx.aandeel_id] -= tx.quantity;
            }
            txIndex++;
        } else {
            break;
        }
    }

    while (currentProcessDate <= endDateObj) {
        const currentStr = currentProcessDate.toISOString().split('T')[0];
        const currentTimestamp = currentProcessDate.getTime();

        while (txIndex < allCashflows.length) {
            const tx = allCashflows[txIndex];
            const txDateStr = new Date(tx.purchase_time).toISOString().split('T')[0];
            if (txDateStr === currentStr) {
                if (tx.aandeel_id) {
                    if (!holdings[tx.aandeel_id]) holdings[tx.aandeel_id] = 0;
                    if (tx.transaction_type === 'BUY') holdings[tx.aandeel_id] += tx.quantity;
                    if (tx.transaction_type === 'SELL') holdings[tx.aandeel_id] -= tx.quantity;
                }
                txIndex++;
            } else {
                break;
            }
        }

        let total_value = 0;
        let total_value_eur = 0;
        const rate = getExchangeRateForDate(currentStr);
        for (const [aandeel_id, qty] of Object.entries(holdings)) {
            if (qty > 0.00001) {
                let price = getInterpolatedPrice(aandeel_id, currentTimestamp);
                
                // USD-waarde berekenen
                let price_usd = price;
                if (isStockEurMap[aandeel_id]) {
                    price_usd = price * rate;
                }
                total_value += qty * price_usd;

                // EUR-waarde berekenen
                let price_eur = price;
                if (!isStockEurMap[aandeel_id]) {
                    price_eur = price / rate;
                }
                total_value_eur += qty * price_eur;
            }
        }

        dailyValues.push({ date: currentStr, total_value, total_value_eur });
        currentProcessDate.setUTCDate(currentProcessDate.getUTCDate() + 1);
    }

    write({ type: 'info', message: `Start berekening vanaf: ${dailyValues.length > 0 ? dailyValues[0].date : 'Vandaag'}` });
    write({ type: 'info', message: `Found ${allCashflows.length} total cashflow transactions.` });
    write({ type: 'info', message: `Found ${dailyValues.length} days with portfolio values to process.` });

    const totalDays = dailyValues.length;
    if (totalDays === 0) {
        write({ type: 'complete', message: 'Geen data om te herberekenen (geen transacties of historische waarden gevonden).' });
        return res.end();
    }

    // Step 3: Loop through dailyValues, calculate XIRR, and store/update
    for (const [index, record] of dailyValues.entries()) {
      const currentDate = new Date(`${record.date}T23:59:59.999Z`); // End of UTC day for XIRR duration

      write({ type: 'debug', message: `\n--- Processing Day ${index + 1}/${totalDays}: ${record.date} ---` });
      write({ type: 'debug', message: `Initial Total Value (Assets): ${record.total_value}` });

      // Filter transactions up to the current date once (STRING MATCHING for perfect sync with holdings logic)
      const transactionsUntilDate = allCashflows.filter(t => {
          const txDateStr = new Date(t.purchase_time).toISOString().split('T')[0];
          return txDateStr <= record.date;
      });

      // --- NEW: Calculate cash balance for the current day ---
      const cash_balance = transactionsUntilDate.reduce((balance, t) => {
        const tDateStr = new Date(t.purchase_time).toISOString().split('T')[0];
        const rate = getExchangeRateForDate(tDateStr);
        let amount = 0;
        switch (t.transaction_type) {
            case 'DEPOSIT':
                amount = t.quantity;
                if (t.currency === 'EUR') amount = amount * rate;
                return balance + amount;
            case 'WITHDRAWAL':
                amount = t.quantity;
                if (t.currency === 'EUR') amount = amount * rate;
                return balance - amount;
            case 'BUY':
                amount = ((t.quantity * t.price) + (t.fees || 0) + (t.taxes || 0));
                if (t.currency === 'EUR') amount = amount * rate;
                return balance - amount;
            case 'SELL':
                amount = ((t.quantity * t.price) - (t.fees || 0) - (t.taxes || 0));
                if (t.currency === 'EUR') amount = amount * rate;
                return balance + amount;
            case 'DIVIDEND':
                amount = ((t.quantity * t.price) - (t.taxes || 0));
                if (t.currency === 'EUR') amount = amount * rate;
                return balance + amount;
            default:
                return balance;
        }
      }, 0);
      const account_total_value = record.total_value + cash_balance;

      write({ type: 'debug', message: `Calculated cash balance: ${cash_balance.toFixed(2)}` });
      write({ type: 'debug', message: `Final account value (assets + cash): ${account_total_value.toFixed(2)}` });

      // Calculate net_invested in assets and cumulative dividends
      let net_invested_assets = 0;
      let net_invested_assets_eur = 0;
      let cumulative_dividends = 0;
      let cumulative_dividends_eur = 0;
      
      transactionsUntilDate.forEach(t => {
        const tDateStr = new Date(t.purchase_time).toISOString().split('T')[0];
        const rate = getExchangeRateForDate(tDateStr);
        
        let val = (t.quantity * t.price) + (t.fees || 0) + (t.taxes || 0);
        let val_usd = val;
        let val_eur = val;
        if (t.currency === 'EUR') {
            val_usd = val * rate;
        } else {
            val_eur = val / rate;
        }
        
        if (t.transaction_type === 'BUY') {
          net_invested_assets += val_usd;
          net_invested_assets_eur += val_eur;
        } else if (t.transaction_type === 'SELL') {
          let sellVal = ((t.quantity * t.price) - (t.fees || 0) - (t.taxes || 0));
          let sellVal_usd = sellVal;
          let sellVal_eur = sellVal;
          if (t.currency === 'EUR') {
              sellVal_usd = sellVal * rate;
          } else {
              sellVal_eur = sellVal / rate;
          }
          net_invested_assets -= sellVal_usd;
          net_invested_assets_eur -= sellVal_eur;
        } else if (t.transaction_type === 'DIVIDEND') {
          let divVal = ((t.quantity * t.price) - (t.taxes || 0));
          let divVal_usd = divVal;
          let divVal_eur = divVal;
          if (t.currency === 'EUR') {
              divVal_usd = divVal * rate;
          } else {
              divVal_eur = divVal / rate;
          }
          cumulative_dividends += divVal_usd;
          cumulative_dividends_eur += divVal_eur;
        }
      });

      // --- Asset XIRR Berekening ---
      let asset_xirr = 0;
      try {
        const rawAssetCashflows = transactionsUntilDate.filter(t => ['BUY', 'SELL', 'DIVIDEND'].includes(t.transaction_type))
          .map(t => {
            const tDateStr = new Date(t.purchase_time).toISOString().split('T')[0];
            const rate = getExchangeRateForDate(tDateStr);
            let amount = 0;
            if (t.transaction_type === 'BUY') {
              amount = -((t.quantity * t.price) + (t.fees || 0) + (t.taxes || 0));
            } else if (t.transaction_type === 'SELL') {
              amount = (t.quantity * t.price) - (t.fees || 0) - (t.taxes || 0);
            } else if (t.transaction_type === 'DIVIDEND') {
              amount = (t.quantity * t.price) - (t.taxes || 0);
            }
            if (t.currency === 'EUR') amount = amount * rate;
            return { amount, date: new Date(t.purchase_time) };
          });

        if (rawAssetCashflows.length > 0 || record.total_value > 0) {
          rawAssetCashflows.push({ amount: record.total_value, date: currentDate });
          
          const finalAssetCashflows = groupCashflowsByDate(rawAssetCashflows);
          write({ type: 'debug', message: `[Asset XIRR] Grouped cashflows for calculation: ${formatCashflowsForLog(finalAssetCashflows)}` });

          if (finalAssetCashflows.length > 1) {
            const dates = finalAssetCashflows.map(cf => cf.date.getTime());
            const duration = Math.max(...dates) - Math.min(...dates);
            
            if (duration > 0) {
              const hasPositive = finalAssetCashflows.some(t => t.amount > 0);
              const hasNegative = finalAssetCashflows.some(t => t.amount < 0);
    
              if (hasPositive && hasNegative) {
                try {
                    asset_xirr = tryCalculateXIRR(finalAssetCashflows);
                    write({ type: 'info', message: `[Asset XIRR] Calculated XIRR: ${asset_xirr}` });
                } catch (err) {
                    write({ type: 'error', message: `[Asset XIRR] Error during calculation: ${err.message}.` });
                    asset_xirr = 0;
                }
              } else {
                write({ type: 'warn', message: `[Asset XIRR] Skipped calculation: requires both positive and negative cashflows.` });
              }
            } else {
              write({ type: 'warn', message: `[Asset XIRR] Skipped calculation: duration is 0 days.` });
            }
          } else {
            write({ type: 'warn', message: `[Asset XIRR] Skipped calculation: not enough grouped cashflows.` });
          }
        } else {
            write({ type: 'debug', message: `[Asset XIRR] Skipped calculation: no transactions and zero total value.` });
        }
      } catch (e) {
        asset_xirr = 0;
        write({ type: 'error', message: `[Asset XIRR] Error during calculation: ${e.message}. This can happen with unusual cash flows or very short time periods.` });
      }

      // --- Account XIRR Berekening ---
      let account_xirr = 0;
      try {
        const rawAccountCashflows = transactionsUntilDate.filter(t => ['DEPOSIT', 'WITHDRAWAL'].includes(t.transaction_type))
          .map(t => {
            const tDateStr = new Date(t.purchase_time).toISOString().split('T')[0];
            const rate = getExchangeRateForDate(tDateStr);
            let amount = 0;
            if (t.transaction_type === 'DEPOSIT') { amount = -t.quantity; }
            else if (t.transaction_type === 'WITHDRAWAL') { amount = t.quantity; }
            if (t.currency === 'EUR') amount = amount * rate;
            return { amount, date: new Date(t.purchase_time) };
          });

        write({ type: 'debug', message: `[Account XIRR] Found ${rawAccountCashflows.length} account-related transactions.` });

        if (rawAccountCashflows.length === 0) {
            write({ type: 'warn', message: `[Account XIRR] Skipped calculation: No DEPOSIT or WITHDRAWAL transactions found.` });
        } else if (rawAccountCashflows.length > 0 || account_total_value > 0) {
            rawAccountCashflows.push({ amount: account_total_value, date: currentDate });
            
            const finalAccountCashflows = groupCashflowsByDate(rawAccountCashflows);
            write({ type: 'debug', message: `[Account XIRR] Grouped cashflows for calculation: ${formatCashflowsForLog(finalAccountCashflows)}` });

            if (finalAccountCashflows.length > 1) {
                const dates = finalAccountCashflows.map(cf => cf.date.getTime());
                const duration = Math.max(...dates) - Math.min(...dates);
                
                if (duration > 0) {
                    const hasPositive = finalAccountCashflows.some(t => t.amount > 0);
                    const hasNegative = finalAccountCashflows.some(t => t.amount < 0);
        
                    if (hasPositive && hasNegative) {
                        try {
                            account_xirr = tryCalculateXIRR(finalAccountCashflows);
                            write({ type: 'info', message: `[Account XIRR] Calculated XIRR: ${account_xirr}` });
                        } catch (err) {
                            write({ type: 'error', message: `[Account XIRR] Error during calculation: ${err.message}.` });
                            account_xirr = 0;
                        }
                    } else {
                        write({ type: 'warn', message: `[Account XIRR] Skipped calculation: requires both positive and negative cashflows.` });
                    }
                } else {
                    write({ type: 'warn', message: `[Account XIRR] Skipped calculation: duration is 0 days.` });
                }
            } else {
                write({ type: 'warn', message: `[Account XIRR] Skipped calculation: not enough grouped cashflows.` });
            }
        } else {
            write({ type: 'debug', message: `[Account XIRR] Skipped calculation: no transactions and zero total value.` });
        }
      } catch (e) {
        account_xirr = 0;
        write({ type: 'error', message: `[Account XIRR] Error during calculation: ${e.message}.` });
      }

      await pool.request()
        .input('user_id', sql.Int, userId)
        .input('date', sql.Date, record.date)
        .input('total_value', sql.Decimal(18, 2), record.total_value)
        .input('total_value_eur', sql.Decimal(18, 2), record.total_value_eur)
        .input('asset_xirr', sql.Decimal(18, 8), isFinite(asset_xirr) ? asset_xirr : 0)
        .input('account_xirr', sql.Decimal(18, 8), isFinite(account_xirr) ? account_xirr : 0)
        .input('net_invested', sql.Decimal(18, 2), net_invested_assets)
        .input('net_invested_eur', sql.Decimal(18, 2), net_invested_assets_eur)
        .input('cumulative_dividends', sql.Decimal(18, 2), cumulative_dividends)
        .input('cumulative_dividends_eur', sql.Decimal(18, 2), cumulative_dividends_eur)
        .query(`
          MERGE INTO DailyPortfolioValue AS target
          USING (SELECT @user_id AS user_id, @date AS date, @total_value AS total_value, @total_value_eur AS total_value_eur, @asset_xirr AS asset_xirr, @account_xirr AS account_xirr, @net_invested AS net_invested, @net_invested_eur AS net_invested_eur, @cumulative_dividends AS cumulative_dividends, @cumulative_dividends_eur AS cumulative_dividends_eur) AS source
          ON target.date = source.date AND target.user_id = source.user_id
          WHEN MATCHED THEN UPDATE SET total_value = source.total_value, total_value_eur = source.total_value_eur, asset_xirr = source.asset_xirr, account_xirr = source.account_xirr, net_invested = source.net_invested, net_invested_eur = source.net_invested_eur, cumulative_dividends = source.cumulative_dividends, cumulative_dividends_eur = source.cumulative_dividends_eur
          WHEN NOT MATCHED THEN INSERT (user_id, date, total_value, total_value_eur, asset_xirr, account_xirr, net_invested, net_invested_eur, cumulative_dividends, cumulative_dividends_eur) VALUES (source.user_id, source.date, source.total_value, source.total_value_eur, source.asset_xirr, source.account_xirr, source.net_invested, source.net_invested_eur, source.cumulative_dividends, source.cumulative_dividends_eur);
        `);

      // Send progress update to the client
      if ((index + 1) % 10 === 0 || (index + 1) === totalDays) {
        const progress = ((index + 1) / totalDays) * 100;
        write({
            type: 'progress',
            message: `Herberekenen dag ${index + 1}/${totalDays}...`,
            progress: progress.toFixed(0)
        });
      }
    }

    write({ type: 'complete', message: 'Portfolio waarden succesvol herberekend en opgeslagen.' });
    res.end();
  } catch (error) {
    console.error('Fout bij het herberekenen en opslaan van portfolio historie:', error);
    if (!res.headersSent) {
        res.status(500).json({ message: 'Serverfout bij het herberekenen en opslaan van portfolio historie.' });
    } else {
        res.end();
    }
  }
};

const checkAndRepairPriceData = async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ message: 'userId is verplicht.' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    const write = (payload) => res.write(JSON.stringify(payload) + '\n');

    try {
        write({ type: 'info', message: 'Starten: ophalen van aandelen uit transactiehistorie...' });
        const pool = await sql.connect(config);

        const stocksInPortfolioQuery = `
            SELECT
                t.aandeel_id,
                s.ticker_symbol,
                at.type_name as asset_type,
                MIN(CAST(t.purchase_time AS DATE)) as first_transaction_date,
                MAX(CAST(t.purchase_time AS DATE)) as last_transaction_date,
                SUM(CASE WHEN t.transaction_type = 'BUY' THEN t.quantity WHEN t.transaction_type = 'SELL' THEN -t.quantity ELSE 0 END) as total_qty
            FROM PF_transactions t
            JOIN Stocks s ON t.aandeel_id = s.aandeel_id
            LEFT JOIN AssetTypes at ON s.asset_type_id = at.asset_type_id
            WHERE t.user_id = @userId AND t.aandeel_id IS NOT NULL
            GROUP BY t.aandeel_id, s.ticker_symbol, at.type_name;
        `;
        const stocksResult = await pool.request().input('userId', sql.Int, userId).query(stocksInPortfolioQuery);
        const stocksToProcess = stocksResult.recordset;

        if (stocksToProcess.length === 0) {
            write({ type: 'complete', message: 'Geen aandelen in transactiehistorie gevonden om te controleren.' });
            return res.end();
        }

        write({ type: 'info', message: `Found ${stocksToProcess.length} stocks to check. Starting process...` });

        const today = new Date();
        const totalStocks = stocksToProcess.length;
        let repairedCount = 0;
        let earliestRepairedDate = new Date();

        for (const [index, stock] of stocksToProcess.entries()) {
            const progress = ((index + 1) / totalStocks) * 100;
            write({ type: 'progress', progress: progress.toFixed(0), message: `Controleren: ${stock.ticker_symbol} (${index + 1}/${totalStocks})` });

            const firstDate = new Date(stock.first_transaction_date);
            const targetEndDate = stock.total_qty > 0.00001 ? today : new Date(stock.last_transaction_date);

            const existingPricesResult = await pool.request()
                .input('aandeel_id', sql.Int, stock.aandeel_id)
                .input('first_date', sql.Date, firstDate)
                .input('end_date', sql.Date, targetEndDate)
                .query('SELECT date FROM DailyClosingPrices WHERE aandeel_id = @aandeel_id AND date >= @first_date AND date <= @end_date');
            
            const existingDates = new Set(existingPricesResult.recordset.map(r => new Date(r.date).toISOString().split('T')[0]));

            const requiredDates = [];
            let currentDate = new Date(firstDate);
            while (currentDate <= targetEndDate) {
                const day = currentDate.getDay();
                if (day > 0 && day < 6) { // 1=Monday, 5=Friday
                    requiredDates.push(currentDate.toISOString().split('T')[0]);
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }

            const missingDates = requiredDates.filter(d => !existingDates.has(d));

            if (missingDates.length > 0) {
                repairedCount++;
                write({ type: 'info', message: `Vond ${missingDates.length} ontbrekende prijsdatums voor ${stock.ticker_symbol}. Ophalen...` });

                const apiFetchStartDate = missingDates[0];
                const apiFetchEndDate = targetEndDate.toISOString().split('T')[0];
                
                let apiData = [];
                if (stock.asset_type === 'ETF') {
                    let yahooTicker = stock.ticker_symbol;
                    if (!yahooTicker.includes('.')) {
                        yahooTicker = `${yahooTicker}.DE`;
                    }
                    const period1 = Math.floor(new Date(apiFetchStartDate).getTime() / 1000);
                    const period2 = Math.floor(new Date(apiFetchEndDate).getTime() / 1000) + 86400; // include end date
                    const apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&period1=${period1}&period2=${period2}`;

                    try {
                        const response = await fetch(apiUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                            }
                        });
                        if (!response.ok) {
                            write({ type: 'error', message: `Yahoo Finance API error for ${stock.ticker_symbol}: ${response.statusText}` });
                            continue;
                        }
                        const json = await response.json();
                        const result = json.chart?.result?.[0];
                        if (result) {
                            const timestamps = result.timestamp || [];
                            const closes = result.indicators?.quote?.[0]?.close || [];
                            apiData = timestamps.map((ts, idx) => {
                                if (closes[idx] === null || closes[idx] === undefined) return null;
                                return {
                                    t: ts,
                                    c: closes[idx]
                                };
                            }).filter(Boolean);
                        }
                    } catch (e) {
                        write({ type: 'error', message: `Fout bij ophalen van ${stock.ticker_symbol} via Yahoo Finance: ${e.message}` });
                        continue;
                    }
                } else {
                    const apiKey = process.env.PROFIT_COM_API_KEY;
                    const apiUrl = `https://api.profit.com/data-api/market-data/historical/daily/${stock.ticker_symbol}?start_date=${apiFetchStartDate}&end_date=${apiFetchEndDate}&token=${apiKey}`;

                    const response = await fetch(apiUrl);
                    if (!response.ok) {
                        write({ type: 'error', message: `API error for ${stock.ticker_symbol}: ${response.statusText}` });
                        continue;
                    }
                    apiData = await response.json();
                }

                if (apiData && apiData.length > 0) {
                    let insertedCount = 0;
                    for (const record of apiData) {
                        const recordDateStr = new Date(record.t * 1000).toISOString().split('T')[0];
                        if (missingDates.includes(recordDateStr)) {
                            await pool.request()
                                .input("aandeel_id", sql.Int, stock.aandeel_id).input("closing_price", sql.Decimal(18, 2), record.c).input("date", sql.Date, recordDateStr).input("last_updated_at", sql.DateTime, new Date())
                                .query(`MERGE INTO DailyClosingPrices AS target USING (SELECT @aandeel_id AS aandeel_id, @closing_price AS closing_price, @date AS date) AS source ON target.date = source.date AND target.aandeel_id = source.aandeel_id WHEN NOT MATCHED THEN INSERT (aandeel_id, closing_price, date, last_updated_at) VALUES (source.aandeel_id, source.closing_price, source.date, @last_updated_at);`);
                            insertedCount++;
                            const recDate = new Date(recordDateStr);
                            if (recDate < earliestRepairedDate) earliestRepairedDate = recDate;
                        }
                    }
                    write({ type: 'info', message: `${insertedCount} prijzen hersteld voor ${stock.ticker_symbol}.` });
                }
            }
        }

        write({ type: 'complete', message: `Prijsdata controle voltooid. Data hersteld voor ${repairedCount} aande(e)l(en). Het is aanbevolen om nu 'Herbereken Historie' uit te voeren.`, earliestRepairedDate: earliestRepairedDate.toISOString().split('T')[0], repairedCount });
        res.end();

    } catch (error) {
        console.error('Fout bij het controleren en repareren van prijsdata:', error);
        if (!res.headersSent) res.status(500).json({ message: 'Serverfout bij het controleren en repareren van prijsdata.' });
        else res.end();
    }
};

const parseDateRange = (period, customStartDate, customEndDate) => {
    let startDate = new Date();
    let endDate = new Date();
    
    if (period === '1W') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '1M') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'YTD') {
      startDate.setMonth(0, 1); // 1 Januari van het huidige jaar
    } else if (period === '1Y') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    } else if (period === 'All') {
      startDate.setFullYear(1970);
    } else if (period === 'Custom') {
      if (customStartDate) startDate = new Date(customStartDate);
      if (customEndDate) endDate = new Date(customEndDate);
    } else {
      const monthsMap = { "3M": 3, "6M": 6, "2Y": 24, "5Y": 60 };
      if (monthsMap[period]) { startDate.setMonth(startDate.getMonth() - monthsMap[period]); }
      else if (period !== 'All') { startDate.setFullYear(startDate.getFullYear() - 1); }
      else { startDate.setFullYear(1970); }
    }

    startDate.setHours(0, 0, 0, 0); // Begin van de dag
    endDate.setHours(23, 59, 59, 999); // Einde van de dag
    return { startDate, endDate };
};

const getPortfolioValues = async (req, res) => {
  try {
    const { userId, period, assetTypes, customStartDate, customEndDate, currency } = req.query;
    const pool = await sql.connect(config);
    const isEur = currency === 'EUR' ? 1 : 0;
    const { startDate, endDate } = parseDateRange(period, customStartDate, customEndDate);

    // If no assetTypes filter is active, return the pre-calculated aggregate history directly (super fast!)
    if (!assetTypes || assetTypes === 'All' || assetTypes.length === 0) {
      const query = `
        SELECT dpv.date, 
               CASE WHEN @isEur = 1 THEN dpv.total_value_eur ELSE dpv.total_value END AS total_value, 
               dpv.asset_xirr, dpv.account_xirr,
               CASE WHEN @isEur = 1 THEN dpv.net_invested_eur ELSE dpv.net_invested END AS net_invested,
               CASE WHEN @isEur = 1 THEN dpv.cumulative_dividends_eur ELSE dpv.cumulative_dividends END AS cumulative_dividends
        FROM DailyPortfolioValue dpv
        WHERE dpv.user_id = @userId AND dpv.date >= @startDate AND dpv.date <= @endDate
        ORDER BY dpv.date ASC
      `;
      const request = pool.request();
      request.input('userId', sql.Int, userId);
      request.input('startDate', sql.Date, startDate);
      request.input('endDate', sql.Date, endDate);
      request.input('isEur', sql.Bit, isEur);
      
      const result = await request.query(query);
      return res.status(200).json(result.recordset);
    }

    // Dynamic category history calculation (Optimized in Node.js to avoid SQL timeout)
    const txQuery = `
      SELECT pt.purchase_time, pt.aandeel_id, pt.transaction_type, pt.quantity, pt.price, pt.currency, 
             ISNULL(pt.fees, 0) AS fees, ISNULL(pt.taxes, 0) AS taxes,
             at.type_name AS asset_type
      FROM PF_transactions pt
      JOIN Stocks s ON pt.aandeel_id = s.aandeel_id
      JOIN AssetTypes at ON s.asset_type_id = at.asset_type_id
      WHERE pt.user_id = @userId
      ORDER BY pt.purchase_time ASC
    `;
    const txRequest = pool.request();
    txRequest.input('userId', sql.Int, userId);
    const txResult = await txRequest.query(txQuery);
    const transactions = txResult.recordset;

    const priceQuery = `
      SELECT dcp.aandeel_id, dcp.date, dcp.closing_price
      FROM DailyClosingPrices dcp
      WHERE dcp.date >= @startDate AND dcp.date <= @endDate
      ORDER BY dcp.date ASC
    `;
    const priceRequest = pool.request();
    priceRequest.input('startDate', sql.Date, startDate);
    priceRequest.input('endDate', sql.Date, endDate);
    const priceResult = await priceRequest.query(priceQuery);
    const closingPrices = priceResult.recordset;

    const fxQuery = `
      SELECT date, rate 
      FROM DailyExchangeRates 
      WHERE currency_pair = 'EURUSD' AND date >= @startDate AND date <= @endDate
      ORDER BY date ASC
    `;
    const fxRequest = pool.request();
    fxRequest.input('startDate', sql.Date, startDate);
    fxRequest.input('endDate', sql.Date, endDate);
    const fxResult = await fxRequest.query(fxQuery);
    const fxRates = fxResult.recordset;

    // Unique dates list (incorporating closing prices and transaction dates)
    const datesSet = new Set(closingPrices.map(p => p.date.toISOString().split('T')[0]));
    transactions.forEach(t => {
      const dStr = new Date(t.purchase_time).toISOString().split('T')[0];
      if (dStr >= startDate && dStr <= endDate) {
        datesSet.add(dStr);
      }
    });
    const sortedDates = Array.from(datesSet).sort();

    // Map exchange rates by date
    const fxMap = {};
    let lastFx = 1.0;
    fxRates.forEach(r => {
      fxMap[r.date.toISOString().split('T')[0]] = r.rate;
    });

    const getFxRate = (dateStr) => {
      if (fxMap[dateStr] !== undefined) {
        lastFx = fxMap[dateStr];
      }
      return lastFx;
    };

    // Map closing prices: pricesMap[aandeel_id][dateStr] = price
    const pricesMap = {};
    closingPrices.forEach(p => {
      const dateStr = p.date.toISOString().split('T')[0];
      if (!pricesMap[p.aandeel_id]) pricesMap[p.aandeel_id] = {};
      pricesMap[p.aandeel_id][dateStr] = p.closing_price;
    });

    const fallbackPrices = {};
    const stockExchangeIsEur = {};

    const filterTypes = assetTypes.split(',').map(t => t.trim().toUpperCase());

    const dailyValues = [];
    const holdings = {};
    const netInvested = {};
    const cumulativeDividends = {};

    let txIdx = 0;

    // Fast-forward holdings prior to startDate
    while (txIdx < transactions.length) {
      const tx = transactions[txIdx];
      const txDateStr = new Date(tx.purchase_time).toISOString().split('T')[0];
      if (txDateStr < startDate) {
        fallbackPrices[tx.aandeel_id] = tx.price;
        stockExchangeIsEur[tx.aandeel_id] = tx.currency === 'EUR';

        if (filterTypes.includes(tx.asset_type.toUpperCase())) {
          if (!holdings[tx.aandeel_id]) {
            holdings[tx.aandeel_id] = 0;
            netInvested[tx.aandeel_id] = 0;
            cumulativeDividends[tx.aandeel_id] = 0;
          }
          
          const fxRate = getFxRate(txDateStr);
          const isTxEur = tx.currency === 'EUR';
          
          let txAmt = (tx.quantity * tx.price) + tx.fees + tx.taxes;
          if (isEur) {
            if (!isTxEur) txAmt = txAmt / fxRate;
          } else {
            if (isTxEur) txAmt = txAmt * fxRate;
          }

          if (tx.transaction_type === 'BUY') {
            holdings[tx.aandeel_id] += tx.quantity;
            netInvested[tx.aandeel_id] += txAmt;
          } else if (tx.transaction_type === 'SELL') {
            holdings[tx.aandeel_id] -= tx.quantity;
            netInvested[tx.aandeel_id] -= txAmt;
          } else if (tx.transaction_type === 'DIVIDEND') {
            let divAmt = (tx.quantity * tx.price) - tx.taxes;
            if (isEur) {
              if (!isTxEur) divAmt = divAmt / fxRate;
            } else {
              if (isTxEur) divAmt = divAmt * fxRate;
            }
            cumulativeDividends[tx.aandeel_id] += divAmt;
          }
        }
        txIdx++;
      } else {
        break;
      }
    }

    const lastKnownPrices = { ...fallbackPrices };

    // Calculate values day-by-day
    sortedDates.forEach(dateStr => {
      while (txIdx < transactions.length) {
        const tx = transactions[txIdx];
        const txDateStr = new Date(tx.purchase_time).toISOString().split('T')[0];
        if (txDateStr === dateStr) {
          lastKnownPrices[tx.aandeel_id] = tx.price;
          stockExchangeIsEur[tx.aandeel_id] = tx.currency === 'EUR';

          if (filterTypes.includes(tx.asset_type.toUpperCase())) {
            if (!holdings[tx.aandeel_id]) {
              holdings[tx.aandeel_id] = 0;
              netInvested[tx.aandeel_id] = 0;
              cumulativeDividends[tx.aandeel_id] = 0;
            }

            const fxRate = getFxRate(dateStr);
            const isTxEur = tx.currency === 'EUR';

            let txAmt = (tx.quantity * tx.price) + tx.fees + tx.taxes;
            if (isEur) {
              if (!isTxEur) txAmt = txAmt / fxRate;
            } else {
              if (isTxEur) txAmt = txAmt * fxRate;
            }

            if (tx.transaction_type === 'BUY') {
              holdings[tx.aandeel_id] += tx.quantity;
              netInvested[tx.aandeel_id] += txAmt;
            } else if (tx.transaction_type === 'SELL') {
              holdings[tx.aandeel_id] -= tx.quantity;
              netInvested[tx.aandeel_id] -= txAmt;
            } else if (tx.transaction_type === 'DIVIDEND') {
              let divAmt = (tx.quantity * tx.price) - tx.taxes;
              if (isEur) {
                if (!isTxEur) divAmt = divAmt / fxRate;
              } else {
                if (isTxEur) divAmt = divAmt * fxRate;
              }
              cumulativeDividends[tx.aandeel_id] += divAmt;
            }
          }
          txIdx++;
        } else {
          break;
        }
      }

      let dayVal = 0;
      let dayNetInvested = 0;
      let dayCumulativeDividends = 0;

      const fxRate = getFxRate(dateStr);

      for (const [aandeel_id, qty] of Object.entries(holdings)) {
        if (qty > 0.00001) {
          let price = lastKnownPrices[aandeel_id] || 0;
          if (pricesMap[aandeel_id] && pricesMap[aandeel_id][dateStr] !== undefined) {
            price = pricesMap[aandeel_id][dateStr];
          } else {
            const assetPrices = pricesMap[aandeel_id] || {};
            const prevDates = Object.keys(assetPrices).filter(d => d < dateStr).sort();
            if (prevDates.length > 0) {
              price = assetPrices[prevDates[prevDates.length - 1]];
            }
          }

          const isAssetEur = stockExchangeIsEur[aandeel_id];
          let priceInTarget = price;
          if (isEur) {
            if (!isAssetEur) priceInTarget = price / fxRate;
          } else {
            if (isAssetEur) priceInTarget = price * fxRate;
          }

          dayVal += qty * priceInTarget;
          dayNetInvested += netInvested[aandeel_id] || 0;
          dayCumulativeDividends += cumulativeDividends[aandeel_id] || 0;
        }
      }

      dailyValues.push({
        date: new Date(`${dateStr}T00:00:00.000Z`),
        total_value: dayVal,
        asset_xirr: 0,
        account_xirr: 0,
        net_invested: dayNetInvested,
        cumulative_dividends: dayCumulativeDividends
      });
    });

    res.status(200).json(dailyValues);
  } catch (error) {
    console.error("Fout bij het ophalen van portfolio waarden:", error);
    res.status(500).json({ message: "Serverfout bij het ophalen van portfolio waarden." });
  }
};

const calculateReturns = async (req, res) => {
  try {
    const userId = 1; // Haal dit uit een sessie of JWT
    const { period } = req.query;

    let dateFilter;
    switch (period) {
      case '1M': dateFilter = new Date(); dateFilter.setMonth(dateFilter.getMonth() - 1); break;
      case '3M': dateFilter = new Date(); dateFilter.setMonth(dateFilter.getMonth() - 3); break;
      case '6M': dateFilter = new Date(); dateFilter.setMonth(dateFilter.getMonth() - 6); break;
      case '1Y': dateFilter = new Date(); dateFilter.setFullYear(dateFilter.getFullYear() - 1); break;
      case '2Y': dateFilter = new Date(); dateFilter.setFullYear(dateFilter.getFullYear() - 2); break;
      case '5Y': dateFilter = new Date(); dateFilter.setFullYear(dateFilter.getFullYear() - 5); break;
      case 'All': default: dateFilter = null; break;
    }

    const pool = await sql.connect(config);
    const request = pool.request();
    request.input('userId', sql.Int, userId);
    if (dateFilter) {
      request.input('dateFilter', sql.Date, dateFilter);
    }

    const query = `
      WITH TransactionsPerDate AS (
        SELECT
          CONVERT(DATE, t.purchase_time) AS transaction_date,
          SUM(CASE
            WHEN t.transaction_type = 'BUY' THEN 
              CASE WHEN t.currency = 'EUR' THEN (t.quantity * t.price) * ISNULL(er.rate, 1) ELSE t.quantity * t.price END
            WHEN t.transaction_type = 'SELL' THEN 
              CASE WHEN t.currency = 'EUR' THEN -(t.quantity * t.price) * ISNULL(er.rate, 1) ELSE -(t.quantity * t.price) END
            ELSE 0
          END) AS total_transaction_value
        FROM PF_transactions t
        OUTER APPLY (
            SELECT TOP 1 rate FROM DailyExchangeRates WHERE currency_pair = 'EURUSD' AND date <= CONVERT(DATE, t.purchase_time) ORDER BY date DESC
        ) er
        WHERE t.user_id = @userId
        ${dateFilter ? 'AND t.purchase_time >= @dateFilter' : ''}
        GROUP BY CONVERT(DATE, t.purchase_time)
      ),
      DailyReturns AS (
        SELECT
          dpv.date,
          dpv.total_value,
          ISNULL(tpd.total_transaction_value, 0) AS total_transaction_value,
          LAG(dpv.total_value) OVER (PARTITION BY dpv.user_id ORDER BY dpv.date) AS previous_total_value,
          CASE
            WHEN LAG(dpv.total_value) OVER (PARTITION BY dpv.user_id ORDER BY dpv.date) IS NULL THEN 1
            ELSE (dpv.total_value - ISNULL(tpd.total_transaction_value, 0)) /
                 LAG(dpv.total_value) OVER (PARTITION BY dpv.user_id ORDER BY dpv.date)
          END AS return_value
        FROM DailyPortfolioValue dpv
        LEFT JOIN TransactionsPerDate tpd
        ON dpv.date = tpd.transaction_date
        WHERE dpv.user_id = @userId
        ${dateFilter ? 'AND dpv.date >= @dateFilter' : ''}
      ),
      CumulativeReturns AS (
        SELECT
          date,
          total_value,
          total_transaction_value,
          previous_total_value,
          return_value,
          EXP(SUM(LOG(return_value)) OVER (PARTITION BY 1 ORDER BY date)) AS return_value_cumulative
        FROM DailyReturns
      )
      SELECT *
      FROM CumulativeReturns
      ORDER BY date ASC;
    `;

    const result = await request.query(query);
    const calculatedReturns = result.recordset;
    res.status(200).json({ calculatedReturns });
  } catch (error) {
    console.error('Fout bij het berekenen van rendement:', error);
    res.status(500).json({ message: 'Serverfout bij het berekenen van rendement.' });
  }
};

const getPortfolioReturns = async (req, res) => {
  try {
    const { userId } = req.query;
    const pool = await sql.connect(config);

    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT date, return_value
        FROM DailyPortfolioValue
        WHERE user_id = @userId
        ORDER BY date ASC;
      `);

    res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Fout bij het ophalen van rendementen:', error);
    res.status(500).json({ message: 'Fout bij het ophalen van rendementen.' });
  }
};

const getCurrentPortfolioHoldings = async (req, res) => {
  try {
    const userId = req.query.userId || 1;
    const { period, customStartDate, customEndDate, currency } = req.query;
    const { endDate } = parseDateRange(period, customStartDate, customEndDate);
    const pool = await sql.connect(config);
    const isEur = currency === 'EUR' || !currency ? 1 : 0;

    // Bereken het actuele bezit op basis van alle transacties en de meest recente slotkoers
    const query = `
      WITH Holdings AS (
        SELECT
          t.aandeel_id,
          SUM(CASE WHEN t.transaction_type = 'BUY' THEN t.quantity WHEN t.transaction_type = 'SELL' THEN -t.quantity ELSE 0 END) AS total_quantity,
          SUM(CASE WHEN t.currency = 'EUR' THEN (CASE WHEN t.transaction_type = 'BUY' THEN t.quantity * t.price WHEN t.transaction_type = 'SELL' THEN -t.quantity * t.price ELSE 0 END) ELSE 0 END) AS invested_eur,
          SUM(CASE WHEN t.currency = 'USD' THEN (CASE WHEN t.transaction_type = 'BUY' THEN t.quantity * t.price WHEN t.transaction_type = 'SELL' THEN -t.quantity * t.price ELSE 0 END) ELSE 0 END) AS invested_usd
        FROM PF_transactions t
        WHERE t.user_id = @userId
        AND t.purchase_time <= @endDate
        GROUP BY t.aandeel_id
        HAVING SUM(CASE WHEN t.transaction_type = 'BUY' THEN t.quantity WHEN t.transaction_type = 'SELL' THEN -t.quantity ELSE 0 END) > 0.0001
      ),
      LatestPrices AS (
        SELECT aandeel_id, closing_price,
               ROW_NUMBER() OVER(PARTITION BY aandeel_id ORDER BY date DESC) as rn
        FROM DailyClosingPrices
        WHERE date <= @endDate
      ),
      LatestTransactionPrices AS (
        SELECT aandeel_id, price, currency,
               ROW_NUMBER() OVER(PARTITION BY aandeel_id ORDER BY purchase_time DESC) as rn
        FROM PF_transactions
        WHERE user_id = @userId AND purchase_time <= @endDate
      )
      SELECT
        h.aandeel_id,
        s.ticker_symbol AS ticker,
        s.name,
        at.type_name AS asset_type,
        h.total_quantity AS quantity,
        -- Detecteer native valuta
        CASE 
          WHEN (s.ticker_symbol LIKE '%.DE' OR s.ticker_symbol LIKE '%.AS' OR s.ticker_symbol LIKE '%.BR' OR s.ticker_symbol LIKE '%.PA' OR at.type_name = 'ETF' OR h.invested_eur > 0)
          THEN 'EUR' 
          ELSE 'USD' 
        END AS native_currency,
        
        -- Geconverteerde prijs naar gevraagde weergave-valuta (@isEur)
        CASE 
          WHEN @isEur = 1 THEN
            CASE 
              WHEN (s.ticker_symbol LIKE '%.DE' OR s.ticker_symbol LIKE '%.AS' OR s.ticker_symbol LIKE '%.BR' OR s.ticker_symbol LIKE '%.PA' OR at.type_name = 'ETF' OR h.invested_eur > 0)
              THEN COALESCE(p.closing_price, ltp.price, 0)
              ELSE COALESCE(p.closing_price, ltp.price, 0) / ISNULL(er.rate, 1.13)
            END
          ELSE
            CASE 
              WHEN (s.ticker_symbol LIKE '%.DE' OR s.ticker_symbol LIKE '%.AS' OR s.ticker_symbol LIKE '%.BR' OR s.ticker_symbol LIKE '%.PA' OR at.type_name = 'ETF' OR h.invested_eur > 0)
              THEN COALESCE(p.closing_price, ltp.price, 0) * ISNULL(er.rate, 1.13)
              ELSE COALESCE(p.closing_price, ltp.price, 0)
            END
        END AS price,

        -- Totale marktwaarde van de holding
        CASE 
          WHEN @isEur = 1 THEN
            h.total_quantity * CASE 
              WHEN (s.ticker_symbol LIKE '%.DE' OR s.ticker_symbol LIKE '%.AS' OR s.ticker_symbol LIKE '%.BR' OR s.ticker_symbol LIKE '%.PA' OR at.type_name = 'ETF' OR h.invested_eur > 0)
              THEN COALESCE(p.closing_price, ltp.price, 0)
              ELSE COALESCE(p.closing_price, ltp.price, 0) / ISNULL(er.rate, 1.13)
            END
          ELSE
            h.total_quantity * CASE 
              WHEN (s.ticker_symbol LIKE '%.DE' OR s.ticker_symbol LIKE '%.AS' OR s.ticker_symbol LIKE '%.BR' OR s.ticker_symbol LIKE '%.PA' OR at.type_name = 'ETF' OR h.invested_eur > 0)
              THEN COALESCE(p.closing_price, ltp.price, 0) * ISNULL(er.rate, 1.13)
              ELSE COALESCE(p.closing_price, ltp.price, 0)
            END
        END AS value,

        -- Totale inleg geconverteerd naar gevraagde valuta
        CASE 
          WHEN @isEur = 1 THEN (h.invested_eur + (h.invested_usd / ISNULL(er.rate, 1.13)))
          ELSE ((h.invested_eur * ISNULL(er.rate, 1.13)) + h.invested_usd)
        END AS total_invested,

        -- Gemiddelde aankoopprijs in gevraagde valuta
        CASE 
          WHEN @isEur = 1 THEN (h.invested_eur + (h.invested_usd / ISNULL(er.rate, 1.13))) / NULLIF(h.total_quantity, 0)
          ELSE ((h.invested_eur * ISNULL(er.rate, 1.13)) + h.invested_usd) / NULLIF(h.total_quantity, 0)
        END AS average_price,

        -- Ongerealiseerde winst / verlies
        (
          (CASE 
            WHEN @isEur = 1 THEN
              h.total_quantity * CASE 
                WHEN (s.ticker_symbol LIKE '%.DE' OR s.ticker_symbol LIKE '%.AS' OR s.ticker_symbol LIKE '%.BR' OR s.ticker_symbol LIKE '%.PA' OR at.type_name = 'ETF' OR h.invested_eur > 0)
                THEN COALESCE(p.closing_price, ltp.price, 0)
                ELSE COALESCE(p.closing_price, ltp.price, 0) / ISNULL(er.rate, 1.13)
              END
            ELSE
              h.total_quantity * CASE 
                WHEN (s.ticker_symbol LIKE '%.DE' OR s.ticker_symbol LIKE '%.AS' OR s.ticker_symbol LIKE '%.BR' OR s.ticker_symbol LIKE '%.PA' OR at.type_name = 'ETF' OR h.invested_eur > 0)
                THEN COALESCE(p.closing_price, ltp.price, 0) * ISNULL(er.rate, 1.13)
                ELSE COALESCE(p.closing_price, ltp.price, 0)
              END
          END)
          -
          (CASE 
            WHEN @isEur = 1 THEN (h.invested_eur + (h.invested_usd / ISNULL(er.rate, 1.13)))
            ELSE ((h.invested_eur * ISNULL(er.rate, 1.13)) + h.invested_usd)
          END)
        ) AS gainLoss

      FROM Holdings h
      JOIN Stocks s ON h.aandeel_id = s.aandeel_id
      LEFT JOIN AssetTypes at ON s.asset_type_id = at.asset_type_id
      LEFT JOIN LatestPrices p ON h.aandeel_id = p.aandeel_id AND p.rn = 1
      LEFT JOIN LatestTransactionPrices ltp ON h.aandeel_id = ltp.aandeel_id AND ltp.rn = 1
      OUTER APPLY (
        SELECT TOP 1 rate FROM DailyExchangeRates WHERE currency_pair = 'EURUSD' AND date <= @endDate ORDER BY date DESC
      ) er;
      `;
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .input('endDate', sql.DateTime, endDate)
        .input('isEur', sql.Bit, isEur)
        .query(query);
    res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Fout bij het ophalen van actuele holdings:', error);
    res.status(500).json({ message: 'Serverfout bij ophalen van actuele holdings.' });
  }
};

const getTransactions = async (req, res) => {
  try {
    const userId = req.query.userId || 1;
    const { period, customStartDate, customEndDate } = req.query;
    const { startDate, endDate } = parseDateRange(period, customStartDate, customEndDate);
    const pool = await sql.connect(config);
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('startDate', sql.DateTime, startDate)
      .input('endDate', sql.DateTime, endDate)
      .query(`
        SELECT t.*, s.ticker_symbol, s.name as stock_name, s.isin, at.type_name as asset_type, b.name as broker_name,
               er.rate as historical_exchange_rate
        FROM PF_transactions t
        LEFT JOIN Stocks s ON t.aandeel_id = s.aandeel_id
        LEFT JOIN AssetTypes at ON s.asset_type_id = at.asset_type_id
        LEFT JOIN Brokers b ON t.broker_id = b.broker_id
        OUTER APPLY (
            SELECT TOP 1 rate 
            FROM DailyExchangeRates 
            WHERE currency_pair = 'EURUSD' AND date <= CAST(t.purchase_time AS DATE) 
            ORDER BY date DESC
        ) er
        WHERE t.user_id = @userId
        AND t.purchase_time >= @startDate AND t.purchase_time <= @endDate
        ORDER BY t.purchase_time DESC
      `);
    res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Fout bij het ophalen van transacties:', error);
    res.status(500).json({ message: 'Serverfout bij ophalen van transacties.' });
  }
};

const fetchAndStorePricesForStock = async (aandeel_id) => {
  try {
    const pool = await sql.connect(config);
    const stockQuery = `
      SELECT s.ticker_symbol, at.type_name as asset_type 
      FROM Stocks s
      LEFT JOIN AssetTypes at ON s.asset_type_id = at.asset_type_id
      WHERE s.aandeel_id = @aandeel_id
    `;
    const stockResult = await pool.request().input('aandeel_id', sql.Int, aandeel_id).query(stockQuery);
    if (stockResult.recordset.length === 0) return;
    const stock = stockResult.recordset[0];

    const today = new Date();
    const todayFormatted = today.toISOString().split("T")[0];
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(today.getFullYear() - 10);
    const apiFetchStartDateFormatted = tenYearsAgo.toISOString().split("T")[0];

    let apiData = [];
    if (stock.asset_type === 'ETF') {
      let yahooTicker = stock.ticker_symbol;
      if (!yahooTicker.includes('.')) {
        yahooTicker = `${yahooTicker}.DE`;
      }
      const period1 = Math.floor(tenYearsAgo.getTime() / 1000);
      const period2 = Math.floor(today.getTime() / 1000) + 86400;
      const apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&period1=${period1}&period2=${period2}`;

      console.log(`[Background Sync] Ophalen van ETF data voor ${stock.ticker_symbol} via Yahoo Finance: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      if (response.ok) {
        const json = await response.json();
        const result = json.chart?.result?.[0];
        if (result) {
          const timestamps = result.timestamp || [];
          const closes = result.indicators?.quote?.[0]?.close || [];
          apiData = timestamps.map((ts, idx) => {
            if (closes[idx] === null || closes[idx] === undefined) return null;
            return {
              t: ts,
              c: closes[idx]
            };
          }).filter(Boolean);
        }
      }
    } else if (stock.asset_type === 'STOCK') {
      const apiKey = process.env.PROFIT_COM_API_KEY;
      const apiUrl = `https://api.profit.com/data-api/market-data/historical/daily/${stock.ticker_symbol}?start_date=${apiFetchStartDateFormatted}&end_date=${todayFormatted}&token=${apiKey}`;

      console.log(`[Background Sync] Ophalen van STOCK data voor ${stock.ticker_symbol} via Profit.com: ${apiUrl}`);
      const response = await fetch(apiUrl);
      if (response.ok) {
        apiData = await response.json();
      }
    }

    if (apiData && apiData.length > 0) {
      console.log(`[Background Sync] Opslaan van ${apiData.length} prijsrecords voor ${stock.ticker_symbol}...`);
      for (const record of apiData) {
        if (!record || !record.t) continue;
        const recordDateStr = new Date(record.t * 1000).toISOString().split('T')[0];

        await pool.request()
          .input("aandeel_id", sql.Int, aandeel_id)
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
      console.log(`[Background Sync] Prijsdata succesvol gesynchroniseerd voor ${stock.ticker_symbol}.`);
    }
  } catch (error) {
    console.error(`[Background Sync Error] Fout bij prijs-synchronisatie voor aandeel_id ${aandeel_id}:`, error);
  }
};

const addTransaction = async (req, res) => {
  try {
    const { user_id, aandeel_id, broker_id, transaction_type, quantity, currency, price, purchase_time, fees = 0, taxes = 0, exchange_rate = 1, import_source = 'manual' } = req.body;
    const pool = await sql.connect(config);
    const isCash = ['DEPOSIT', 'WITHDRAWAL'].includes(transaction_type);
    
    // Check of transactie al bestaat
    const duplicateCheck = await pool.request()
      .input('user_id', sql.Int, user_id)
      .input('aandeel_id', sql.Int, isCash ? null : aandeel_id)
      .input('broker_id', sql.Int, broker_id || null)
      .input('transaction_type', sql.VarChar, transaction_type)
      .input('quantity', sql.Decimal(18, 5), quantity)
      .input('price', sql.Decimal(18, 4), isCash ? 1 : price)
      .input('purchase_time', sql.DateTime, purchase_time)
      .query(`
        SELECT 1 FROM PF_transactions
        WHERE user_id = @user_id 
        AND (@aandeel_id IS NULL OR aandeel_id = @aandeel_id)
        AND (@broker_id IS NULL OR broker_id = @broker_id)
        AND transaction_type = @transaction_type 
        AND ABS(quantity - @quantity) < 0.0001
        AND ABS(price - @price) <= 0.015 
        AND CAST(purchase_time AS DATE) = CAST(@purchase_time AS DATE)
      `);

    if (duplicateCheck.recordset.length > 0) {
        return res.status(409).json({ message: 'Deze transactie bestaat al in de database (duplicaat).' });
    }

    await pool.request()
      .input('user_id', sql.Int, user_id)
      .input('aandeel_id', sql.Int, isCash ? null : aandeel_id)
      .input('broker_id', sql.Int, broker_id)
      .input('transaction_type', sql.VarChar, transaction_type)
      .input('quantity', sql.Decimal(18, 5), quantity)
      .input('currency', sql.VarChar, currency)
      .input('price', sql.Decimal(18, 4), isCash ? 1 : price)
      .input('purchase_time', sql.DateTime, purchase_time)
      .input('fees', sql.Decimal(18, 4), fees)
      .input('taxes', sql.Decimal(18, 4), taxes)
      .input('exchange_rate', sql.Decimal(18, 6), exchange_rate)
      .input('import_source', sql.NVarChar, import_source)
      .query(`
        INSERT INTO PF_transactions (user_id, aandeel_id, broker_id, transaction_type, quantity, currency, price, purchase_time, fees, taxes, exchange_rate, import_source, created_at, updated_at)
        VALUES (@user_id, @aandeel_id, @broker_id, @transaction_type, @quantity, @currency, @price, @purchase_time, @fees, @taxes, @exchange_rate, @import_source, GETDATE(), GETDATE())
      `);

    // Synchroniseer prijzen op de achtergrond alleen indien aandeel_id aanwezig is
    if (aandeel_id) {
      fetchAndStorePricesForStock(aandeel_id);
    }

    res.status(201).json({ message: 'Transactie succesvol toegevoegd' });
  } catch (error) {
    console.error('Fout bij toevoegen transactie:', error);
    res.status(500).json({ message: 'Serverfout bij toevoegen transactie' });
  }
};

const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, aandeel_id, broker_id, transaction_type, quantity, currency, price, purchase_time, fees = 0, taxes = 0, exchange_rate = 1, force = false } = req.body;
    const pool = await sql.connect(config);
    
    // Controleer of de transactie afkomstig is van een broker import
    const existing = await pool.request().input('id', sql.Int, id).query('SELECT import_source FROM PF_transactions WHERE id = @id');
    if (existing.recordset.length > 0) {
      const src = existing.recordset[0].import_source;
      if (src && src !== 'manual' && !force) {
        return res.status(403).json({ 
          message: `Deze transactie is automatisch geïmporteerd via ${src} en kan niet rechtstreeks worden aangepast om de zuiverheid van het grootboek te waarborgen.` 
        });
      }
    }

    const result = await pool.request()
      .input('id', sql.Int, id).input('user_id', sql.Int, user_id).input('aandeel_id', sql.Int, aandeel_id).input('broker_id', sql.Int, broker_id)
      .input('transaction_type', sql.VarChar, transaction_type).input('quantity', sql.Decimal(18, 5), quantity).input('currency', sql.VarChar, currency)
      .input('price', sql.Decimal(18, 4), price).input('purchase_time', sql.DateTime, purchase_time).input('fees', sql.Decimal(18, 4), fees)
      .input('taxes', sql.Decimal(18, 4), taxes).input('exchange_rate', sql.Decimal(18, 6), exchange_rate)
      .query(`
        UPDATE PF_transactions 
        SET user_id = @user_id, aandeel_id = @aandeel_id, broker_id = @broker_id, transaction_type = @transaction_type, 
            quantity = @quantity, currency = @currency, price = @price, purchase_time = @purchase_time, 
            fees = @fees, taxes = @taxes, exchange_rate = @exchange_rate, updated_at = GETDATE()
        WHERE id = @id
      `);
    
    if (result.rowsAffected[0] > 0) {
      // Synchroniseer prijzen op de achtergrond
      fetchAndStorePricesForStock(aandeel_id);

      res.status(200).json({ message: 'Transactie succesvol bijgewerkt' });
    }
    else res.status(404).json({ message: 'Transactie niet gevonden.' });
  } catch (error) {
    console.error('Fout bij bewerken transactie:', error);
    res.status(500).json({ message: 'Serverfout bij bewerken transactie' });
  }
};

const addMultipleTransactions = async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!transactions || !Array.isArray(transactions)) {
        return res.status(400).json({ message: 'Geen geldige transacties meegegeven.' });
    }

    const pool = await sql.connect(config);
    let added = 0; let duplicates = 0; let errors = 0;
    const importedAandeelIds = new Set();

    for (const t of transactions) {
      try {
          const isCash = ['DEPOSIT', 'WITHDRAWAL'].includes(t.transaction_type);
          let aandeel_id = t.aandeel_id || null;
          let matchedTicker = t.ticker;

          // 1. Zoek aandeel_id op basis van ISIN, Ticker of Naam (alleen voor aandelen/etfs)
          if (!isCash && !aandeel_id) {
              let stockResult;
              const cleanIsin = t.isin ? String(t.isin).trim().toUpperCase() : null;
              const cleanTicker = t.ticker ? String(t.ticker).trim().toUpperCase() : null;
              const cleanName = t.ticker ? String(t.ticker).trim() : '';

              // A. Zoek op ISIN
              if (cleanIsin) {
                  stockResult = await pool.request()
                      .input('isin', sql.VarChar, cleanIsin)
                      .query(`SELECT aandeel_id, ticker_symbol, name, isin FROM Stocks WHERE isin = @isin`);
              }

              // B. Zoek op Ticker Symbol
              if ((!stockResult || stockResult.recordset.length === 0) && cleanTicker) {
                  stockResult = await pool.request()
                      .input('ticker', sql.NVarChar, cleanTicker)
                      .query(`SELECT aandeel_id, ticker_symbol, name, isin FROM Stocks WHERE ticker_symbol = @ticker`);
              }

              // C. Zoek op Bedrijfsnaam (voor DeGiro Product namen zoals "APPLE INC.")
              if ((!stockResult || stockResult.recordset.length === 0) && cleanName) {
                  stockResult = await pool.request()
                      .input('namePattern', sql.NVarChar, `%${cleanName}%`)
                      .query(`SELECT TOP 1 aandeel_id, ticker_symbol, name, isin FROM Stocks WHERE name LIKE @namePattern OR @namePattern LIKE '%' + name + '%'`);
              }

              // D. Als niet gevonden in DB: Doe realtime lookup via Yahoo Finance search op ISIN of Naam
              if ((!stockResult || stockResult.recordset.length === 0) && (cleanIsin || cleanName)) {
                  try {
                      const lookupQuery = cleanIsin || cleanName;
                      const yResponse = await axios.get(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(lookupQuery)}`, {
                          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                          timeout: 5000
                      });

                      const firstQuote = yResponse.data?.quotes?.[0];
                      if (firstQuote && firstQuote.symbol) {
                          const resolvedSymbol = firstQuote.symbol.toUpperCase();
                          const resolvedName = firstQuote.shortname || firstQuote.longname || cleanName || resolvedSymbol;
                          const isEtf = firstQuote.quoteType === 'ETF';

                          // Check of deze resolvedSymbol al in DB bestaat
                          const checkSym = await pool.request()
                              .input('sym', sql.NVarChar, resolvedSymbol)
                              .query(`SELECT aandeel_id, ticker_symbol, isin FROM Stocks WHERE ticker_symbol = @sym`);

                          if (checkSym.recordset.length > 0) {
                              aandeel_id = checkSym.recordset[0].aandeel_id;
                              matchedTicker = checkSym.recordset[0].ticker_symbol;
                              // Update ISIN als die nog leeg was
                              if (cleanIsin && !checkSym.recordset[0].isin) {
                                  await pool.request().input('aid', sql.Int, aandeel_id).input('isin', sql.VarChar, cleanIsin)
                                      .query(`UPDATE Stocks SET isin = @isin WHERE aandeel_id = @aid`);
                              }
                          } else {
                              // Voeg nieuw aandeel toe aan Stocks tabel!
                              const insertStock = await pool.request()
                                  .input('ticker', sql.NVarChar, resolvedSymbol)
                                  .input('name', sql.NVarChar, resolvedName)
                                  .input('isin', sql.VarChar, cleanIsin || null)
                                  .input('asset_type_id', sql.Int, isEtf ? 2 : 1)
                                  .input('stock_exchange_id', sql.Int, 1)
                                  .query(`
                                      INSERT INTO Stocks (ticker_symbol, name, isin, asset_type_id, stock_exchange_id, inWatchlist, inIdealePortfolio)
                                      OUTPUT INSERTED.aandeel_id
                                      VALUES (@ticker, @name, @isin, @asset_type_id, @stock_exchange_id, 0, 0)
                                  `);
                              if (insertStock.recordset.length > 0) {
                                  aandeel_id = insertStock.recordset[0].aandeel_id;
                                  matchedTicker = resolvedSymbol;
                              }
                          }
                      }
                  } catch (yahooErr) {
                      console.warn('Yahoo ISIN lookup fout:', yahooErr.message);
                  }
              }

              if (!aandeel_id && stockResult && stockResult.recordset.length > 0) {
                  aandeel_id = stockResult.recordset[0].aandeel_id;
                  matchedTicker = stockResult.recordset[0].ticker_symbol;
                  // Update ISIN als die nog leeg was in DB
                  if (cleanIsin && !stockResult.recordset[0].isin) {
                      await pool.request().input('aid', sql.Int, aandeel_id).input('isin', sql.VarChar, cleanIsin)
                          .query(`UPDATE Stocks SET isin = @isin WHERE aandeel_id = @aid`);
                  }
              }
          }

          if (!isCash && !aandeel_id) { 
              console.warn(`Kon aandeel niet matchen voor ticker: ${t.ticker}, isin: ${t.isin}`);
              errors++; 
              continue; 
          }

          // 2. Duplicaat check op datum, aandeel, type, qty en prijs
          const duplicateCheck = await pool.request()
            .input('user_id', sql.Int, t.user_id || 1)
            .input('aandeel_id', sql.Int, isCash ? null : aandeel_id)
            .input('broker_id', sql.Int, t.broker_id || null)
            .input('transaction_type', sql.VarChar, t.transaction_type)
            .input('quantity', sql.Decimal(18, 5), Math.abs(t.quantity))
            .input('price', sql.Decimal(18, 4), isCash ? 1 : Math.abs(t.price))
            .input('purchase_time', sql.DateTime, t.purchase_time)
            .query(`
              SELECT 1 FROM PF_transactions 
              WHERE user_id = @user_id 
              AND ((@aandeel_id IS NULL AND aandeel_id IS NULL) OR (aandeel_id = @aandeel_id))
              AND (@broker_id IS NULL OR broker_id = @broker_id)
              AND transaction_type = @transaction_type 
              AND ABS(quantity - @quantity) < 0.0001 
              AND ABS(price - @price) <= 0.02 
              AND CAST(purchase_time AS DATE) = CAST(@purchase_time AS DATE)
            `);

          if (duplicateCheck.recordset.length > 0) { 
              duplicates++; 
              continue; 
          }

          const rowImportSource = t.import_source || req.body.import_source || 'degiro_upload';
          const externalId = t.external_id || t.order_id || null;

          // 3. Invoegen in PF_transactions
          await pool.request()
            .input('user_id', sql.Int, t.user_id || 1)
            .input('aandeel_id', sql.Int, aandeel_id)
            .input('broker_id', sql.Int, t.broker_id || 1)
            .input('transaction_type', sql.VarChar, t.transaction_type)
            .input('quantity', sql.Decimal(18, 5), Math.abs(t.quantity))
            .input('currency', sql.VarChar, t.currency || 'USD')
            .input('price', sql.Decimal(18, 4), Math.abs(t.price))
            .input('purchase_time', sql.DateTime, t.purchase_time)
            .input('fees', sql.Decimal(18, 4), t.fees || 0)
            .input('taxes', sql.Decimal(18, 4), t.taxes || 0)
            .input('exchange_rate', sql.Decimal(18, 6), t.exchange_rate || 1)
            .input('import_source', sql.NVarChar, rowImportSource)
            .input('external_id', sql.NVarChar, externalId)
            .query(`
              INSERT INTO PF_transactions (user_id, aandeel_id, broker_id, transaction_type, quantity, currency, price, purchase_time, fees, taxes, exchange_rate, import_source, external_id, created_at, updated_at)
              VALUES (@user_id, @aandeel_id, @broker_id, @transaction_type, @quantity, @currency, @price, @purchase_time, @fees, @taxes, @exchange_rate, @import_source, @external_id, GETDATE(), GETDATE())
            `);

          added++;
          importedAandeelIds.add(aandeel_id);
      } catch (rowError) {
          console.error('Fout bij verwerken specifieke transactierij:', rowError);
          errors++;
      }
    }

    // Synchroniseer prijzen op de achtergrond voor alle unieke aandeelIds die succesvol zijn geïmporteerd
    for (const aandeel_id of importedAandeelIds) {
        fetchAndStorePricesForStock(aandeel_id);
    }

    res.status(200).json({ 
        message: `Import voltooid! Toegevoegd: ${added}, Duplicaten overgeslagen: ${duplicates}, Fouten/Niet herkend: ${errors}.`,
        added,
        duplicates,
        errors
    });
  } catch (error) {
    console.error('Fout bij importeren van meerdere transacties:', error);
    res.status(500).json({ message: 'Serverfout bij bulk import: ' + error.message });
  }
};

const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { force = false } = req.query;
    const pool = await sql.connect(config);

    // Controleer of transactie afkomstig is van een broker import
    const existing = await pool.request().input('id', sql.Int, id).query('SELECT import_source FROM PF_transactions WHERE id = @id');
    if (existing.recordset.length > 0) {
      const src = existing.recordset[0].import_source;
      if (src && src !== 'manual' && String(force) !== 'true') {
        return res.status(403).json({ 
          message: `Deze transactie is automatisch geïmporteerd via ${src} en kan niet zomaar worden verwijderd om het grootboek intact te houden.` 
        });
      }
    }

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM PF_transactions WHERE id = @id');

    if (result.rowsAffected[0] > 0) {
      res.status(200).json({ message: 'Transactie succesvol verwijderd.' });
    } else {
      res.status(404).json({ message: 'Transactie niet gevonden.' });
    }
  } catch (error) {
    console.error('Fout bij verwijderen transactie:', error);
    res.status(500).json({ message: 'Serverfout bij verwijderen transactie.' });
  }
};

const markTobPaid = async (req, res) => {
  try {
      const { transactionIds, isPaid } = req.body;
      if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
          return res.status(400).json({ message: 'Geen transacties opgegeven.' });
      }
      
      const pool = await sql.connect(config);
      // Filter zodat we enkel getallen hebben om SQL-injecties te voorkomen
      const cleanIds = transactionIds.map(id => parseInt(id)).filter(id => !isNaN(id));
      if (cleanIds.length === 0) return res.status(400).json({ message: 'Ongeldige IDs.' });
      
      await pool.request()
          .input('isPaid', sql.Bit, isPaid ? 1 : 0)
          .query(`UPDATE PF_transactions SET tob_paid = @isPaid WHERE id IN (${cleanIds.join(',')})`);
          
      res.status(200).json({ message: 'TOB status succesvol bijgewerkt.' });
  } catch (error) {
      console.error('Fout bij updaten TOB status:', error);
      res.status(500).json({ message: 'Serverfout bij updaten TOB status.' });
  }
};

const getPortfolioReturnsDynamics = async (req, res) => {
    try {
        const { userId, period, customStartDate, customEndDate, currency, periodGrouping = 'monthly' } = req.query;

        const { startDate, endDate } = parseDateRange(period, customStartDate, customEndDate);
        const isEur = currency === 'EUR';

        const pool = await sql.connect(config);

        // Fetch all data needed in one go
        const transactionsResult = await pool.request()
            .input('userId', sql.Int, userId)
            .input('endDate', sql.Date, endDate)
            .query(`
                SELECT purchase_time, transaction_type, quantity, price, fees, taxes, currency
                FROM PF_transactions
                WHERE user_id = @userId AND purchase_time <= @endDate;
            `);
        
        const valuesResult = await pool.request()
            .input('userId', sql.Int, userId)
            .input('endDate', sql.Date, endDate)
            .query(`
                SELECT date, total_value
                FROM DailyPortfolioValue
                WHERE user_id = @userId AND date <= @endDate
                ORDER BY date ASC;
            `);

        const exchangeRatesResult = await pool.request().query("SELECT date, rate FROM DailyExchangeRates WHERE currency_pair = 'EURUSD' ORDER BY date ASC");

        const transactions = transactionsResult.recordset;
        const dailyValues = valuesResult.recordset;
        const exchangeRates = exchangeRatesResult.recordset;

        if (dailyValues.length === 0) {
            return res.status(200).json([]);
        }

        // Create fast lookup maps
        const valueMap = new Map(dailyValues.map(v => [new Date(v.date).toISOString().split('T')[0], v.total_value]));
        const rateMap = new Map(exchangeRates.map(r => [new Date(r.date).toISOString().split('T')[0], r.rate]));

        const memoizedRates = {};
        const getRateOnDate = (date) => {
            const dateStr = date.toISOString().split('T')[0];
            if (memoizedRates[dateStr]) return memoizedRates[dateStr];
            if (rateMap.has(dateStr)) {
                memoizedRates[dateStr] = rateMap.get(dateStr);
                return memoizedRates[dateStr];
            }
            const closest = exchangeRates.filter(r => new Date(r.date) <= date).pop();
            memoizedRates[dateStr] = closest ? closest.rate : 1;
            return memoizedRates[dateStr];
        };

        const memoizedValues = {};
        const getValueOnDate = (date) => {
            const dateStr = date.toISOString().split('T')[0];
            if (memoizedValues[dateStr]) return memoizedValues[dateStr];

            let value = 0;
            if (valueMap.has(dateStr)) {
                value = valueMap.get(dateStr);
            } else {
                const closest = dailyValues.filter(v => new Date(v.date) <= date).pop();
                value = closest ? closest.total_value : 0;
            }

            if (isEur) {
                const rate = getRateOnDate(date);
                memoizedValues[dateStr] = value / (rate || 1);
                return memoizedValues[dateStr];
            }
            memoizedValues[dateStr] = value;
            return value;
        };

        // Generate period buckets
        const buckets = [];
        
        let actualStartDate = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
        if (transactions.length > 0) {
            const earliestTxDate = new Date(Math.min(...transactions.map(t => new Date(t.purchase_time).getTime())));
            if (earliestTxDate > startDate) {
                actualStartDate = new Date(earliestTxDate);
                actualStartDate.setHours(0, 0, 0, 0);
                actualStartDate = new Date(Date.UTC(actualStartDate.getFullYear(), actualStartDate.getMonth(), actualStartDate.getDate()));
            }
        }

        let cursorDate = new Date(actualStartDate);
        const endUtc = new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59));

        while(cursorDate <= endUtc) {
            const year = cursorDate.getUTCFullYear();
            const month = cursorDate.getUTCMonth();
            const quarter = Math.floor(month / 3);

            let bucketStartDate, bucketEndDate, bucketLabel;

            switch(periodGrouping) {
                case 'annually':
                    bucketStartDate = new Date(Date.UTC(year, 0, 1));
                    bucketEndDate = new Date(Date.UTC(year, 11, 31));
                    bucketLabel = `${year}`;
                    cursorDate = new Date(Date.UTC(year + 1, 0, 1));
                    break;
                case 'quarterly':
                    bucketStartDate = new Date(Date.UTC(year, quarter * 3, 1));
                    bucketEndDate = new Date(Date.UTC(year, quarter * 3 + 3, 0));
                    bucketLabel = `${year}-Q${quarter + 1}`;
                    cursorDate = new Date(Date.UTC(year, quarter * 3 + 3, 1));
                    break;
                case 'weekly':
                    const day = cursorDate.getUTCDay();
                    const diff = cursorDate.getUTCDate() - day + (day === 0 ? -6 : 1);
                    bucketStartDate = new Date(cursorDate);
                    bucketStartDate.setUTCDate(diff);
                    bucketEndDate = new Date(bucketStartDate);
                    bucketEndDate.setUTCDate(bucketStartDate.getUTCDate() + 6);
                    bucketLabel = bucketStartDate.toISOString().split('T')[0];
                    cursorDate = new Date(bucketEndDate);
                    cursorDate.setUTCDate(cursorDate.getUTCDate() + 1);
                    break;
                default: // monthly
                    bucketStartDate = new Date(Date.UTC(year, month, 1));
                    bucketEndDate = new Date(Date.UTC(year, month + 1, 0));
                    bucketLabel = `${year}-${String(month + 1).padStart(2, '0')}`;
                    cursorDate = new Date(Date.UTC(year, month + 1, 1));
                    break;
            }
            
            if (bucketStartDate < actualStartDate) bucketStartDate = new Date(actualStartDate);
            if (bucketEndDate > endUtc) bucketEndDate = new Date(endUtc);
            if (bucketStartDate > bucketEndDate) continue;

            if (!buckets.find(b => b.label === bucketLabel)) {
                 buckets.push({ start: bucketStartDate, end: bucketEndDate, label: bucketLabel });
            }
        }

        const results = buckets.map(bucket => {
            const dayBeforeStart = new Date(bucket.start);
            dayBeforeStart.setUTCDate(dayBeforeStart.getUTCDate() - 1);

            const startValue = getValueOnDate(dayBeforeStart);
            const endValue = getValueOnDate(bucket.end);

            const netFlows = transactions.reduce((sum, t) => {
                const tDateStr = new Date(t.purchase_time).toISOString().split('T')[0];
                const startStr = bucket.start.toISOString().split('T')[0];
                const endStr = bucket.end.toISOString().split('T')[0];
                
                if (tDateStr >= startStr && tDateStr <= endStr) {
                    let flow = 0;
                    switch (t.transaction_type) {
                        case 'BUY': flow = ((t.quantity * t.price) + (t.fees || 0) + (t.taxes || 0)); break;
                        case 'SELL': flow = -((t.quantity * t.price) - (t.fees || 0) - (t.taxes || 0)); break;
                        case 'DIVIDEND': flow = -((t.quantity * t.price) - (t.taxes || 0)); break;
                        case 'DEPOSIT': 
                        case 'WITHDRAWAL': flow = 0; break;
                    }
                    
                    const rate = getRateOnDate(new Date(t.purchase_time));
                    if (isEur) {
                        if (t.currency !== 'EUR') {
                            flow = flow / (rate || 1);
                        }
                    } else {
                        if (t.currency === 'EUR') {
                            flow = flow * (rate || 1);
                        }
                    }
                    return sum + flow;
                }
                return sum;
            }, 0);

            const dividendsReceived = transactions.reduce((sum, t) => {
                const tDateStr = new Date(t.purchase_time).toISOString().split('T')[0];
                const startStr = bucket.start.toISOString().split('T')[0];
                const endStr = bucket.end.toISOString().split('T')[0];
                
                if (tDateStr >= startStr && tDateStr <= endStr && t.transaction_type === 'DIVIDEND') {
                    let flow = (t.quantity * t.price) - (t.taxes || 0);
                    const rate = getRateOnDate(new Date(t.purchase_time));
                    if (isEur) {
                        if (t.currency !== 'EUR') flow = flow / (rate || 1);
                    } else {
                        if (t.currency === 'EUR') flow = flow * (rate || 1);
                    }
                    return sum + flow;
                }
                return sum;
            }, 0);

            const taxes = transactions.reduce((sum, t) => {
                const tDateStr = new Date(t.purchase_time).toISOString().split('T')[0];
                const startStr = bucket.start.toISOString().split('T')[0];
                const endStr = bucket.end.toISOString().split('T')[0];
                
                if (tDateStr >= startStr && tDateStr <= endStr) {
                    let tax = (t.taxes || 0) + (t.fees || 0);
                    const rate = getRateOnDate(new Date(t.purchase_time));
                    if (isEur) {
                        if (t.currency !== 'EUR') tax = tax / (rate || 1);
                    } else {
                        if (t.currency === 'EUR') tax = tax * (rate || 1);
                    }
                    return sum + tax;
                }
                return sum;
            }, 0);

            const returnValue = endValue - startValue - netFlows;
            const capitalGain = returnValue - dividendsReceived;
            
            // Gebruik de 'Modified Dietz' benadering voor het percentage
            const averageCapital = startValue + (netFlows / 2);
            let returnPercent = 0;
            if (Math.abs(averageCapital) > 0.01) {
                returnPercent = (returnValue / averageCapital) * 100;
            }

            return { 
                period: bucket.label, 
                returnValue, 
                returnPercent, 
                irr: returnPercent, 
                capitalGain, 
                dividendsReceived, 
                taxes 
            };
        });

        res.status(200).json(results);

    } catch (error) {
        console.error("Error fetching portfolio returns dynamics:", error);
        res.status(500).json({ message: "Server error fetching portfolio returns dynamics." });
    }
};

const forceUpdateExchangeRates = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    const write = (payload) => res.write(JSON.stringify(payload) + '\n');
    
    try {
        const pool = await sql.connect(config);
        write({ type: 'info', message: 'Ophalen van historische EUR/USD wisselkoersen via Profit.com (10 jaar)...' });
        
        let fxStartDate = new Date();
        fxStartDate.setFullYear(fxStartDate.getFullYear() - 10);
        const fxStartDateFormatted = fxStartDate.toISOString().split("T")[0];
        const todayFormatted = new Date().toISOString().split("T")[0];

        const apiKey = process.env.PROFIT_COM_API_KEY;
        const fxUrl = `https://api.profit.com/data-api/market-data/historical/daily/EURUSD.FOREX?start_date=${fxStartDateFormatted}&end_date=${todayFormatted}&token=${apiKey}`;

        const fxResponse = await fetch(fxUrl);
        if (fxResponse.ok) {
            const fxData = await fxResponse.json();
            if (fxData && fxData.length > 0) {
                let insertedFx = 0;
                for (const [index, record] of fxData.entries()) {
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
                    insertedFx++;
                    
                    if (insertedFx % 100 === 0 || index === fxData.length - 1) {
                         write({ type: 'progress', message: `Bezig met opslaan... (${insertedFx}/${fxData.length})`, progress: ((insertedFx/fxData.length)*100).toFixed(0) });
                    }
                }
                write({ type: 'complete', message: `EUR/USD wisselkoersen succesvol bijgewerkt (${insertedFx} records).` });
            } else {
                write({ type: 'warn', message: 'Profit.com gaf geen data terug.' });
            }
        } else {
            write({ type: 'error', message: `Profit.com FX API error: ${fxResponse.statusText}` });
        }
        res.end();
    } catch (error) {
        console.error(error);
        write({ type: 'error', message: `Fout: ${error.message}` });
        res.end();
    }
};

const applyStockSplit = async (req, res) => {
    const { stockId, splitDate, splitRatio } = req.body;
    
    if (!stockId || !splitDate || !splitRatio || isNaN(parseFloat(splitRatio))) {
        return res.status(400).json({ message: 'Missing required parameters.' });
    }

    try {
        const pool = await sql.connect(config);
        
        // 1. Controleer of deze specifieke split al eens is toegepast
        const checkResult = await pool.request()
            .input('stockId', sql.Int, stockId)
            .input('splitDate', sql.Date, new Date(splitDate))
            .query(`SELECT id FROM PF_StockSplits WHERE aandeel_id = @stockId AND CAST(split_date AS DATE) = CAST(@splitDate AS DATE)`);
            
        if (checkResult.recordset.length > 0) {
            return res.status(409).json({ message: 'Deze stock split is al eerder toegepast voor deze datum. Om dubbele eenheden te voorkomen is deze actie geblokkeerd.' });
        }

        // 2. Pas de split toe op de transacties
        const result = await pool.request()
            .input('stockId', sql.Int, stockId)
            .input('splitDate', sql.Date, new Date(splitDate))
            .input('splitRatio', sql.Decimal(18, 6), parseFloat(splitRatio))
            .query(`
                UPDATE PF_transactions
                SET quantity = quantity * @splitRatio,
                    price = price / @splitRatio
                WHERE aandeel_id = @stockId 
                  AND CAST(purchase_time AS DATE) < @splitDate
                  AND transaction_type IN ('BUY', 'SELL', 'DIVIDEND')
            `);

        // 3. Sla op in het logboek dat deze split is uitgevoerd
        await pool.request()
            .input('stockId', sql.Int, stockId)
            .input('splitDate', sql.Date, new Date(splitDate))
            .input('splitRatio', sql.Decimal(18, 6), parseFloat(splitRatio))
            .query(`INSERT INTO PF_StockSplits (aandeel_id, split_date, split_ratio) VALUES (@stockId, @splitDate, @splitRatio)`);

        res.status(200).json({ message: `Stock split toegepast. ${result.rowsAffected[0]} transacties bijgewerkt.` });
    } catch (error) {
        console.error('Error applying stock split:', error);
        res.status(500).json({ message: 'Server error applying stock split.' });
    }
};

const getBenchmarkHistory = async (req, res) => {
    try {
        const userId = 1; // Haal dit uit sessie/JWT of default
        const { ticker = 'SPY', displayCurrency = 'USD' } = req.query;

        const pool = await sql.connect(config);

        // 1. Haal de vroegste transactiedatum van de gebruiker op
        const firstTxResult = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`SELECT MIN(CAST(purchase_time AS DATE)) as first_date FROM PF_transactions WHERE user_id = @userId`);
        
        let firstDate = firstTxResult.recordset[0].first_date;
        if (!firstDate) {
            firstDate = new Date();
            firstDate.setFullYear(firstDate.getFullYear() - 1);
        } else {
            firstDate = new Date(firstDate);
        }

        // Neem een buffer van 5 dagen in het verleden
        firstDate.setDate(firstDate.getDate() - 5);
        const period1 = Math.floor(firstDate.getTime() / 1000);
        const period2 = Math.floor(Date.now() / 1000);

        // 2. Haal de koershistorie van de benchmark op via Yahoo Finance API
        const yahooTicker = ticker.toUpperCase().trim();
        const apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&period1=${period1}&period2=${period2}`;
        
        console.log(`[Benchmark] Ophalen van benchmark ${yahooTicker} via Yahoo: ${apiUrl}`);
        
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const chartData = response.data?.chart?.result?.[0];
        if (!chartData) {
            return res.status(404).json({ message: `Geen koersdata gevonden voor benchmark ${yahooTicker}` });
        }

        const timestamps = chartData.timestamp || [];
        const closes = chartData.indicators?.quote?.[0]?.close || [];

        const benchmarkPrices = {};
        timestamps.forEach((ts, idx) => {
            const dateStr = new Date(ts * 1000).toISOString().split('T')[0];
            const price = closes[idx];
            if (price != null) {
                benchmarkPrices[dateStr] = price;
            }
        });

        // 3. Haal alle BUY & SELL transacties van de gebruiker op
        const txResult = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT CAST(purchase_time AS DATE) as date, transaction_type, quantity, price, currency
                FROM PF_transactions
                WHERE user_id = @userId AND transaction_type IN ('BUY', 'SELL')
                ORDER BY purchase_time ASC
            `);
        const transactions = txResult.recordset;

        // Wisselkoersen inladen voor EUR/USD conversie
        const fxResult = await pool.request().query(`
            SELECT CAST(date AS DATE) as date, rate
            FROM DailyExchangeRates
            WHERE currency_pair = 'EURUSD'
        `);
        const fxMap = {};
        fxResult.recordset.forEach(r => {
            const dateStr = new Date(r.date).toISOString().split('T')[0];
            fxMap[dateStr] = parseFloat(r.rate);
        });

        const getExchangeRateForDate = (dateStr) => {
            let curr = new Date(dateStr);
            for (let i = 0; i < 30; i++) {
                const checkStr = curr.toISOString().split('T')[0];
                if (fxMap[checkStr]) return fxMap[checkStr];
                curr.setDate(curr.getDate() - 1);
            }
            return 1.1; // Default fallback
        };

        // 4. Bouw de dagelijkse tijdlijn op op basis van de datums uit DailyPortfolioValue
        const valDatesResult = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT CAST(date AS DATE) as date
                FROM DailyPortfolioValue
                WHERE user_id = @userId
                ORDER BY date ASC
            `);
        
        const timelineDates = valDatesResult.recordset.map(r => new Date(r.date).toISOString().split('T')[0]);

        if (timelineDates.length === 0) {
            return res.json([]);
        }

        const sortedBenchmarkDates = Object.keys(benchmarkPrices).sort();
        const getBenchmarkPriceForDate = (dateStr) => {
            if (benchmarkPrices[dateStr]) return benchmarkPrices[dateStr];
            let lastPrice = 1.0;
            for (let i = 0; i < sortedBenchmarkDates.length; i++) {
                const bDate = sortedBenchmarkDates[i];
                if (bDate > dateStr) break;
                lastPrice = benchmarkPrices[bDate];
            }
            return lastPrice;
        };

        let simulatedShares = 0;
        let simulatedCostBasis = 0;
        const resultTimeline = [];

        timelineDates.forEach(dateStr => {
            const rate = getExchangeRateForDate(dateStr);
            const benchmarkPrice = getBenchmarkPriceForDate(dateStr);

            // Verwerk de transacties die op of voor deze dag hebben plaatsgevonden
            const dayTxs = transactions.filter(t => new Date(t.date).toISOString().split('T')[0] === dateStr);
            dayTxs.forEach(t => {
                let cashValue = t.quantity * t.price;
                
                // Converteer transactiebedrag naar USD (waarin de benchmarks SPY, QQQ genoteerd staan)
                if (t.currency === 'EUR') {
                    cashValue = cashValue * rate;
                }

                if (t.transaction_type === 'BUY') {
                    simulatedShares += cashValue / benchmarkPrice;
                    simulatedCostBasis += cashValue;
                } else if (t.transaction_type === 'SELL') {
                    const fractionSold = simulatedShares > 0 ? (cashValue / benchmarkPrice) / simulatedShares : 0;
                    simulatedShares -= cashValue / benchmarkPrice;
                    simulatedCostBasis -= simulatedCostBasis * fractionSold;
                }
            });

            if (simulatedShares < 0) {
                simulatedShares = 0;
                simulatedCostBasis = 0;
            }

            let simulatedValue = simulatedShares * benchmarkPrice;
            let displayCostBasis = simulatedCostBasis;

            // Omrekenen naar display valuta van de gebruiker (EUR of USD)
            if (displayCurrency === 'EUR') {
                simulatedValue = simulatedValue / rate;
                displayCostBasis = displayCostBasis / rate;
            }

            resultTimeline.push({
                date: dateStr,
                value: parseFloat(simulatedValue.toFixed(2)),
                costBasis: parseFloat(displayCostBasis.toFixed(2)),
                rawPrice: parseFloat(benchmarkPrice.toFixed(2))
            });
        });

        res.json(resultTimeline);

    } catch (err) {
        console.error('Fout bij ophalen benchmark geschiedenis:', err);
        res.status(500).json({ message: 'Serverfout bij ophalen benchmark geschiedenis' });
    }
};

/**
 * Genereert de Strategie Assistent data en concrete signalen voor het huidige portfolio van de gebruiker.
 * Vergelijkt huidige posities met de optimale Super-Kwaliteit strategie (Score 5, intrinsieke waardering <= 1.3x, 200 SMA, lage schuld).
 */
const getStrategyAdvisorData = async (req, res) => {
    try {
        const userId = req.query.userId || 1;
        const currency = req.query.currency || 'EUR';
        const maxPriceToIntrinsic = parseFloat(req.query.maxPriceToIntrinsic || 1.3);
        const takeProfitRatio = parseFloat(req.query.takeProfitRatio || 2.0);
        const maxDebtRatio = parseFloat(req.query.maxDebtRatio || 1.0);
        const isEur = currency === 'EUR';

        const pool = await sql.connect(config);

        // 1. Haal wisselkoers op
        const fxResult = await pool.request().query(`
            SELECT TOP 1 rate, date 
            FROM DailyExchangeRates 
            WHERE currency_pair = 'EURUSD'
            ORDER BY date DESC
        `);
        const latestFxRate = (fxResult.recordset.length > 0 && fxResult.recordset[0].rate > 0) 
            ? fxResult.recordset[0].rate 
            : 1.08;

        // 2. Haal alle huidige actieve posities van de gebruiker op
        const holdingsQuery = `
            WITH UserHoldings AS (
                SELECT
                    t.aandeel_id,
                    SUM(CASE WHEN t.transaction_type = 'BUY' THEN t.quantity WHEN t.transaction_type = 'SELL' THEN -t.quantity ELSE 0 END) AS total_quantity,
                    SUM(CASE WHEN t.transaction_type = 'BUY' THEN (t.quantity * t.price) WHEN t.transaction_type = 'SELL' THEN -(t.quantity * t.price) ELSE 0 END) AS total_invested
                FROM PF_transactions t
                WHERE t.user_id = @userId
                GROUP BY t.aandeel_id
                HAVING SUM(CASE WHEN t.transaction_type = 'BUY' THEN t.quantity WHEN t.transaction_type = 'SELL' THEN -t.quantity ELSE 0 END) > 0.0001
            ),
            LatestPrices AS (
                SELECT aandeel_id, closing_price, date,
                       ROW_NUMBER() OVER(PARTITION BY aandeel_id ORDER BY date DESC) as rn
                FROM DailyClosingPrices
            ),
            LatestTxPrices AS (
                SELECT aandeel_id, price,
                       ROW_NUMBER() OVER(PARTITION BY aandeel_id ORDER BY purchase_time DESC) as rn
                FROM PF_transactions
                WHERE user_id = @userId
            )
            SELECT
                h.aandeel_id,
                s.ticker_symbol AS ticker,
                s.name,
                ISNULL(at.type_name, 'Aandeel') AS asset_type,
                s.asset_type_id,
                h.total_quantity AS quantity,
                (h.total_invested / NULLIF(h.total_quantity, 0)) AS avg_buy_price_raw,
                COALESCE(p.closing_price, ltp.price, 0) AS current_price_raw,
                p.date AS last_price_date
            FROM UserHoldings h
            JOIN Stocks s ON h.aandeel_id = s.aandeel_id
            LEFT JOIN AssetTypes at ON s.asset_type_id = at.asset_type_id
            LEFT JOIN LatestPrices p ON h.aandeel_id = p.aandeel_id AND p.rn = 1
            LEFT JOIN LatestTxPrices ltp ON h.aandeel_id = ltp.aandeel_id AND ltp.rn = 1;
        `;

        const holdingsResult = await pool.request()
            .input('userId', sql.Int, userId)
            .query(holdingsQuery);
        
        const rawHoldings = holdingsResult.recordset;

        // 3. Haal alle individuele kwaliteitsaandelen op (voor analyse holdings én ontdekken nieuwe top-aankoopkandidaten)
        const stocksQuery = `
            WITH RankedCalculations AS (
                SELECT 
                    sc.stock_id,
                    sc.waarde_verdeling,
                    sc.intrinsieke_waarde,
                    sc.selectiecriteria,
                    sc.waardefactor_LTD_equity,
                    sc.ltd_equity_mean,
                    sc.period_end_date,
                    ROW_NUMBER() OVER(PARTITION BY sc.stock_id ORDER BY sc.period_end_date DESC) as rn
                FROM stock_calculations sc
            ),
            LatestStockPrices AS (
                SELECT aandeel_id, closing_price, date,
                       ROW_NUMBER() OVER(PARTITION BY aandeel_id ORDER BY date DESC) as rn
                FROM DailyClosingPrices
            )
            SELECT 
                s.aandeel_id,
                s.ticker_symbol AS ticker,
                s.name,
                ISNULL(at.type_name, 'Aandeel') AS asset_type,
                s.asset_type_id,
                rc.waarde_verdeling,
                rc_prev.waarde_verdeling AS prev_waarde_verdeling,
                rc.intrinsieke_waarde,
                rc.selectiecriteria,
                rc.waardefactor_LTD_equity,
                rc.ltd_equity_mean,
                rc.period_end_date,
                lp.closing_price AS current_price,
                lp.date AS last_price_date
            FROM Stocks s
            LEFT JOIN AssetTypes at ON s.asset_type_id = at.asset_type_id
            LEFT JOIN RankedCalculations rc ON s.aandeel_id = rc.stock_id AND rc.rn = 1
            LEFT JOIN RankedCalculations rc_prev ON s.aandeel_id = rc_prev.stock_id AND rc_prev.rn = 2
            LEFT JOIN LatestStockPrices lp ON s.aandeel_id = lp.aandeel_id AND lp.rn = 1
            WHERE s.asset_type_id = 1 OR s.asset_type_id IS NULL OR s.inWatchlist = 1 OR s.inIdealePortfolio = 1;
        `;

        const stocksResult = await pool.request().query(stocksQuery);
        const allStocks = stocksResult.recordset;

        // 4. Haal alle historische kwartaalberekeningen op voor trendgrafiekjes van Waardeverdeling
        const allCalcsResult = await pool.request().query(`
            SELECT stock_id, period_end_date, waarde_verdeling, selectiecriteria, intrinsieke_waarde
            FROM stock_calculations
            ORDER BY stock_id, period_end_date ASC;
        `);
        const calcsHistoryByStock = new Map();
        for (const row of allCalcsResult.recordset) {
            if (!calcsHistoryByStock.has(row.stock_id)) {
                calcsHistoryByStock.set(row.stock_id, []);
            }
            calcsHistoryByStock.get(row.stock_id).push({
                date: row.period_end_date instanceof Date ? row.period_end_date.toISOString().split('T')[0] : String(row.period_end_date).split('T')[0],
                waardeVerdeling: parseFloat(row.waarde_verdeling) || 0,
                score: row.selectiecriteria ?? 5,
                intrinsiekeWaarde: parseFloat(row.intrinsieke_waarde) || 0
            });
        }

        // 5. Haal historische slotkoersen op voor 200 SMA berekening
        const pricesQuery = `
            SELECT aandeel_id, closing_price, date
            FROM DailyClosingPrices
            ORDER BY aandeel_id, date ASC;
        `;
        const pricesResult = await pool.request().query(pricesQuery);
        const pricesByStock = new Map();
        for (const row of pricesResult.recordset) {
            if (!pricesByStock.has(row.aandeel_id)) {
                pricesByStock.set(row.aandeel_id, []);
            }
            pricesByStock.get(row.aandeel_id).push(row);
        }

        // Helper: bereken 200 SMA
        const calculateSma200 = (stockId) => {
            const history = pricesByStock.get(stockId) || [];
            if (history.length < 20) return null;
            const windowSize = Math.min(200, history.length);
            const slice = history.slice(-windowSize);
            const sum = slice.reduce((acc, p) => acc + (parseFloat(p.closing_price) || 0), 0);
            return sum / slice.length;
        };

        // Helper: bereken schuldgraad (LTD / Eigen Vermogen uit kwartaalberekeningen)
        const getStockDebtRatio = (stockDetails) => {
            if (!stockDetails) return 0;
            return stockDetails.ltd_equity_mean ?? stockDetails.waardefactor_LTD_equity ?? 0;
        };

        // Helper: valutaconversie
        const toDisplayCurrency = (val, ticker, assetType) => {
            if (val === null || val === undefined || isNaN(val)) return 0;
            const isEurStock = (ticker && (ticker.endsWith('.DE') || ticker.endsWith('.AS') || ticker.endsWith('.BR'))) || assetType === 'ETF';
            if (isEur) {
                return isEurStock ? val : val / latestFxRate;
            } else {
                return isEurStock ? val * latestFxRate : val;
            }
        };

        // 6. Verwerk de huidige holdings van de gebruiker
        let totalPortfolioValue = 0;
        let totalPortfolioCost = 0;
        const evaluatedHoldings = [];

        for (const h of rawHoldings) {
            const currentPriceConverted = toDisplayCurrency(h.current_price_raw, h.ticker, h.asset_type);
            const avgBuyPriceConverted = toDisplayCurrency(h.avg_buy_price_raw, h.ticker, h.asset_type);
            const holdingValue = h.quantity * currentPriceConverted;
            const holdingCost = h.quantity * avgBuyPriceConverted;

            totalPortfolioValue += holdingValue;
            totalPortfolioCost += holdingCost;

            const stockDetails = allStocks.find(s => s.aandeel_id === h.aandeel_id);
            const sma200Raw = calculateSma200(h.aandeel_id);
            const sma200 = sma200Raw !== null ? toDisplayCurrency(sma200Raw, h.ticker, h.asset_type) : null;
            const debtRatio = getStockDebtRatio(stockDetails);

            const intrinsicValueRaw = stockDetails?.intrinsieke_waarde || null;
            const intrinsicValue = intrinsicValueRaw !== null ? toDisplayCurrency(intrinsicValueRaw, h.ticker, h.asset_type) : null;
            const priceToIntrinsicRatio = (intrinsicValue && intrinsicValue > 0) ? (currentPriceConverted / intrinsicValue) : null;
            const score = stockDetails?.selectiecriteria ?? 5;
            const waardeVerdeling = stockDetails?.waarde_verdeling || 0;
            const prevWaardeVerdeling = stockDetails?.prev_waarde_verdeling ?? null;
            const isWvDropping = (score === 5 && prevWaardeVerdeling !== null && waardeVerdeling < prevWaardeVerdeling && prevWaardeVerdeling > 0);
            const wvDropFraction = isWvDropping ? Math.min(1, Math.max(0, (prevWaardeVerdeling - waardeVerdeling) / prevWaardeVerdeling)) : 0;
            const wvDropPct = wvDropFraction * 100;

            const isAbove200Sma = sma200 !== null ? (currentPriceConverted >= sma200) : true;
            const isLowDebt = debtRatio <= maxDebtRatio;

            // Bepaal het signaal
            let actionType = 'HOLD';
            let actionLabel = '🟡 Behouden';
            let actionSeverity = 'neutral';
            let actionReason = 'Positie voldoet aan kwaliteitsstandaarden en ligt netjes binnen de bandbreedte.';
            let isAligned = true;

            if (h.asset_type === 'ETF' || h.asset_type_id === 2) {
                actionType = 'ETF_INDEX';
                actionLabel = 'ℹ️ Index ETF';
                actionSeverity = 'info';
                actionReason = 'Brede index-tracker. Geen fundamentele DCF waardering; behoud als veilige kern of herinvesteer geleidelijk in Super-Kwaliteit.';
                isAligned = true;
            } else if (priceToIntrinsicRatio !== null && priceToIntrinsicRatio >= takeProfitRatio) {
                actionType = 'TAKE_PROFIT';
                actionLabel = '💰 Winstnemen';
                actionSeverity = 'warning';
                actionReason = `Koers (${priceToIntrinsicRatio.toFixed(2)}x intrinsiek) is fors overgewaardeerd (> ${takeProfitRatio}x). Behoud als sterke winnaar, of room af bij rotatie naar een nieuw ondergewaardeerd 5/5 aandeel.`;
                isAligned = true;
            } else if (score < 5) {
                actionType = 'TRIM_FUNDAMENTAL';
                actionLabel = '🔴 Afbouwen (Score < 5)';
                actionSeverity = 'danger';
                actionReason = `Score (${score}/5) voldoet niet meer aan de Super-Kwaliteit eisen. Sluit positie om kapitaal te beschermen.`;
                isAligned = false;
            } else if (isWvDropping && wvDropPct >= 2.0) {
                actionType = 'PARTIAL_TRIM_WV';
                actionLabel = `🔴 Deelverkoop (-${wvDropPct.toFixed(1)}%)`;
                actionSeverity = 'warning';
                actionReason = `Score is 5/5, maar de Waardeverdeling is gedaald van ${prevWaardeVerdeling.toFixed(1)}% naar ${waardeVerdeling.toFixed(1)}% (-${wvDropPct.toFixed(1)}%). Verkoop ${wvDropPct.toFixed(1)}% van deze positie conform de strategie.`;
                isAligned = false;
            } else if (!isAbove200Sma) {
                actionType = 'TRIM_DOWNTREND';
                actionLabel = '🔴 Afbouwen (Trendbreuk)';
                actionSeverity = 'danger';
                actionReason = `Koers is onder het 200-daags gemiddelde (${sma200 ? sma200.toFixed(2) : '-'}) gezakt. Beperk neerwaarts marktrisico bij rotatie.`;
                isAligned = false;
            } else if (score >= 5 && priceToIntrinsicRatio !== null && priceToIntrinsicRatio <= maxPriceToIntrinsic && isAbove200Sma && isLowDebt) {
                actionType = 'BUY_MORE';
                isAligned = true;
            }

            evaluatedHoldings.push({
                stockId: h.aandeel_id,
                ticker: h.ticker,
                name: h.name,
                assetType: h.asset_type,
                quantity: h.quantity,
                avgBuyPrice: avgBuyPriceConverted,
                currentPrice: currentPriceConverted,
                holdingValue,
                holdingCost,
                profit: holdingValue - holdingCost,
                profitPct: holdingCost > 0 ? ((holdingValue - holdingCost) / holdingCost) * 100 : 0,
                intrinsicValue,
                priceToIntrinsicRatio,
                sma200,
                isAbove200Sma,
                debtRatio,
                isLowDebt,
                score,
                waardeVerdeling,
                prevWaardeVerdeling,
                wvDiff: prevWaardeVerdeling !== null ? parseFloat((waardeVerdeling - prevWaardeVerdeling).toFixed(2)) : 0,
                wvDiffPct: (prevWaardeVerdeling !== null && prevWaardeVerdeling > 0) ? parseFloat((((waardeVerdeling - prevWaardeVerdeling) / prevWaardeVerdeling) * 100).toFixed(1)) : 0,
                isWvDropping,
                wvHistory: (calcsHistoryByStock.get(h.aandeel_id) || []).slice(-8),
                wvDropFraction,
                wvDropPct,
                periodEndDate: stockDetails?.period_end_date ? (stockDetails.period_end_date instanceof Date ? stockDetails.period_end_date.toISOString().split('T')[0] : String(stockDetails.period_end_date).split('T')[0]) : null,
                actionType,
                actionLabel,
                actionSeverity,
                actionReason,
                isAligned
            });
        }

        // Voeg gewichten toe aan holdings
        evaluatedHoldings.forEach(h => {
            h.weightPct = totalPortfolioValue > 0 ? (h.holdingValue / totalPortfolioValue) * 100 : 0;
        });

        // 7. Zoek alle Top Aankoopkandidaten van Vandaag uit het hele universum
        const topBuyCandidates = [];
        for (const s of allStocks) {
            // Uitsluitend echte bedrijven (geen ETF's) met een geldige koers
            if (s.asset_type === 'ETF' || s.asset_type_id === 2 || !s.current_price || s.current_price <= 0) continue;

            const currentPriceConverted = toDisplayCurrency(s.current_price, s.ticker, s.asset_type);
            const intrinsicValueRaw = s.intrinsieke_waarde;
            if (!intrinsicValueRaw || intrinsicValueRaw <= 0) continue;

            const intrinsicValueConverted = toDisplayCurrency(intrinsicValueRaw, s.ticker, s.asset_type);
            const priceToIntrinsicRatio = currentPriceConverted / intrinsicValueConverted;
            const sma200Raw = calculateSma200(s.aandeel_id);
            const sma200 = sma200Raw !== null ? toDisplayCurrency(sma200Raw, s.ticker, s.asset_type) : null;
            const isAbove200Sma = sma200 !== null ? (currentPriceConverted >= sma200) : true;
            const debtRatio = getStockDebtRatio(s);
            const isLowDebt = debtRatio <= maxDebtRatio;
            const score = s.selectiecriteria ?? 5;
            const waardeVerdeling = s.waarde_verdeling || 0;

            // Kwaliteitscriteria voor Top Aankoop:
            // Uitsluitend Super-Kwaliteit (Score 5/5), niet overgewaardeerd (<= 1.3x intrinsiek), koers > 200 SMA, lage schuldgraad en stijgende/stabiele waardeverdeling
            const isWvDroppingStock = (s.prev_waarde_verdeling !== null && s.waarde_verdeling < s.prev_waarde_verdeling);
            if (score === 5 && priceToIntrinsicRatio <= maxPriceToIntrinsic && isAbove200Sma && isLowDebt && !isWvDroppingStock) {
                const existingHolding = evaluatedHoldings.find(h => h.stockId === s.aandeel_id);
                topBuyCandidates.push({
                    stockId: s.aandeel_id,
                    ticker: s.ticker,
                    name: s.name,
                    score,
                    waardeVerdeling,
                    prevWaardeVerdeling: s.prev_waarde_verdeling ?? null,
                    wvDiff: s.prev_waarde_verdeling !== null ? parseFloat((waardeVerdeling - s.prev_waarde_verdeling).toFixed(2)) : 0,
                    wvDiffPct: (s.prev_waarde_verdeling !== null && s.prev_waarde_verdeling > 0) ? parseFloat((((waardeVerdeling - s.prev_waarde_verdeling) / s.prev_waarde_verdeling) * 100).toFixed(1)) : 0,
                    wvHistory: (calcsHistoryByStock.get(s.aandeel_id) || []).slice(-8),
                    currentPrice: currentPriceConverted,
                    intrinsicValue: intrinsicValueConverted,
                    priceToIntrinsicRatio,
                    discountPct: ((intrinsicValueConverted - currentPriceConverted) / intrinsicValueConverted) * 100,
                    sma200,
                    isAbove200Sma,
                    debtRatio,
                    currentlyOwned: !!existingHolding,
                    currentWeightPct: existingHolding ? existingHolding.weightPct : 0,
                    targetWeightPct: 10.0, // Doelallocatie ~10% per topspreiding
                    suggestedAction: existingHolding ? 'Positie verder uitbreiden' : 'Nieuwe toppositie openen'
                });
            }
        }

        // Sorteer koopkandidaten op Score (5 eerst) en daarna op de grootste korting op intrinsieke waarde
        topBuyCandidates.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.priceToIntrinsicRatio - b.priceToIntrinsicRatio;
        });

        // 8. Bereken het Ideale Portfolio (Uitsluitend Super-Kwaliteit aandelen met Score 5/5)
        // Selecteer alle kwaliteitsaandelen uit het universum met Score 5/5
        const idealUniverse = allStocks
            .filter(s => s.asset_type !== 'ETF' && s.asset_type_id !== 2 && s.current_price > 0 && s.intrinsieke_waarde > 0)
            .map(s => {
                const curPrice = toDisplayCurrency(s.current_price, s.ticker, s.asset_type);
                const intVal = toDisplayCurrency(s.intrinsieke_waarde, s.ticker, s.asset_type);
                const ratio = curPrice / intVal;
                const sma = calculateSma200(s.aandeel_id);
                const debt = getStockDebtRatio(s);
                const score = s.selectiecriteria ?? 5;
                const wv = s.waarde_verdeling || 0;
                return {
                    stockId: s.aandeel_id,
                    ticker: s.ticker,
                    name: s.name,
                    score,
                    waardeVerdeling: wv,
                    currentPrice: curPrice,
                    intrinsicValue: intVal,
                    priceToIntrinsicRatio: ratio,
                    discountPct: ((intVal - curPrice) / intVal) * 100,
                    isAbove200Sma: sma !== null ? (curPrice >= toDisplayCurrency(sma, s.ticker, s.asset_type)) : true,
                    debtRatio: debt
                };
            })
            .filter(s => s.score === 5)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return b.waardeVerdeling - a.waardeVerdeling;
            });

        // 8. Bereken het Ideale Portfolio (Alle Super-Kwaliteit aandelen die aan de criteria voldoen)
        // Gewogen op basis van de relatieve Waardeverdeling (waarde_verdeling) van de geselecteerde aandelen
        const topIdealStocks = idealUniverse;
        const totalIdealWaardeverdeling = topIdealStocks.reduce((sum, s) => sum + (parseFloat(s.waardeVerdeling) > 0 ? parseFloat(s.waardeVerdeling) : 1), 0);
        
        const idealPortfolio = topIdealStocks.map(s => {
            const stockWv = (parseFloat(s.waardeVerdeling) > 0 ? parseFloat(s.waardeVerdeling) : 1);
            // Proportioneel gewicht naar relatieve Waardeverdeling
            const targetWeightPct = totalIdealWaardeverdeling > 0 
                ? ((stockWv / totalIdealWaardeverdeling) * 100) 
                : (100 / topIdealStocks.length);

            const targetValueEur = totalPortfolioValue > 0 ? (totalPortfolioValue * (targetWeightPct / 100)) : 1000;
            const targetShares = s.currentPrice > 0 ? (targetValueEur / s.currentPrice) : 0;
            const currentHolding = evaluatedHoldings.find(h => h.stockId === s.stockId);
            const currentWeightPct = currentHolding ? currentHolding.weightPct : 0;
            const currentValueEur = currentHolding ? currentHolding.holdingValue : 0;
            const currentShares = currentHolding ? currentHolding.quantity : 0;

            const stockDetails = allStocks.find(st => st.aandeel_id === s.stockId);
            const prevWv = stockDetails?.prev_waarde_verdeling ?? null;
            const wvDiff = prevWv !== null ? parseFloat((s.waardeVerdeling - prevWv).toFixed(2)) : 0;
            const wvDiffPct = (prevWv !== null && prevWv > 0) ? parseFloat((((s.waardeVerdeling - prevWv) / prevWv) * 100).toFixed(1)) : 0;

            return {
                stockId: s.stockId,
                ticker: s.ticker,
                name: s.name,
                score: s.score,
                currentPrice: s.currentPrice,
                intrinsicValue: s.intrinsicValue,
                discountPct: s.discountPct,
                priceToIntrinsicRatio: s.priceToIntrinsicRatio,
                targetWeightPct: parseFloat(targetWeightPct.toFixed(1)),
                targetValueEur: parseFloat(targetValueEur.toFixed(2)),
                targetShares: parseFloat(targetShares.toFixed(2)),
                currentWeightPct: parseFloat(currentWeightPct.toFixed(1)),
                currentValueEur: parseFloat(currentValueEur.toFixed(2)),
                currentShares: parseFloat(currentShares.toFixed(2)),
                diffValueEur: parseFloat((targetValueEur - currentValueEur).toFixed(2)),
                diffShares: parseFloat((targetShares - currentShares).toFixed(2)),
                waardeVerdeling: s.waardeVerdeling,
                prevWaardeVerdeling: prevWv,
                wvDiff,
                wvDiffPct,
                isWvDropping: prevWv !== null && s.waardeVerdeling < prevWv,
                wvHistory: (calcsHistoryByStock.get(s.stockId) || []).slice(-8)
            };
        });

        // Helper: formatteer euro
        const formatEur = (v) => '€ ' + (v || 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // 9. Exact Actieplan met concrete Bedragen (€), Stuks en Timing-triggers
        const exactActions = [];

        // Actie A: Winstnemen (Wanneer koers > 2.0x intrinsiek)
        const takeProfitHoldings = evaluatedHoldings.filter(h => h.actionType === 'TAKE_PROFIT');
        takeProfitHoldings.forEach(h => {
            // Room 50% af als koers tussen 2.0x en 2.5x is, 100% als > 2.5x
            const sellRatio = (h.priceToIntrinsicRatio >= 2.5) ? 1.0 : 0.5;
            const sellAmountEur = h.holdingValue * sellRatio;
            const sellShares = h.quantity * sellRatio;

            exactActions.push({
                type: 'TAKE_PROFIT',
                badge: '💰 Winstnemen',
                ticker: h.ticker,
                name: h.name,
                actionVerb: sellRatio === 1.0 ? 'Volledig Verkopen (100%)' : 'Winst Afromen (50%)',
                amountEur: parseFloat(sellAmountEur.toFixed(2)),
                shares: parseFloat(sellShares.toFixed(2)),
                currentPrice: h.currentPrice,
                currentWeightPct: parseFloat(h.weightPct.toFixed(1)),
                timingTrigger: `Koers (${h.priceToIntrinsicRatio.toFixed(2)}x intrinsiek) is extreem overgewaardeerd. Voer order in bij de opening.`,
                rationale: `Stel ${formatEur(sellAmountEur)} veilig om direct te herbeleggen in 5/5 koopkansen.`
            });
        });

        // Actie B: Snoeien / Roteren (Alleen gekoppeld aan beschikbare koopkansen!)
        const trimHoldings = evaluatedHoldings.filter(h => h.actionType.startsWith('TRIM'));
        trimHoldings.forEach((h, idx) => {
            // Koppel aan een van de top koopkandidaten (Snoeien voor herinvestering)
            const targetBuy = topBuyCandidates[idx % Math.max(1, topBuyCandidates.length)];
            const sellAmountEur = h.holdingValue;
            const sellShares = h.quantity;
            const buyShares = targetBuy && targetBuy.currentPrice > 0 ? (sellAmountEur / targetBuy.currentPrice) : 0;

            exactActions.push({
                type: 'TRIM_ROTATE',
                badge: '🔄 Snoeien & Roteren',
                ticker: h.ticker,
                name: h.name,
                actionVerb: 'Sluiten & Herinvesteren',
                amountEur: parseFloat(sellAmountEur.toFixed(2)),
                shares: parseFloat(sellShares.toFixed(2)),
                currentPrice: h.currentPrice,
                currentWeightPct: parseFloat(h.weightPct.toFixed(1)),
                targetRotateTicker: targetBuy ? targetBuy.ticker : null,
                targetRotateShares: parseFloat(buyShares.toFixed(2)),
                timingTrigger: targetBuy 
                    ? `Snoei ${h.ticker} alleen om DIRECT ${targetBuy.ticker} aan te kopen (wacht op MACD koopsignaal / koers > 200 SMA van ${targetBuy.ticker}).`
                    : `Snoei ${h.ticker} wegens trendbreuk / zwakker kwartaalresultaat.`,
                rationale: targetBuy
                    ? `Verkoop ${parseFloat(sellShares.toFixed(2))} stuks ${h.ticker} (€${sellAmountEur.toFixed(0)}) en koop circa ${parseFloat(buyShares.toFixed(2))} stuks ${targetBuy.ticker} (Score 5/5, ${targetBuy.discountPct.toFixed(0)}% korting).`
                    : `Beperk risico op verzwakte positie.`
            });
        });

        // Actie C: Bijkopen / Uitbreiden van Top Kansen
        topBuyCandidates.slice(0, 4).forEach(c => {
            const idealHolding = idealPortfolio.find(i => i.ticker === c.ticker);
            const targetTotalValue = idealHolding ? idealHolding.targetValueEur : (totalPortfolioValue * 0.10);
            const currentOwnedValue = c.currentlyOwned ? (evaluatedHoldings.find(h => h.ticker === c.ticker)?.holdingValue || 0) : 0;
            const neededBuyAmountEur = Math.max(0, targetTotalValue - currentOwnedValue);
            const neededShares = c.currentPrice > 0 ? (neededBuyAmountEur / c.currentPrice) : 0;

            if (neededBuyAmountEur > 50) {
                exactActions.push({
                    type: 'BUY_TARGET',
                    badge: '🟢 Doel-Aankoop',
                    ticker: c.ticker,
                    name: c.name,
                    actionVerb: c.currentlyOwned ? 'Positie Bijkopen' : 'Nieuwe Positie Openen',
                    amountEur: parseFloat(neededBuyAmountEur.toFixed(2)),
                    shares: parseFloat(neededShares.toFixed(2)),
                    currentPrice: c.currentPrice,
                    currentWeightPct: parseFloat(c.currentWeightPct.toFixed(1)),
                    targetWeightPct: parseFloat((idealHolding?.targetWeightPct || 10).toFixed(1)),
                    timingTrigger: `MACD Instap: Koop zodra de MACD Histogram groen kleurt of bij markt-dip boven de 200 SMA.`,
                    rationale: `Score 5/5 met ${c.discountPct.toFixed(0)}% intrinsieke korting. Doelstreefbedrag: ${formatEur(targetTotalValue)} (${idealHolding?.targetWeightPct || 10}% van portefeuille conform Waardeverdeling).`
                });
            }
        });

        // 10. Data-Gedreven Meldingen Feed (MACD Alert triggers op exacte datum met Cash-Koppeling)
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
        const availableCashBalance = balanceResult.recordset[0]?.total || 0;

        // Haal alle historische transacties van de gebruiker op om per meldingsdatum de exacte positiegrootte te kennen
        const userTxQuery = `
            SELECT aandeel_id, transaction_type, quantity, price, purchase_time
            FROM PF_transactions
            WHERE user_id = @userId AND (transaction_type = 'BUY' OR transaction_type = 'SELL')
            ORDER BY purchase_time ASC;
        `;
        const userTxResult = await pool.request()
            .input('userId', sql.Int, userId)
            .query(userTxQuery);
        const allUserTx = userTxResult.recordset || [];

        // Haal tot 250 recente alerts op voor volledige historie (2024–2026)
        const recentAlertsQuery = `
            SELECT TOP 250 a.alert_id, a.aandeel_id, s.ticker_symbol, s.name, a.date, a.type_melding, 
                   a.prijs_op_moment, a.signal_line_value, a.trade_amount
            FROM [dbo].[MACDAlerts] a
            JOIN [dbo].[Stocks] s ON a.aandeel_id = s.aandeel_id
            WHERE (s.inIdealePortfolio = 1 OR s.inWatchlist = 1 OR a.aandeel_id IN (
                SELECT DISTINCT aandeel_id FROM PF_transactions
            ))
            ORDER BY a.date DESC, a.alert_id DESC
        `;
        const alertsDbRes = await pool.request().query(recentAlertsQuery);
        const rawAlerts = alertsDbRes.recordset || [];

        // Bereken de actuele vrije cash
        let availableCash = availableCashBalance;

        // Bouw concrete datagedreven meldingen
        const dataDrivenAlerts = [];
        const seenBuyTickers = new Set();
        
        // 1. KOOPSIGNALEN: MACD Koopsignalen tonen voor Super-Kwaliteit aandelen (Score 5/5) met duidelijke Waarderingsstatus
        rawAlerts
            .filter(a => a.type_melding === 'Koopsignaal')
            .forEach(rawAlert => {
                const ticker = rawAlert.ticker_symbol;
                const alertDateStr = new Date(rawAlert.date).toISOString().split('T')[0];
                const stockDetails = allStocks.find(s => s.ticker === ticker);
                const alertPriceRaw = rawAlert.prijs_op_moment || 0;
                const alertPrice = toDisplayCurrency(alertPriceRaw, ticker, stockDetails?.asset_type);
                
                const idealItem = idealPortfolio.find(i => i.ticker === ticker);
                
                // Moet een 5/5 Super-Kwaliteit aandeel zijn in het ideale portfolio
                if (!idealItem || idealItem.score !== 5) return;

                const isLatestAlertForStock = !seenBuyTickers.has(ticker);
                seenBuyTickers.add(ticker);

                const currentStockPrice = stockDetails?.current_price 
                    ? toDisplayCurrency(stockDetails.current_price, ticker, stockDetails?.asset_type) 
                    : alertPrice;
                const currentStockPriceDate = stockDetails?.last_price_date 
                    ? (stockDetails.last_price_date instanceof Date ? stockDetails.last_price_date.toISOString().split('T')[0] : String(stockDetails.last_price_date).split('T')[0]) 
                    : null;

                const priceDiffSinceAlertEur = currentStockPrice - alertPrice;
                const priceDiffSinceAlertPct = alertPrice > 0 ? ((currentStockPrice - alertPrice) / alertPrice) * 100 : 0;
                const isCheaperNow = currentStockPrice < alertPrice;

                // Bereken EXACT aantal stuks in bezit OP HET MOMENT VAN DEZE MELDING
                const alertDateEnd = new Date(rawAlert.date);
                alertDateEnd.setHours(23, 59, 59, 999);

                let sharesOwnedAtAlertDate = 0;
                for (const tx of allUserTx) {
                    if (tx.aandeel_id === rawAlert.aandeel_id) {
                        const txDate = new Date(tx.purchase_time);
                        if (txDate <= alertDateEnd) {
                            if (tx.transaction_type === 'BUY') {
                                sharesOwnedAtAlertDate += Number(tx.quantity) || 0;
                            } else if (tx.transaction_type === 'SELL') {
                                sharesOwnedAtAlertDate -= Number(tx.quantity) || 0;
                            }
                        }
                    }
                }
                if (sharesOwnedAtAlertDate < 0.0001) sharesOwnedAtAlertDate = 0;
                const currentOwnedEurAtAlertDate = sharesOwnedAtAlertDate * alertPrice;

                // Waarderingscheck: Koers tov Intrinsieke Waarde
                const intrinsicVal = idealItem.intrinsicValue;
                const priceToIntrinsic = (intrinsicVal && intrinsicVal > 0 && alertPrice > 0)
                    ? (alertPrice / intrinsicVal)
                    : idealItem.priceToIntrinsicRatio;

                const isOvervalued = priceToIntrinsic !== null && priceToIntrinsic > maxPriceToIntrinsic;

                // Trendcheck: Koers tov 200 SMA
                const sma200Raw = calculateSma200(rawAlert.aandeel_id);
                const sma200 = sma200Raw !== null ? toDisplayCurrency(sma200Raw, ticker, stockDetails?.asset_type) : null;
                const isBelowSma = sma200 !== null && alertPrice < sma200;

                // Waardeverdelingscheck
                const isWvDown = stockDetails && stockDetails.prev_waarde_verdeling !== null && stockDetails.waarde_verdeling < stockDetails.prev_waarde_verdeling;
                const wvDiff = stockDetails?.prev_waarde_verdeling !== null ? parseFloat(((stockDetails?.waarde_verdeling || 0) - stockDetails.prev_waarde_verdeling).toFixed(2)) : 0;
                const wvDiffPct = (stockDetails?.prev_waarde_verdeling !== null && stockDetails.prev_waarde_verdeling > 0) ? parseFloat(((((stockDetails?.waarde_verdeling || 0) - stockDetails.prev_waarde_verdeling) / stockDetails.prev_waarde_verdeling) * 100).toFixed(1)) : 0;

                // Bepaal badge en status
                let alertBadge = '🟢 Koopsignaal (MACD Golden Cross)';
                let alertSeverity = 'success';
                let alertWarning = null;

                if (isOvervalued) {
                    alertBadge = `⚠️ Koopsignaal (Overgewaardeerd ${priceToIntrinsic.toFixed(1)}x)`;
                    alertSeverity = 'warning';
                    alertWarning = `Aandeel noteert boven intrinsieke waarde (${priceToIntrinsic.toFixed(2)}x). In de backteststrategie wordt aankoop bij overwaardering afgeraden of defensief beperkt.`;
                } else if (isWvDown) {
                    alertBadge = '⚠️ Koopsignaal (Dalende Waardeverdeling)';
                    alertSeverity = 'warning';
                    alertWarning = `Waardeverdeling is recent gedaald van ${stockDetails.prev_waarde_verdeling.toFixed(1)}% naar ${(stockDetails.waarde_verdeling || 0).toFixed(1)}% (${wvDiffPct.toFixed(1)}%). Strategie adviseert terughoudendheid.`;
                } else if (isBelowSma) {
                    alertBadge = '🟢 Koopsignaal (Dip-Herstel onder 200 SMA)';
                    alertSeverity = 'success';
                }

                // Aankoopbedrag berekening (Conform de +369% Backteststrategie):
                // Rekent met de positiegrootte OP DAT MOMENT
                const targetEur = idealItem.targetValueEur;
                const baseNeededEur = Math.max(0, targetEur - currentOwnedEurAtAlertDate);

                // Waarderingsfactor: Hoe goedkoper het aandeel noteert tov intrinsieke waarde, hoe hoger de allocatie-opportuniteit (factor 0.4x tot 1.5x)
                const valuationFactor = (intrinsicVal && intrinsicVal > 0 && alertPrice > 0)
                    ? Math.max(0.4, Math.min(1.5, intrinsicVal / alertPrice))
                    : 1.0;

                let actionAmountEur = baseNeededEur > 0 ? (baseNeededEur * valuationFactor) : (targetEur * 0.5 * valuationFactor);
                
                // Indien het aandeel nog niet in bezit is en het berekende bedrag laag is, gebruik trade_amount gewogen naar waardering
                if (actionAmountEur < 50 && rawAlert.trade_amount > 0) {
                    actionAmountEur = toDisplayCurrency(rawAlert.trade_amount, ticker, stockDetails?.asset_type) * valuationFactor;
                }
                
                // Voorkom dat een aankoop de maximale streefallocatie van het aandeel overschrijdt
                if (currentOwnedEurAtAlertDate + actionAmountEur > targetEur * 1.3) {
                    actionAmountEur = Math.max(0, targetEur * 1.3 - currentOwnedEurAtAlertDate);
                }

                const actionShares = alertPrice > 0 ? (actionAmountEur / alertPrice) : 0;
                if (actionAmountEur <= 10) return;

                let fundingSource = null;
                let linkedSales = [];

                if (availableCash >= actionAmountEur) {
                    fundingSource = {
                        status: 'DIRECT_CASH',
                        badge: '🟢 Vrije Cash Beschikbaar',
                        message: `Voldoende vrije cash (€${availableCash.toFixed(2)}) om direct uit te voeren.`
                    };
                } else {
                    const shortfallEur = actionAmountEur - availableCash;
                    let coveredEur = 0;
                    const potentialSellCandidates = [
                        ...takeProfitHoldings.filter(h => h.ticker !== ticker),
                        ...trimHoldings.filter(h => h.ticker !== ticker)
                    ];

                    for (const cand of potentialSellCandidates) {
                        if (coveredEur >= shortfallEur) break;
                        const neededFromCand = Math.min(cand.holdingValue, shortfallEur - coveredEur);
                        const candShares = cand.currentPrice > 0 ? (neededFromCand / cand.currentPrice) : 0;
                        
                        linkedSales.push({
                            ticker: cand.ticker,
                            name: cand.name,
                            reason: cand.actionType === 'TAKE_PROFIT' ? 'Winst Verzilveren (Overgewaardeerd)' : 'Verlies Beperken (Onder 200 SMA / Zwakker)',
                            sharesToSell: parseFloat(candShares.toFixed(2)),
                            amountToSellEur: parseFloat(neededFromCand.toFixed(2)),
                            currentPrice: cand.currentPrice
                        });
                        coveredEur += neededFromCand;
                    }

                    fundingSource = {
                        status: 'ROTATION_REQUIRED',
                        badge: '⚠️ Cash Vrijmaken via Verkoop',
                        shortfallEur: parseFloat(shortfallEur.toFixed(2)),
                        message: `Onvoldoende vrije cash (€${availableCash.toFixed(0)} beschikbaar). Voer op ${alertDateStr} onderstaande verkoop uit om €${actionAmountEur.toFixed(0)} vrij te maken:`
                    };
                }

                const latestQuarterDate = stockDetails?.period_end_date 
                    ? (stockDetails.period_end_date instanceof Date ? stockDetails.period_end_date.toISOString().split('T')[0] : String(stockDetails.period_end_date).split('T')[0]) 
                    : null;

                const hasNewQuarterSinceAlert = latestQuarterDate ? (new Date(latestQuarterDate) > new Date(alertDateStr)) : false;
                const isLateBuyOpportunity = isCheaperNow && !hasNewQuarterSinceAlert && !isOvervalued && !isWvDown;

                dataDrivenAlerts.push({
                    alertId: rawAlert.alert_id,
                    date: alertDateStr,
                    ticker: ticker,
                    name: rawAlert.name,
                    signalType: 'Koopsignaal',
                    badge: alertBadge,
                    severity: alertSeverity,
                    warning: alertWarning,
                    isOvervalued: isOvervalued,
                    isWvDown: isWvDown,
                    isActionableBuy: !isOvervalued && !isWvDown,
                    isCautionBuy: isOvervalued || isWvDown,
                    waardeVerdeling: stockDetails?.waarde_verdeling || 0,
                    prevWaardeVerdeling: stockDetails?.prev_waarde_verdeling ?? null,
                    wvDiff,
                    wvDiffPct,
                    wvHistory: (calcsHistoryByStock.get(rawAlert.aandeel_id) || []).slice(-8),
                    priceToIntrinsicRatio: priceToIntrinsic ? parseFloat(priceToIntrinsic.toFixed(2)) : null,
                    signalLineValue: rawAlert.signal_line_value,
                    priceAtAlert: alertPrice,
                    currentPrice: parseFloat(currentStockPrice.toFixed(2)),
                    currentPriceDate: currentStockPriceDate,
                    priceDiffSinceAlertEur: parseFloat(priceDiffSinceAlertEur.toFixed(2)),
                    priceDiffSinceAlertPct: parseFloat(priceDiffSinceAlertPct.toFixed(1)),
                    isCheaperNow: isCheaperNow,
                    isLatestAlertForStock: isLatestAlertForStock,
                    hasNewQuarterSinceAlert: hasNewQuarterSinceAlert,
                    isLateBuyOpportunity: isLateBuyOpportunity,
                    amountEur: parseFloat(actionAmountEur.toFixed(2)),
                    shares: parseFloat(actionShares.toFixed(2)),
                    targetWeightPct: idealItem ? parseFloat(idealItem.targetWeightPct.toFixed(1)) : null,
                    targetValueEur: idealItem ? parseFloat(idealItem.targetValueEur.toFixed(2)) : null,
                    targetShares: idealItem ? idealItem.targetShares : null,
                    sharesAtAlertDate: parseFloat(sharesOwnedAtAlertDate.toFixed(2)),
                    currentOwnedEurAtAlertDate: parseFloat(currentOwnedEurAtAlertDate.toFixed(2)),
                    currentOwnedEur: parseFloat(currentOwnedEurAtAlertDate.toFixed(2)),
                    currentShares: parseFloat(sharesOwnedAtAlertDate.toFixed(2)),
                    latestQuarterDate: latestQuarterDate,
                    fundingSource: fundingSource,
                    linkedSales: linkedSales
                });
            });

        // 2. ECHTE STRATEGIE VERKOOPSIGNALEN (Uitsluitend bij fundamentele verslechtering Score < 5)
        // Posities onder de 200 SMA of met lichte dalingen worden NOOIT los verkocht; enkel als financiering bij een kooporder wanneer er cash tekort is.
        evaluatedHoldings.forEach(h => {
            if (h.actionType === 'TRIM_FUNDAMENTAL') {
                const alertDate = h.periodEndDate || new Date().toISOString().split('T')[0];
                dataDrivenAlerts.push({
                    alertId: 91000 + h.stockId,
                    date: alertDate,
                    ticker: h.ticker,
                    name: h.name,
                    signalType: 'Verkoopsignaal',
                    badge: '🔴 Verkoopsignaal (Score < 5)',
                    priceAtAlert: h.currentPrice,
                    amountEur: parseFloat(h.holdingValue.toFixed(2)),
                    shares: parseFloat(h.quantity.toFixed(2)),
                    targetWeightPct: 0,
                    fundamentalScore: h.score,
                    latestQuarterDate: h.periodEndDate,
                    fundingSource: {
                        status: 'PROTECT_CAPITAL',
                        badge: '🛑 Kapitaal Beschermen',
                        message: `Bedrijf voldoet niet meer aan de Super-Kwaliteit criteria (Score ${h.score}/5 bij kwartaalrapport van ${alertDate}). Sluit positie (100%) om kapitaal te beschermen.`
                    },
                    linkedSales: []
                });
            }
        });

        // Sorteer alle meldingen op datum nieuwste eerst
        dataDrivenAlerts.sort((a, b) => new Date(b.date) - new Date(a.date));

        // 10. Bereken de samenvatting en de Strategie Alignment Score
        const alignedValue = evaluatedHoldings
            .filter(h => h.isAligned)
            .reduce((acc, h) => acc + h.holdingValue, 0);

        const alignmentPercentage = totalPortfolioValue > 0 
            ? (alignedValue / totalPortfolioValue) * 100 
            : 100;

        const actionSummary = {
            buyMoreCount: evaluatedHoldings.filter(h => h.actionType === 'BUY_MORE').length,
            holdCount: evaluatedHoldings.filter(h => h.actionType === 'HOLD' || h.actionType === 'ETF_INDEX').length,
            takeProfitCount: evaluatedHoldings.filter(h => h.actionType === 'TAKE_PROFIT').length,
            trimCount: evaluatedHoldings.filter(h => h.actionType.startsWith('TRIM')).length,
            topBuyCandidatesCount: topBuyCandidates.length
        };

        // 11. Concrete Actiepunten genereren
        const actionItems = [];
        
        // Stap 1: Winstnemen
        if (takeProfitHoldings.length > 0) {
            actionItems.push({
                step: 1,
                type: 'TAKE_PROFIT',
                badge: '💰 Winstnemen',
                title: `Room winst af op ${takeProfitHoldings.length} overgewaardeerde positie(s)`,
                description: `Aandelen zoals ${takeProfitHoldings.map(h => h.ticker).join(', ')} noteren fors boven hun intrinsieke waarde (> ${takeProfitRatio}x). Door hier winst te nemen stel je rendement veilig.`,
                tickers: takeProfitHoldings.map(h => h.ticker)
            });
        }

        // Stap 2: Risicobescherming / Afbouw
        if (trimHoldings.length > 0) {
            actionItems.push({
                step: 2,
                type: 'TRIM',
                badge: '🔴 Risico Beperken',
                title: `Bouw ${trimHoldings.length} verzwakte positie(s) af`,
                description: `Posities zoals ${trimHoldings.map(h => h.ticker).join(', ')} zijn onder hun 200 SMA gezakt of hebben een lagere fundamentele score. Sluit deze om bearmarkt-verliezen te vermijden.`,
                tickers: trimHoldings.map(h => h.ticker)
            });
        }

        // Stap 3: Aankoop & Herallocatie
        if (topBuyCandidates.length > 0) {
            const top3 = topBuyCandidates.slice(0, 3);
            actionItems.push({
                step: 3,
                type: 'BUY',
                badge: '🟢 Doel-Investering',
                title: `Allokeer nieuwe inleg of vrijgekomen cash naar de Top Koopkansen`,
                description: `De hoogste verwachte alpha ligt momenteel bij: ${top3.map(c => `${c.ticker} (${c.score}/5, ${c.discountPct > 0 ? c.discountPct.toFixed(0) + '% korting' : c.priceToIntrinsicRatio.toFixed(2) + 'x'})`).join(' • ')}.`,
                tickers: top3.map(c => c.ticker)
            });
        }

        // 12. Data Freshness Status
        const todayStr = new Date().toISOString().split('T')[0];
        const lastUpdatedDate = allStocks.reduce((max, s) => {
            if (!s.last_price_date) return max;
            const d = new Date(s.last_price_date).toISOString().split('T')[0];
            return d > max ? d : max;
        }, '1970-01-01');

        res.json({
            currency,
            totalPortfolioValue,
            totalPortfolioCost,
            totalProfit: totalPortfolioValue - totalPortfolioCost,
            totalProfitPct: totalPortfolioCost > 0 ? ((totalPortfolioValue - totalPortfolioCost) / totalPortfolioCost) * 100 : 0,
            alignmentPercentage,
            actionSummary,
            actionItems,
            exactActions,
            idealPortfolio,
            dataDrivenAlerts,
            holdings: evaluatedHoldings,
            topBuyCandidates,
            dataFreshness: {
                lastUpdatedDate,
                isUpdatedToday: lastUpdatedDate >= todayStr,
                fxRate: latestFxRate
            }
        });

    } catch (err) {
        console.error('Fout bij ophalen Strategy Advisor data:', err);
        res.status(500).json({ message: 'Fout bij genereren Strategy Advisor data', error: err.message });
    }
};

module.exports = {
  recalculateAndStorePortfolioHistory,
  getPortfolioValues,
  checkAndRepairPriceData,
  calculateReturns,
  getPortfolioReturns,
  getCurrentPortfolioHoldings,
  getTransactions,
  addTransaction,
  updateTransaction,
  addMultipleTransactions,
  deleteTransaction,
  getPortfolioReturnsDynamics,
  markTobPaid,
  forceUpdateExchangeRates,
  applyStockSplit,
  getBenchmarkHistory,
  getStrategyAdvisorData
};
// controllers/portfolioController.js
const { sql, config } = require('../config/database');
const xirr = require('xirr');
const fetch = require('node-fetch');

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

    // Step 1: Fetch all cashflows for XIRR calculation
    const cashflowRequest = pool.request();
    cashflowRequest.input('userId', sql.Int, userId);
    const cashflowResult = await cashflowRequest.query(`
        SELECT aandeel_id, purchase_time, transaction_type, quantity, price, fees, taxes
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
        for (const [aandeel_id, qty] of Object.entries(holdings)) {
            if (qty > 0.00001) {
                const price = getInterpolatedPrice(aandeel_id, currentTimestamp);
                total_value += qty * price;
            }
        }

        dailyValues.push({ date: currentStr, total_value });
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
        switch (t.transaction_type) {
            case 'DEPOSIT':
                return balance + t.quantity;
            case 'WITHDRAWAL':
                return balance - t.quantity;
            case 'BUY':
                return balance - ((t.quantity * t.price) + (t.fees || 0) + (t.taxes || 0));
            case 'SELL':
                return balance + ((t.quantity * t.price) - (t.fees || 0) - (t.taxes || 0));
            case 'DIVIDEND':
                return balance + ((t.quantity * t.price) - (t.taxes || 0));
            default:
                return balance;
        }
      }, 0);
      const account_total_value = record.total_value + cash_balance;

      write({ type: 'debug', message: `Calculated cash balance: ${cash_balance.toFixed(2)}` });
      write({ type: 'debug', message: `Final account value (assets + cash): ${account_total_value.toFixed(2)}` });

      // Calculate net_invested in assets and cumulative dividends
      let net_invested_assets = 0;
      let cumulative_dividends = 0;
      
      transactionsUntilDate.forEach(t => {
        if (t.transaction_type === 'BUY') {
          net_invested_assets += (t.quantity * t.price) + (t.fees || 0) + (t.taxes || 0);
        } else if (t.transaction_type === 'SELL') {
          net_invested_assets -= ((t.quantity * t.price) - (t.fees || 0) - (t.taxes || 0));
        } else if (t.transaction_type === 'DIVIDEND') {
          cumulative_dividends += ((t.quantity * t.price) - (t.taxes || 0));
        }
      });

      // --- Asset XIRR Berekening ---
      let asset_xirr = 0;
      try {
        const rawAssetCashflows = transactionsUntilDate.filter(t => ['BUY', 'SELL', 'DIVIDEND'].includes(t.transaction_type))
          .map(t => {
            let amount = 0;
            if (t.transaction_type === 'BUY') {
              amount = -((t.quantity * t.price) + (t.fees || 0) + (t.taxes || 0));
            } else if (t.transaction_type === 'SELL') {
              amount = (t.quantity * t.price) - (t.fees || 0) - (t.taxes || 0);
            } else if (t.transaction_type === 'DIVIDEND') {
              amount = (t.quantity * t.price) - (t.taxes || 0);
            }
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
            let amount = 0;
            if (t.transaction_type === 'DEPOSIT') { amount = -t.quantity; }
            else if (t.transaction_type === 'WITHDRAWAL') { amount = t.quantity; }
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
        .input('asset_xirr', sql.Decimal(18, 8), isFinite(asset_xirr) ? asset_xirr : 0)
        .input('account_xirr', sql.Decimal(18, 8), isFinite(account_xirr) ? account_xirr : 0)
        .input('net_invested', sql.Decimal(18, 2), net_invested_assets)
        .input('cumulative_dividends', sql.Decimal(18, 2), cumulative_dividends)
        .query(`
          MERGE INTO DailyPortfolioValue AS target
          USING (SELECT @user_id AS user_id, @date AS date, @total_value AS total_value, @asset_xirr AS asset_xirr, @account_xirr AS account_xirr, @net_invested AS net_invested, @cumulative_dividends AS cumulative_dividends) AS source
          ON target.date = source.date AND target.user_id = source.user_id
          WHEN MATCHED THEN UPDATE SET total_value = source.total_value, asset_xirr = source.asset_xirr, account_xirr = source.account_xirr, net_invested = source.net_invested, cumulative_dividends = source.cumulative_dividends
          WHEN NOT MATCHED THEN INSERT (user_id, date, total_value, asset_xirr, account_xirr, net_invested, cumulative_dividends) VALUES (source.user_id, source.date, source.total_value, source.asset_xirr, source.account_xirr, source.net_invested, source.cumulative_dividends);
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
                MIN(CAST(t.purchase_time AS DATE)) as first_transaction_date,
                MAX(CAST(t.purchase_time AS DATE)) as last_transaction_date,
                SUM(CASE WHEN t.transaction_type = 'BUY' THEN t.quantity WHEN t.transaction_type = 'SELL' THEN -t.quantity ELSE 0 END) as total_qty
            FROM PF_transactions t
            JOIN Stocks s ON t.aandeel_id = s.aandeel_id
            WHERE t.user_id = @userId AND t.aandeel_id IS NOT NULL
            GROUP BY t.aandeel_id, s.ticker_symbol;
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
                
                const apiKey = process.env.PROFIT_COM_API_KEY;
                const apiUrl = `https://api.profit.com/data-api/market-data/historical/daily/${stock.ticker_symbol}?start_date=${apiFetchStartDate}&end_date=${apiFetchEndDate}&token=${apiKey}`;

                const response = await fetch(apiUrl);
                if (!response.ok) {
                    write({ type: 'error', message: `API error for ${stock.ticker_symbol}: ${response.statusText}` });
                    continue;
                }
                const apiData = await response.json();

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
    const currentTime = new Date();

    const pool = await sql.connect(config);
    const isEur = currency === 'EUR' ? 1 : 0;

    // Stap 1: Haal alle cashflows voor de gebruiker eenmalig op
    const cashflowRequest = pool.request();
    cashflowRequest.input('userId', sql.Int, userId);
    const cashflowResult = await cashflowRequest.query(`
        SELECT purchase_time, transaction_type, quantity, price, fees, taxes
        FROM PF_transactions
        WHERE user_id = @userId
        ORDER BY purchase_time ASC
    `);
    const allCashflows = cashflowResult.recordset;


    const { startDate, endDate } = parseDateRange(period, customStartDate, customEndDate);

    let query = '';
    if (assetTypes && assetTypes.length > 0 && assetTypes !== 'All') {
      // If assetTypes filter is active, XIRR values are not applicable for the filtered view
      // and total_value needs to be calculated on the fly.
      // Stored XIRR is for the entire portfolio.
      
      // Dynamische berekening als er filters actief zijn
      const types = assetTypes.split(',').map(t => `'${t}'`).join(',');
      query = `
        WITH DailyDates AS (
          SELECT DISTINCT date FROM DailyClosingPrices WHERE date >= @startDate AND date <= @endDate
        ),
        DailyFilteredPortfolioValue AS (
          SELECT d.date, SUM(lt.total_quantity * COALESCE(lcp.closing_price, tp.price, 0)) AS total_value, ISNULL(MAX(er.rate), 1) as exchange_rate,
                 SUM(lt.net_invested) AS net_invested, SUM(lt.cumulative_dividends) AS cumulative_dividends
          FROM DailyDates d
          CROSS APPLY (
            SELECT pt.aandeel_id, 
                   SUM(CASE WHEN pt.transaction_type = 'BUY' THEN pt.quantity WHEN pt.transaction_type = 'SELL' THEN -pt.quantity ELSE 0 END) AS total_quantity,
                   SUM(CASE WHEN pt.transaction_type = 'BUY' THEN (pt.quantity * pt.price) + ISNULL(pt.fees,0) + ISNULL(pt.taxes,0) WHEN pt.transaction_type = 'SELL' THEN -((pt.quantity * pt.price) - ISNULL(pt.fees,0) - ISNULL(pt.taxes,0)) ELSE 0 END) AS net_invested,
                   SUM(CASE WHEN pt.transaction_type = 'DIVIDEND' THEN (pt.quantity * pt.price) - ISNULL(pt.taxes,0) ELSE 0 END) AS cumulative_dividends
            FROM PF_transactions pt
            JOIN Stocks s ON pt.aandeel_id = s.aandeel_id
            JOIN AssetTypes at ON s.asset_type_id = at.asset_type_id
            WHERE pt.purchase_time <= DATEADD(DAY, 1, d.date) AND pt.user_id = @userId AND at.type_name IN (${types})
            GROUP BY pt.aandeel_id
            HAVING SUM(CASE WHEN pt.transaction_type = 'BUY' THEN pt.quantity WHEN pt.transaction_type = 'SELL' THEN -pt.quantity ELSE 0 END) > 0
          ) lt
          OUTER APPLY (
            SELECT TOP 1 closing_price FROM DailyClosingPrices dcp
            WHERE dcp.aandeel_id = lt.aandeel_id AND dcp.date <= d.date ORDER BY dcp.date DESC
          ) lcp
          OUTER APPLY (
            SELECT TOP 1 price FROM PF_transactions pt2
            WHERE pt2.aandeel_id = lt.aandeel_id AND pt2.user_id = @userId AND CAST(pt2.purchase_time AS DATE) <= d.date
            ORDER BY pt2.purchase_time DESC
          ) tp
          OUTER APPLY (
            SELECT TOP 1 rate FROM DailyExchangeRates WHERE currency_pair = 'EURUSD' AND date <= d.date ORDER BY date DESC
          ) er
          GROUP BY d.date
        )
        SELECT date, (ISNULL(total_value, 0) / CASE WHEN @isEur = 1 THEN exchange_rate ELSE 1 END) AS total_value
             , 0 AS asset_xirr, 0 AS account_xirr, -- Set XIRR to 0 for filtered views
             (ISNULL(net_invested, 0) / CASE WHEN @isEur = 1 THEN exchange_rate ELSE 1 END) AS net_invested,
             (ISNULL(cumulative_dividends, 0) / CASE WHEN @isEur = 1 THEN exchange_rate ELSE 1 END) AS cumulative_dividends
        FROM DailyFilteredPortfolioValue
        ORDER BY date ASC
      `;
    } else {
      query = `
        SELECT dpv.date, 
               (dpv.total_value / CASE WHEN @isEur = 1 THEN ISNULL(er.rate, 1) ELSE 1 END) AS total_value, 
               dpv.asset_xirr, dpv.account_xirr,
               (dpv.net_invested / CASE WHEN @isEur = 1 THEN ISNULL(er.rate, 1) ELSE 1 END) AS net_invested,
               (dpv.cumulative_dividends / CASE WHEN @isEur = 1 THEN ISNULL(er.rate, 1) ELSE 1 END) AS cumulative_dividends
        FROM DailyPortfolioValue dpv
        OUTER APPLY (
            SELECT TOP 1 rate FROM DailyExchangeRates WHERE currency_pair = 'EURUSD' AND date <= dpv.date ORDER BY date DESC
        ) er
        WHERE dpv.user_id = @userId AND dpv.date >= @startDate AND dpv.date <= @endDate
        ORDER BY dpv.date ASC
      `;
    }

    const request = pool.request();
    request.input('userId', sql.Int, userId);
    request.input('startDate', sql.Date, startDate);
    request.input('endDate', sql.Date, endDate);
    request.input('isEur', sql.Bit, isEur);

    const result = await request.query(query);
    const dailyValues = result.recordset;

    res.status(200).json(dailyValues); // Return directly as XIRR is now stored
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
            WHEN t.transaction_type = 'BUY' THEN t.quantity * t.price
            WHEN t.transaction_type = 'SELL' THEN -t.quantity * t.price
            ELSE 0
          END) AS total_transaction_value
        FROM PF_transactions t
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
    // Haal userId uit query param of sessie (hier standaard 1 voor testdoeleinden)
    const userId = req.query.userId || 1;
    const { period, customStartDate, customEndDate, currency } = req.query;
    const { endDate } = parseDateRange(period, customStartDate, customEndDate);
    const pool = await sql.connect(config);
    const isEur = currency === 'EUR' ? 1 : 0;

    // Bereken het actuele bezit op basis van alle transacties en de meest recente slotkoers
    const query = `
      WITH Holdings AS (
        SELECT
          t.aandeel_id,
          SUM(CASE WHEN t.transaction_type = 'BUY' THEN t.quantity WHEN t.transaction_type = 'SELL' THEN -t.quantity ELSE 0 END) AS total_quantity,
          SUM(CASE WHEN t.transaction_type = 'BUY' THEN (t.quantity * t.price) WHEN t.transaction_type = 'SELL' THEN -(t.quantity * t.price) ELSE 0 END) AS total_invested
        FROM PF_transactions t
        WHERE t.user_id = @userId
        AND t.purchase_time <= @endDate
        GROUP BY t.aandeel_id
        HAVING SUM(CASE WHEN t.transaction_type = 'BUY' THEN t.quantity WHEN t.transaction_type = 'SELL' THEN -t.quantity ELSE 0 END) > 0
      ),
      LatestPrices AS (
        SELECT aandeel_id, closing_price,
               ROW_NUMBER() OVER(PARTITION BY aandeel_id ORDER BY date DESC) as rn
        FROM DailyClosingPrices
        WHERE date <= @endDate
      ),
      LatestTransactionPrices AS (
        SELECT aandeel_id, price,
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
        ((h.total_invested / NULLIF(h.total_quantity, 0)) / CASE WHEN @isEur = 1 THEN ISNULL(er.rate, 1) ELSE 1 END) AS average_price,
        (COALESCE(p.closing_price, ltp.price, 0) / CASE WHEN @isEur = 1 THEN ISNULL(er.rate, 1) ELSE 1 END) AS price,
        ((h.total_quantity * COALESCE(p.closing_price, ltp.price, 0)) / CASE WHEN @isEur = 1 THEN ISNULL(er.rate, 1) ELSE 1 END) AS value,
        (((h.total_quantity * COALESCE(p.closing_price, ltp.price, 0)) - h.total_invested) / CASE WHEN @isEur = 1 THEN ISNULL(er.rate, 1) ELSE 1 END) AS gainLoss,
        (h.total_invested / CASE WHEN @isEur = 1 THEN ISNULL(er.rate, 1) ELSE 1 END) AS total_invested
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
        SELECT t.*, s.ticker_symbol, s.name as stock_name, at.type_name as asset_type, b.name as broker_name,
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

const addTransaction = async (req, res) => {
  try {
    const { user_id, aandeel_id, broker_id, transaction_type, quantity, currency, price, purchase_time, fees = 0, taxes = 0, exchange_rate = 1 } = req.body;
    const pool = await sql.connect(config);
    
    // Check of transactie al bestaat (Duplicaat check op Tijd, Aandeel, Prijs en Aantal)
    const duplicateCheck = await pool.request()
      .input('user_id', sql.Int, user_id)
      .input('aandeel_id', sql.Int, aandeel_id)
      .input('transaction_type', sql.VarChar, transaction_type)
      .input('quantity', sql.Decimal(18, 5), quantity)
      .input('price', sql.Decimal(18, 4), price)
      .input('purchase_time', sql.DateTime, purchase_time)
      .query(`
        SELECT 1 FROM PF_transactions
        WHERE user_id = @user_id AND aandeel_id = @aandeel_id
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
      .input('aandeel_id', sql.Int, aandeel_id)
      .input('broker_id', sql.Int, broker_id)
      .input('transaction_type', sql.VarChar, transaction_type)
      .input('quantity', sql.Decimal(18, 5), quantity)
      .input('currency', sql.VarChar, currency)
      .input('price', sql.Decimal(18, 4), price)
      .input('purchase_time', sql.DateTime, purchase_time)
      .input('fees', sql.Decimal(18, 4), fees)
      .input('taxes', sql.Decimal(18, 4), taxes)
      .input('exchange_rate', sql.Decimal(18, 6), exchange_rate)
      .query(`
        INSERT INTO PF_transactions (user_id, aandeel_id, broker_id, transaction_type, quantity, currency, price, purchase_time, fees, taxes, exchange_rate)
        VALUES (@user_id, @aandeel_id, @broker_id, @transaction_type, @quantity, @currency, @price, @purchase_time, @fees, @taxes, @exchange_rate)
      `);
    res.status(201).json({ message: 'Transactie succesvol toegevoegd' });
  } catch (error) {
    console.error('Fout bij toevoegen transactie:', error);
    res.status(500).json({ message: 'Serverfout bij toevoegen transactie' });
  }
};

const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, aandeel_id, broker_id, transaction_type, quantity, currency, price, purchase_time, fees = 0, taxes = 0, exchange_rate = 1 } = req.body;
    const pool = await sql.connect(config);
    
    const result = await pool.request()
      .input('id', sql.Int, id).input('user_id', sql.Int, user_id).input('aandeel_id', sql.Int, aandeel_id).input('broker_id', sql.Int, broker_id)
      .input('transaction_type', sql.VarChar, transaction_type).input('quantity', sql.Decimal(18, 5), quantity).input('currency', sql.VarChar, currency)
      .input('price', sql.Decimal(18, 4), price).input('purchase_time', sql.DateTime, purchase_time).input('fees', sql.Decimal(18, 4), fees)
      .input('taxes', sql.Decimal(18, 4), taxes).input('exchange_rate', sql.Decimal(18, 6), exchange_rate)
      .query(`
        UPDATE PF_transactions 
        SET user_id = @user_id, aandeel_id = @aandeel_id, broker_id = @broker_id, transaction_type = @transaction_type, 
            quantity = @quantity, currency = @currency, price = @price, purchase_time = @purchase_time, 
            fees = @fees, taxes = @taxes, exchange_rate = @exchange_rate
        WHERE id = @id
      `);
    
    if (result.rowsAffected[0] > 0) res.status(200).json({ message: 'Transactie succesvol bijgewerkt' });
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

    for (const t of transactions) {
      try {
          let aandeel_id = t.aandeel_id;

          // Zoek het aandeel_id op basis van ISIN (DeGiro) of Ticker (eToro/Template)
          if (!aandeel_id) {
              let stockResult;
              if (t.isin) {
                  stockResult = await pool.request().input('isin', sql.VarChar, t.isin).query(`SELECT aandeel_id FROM Stocks WHERE isin = @isin`);
              }
              if ((!stockResult || stockResult.recordset.length === 0) && t.ticker) {
                  stockResult = await pool.request().input('ticker', sql.NVarChar, t.ticker).query(`SELECT aandeel_id FROM Stocks WHERE ticker_symbol = @ticker`);
              }
              
              if (stockResult.recordset.length > 0) aandeel_id = stockResult.recordset[0].aandeel_id;
              else { errors++; continue; } // Aandeel niet in DB
          }
          if (!aandeel_id) { errors++; continue; }

          // Duplicaat check
          const duplicateCheck = await pool.request()
            .input('user_id', sql.Int, t.user_id || 1).input('aandeel_id', sql.Int, aandeel_id).input('transaction_type', sql.VarChar, t.transaction_type)
            .input('quantity', sql.Decimal(18, 5), t.quantity).input('price', sql.Decimal(18, 4), t.price).input('purchase_time', sql.DateTime, t.purchase_time)
            .query(`SELECT 1 FROM PF_transactions WHERE user_id = @user_id AND aandeel_id = @aandeel_id AND transaction_type = @transaction_type AND ABS(quantity - @quantity) < 0.0001 AND ABS(price - @price) <= 0.015 AND CAST(purchase_time AS DATE) = CAST(@purchase_time AS DATE)`);

          if (duplicateCheck.recordset.length > 0) { duplicates++; continue; }

          // Invoegen
          await pool.request()
            .input('user_id', sql.Int, t.user_id || 1).input('aandeel_id', sql.Int, aandeel_id).input('broker_id', sql.Int, t.broker_id || 1)
            .input('transaction_type', sql.VarChar, t.transaction_type).input('quantity', sql.Decimal(18, 5), t.quantity).input('currency', sql.VarChar, t.currency || 'USD')
            .input('price', sql.Decimal(18, 4), t.price).input('purchase_time', sql.DateTime, t.purchase_time)
            .input('fees', sql.Decimal(18, 4), t.fees || 0).input('taxes', sql.Decimal(18, 4), t.taxes || 0).input('exchange_rate', sql.Decimal(18, 6), t.exchange_rate || 1)
            .query(`
              INSERT INTO PF_transactions (user_id, aandeel_id, broker_id, transaction_type, quantity, currency, price, purchase_time, fees, taxes, exchange_rate)
              VALUES (@user_id, @aandeel_id, @broker_id, @transaction_type, @quantity, @currency, @price, @purchase_time, @fees, @taxes, @exchange_rate)
            `);
          added++;
      } catch (rowError) {
          console.error('Fout bij verwerken specifieke rij:', rowError);
          errors++;
      }
    }
    res.status(200).json({ message: `Import voltooid! Toegevoegd: ${added}, Duplicaten overgeslagen: ${duplicates}, Fouten/Onbekende tickers: ${errors}.` });
  } catch (error) {
    console.error('Fout bij importeren van meerdere transacties:', error);
    res.status(500).json({ message: 'Serverfout bij bulk import.' });
  }
};

const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await sql.connect(config);
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
                        // BUY voegt kapitaal toe aan je assets, SELL en DIVIDEND halen kapitaal uit je assets
                        case 'BUY': flow = ((t.quantity * t.price) + (t.fees || 0) + (t.taxes || 0)); break;
                        case 'SELL': flow = -((t.quantity * t.price) - (t.fees || 0) - (t.taxes || 0)); break;
                        case 'DIVIDEND': flow = -((t.quantity * t.price) - (t.taxes || 0)); break;
                        // DEPOSIT en WITHDRAWAL hebben geen invloed op de prestaties van de onderliggende aandelen
                        case 'DEPOSIT': 
                        case 'WITHDRAWAL': flow = 0; break;
                    }
                    // Hier zou valuta conversie moeten komen als transacties in verschillende valuta zijn.
                    // Voor nu gaan we uit van een consistente valuta.
                    return sum + flow;
                }
                return sum;
            }, 0);

            const returnValue = endValue - startValue - netFlows;
            
            // Gebruik de 'Modified Dietz' benadering voor het percentage
            const averageCapital = startValue + (netFlows / 2);
            let returnPercent = 0;
            if (Math.abs(averageCapital) > 0.01) {
                returnPercent = (returnValue / averageCapital) * 100;
            }

            return { period: bucket.label, returnValue, returnPercent, irr: 0 };
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
  applyStockSplit
};
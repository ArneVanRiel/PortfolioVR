// backend/controllers/backtestController.js
const axios = require('axios');
const { sql } = require('../config/database');

let benchmarkCache = null;
let benchmarkCacheTime = 0;

const getBenchmarkSeries = async () => {
  const now = Date.now();
  if (benchmarkCache && (now - benchmarkCacheTime < 3600000)) {
    return benchmarkCache;
  }

  try {
    const p2 = Math.floor(now / 1000);
    const p1 = p2 - (11 * 365 * 24 * 3600); // 11 jaar

    const [spyRes, worldRes] = await Promise.all([
      axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&period1=${p1}&period2=${p2}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000
      }).catch(() => null),
      axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/URTH?interval=1d&period1=${p1}&period2=${p2}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000
      }).catch(() => null)
    ]);

    const spyMap = new Map();
    if (spyRes?.data?.chart?.result?.[0]) {
      const res = spyRes.data.chart.result[0];
      const ts = res.timestamp || [];
      const closes = res.indicators?.quote?.[0]?.close || [];
      ts.forEach((t, idx) => {
        if (closes[idx] != null && !isNaN(closes[idx])) {
          const dStr = new Date(t * 1000).toISOString().split('T')[0];
          spyMap.set(dStr, closes[idx]);
        }
      });
    }

    const worldMap = new Map();
    if (worldRes?.data?.chart?.result?.[0]) {
      const res = worldRes.data.chart.result[0];
      const ts = res.timestamp || [];
      const closes = res.indicators?.quote?.[0]?.close || [];
      ts.forEach((t, idx) => {
        if (closes[idx] != null && !isNaN(closes[idx])) {
          const dStr = new Date(t * 1000).toISOString().split('T')[0];
          worldMap.set(dStr, closes[idx]);
        }
      });
    }

    benchmarkCache = { spyMap, worldMap };
    benchmarkCacheTime = now;
    return benchmarkCache;
  } catch (err) {
    console.error('Fout bij ophalen benchmark series:', err.message);
    return { spyMap: new Map(), worldMap: new Map() };
  }
};

function calculateEMA_Series(data, period) {
  if (data.length < period) return Array(data.length).fill(NaN);
  const k = 2 / (period + 1);
  const emaArray = Array(data.length).fill(NaN);
  let initialSMA = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
  emaArray[period - 1] = initialSMA;
  let prevEMA = initialSMA;
  for (let i = period; i < data.length; i++) {
    const currentEMA = data[i] * k + prevEMA * (1 - k);
    emaArray[i] = currentEMA;
    prevEMA = currentEMA;
  }
  return emaArray;
}

function calculateFullMACDSeries(closingPrices) {
  const fastLength = 30;
  const slowLength = 90;
  const signalSmoothing = 9;

  const pricesOnly = closingPrices.map(p => parseFloat(p.closing_price));
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
    price: pricesOnly[index],
    macdLine: macd,
    signalLine: signalLines[index]
  }));
}

// 1. Hoofd Backtest Simulatie voor een Enkel Aandeel
const runBacktest = async (req, res) => {
  const { 
    ticker, 
    stockId: paramStockId, 
    initialCapital = 10000, 
    requireScore5 = true, 
    requireWaardeverdelingRise = true,
    useMacdSell = false,
    useWaardeverdelingSell = true,
    sellOnScoreDrop = true
  } = req.body;

  try {
    let stockId = paramStockId;
    let tickerSymbol = ticker ? ticker.trim().toUpperCase() : null;
    let stockName = tickerSymbol;

    const reqStock = new sql.Request();
    if (tickerSymbol) {
      reqStock.input('ticker', sql.NVarChar, tickerSymbol);
      const sRes = await reqStock.query('SELECT aandeel_id, ticker_symbol, name FROM Stocks WHERE ticker_symbol = @ticker');
      if (sRes.recordset.length === 0) {
        return res.status(404).json({ message: `Aandeel met ticker ${tickerSymbol} niet gevonden in database.` });
      }
      stockId = sRes.recordset[0].aandeel_id;
      tickerSymbol = sRes.recordset[0].ticker_symbol;
      stockName = sRes.recordset[0].name;
    } else if (stockId) {
      reqStock.input('stockId', sql.Int, stockId);
      const sRes = await reqStock.query('SELECT aandeel_id, ticker_symbol, name FROM Stocks WHERE aandeel_id = @stockId');
      if (sRes.recordset.length === 0) {
        return res.status(404).json({ message: `Aandeel met ID ${stockId} niet gevonden.` });
      }
      tickerSymbol = sRes.recordset[0].ticker_symbol;
      stockName = sRes.recordset[0].name;
    } else {
      return res.status(400).json({ message: 'Ticker of stockId is verplicht voor backtest.' });
    }

    const pricesRes = await new sql.Request()
      .input('stockId', sql.Int, stockId)
      .query('SELECT date, closing_price FROM DailyClosingPrices WHERE aandeel_id = @stockId ORDER BY date ASC');

    const priceList = pricesRes.recordset;
    if (priceList.length < 5) {
      return res.status(400).json({ message: `Onvoldoende historische koersdata beschikbaar voor ${tickerSymbol} (${priceList.length} dagen gevonden).` });
    }

    const calcsRes = await new sql.Request()
      .input('stockId', sql.Int, stockId)
      .query('SELECT period_end_date, waarde_verdeling, selectiecriteria FROM stock_calculations WHERE stock_id = @stockId ORDER BY period_end_date ASC');

    const calcs = calcsRes.recordset;

    const getCalcOnDate = (dStr) => {
      const targetTime = new Date(dStr).getTime();
      let bestCalc = null;
      let prevCalc = null;
      for (let i = 0; i < calcs.length; i++) {
        const cTime = new Date(calcs[i].period_end_date).getTime();
        if (cTime <= targetTime) {
          prevCalc = bestCalc;
          bestCalc = calcs[i];
        } else {
          break;
        }
      }
      return { curr: bestCalc, prev: prevCalc };
    };

    const buySignalsByDate = new Map();
    const sellSignalsByDate = new Map();

    const macdSeries = calculateFullMACDSeries(priceList);
    for (let i = 1; i < macdSeries.length; i++) {
      const prev = macdSeries[i - 1];
      const curr = macdSeries[i];
      const dStr = curr.date instanceof Date ? curr.date.toISOString().split('T')[0] : curr.date;

      if (!isNaN(prev.macdLine) && !isNaN(prev.signalLine) && !isNaN(curr.macdLine) && !isNaN(curr.signalLine)) {
        if (prev.macdLine <= prev.signalLine && curr.macdLine > curr.signalLine) {
          buySignalsByDate.set(dStr, {
            date: dStr,
            type: 'BUY',
            reason: 'MACD Koopsignaal (Bullish Crossover)'
          });
        }
        if (prev.macdLine >= prev.signalLine && curr.macdLine < curr.signalLine && useMacdSell) {
          sellSignalsByDate.set(dStr, {
            date: dStr,
            type: 'SELL',
            reason: 'MACD Verkoopsignaal (Bearish Crossover)'
          });
        }
      }
    }

    const alertsRes = await new sql.Request()
      .input('stockId', sql.Int, stockId)
      .query('SELECT date, type_melding FROM MACDAlerts WHERE aandeel_id = @stockId ORDER BY date ASC');

    alertsRes.recordset.forEach(a => {
      const dStr = a.date instanceof Date ? a.date.toISOString().split('T')[0] : a.date;
      if (a.type_melding === 'Koopsignaal') {
        buySignalsByDate.set(dStr, {
          date: dStr,
          type: 'BUY',
          reason: 'MACD Koopsignaal'
        });
      } else if (a.type_melding === 'Verkoopsignaal' && useMacdSell) {
        sellSignalsByDate.set(dStr, {
          date: dStr,
          type: 'SELL',
          reason: 'MACD Verkoopsignaal'
        });
      }
    });

    let cash = parseFloat(initialCapital);
    let shares = 0;
    let position = null;
    const trades = [];
    const equityCurve = [];
    const timelineEvents = [];

    const firstPrice = parseFloat(priceList[0].closing_price);
    let peakValue = initialCapital;
    let maxDrawdown = 0;

    for (let i = 0; i < priceList.length; i++) {
      const day = priceList[i];
      const dStr = day.date instanceof Date ? day.date.toISOString().split('T')[0] : day.date;
      const price = parseFloat(day.closing_price);

      if (!price || price <= 0) continue;

      const { curr, prev } = getCalcOnDate(dStr);
      const scoreOnDay = curr ? (curr.selectiecriteria ?? 5) : 5;
      const wvOnDay = curr ? curr.waarde_verdeling : 0;
      const prevWv = prev ? prev.waarde_verdeling : null;
      const isWvRising = prevWv == null || (wvOnDay != null && prevWv != null && wvOnDay >= prevWv);
      const currQuarterDate = curr ? (curr.period_end_date instanceof Date ? curr.period_end_date.toISOString().split('T')[0] : curr.period_end_date) : null;

      const buySig = buySignalsByDate.get(dStr);
      const macdSellSig = sellSignalsByDate.get(dStr);

      let buyEventToday = null;
      let sellEventToday = null;
      let partialSellEventToday = null;

      // 1. Check VERKOOP
      if (shares > 0 && position && position.entryDate !== dStr) {
        if (sellOnScoreDrop && scoreOnDay < 5) {
          const revenue = shares * price;
          const profit = revenue - position.cost;
          const returnPct = ((price - position.entryPrice) / position.entryPrice) * 100;
          const entryDateObj = new Date(position.entryDate);
          const exitDateObj = new Date(dStr);
          const holdingDays = Math.max(1, Math.round((exitDateObj - entryDateObj) / (1000 * 60 * 60 * 24)));
          const sellReason = `Score gedaald naar ${scoreOnDay}/5 (Geen 5 meer) -> 100% Volledig Verkocht`;

          cash += revenue;
          trades.push({
            tradeNumber: trades.length + 1,
            type: 'FULL_EXIT',
            sellPct: 100,
            sharesSold: shares,
            sharesRemaining: 0,
            entryDate: position.entryDate,
            entryPrice: position.entryPrice,
            exitDate: dStr,
            exitPrice: price,
            revenue,
            profit,
            returnPct,
            holdingDays,
            exitReason: sellReason,
            exitScore: scoreOnDay,
            exitWv: wvOnDay,
            isWin: profit > 0
          });

          sellEventToday = {
            date: dStr,
            type: 'SELL',
            price,
            reason: sellReason,
            profit,
            returnPct
          };
          timelineEvents.push(sellEventToday);

          shares = 0;
          position = null;
        } else if (useWaardeverdelingSell && scoreOnDay === 5 && prevWv != null && wvOnDay != null && wvOnDay < prevWv && position.lastEvaluatedQuarterDate !== currQuarterDate) {
          const dropFraction = Math.min(1, Math.max(0, (prevWv - wvOnDay) / prevWv));
          const dropPct = dropFraction * 100;
          const sharesToSell = Math.min(shares, Math.max(1, Math.round(shares * dropFraction)));

          if (sharesToSell > 0) {
            const costOfSoldShares = position.cost * (sharesToSell / shares);
            const revenue = sharesToSell * price;
            const profit = revenue - costOfSoldShares;
            const returnPct = ((price - position.entryPrice) / position.entryPrice) * 100;
            const entryDateObj = new Date(position.entryDate);
            const exitDateObj = new Date(dStr);
            const holdingDays = Math.max(1, Math.round((exitDateObj - entryDateObj) / (1000 * 60 * 60 * 24)));
            const sellReason = `Deelverkoop ${dropPct.toFixed(1)}% (Waardeverdeling daling ${dropPct.toFixed(1)}%: ${prevWv.toFixed(1)} -> ${wvOnDay.toFixed(1)})`;

            cash += revenue;
            trades.push({
              tradeNumber: trades.length + 1,
              type: 'PARTIAL_EXIT',
              sellPct: parseFloat(dropPct.toFixed(1)),
              sharesSold: sharesToSell,
              sharesRemaining: shares - sharesToSell,
              entryDate: position.entryDate,
              entryPrice: position.entryPrice,
              exitDate: dStr,
              exitPrice: price,
              revenue,
              profit,
              returnPct,
              holdingDays,
              exitReason: sellReason,
              exitScore: scoreOnDay,
              exitWv: wvOnDay,
              isWin: profit > 0
            });

            partialSellEventToday = {
              date: dStr,
              type: 'PARTIAL_SELL',
              price,
              reason: sellReason,
              profit,
              returnPct
            };
            timelineEvents.push(partialSellEventToday);

            shares -= sharesToSell;
            if (shares === 0) {
              position = null;
            } else {
              position.shares = shares;
              position.cost -= costOfSoldShares;
              position.lastEvaluatedQuarterDate = currQuarterDate;
            }
          }
        }
      }

      // 2. Check KOOP
      if (buySig && cash > price) {
        const scorePass = !requireScore5 || scoreOnDay === 5;
        const wvPass = !requireWaardeverdelingRise || isWvRising;

        if (scorePass && wvPass && wvOnDay > 0) {
          const sharesToBuy = Math.floor(cash / price);
          if (sharesToBuy > 0) {
            const cost = sharesToBuy * price;
            cash -= cost;
            shares += sharesToBuy;
            const fullEntryReason = `MACD Koop + Score ${scoreOnDay}/5 + WV ${isWvRising ? 'Stijgend' : 'Gelijk'} (${prevWv != null ? prevWv.toFixed(1) : '-'} -> ${wvOnDay != null ? wvOnDay.toFixed(1) : '-'})`;
            
            if (!position) {
              position = {
                entryDate: dStr,
                entryPrice: price,
                shares: sharesToBuy,
                cost,
                lastEvaluatedQuarterDate: currQuarterDate,
                entryReason: fullEntryReason,
                entryScore: scoreOnDay,
                entryWv: wvOnDay
              };
            } else {
              position.shares = shares;
              position.cost += cost;
              position.entryPrice = position.cost / shares;
              position.lastEvaluatedQuarterDate = currQuarterDate;
            }

            buyEventToday = {
              date: dStr,
              type: 'BUY',
              price,
              reason: fullEntryReason,
              shares: sharesToBuy
            };
            timelineEvents.push(buyEventToday);
          }
        }
      }

      const portfolioVal = cash + (shares * price);
      const buyAndHoldVal = (initialCapital / firstPrice) * price;

      if (portfolioVal > peakValue) {
        peakValue = portfolioVal;
      }
      const currentDd = ((peakValue - portfolioVal) / peakValue) * 100;
      if (currentDd > maxDrawdown) {
        maxDrawdown = currentDd;
      }

      const hasEvent = buyEventToday || sellEventToday || partialSellEventToday;
      if (i % 2 === 0 || i === priceList.length - 1 || hasEvent) {
        equityCurve.push({
          date: dStr,
          price,
          strategyValue: Math.round(portfolioVal * 100) / 100,
          buyAndHoldValue: Math.round(buyAndHoldVal * 100) / 100,
          inPosition: shares > 0,
          buySignalPrice: buyEventToday ? price : null,
          sellSignalPrice: sellEventToday ? price : null,
          partialSellSignalPrice: partialSellEventToday ? price : null,
          buyEvent: buyEventToday,
          sellEvent: sellEventToday,
          partialSellEvent: partialSellEventToday
        });
      }
    }

    const lastPrice = parseFloat(priceList[priceList.length - 1].closing_price);
    const finalDateStr = priceList[priceList.length - 1].date instanceof Date ? priceList[priceList.length - 1].date.toISOString().split('T')[0] : priceList[priceList.length - 1].date;
    
    if (shares > 0 && position) {
      const unrealizedRevenue = shares * lastPrice;
      const unrealizedProfit = unrealizedRevenue - position.cost;
      const unrealizedReturnPct = ((lastPrice - position.entryPrice) / position.entryPrice) * 100;
      const holdingDays = Math.max(1, Math.round((new Date(finalDateStr) - new Date(position.entryDate)) / (1000 * 60 * 60 * 24)));

      trades.push({
        tradeNumber: trades.length + 1,
        type: 'OPEN_POSITION',
        sellPct: 0,
        sharesSold: 0,
        sharesRemaining: shares,
        entryDate: position.entryDate,
        entryPrice: position.entryPrice,
        exitDate: `${finalDateStr} (Open)`,
        exitPrice: lastPrice,
        revenue: unrealizedRevenue,
        profit: unrealizedProfit,
        returnPct: unrealizedReturnPct,
        holdingDays,
        exitReason: 'Nog in Positie (Lopende Trade)',
        isOpen: true,
        isWin: unrealizedProfit > 0
      });
    }

    const finalStrategyValue = cash + (shares * lastPrice);
    const finalBuyAndHoldValue = (initialCapital / firstPrice) * lastPrice;

    const strategyTotalProfit = finalStrategyValue - initialCapital;
    const strategyTotalReturnPct = ((finalStrategyValue - initialCapital) / initialCapital) * 100;

    const buyAndHoldTotalProfit = finalBuyAndHoldValue - initialCapital;
    const buyAndHoldTotalReturnPct = ((finalBuyAndHoldValue - initialCapital) / initialCapital) * 100;

    const outperformancePct = strategyTotalReturnPct - buyAndHoldTotalReturnPct;

    const totalTradesCount = trades.length;
    const winningTrades = trades.filter(t => t.profit > 0);
    const losingTrades = trades.filter(t => t.profit <= 0);
    const winRate = totalTradesCount > 0 ? (winningTrades.length / totalTradesCount) * 100 : 0;

    const grossGains = winningTrades.reduce((acc, t) => acc + t.profit, 0);
    const grossLosses = Math.abs(losingTrades.reduce((acc, t) => acc + t.profit, 0));
    const profitFactor = grossLosses > 0 ? grossGains / grossLosses : grossGains > 0 ? 99.9 : 1.0;

    const avgHoldingDays = totalTradesCount > 0 ? Math.round(trades.reduce((acc, t) => acc + t.holdingDays, 0) / totalTradesCount) : 0;
    const avgTradeReturnPct = totalTradesCount > 0 ? trades.reduce((acc, t) => acc + t.returnPct, 0) / totalTradesCount : 0;

    res.json({
      ticker: tickerSymbol,
      name: stockName,
      stockId,
      timeframe: {
        startDate: priceList[0].date,
        endDate: priceList[priceList.length - 1].date,
        totalTradingDays: priceList.length
      },
      parameters: {
        initialCapital,
        requireScore5,
        requireWaardeverdelingRise,
        useMacdSell,
        useWaardeverdelingSell,
        sellOnScoreDrop
      },
      kpis: {
        initialCapital,
        finalStrategyValue: Math.round(finalStrategyValue * 100) / 100,
        strategyTotalProfit: Math.round(strategyTotalProfit * 100) / 100,
        strategyTotalReturnPct: Math.round(strategyTotalReturnPct * 100) / 100,

        finalBuyAndHoldValue: Math.round(finalBuyAndHoldValue * 100) / 100,
        buyAndHoldTotalProfit: Math.round(buyAndHoldTotalProfit * 100) / 100,
        buyAndHoldTotalReturnPct: Math.round(buyAndHoldTotalReturnPct * 100) / 100,

        outperformancePct: Math.round(outperformancePct * 100) / 100,
        winRate: Math.round(winRate * 10) / 10,
        totalTrades: totalTradesCount,
        winningTradesCount: winningTrades.length,
        losingTradesCount: losingTrades.length,
        profitFactor: Math.round(profitFactor * 100) / 100,
        maxDrawdownPct: Math.round(maxDrawdown * 10) / 10,
        avgHoldingDays,
        avgTradeReturnPct: Math.round(avgTradeReturnPct * 10) / 10
      },
      trades: trades.reverse(),
      timelineEvents: timelineEvents.reverse(),
      equityCurve
    });

  } catch (error) {
    console.error('Fout in runBacktest:', error);
    res.status(500).json({ message: `Serverfout bij uitvoeren backtest: ${error.message}` });
  }
};

// 2. Dynamische Score 5/5 Portfolio Simulatie (Spike-free with lastKnownPrice + Actieve Herbalancering + Benchmarks + Trendfilter, Waarderingsfilter & Stop-Loss)
const runDynamicScore5PortfolioBacktest = async (req, res) => {
  const { 
    initialCapital = 10000,
    useWaardeverdelingSell = true,
    sellOnScoreDrop = true,
    useMacdSell = false,
    usePortfolioRelativeWeight = true,
    enableActiveRebalance = true,
    useTrendFilter200Sma = false,
    stopLossPct = 0,
    maxPositions = 0,
    minWaardeverdeling = 0,
    maxPriceToIntrinsicRatio = 0, // 0 = off, e.g. 1.2 = max 20% overwaardering
    takeProfitAtIntrinsicRatio = 0, // 0 = off, e.g. 2.5 = winstname bij 2.5x intrinsieke waarde
    maxDebtRatio = 0 // 0 = off, e.g. 0.60
  } = req.body;

  try {
    const stocksRes = await sql.query('SELECT aandeel_id, ticker_symbol, name, asset_type_id FROM Stocks WHERE asset_type_id = 1 OR asset_type_id IS NULL');
    const stocks = stocksRes.recordset;

    const pricesRes = await sql.query('SELECT aandeel_id, date, closing_price FROM DailyClosingPrices ORDER BY date ASC');
    const calcsRes = await sql.query('SELECT stock_id, period_end_date, selectiecriteria, waarde_verdeling, intrinsieke_waarde, waardefactor_FCF, waardefactor_LTD_equity, ltd_equity_mean, gem_groeipercentage_FCF FROM stock_calculations ORDER BY period_end_date ASC');
    const alertsRes = await sql.query("SELECT aandeel_id, date, type_melding FROM MACDAlerts WHERE type_melding = 'Koopsignaal'");

    // Ophalen Benchmarks (S&P 500 & MSCI World)
    const { spyMap, worldMap } = await getBenchmarkSeries();

    const pricesByStock = new Map();
    pricesRes.recordset.forEach(p => {
      if (!pricesByStock.has(p.aandeel_id)) pricesByStock.set(p.aandeel_id, []);
      pricesByStock.get(p.aandeel_id).push(p);
    });

    const calcsByStock = new Map();
    calcsRes.recordset.forEach(c => {
      if (!calcsByStock.has(c.stock_id)) calcsByStock.set(c.stock_id, []);
      calcsByStock.get(c.stock_id).push(c);
    });

    const alertsByStock = new Map();
    alertsRes.recordset.forEach(a => {
      if (!alertsByStock.has(a.aandeel_id)) alertsByStock.set(a.aandeel_id, new Set());
      const dStr = a.date instanceof Date ? a.date.toISOString().split('T')[0] : a.date;
      alertsByStock.get(a.aandeel_id).add(dStr);
    });

    const allDatesSet = new Set();
    pricesRes.recordset.forEach(p => {
      const dStr = p.date instanceof Date ? p.date.toISOString().split('T')[0] : p.date;
      allDatesSet.add(dStr);
    });
    const allDates = Array.from(allDatesSet).sort();

    if (allDates.length === 0) {
      return res.status(400).json({ message: 'Geen koersdata beschikbaar in database.' });
    }

    const stockData = new Map();
    for (const s of stocks) {
      const pList = pricesByStock.get(s.aandeel_id) || [];
      if (pList.length < 5) continue;
      const pricesOnly = pList.map(p => parseFloat(p.closing_price));
      const macdSeries = calculateFullMACDSeries(pList);
      const priceMap = new Map();
      const sma200Map = new Map();
      const buySignals = new Set(alertsByStock.get(s.aandeel_id) || []);

      // Bereken 200 SMA
      for (let i = 0; i < pricesOnly.length; i++) {
        const dStr = pList[i].date instanceof Date ? pList[i].date.toISOString().split('T')[0] : pList[i].date;
        priceMap.set(dStr, pricesOnly[i]);
        if (i >= 199) {
          const sum = pricesOnly.slice(i - 199, i + 1).reduce((a, b) => a + b, 0);
          sma200Map.set(dStr, sum / 200);
        }

        if (i > 0) {
          const prev = macdSeries[i-1];
          const curr = macdSeries[i];
          if (!isNaN(prev.macdLine) && !isNaN(prev.signalLine) && !isNaN(curr.macdLine) && !isNaN(curr.signalLine)) {
            if (prev.macdLine <= prev.signalLine && curr.macdLine > curr.signalLine) {
              buySignals.add(dStr);
            }
          }
        }
      }

      const cList = calcsByStock.get(s.aandeel_id) || [];
      const latestPrice = parseFloat(pList[pList.length - 1].closing_price);
      stockData.set(s.aandeel_id, {
        ...s,
        priceMap,
        sma200Map,
        buySignals,
        cList,
        latestPrice,
        lastKnownPrice: parseFloat(pList[0].closing_price)
      });
    }

    const getCalc = (cList, dStr) => {
      const target = new Date(dStr).getTime();
      let curr = null, prev = null;
      for (let i = 0; i < cList.length; i++) {
        const t = new Date(cList[i].period_end_date).getTime();
        if (t <= target) {
          prev = curr;
          curr = cList[i];
        } else break;
      }
      return { curr, prev };
    };

    // Benchmark basis startkoersen
    let initialSpyPrice = null;
    let initialWorldPrice = null;
    let lastSpyPrice = null;
    let lastWorldPrice = null;

    for (let i = 0; i < allDates.length; i++) {
      const dt = allDates[i];
      if (spyMap.has(dt)) {
        if (initialSpyPrice === null) initialSpyPrice = spyMap.get(dt);
        lastSpyPrice = spyMap.get(dt);
      }
      if (worldMap.has(dt)) {
        if (initialWorldPrice === null) initialWorldPrice = worldMap.get(dt);
        lastWorldPrice = worldMap.get(dt);
      }
    }
    if (initialSpyPrice === null) initialSpyPrice = 200;
    if (initialWorldPrice === null) initialWorldPrice = 70;
    if (lastSpyPrice === null) lastSpyPrice = initialSpyPrice;
    if (lastWorldPrice === null) lastWorldPrice = initialWorldPrice;

    let cash = parseFloat(initialCapital);
    const positions = new Map(); // aandeel_id -> { shares, cost, entryPrice, entryDate, entryWv, entryScore, lastEvaluatedQuarterDate }
    const trades = [];
    const equityCurve = [];
    let peakValue = initialCapital;
    let maxDrawdown = 0;

    for (let i = 0; i < allDates.length; i++) {
      const dStr = allDates[i];

      // Update benchmark prijzen
      if (spyMap.has(dStr)) lastSpyPrice = spyMap.get(dStr);
      if (worldMap.has(dStr)) lastWorldPrice = worldMap.get(dStr);

      // Update lastKnownPrice voor alle aandelen die vandaag handelden
      for (const [stockId, sInfo] of stockData.entries()) {
        if (sInfo.priceMap.has(dStr)) {
          sInfo.lastKnownPrice = sInfo.priceMap.get(dStr);
        }
      }

      // Actuele portfoliowaarde
      let currentInvested = 0;
      for (const [stockId, pos] of positions.entries()) {
        const sInfo = stockData.get(stockId);
        currentInvested += pos.shares * sInfo.lastKnownPrice;
      }
      const currentTotalVal = cash + currentInvested;

      // 1. Check REGULIERE & BESCHERMENDE VERKOOP voor actieve posities
      for (const [stockId, pos] of Array.from(positions.entries())) {
        const sInfo = stockData.get(stockId);
        if (!sInfo.priceMap.has(dStr)) continue;
        const price = sInfo.priceMap.get(dStr);

        const { curr, prev } = getCalc(sInfo.cList, dStr);
        const score = curr ? (curr.selectiecriteria ?? 5) : 5;
        const wv = curr ? curr.waarde_verdeling : 0;
        const prevWv = prev ? prev.waarde_verdeling : null;
        const currQuarterDate = curr ? (curr.period_end_date instanceof Date ? curr.period_end_date.toISOString().split('T')[0] : curr.period_end_date) : null;
        const returnPct = ((price - pos.entryPrice) / pos.entryPrice) * 100;

        const intrinsicVal = curr ? curr.intrinsieke_waarde : 0;

        // REGEL -1: Winstname bij Extreme Overwaardering (Koers >= X * Intrinsieke Waarde)
        if (takeProfitAtIntrinsicRatio > 0 && intrinsicVal > 0 && price >= intrinsicVal * Number(takeProfitAtIntrinsicRatio) && pos.entryDate !== dStr) {
          const revenue = pos.shares * price;
          const profit = revenue - pos.cost;
          const holdingDays = Math.max(1, Math.round((new Date(dStr) - new Date(pos.entryDate)) / (1000 * 60 * 60 * 24)));
          const sellReason = `💰 Winstname Extreme Overwaardering (Koers €${price.toFixed(2)} >= ${takeProfitAtIntrinsicRatio}x Intrinsieke Waarde €${intrinsicVal.toFixed(2)})`;

          cash += revenue;
          trades.push({
            ticker: sInfo.ticker_symbol,
            name: sInfo.name,
            tradeNumber: trades.length + 1,
            type: 'TAKE_PROFIT_VALUATION',
            sellPct: 100,
            sharesSold: pos.shares,
            sharesRemaining: 0,
            entryDate: pos.entryDate,
            entryPrice: pos.entryPrice,
            shares: pos.shares,
            cost: pos.cost,
            entryReason: pos.entryReason,
            exitDate: dStr,
            exitPrice: price,
            revenue,
            profit,
            returnPct,
            holdingDays,
            exitReason: sellReason,
            isWin: profit > 0
          });
          positions.delete(stockId);
        }
        // REGEL 0: Harde Stop-Loss (Verliesbescherming)
        else if (stopLossPct > 0 && returnPct <= -Number(stopLossPct) && pos.entryDate !== dStr) {
          const revenue = pos.shares * price;
          const profit = revenue - pos.cost;
          const holdingDays = Math.max(1, Math.round((new Date(dStr) - new Date(pos.entryDate)) / (1000 * 60 * 60 * 24)));
          const sellReason = `🛑 Stop-Loss (${returnPct.toFixed(1)}% <= -${stopLossPct}%) -> Verkocht om kapitaal te beschermen`;

          cash += revenue;
          trades.push({
            ticker: sInfo.ticker_symbol,
            name: sInfo.name,
            tradeNumber: trades.length + 1,
            type: 'STOP_LOSS',
            sellPct: 100,
            sharesSold: pos.shares,
            sharesRemaining: 0,
            entryDate: pos.entryDate,
            entryPrice: pos.entryPrice,
            shares: pos.shares,
            cost: pos.cost,
            entryReason: pos.entryReason,
            exitDate: dStr,
            exitPrice: price,
            revenue,
            profit,
            returnPct,
            holdingDays,
            exitReason: sellReason,
            isStopLoss: true,
            isWin: false
          });
          positions.delete(stockId);
        }
        // REGEL 1: Score < 5 -> 100% Volledige verkoop
        else if (sellOnScoreDrop && score < 5 && pos.entryDate !== dStr) {
          const revenue = pos.shares * price;
          const profit = revenue - pos.cost;
          const returnPct = ((price - pos.entryPrice) / pos.entryPrice) * 100;
          const holdingDays = Math.max(1, Math.round((new Date(dStr) - new Date(pos.entryDate)) / (1000 * 60 * 60 * 24)));
          const sellReason = `Score is gezakt naar ${score}/5 (Geen 5 meer) -> 100% Verkocht`;

          cash += revenue;
          trades.push({
            ticker: sInfo.ticker_symbol,
            name: sInfo.name,
            tradeNumber: trades.length + 1,
            type: 'FULL_EXIT',
            sellPct: 100,
            sharesSold: pos.shares,
            sharesRemaining: 0,
            entryDate: pos.entryDate,
            entryPrice: pos.entryPrice,
            shares: pos.shares,
            cost: pos.cost,
            entryReason: pos.entryReason,
            exitDate: dStr,
            exitPrice: price,
            revenue,
            profit,
            returnPct,
            holdingDays,
            exitReason: sellReason,
            isWin: profit > 0
          });
          positions.delete(stockId);
        }
        // REGEL 2: Score blijft 5/5, maar Waardeverdeling daalt -> Deelverkoop (% daling)
        else if (useWaardeverdelingSell && score === 5 && prevWv != null && wv != null && wv < prevWv && pos.lastEvaluatedQuarterDate !== currQuarterDate && pos.entryDate !== dStr) {
          const dropFraction = Math.min(1, Math.max(0, (prevWv - wv) / prevWv));
          const dropPct = dropFraction * 100;
          const sharesToSell = Math.min(pos.shares, Math.max(1, Math.round(pos.shares * dropFraction)));

          if (sharesToSell > 0) {
            const costOfSoldShares = pos.cost * (sharesToSell / pos.shares);
            const revenue = sharesToSell * price;
            const profit = revenue - costOfSoldShares;
            const returnPct = ((price - pos.entryPrice) / pos.entryPrice) * 100;
            const holdingDays = Math.max(1, Math.round((new Date(dStr) - new Date(pos.entryDate)) / (1000 * 60 * 60 * 24)));
            const sellReason = `Deelverkoop ${dropPct.toFixed(1)}% (Waardeverdeling daling ${dropPct.toFixed(1)}%: ${prevWv.toFixed(1)} -> ${wv.toFixed(1)})`;

            cash += revenue;
            trades.push({
              ticker: sInfo.ticker_symbol,
              name: sInfo.name,
              tradeNumber: trades.length + 1,
              type: 'PARTIAL_EXIT',
              sellPct: parseFloat(dropPct.toFixed(1)),
              sharesSold: sharesToSell,
              sharesRemaining: pos.shares - sharesToSell,
              entryDate: pos.entryDate,
              entryPrice: pos.entryPrice,
              shares: sharesToSell,
              cost: costOfSoldShares,
              entryReason: pos.entryReason,
              exitDate: dStr,
              exitPrice: price,
              revenue,
              profit,
              returnPct,
              holdingDays,
              exitReason: sellReason,
              isWin: profit > 0
            });

            pos.shares -= sharesToSell;
            if (pos.shares <= 0) {
              positions.delete(stockId);
            } else {
              pos.cost -= costOfSoldShares;
              pos.lastEvaluatedQuarterDate = currQuarterDate;
            }
          }
        }
      }

      // 2. Bereken op datum dStr de totale som van alle positieve Waardeverdelingen van aandelen met Score 5 (voor Relatieve Weging)
      let totalScore5WvToday = 0;
      if (usePortfolioRelativeWeight) {
        for (const [sId, sInfo] of stockData.entries()) {
          const { curr } = getCalc(sInfo.cList, dStr);
          if (curr && (curr.selectiecriteria ?? 5) === 5 && curr.waarde_verdeling > 0) {
            totalScore5WvToday += curr.waarde_verdeling;
          }
        }
      }

      // 3. Check KOOP kandidaten (Score 5 + Stijgende Waardeverdeling + MACD Koopsignaal + Trendfilter)
      const candidateList = [];
      for (const [stockId, sInfo] of stockData.entries()) {
        if (!sInfo.buySignals.has(dStr)) continue;
        if (!sInfo.priceMap.has(dStr)) continue;
        const price = sInfo.priceMap.get(dStr);
        if (!price || price <= 0) continue;

        const { curr, prev } = getCalc(sInfo.cList, dStr);
        const score = curr ? (curr.selectiecriteria ?? 5) : 5;
        const wv = curr ? curr.waarde_verdeling : 0;
        const prevWv = prev ? prev.waarde_verdeling : null;
        const isWvRising = prevWv == null || (wv != null && prevWv != null && wv >= prevWv);
        const currQuarterDate = curr ? (curr.period_end_date instanceof Date ? curr.period_end_date.toISOString().split('T')[0] : curr.period_end_date) : null;

        if (score === 5 && isWvRising && wv >= Number(minWaardeverdeling)) {
          // Trendfilter: Koop enkel als koers boven 200 SMA staat
          if (useTrendFilter200Sma) {
            const sma = sInfo.sma200Map.get(dStr);
            if (sma && price < sma) continue;
          }

          // Waarderingsfilter: Koop enkel als koers niet zwaar boven intrinsieke waarde noteert
          const intrinsicVal = curr ? curr.intrinsieke_waarde : 0;
          if (maxPriceToIntrinsicRatio > 0 && intrinsicVal > 0 && price > intrinsicVal * Number(maxPriceToIntrinsicRatio)) {
            continue;
          }

          // Solvabiliteitsfilter: Maximaal toegestane schuld/equity ratio
          const debtRatio = curr ? (curr.ltd_equity_mean ?? curr.waardefactor_LTD_equity ?? 0) : 0;
          if (maxDebtRatio > 0 && debtRatio > Number(maxDebtRatio)) {
            continue;
          }

          candidateList.push({ stockId, sInfo, price, score, wv, prevWv, currQuarterDate });
        }
      }

      // Sorteer op Waardeverdeling aflopend (hoogste WV eerst)
      candidateList.sort((a, b) => b.wv - a.wv);

      for (const candidate of candidateList) {
        const { stockId, sInfo, price, score, wv, prevWv, currQuarterDate } = candidate;

        // MAX POSITIES FILTER (FOCUS OP DE TOP POSITIES MET HOOGSTE WAARDEVERDELING)
        if (maxPositions && !positions.has(stockId) && positions.size >= Number(maxPositions)) {
          let lowestWvInPos = Infinity, lowestStockId = null;
          for (const [pId, pPos] of positions.entries()) {
            const pInfo = stockData.get(pId);
            const { curr: pCurr } = getCalc(pInfo.cList, dStr);
            const pWv = pCurr ? pCurr.waarde_verdeling : 0;
            if (pWv < lowestWvInPos) {
              lowestWvInPos = pWv;
              lowestStockId = pId;
            }
          }

          if (lowestStockId && wv > lowestWvInPos) {
            const pInfo = stockData.get(lowestStockId);
            const pPos = positions.get(lowestStockId);
            const pPrice = pInfo.priceMap.get(dStr) || pInfo.lastKnownPrice;
            const revenue = pPos.shares * pPrice;
            const profit = revenue - pPos.cost;
            const returnPct = ((pPrice - pPos.entryPrice) / pPos.entryPrice) * 100;
            const holdingDays = Math.max(1, Math.round((new Date(dStr) - new Date(pPos.entryDate)) / (1000 * 60 * 60 * 24)));
            const sellReason = `🎯 Top ${maxPositions} Focus: Ruimte gemaakt voor ${sInfo.ticker_symbol} (WV: ${wv.toFixed(1)}% vs ${pInfo.ticker_symbol} WV: ${lowestWvInPos.toFixed(1)}%)`;

            cash += revenue;
            trades.push({
              ticker: pInfo.ticker_symbol,
              name: pInfo.name,
              tradeNumber: trades.length + 1,
              type: 'FULL_EXIT',
              sellPct: 100,
              sharesSold: pPos.shares,
              sharesRemaining: 0,
              entryDate: pPos.entryDate,
              entryPrice: pPos.entryPrice,
              shares: pPos.shares,
              cost: pPos.cost,
              entryReason: pPos.entryReason,
              exitDate: dStr,
              exitPrice: pPrice,
              revenue,
              profit,
              returnPct,
              holdingDays,
              exitReason: sellReason,
              isRebalance: true,
              targetTicker: sInfo.ticker_symbol,
              isWin: profit > 0
            });
            positions.delete(lowestStockId);
          } else {
            continue; // Portfolio is al maximaal bezet met hogere kwaliteit
          }
        }

        let targetAlloc;
        if (usePortfolioRelativeWeight && totalScore5WvToday > 0) {
          const relPct = wv / totalScore5WvToday;
          const maxSingleWeight = maxPositions > 0 ? Math.max(0.12, 1.2 / Number(maxPositions)) : 0.25;
          targetAlloc = currentTotalVal * Math.min(maxSingleWeight, relPct * 2.0);
        } else {
          targetAlloc = currentTotalVal * Math.min(0.25, (wv / 100) * 1.5);
        }

        const currentHoldingCost = positions.get(stockId)?.cost || 0;
        const neededAlloc = Math.max(0, targetAlloc - currentHoldingCost);

        if (neededAlloc < price * 0.5 && cash < price) continue;

        // OPTIE 1: ACTIEVE HERBALANCERING / SNOEIEN WANNEER CASH ONVOLDOENDE IS VOOR STREEFALLOCATIE
        if (enableActiveRebalance && cash < Math.max(price, neededAlloc)) {
          const prunablePositions = [];
          for (const [pStockId, pPos] of positions.entries()) {
            if (pStockId === stockId) continue;
            const pInfo = stockData.get(pStockId);
            const pPrice = pInfo.priceMap.get(dStr) || pInfo.lastKnownPrice;
            if (!pPrice || pPrice <= 0) continue;

            const { curr: pCurr } = getCalc(pInfo.cList, dStr);
            const pScore = pCurr ? (pCurr.selectiecriteria ?? 5) : 5;
            const pWv = pCurr ? pCurr.waarde_verdeling : 0;
            const pHoldingVal = pPos.shares * pPrice;
            const pRelPct = totalScore5WvToday > 0 ? (pWv / totalScore5WvToday) : (pWv / 100);
            const pMaxWeight = maxPositions > 0 ? Math.max(0.12, 1.2 / Number(maxPositions)) : 0.25;
            const pIdealVal = currentTotalVal * Math.min(pMaxWeight, pRelPct * 2.0);

            if (pScore < 5 || pHoldingVal > pIdealVal * 1.05 || pWv < wv) {
              prunablePositions.push({
                pStockId,
                pPos,
                pInfo,
                pPrice,
                pScore,
                pWv,
                pHoldingVal,
                pIdealVal,
                excessValue: Math.max(0, pHoldingVal - pIdealVal),
                isOverweight: pHoldingVal > pIdealVal * 1.05
              });
            }
          }

          prunablePositions.sort((a, b) => {
            if (a.pScore !== b.pScore) return a.pScore - b.pScore;
            if (a.excessValue !== b.excessValue) return b.excessValue - a.excessValue;
            return a.pWv - b.pWv;
          });

          for (const pruneItem of prunablePositions) {
            if (cash >= neededAlloc && cash >= price) break;

            const { pStockId, pPos, pInfo, pPrice, pScore, pWv, pHoldingVal, pIdealVal, excessValue, isOverweight } = pruneItem;
            if (!positions.has(pStockId) || pPos.shares <= 0) continue;

            const cashShortage = Math.max(price, neededAlloc) - cash;
            let sharesToPrune = 0;

            if (pScore < 5) {
              sharesToPrune = pPos.shares;
            } else if (excessValue > 0) {
              sharesToPrune = Math.min(pPos.shares, Math.ceil(Math.min(cashShortage, excessValue) / pPrice));
            } else if (pWv < wv) {
              const maxSnoeiShares = Math.max(1, Math.floor(pPos.shares * 0.35));
              sharesToPrune = Math.min(maxSnoeiShares, Math.ceil(cashShortage / pPrice));
            }

            if (sharesToPrune > 0) {
              const costOfSold = pPos.cost * (sharesToPrune / pPos.shares);
              const revenue = sharesToPrune * pPrice;
              const profit = revenue - costOfSold;
              const returnPct = ((pPrice - pPos.entryPrice) / pPos.entryPrice) * 100;
              const holdingDays = Math.max(1, Math.round((new Date(dStr) - new Date(pPos.entryDate)) / (1000 * 60 * 60 * 24)));
              const isFullExit = sharesToPrune >= pPos.shares;
              const sellReason = `✂️ Herbalancering: Ruimte gemaakt voor ${sInfo.ticker_symbol} (WV: ${wv.toFixed(1)}% vs ${pInfo.ticker_symbol} WV: ${pWv.toFixed(1)}%)`;

              cash += revenue;
              trades.push({
                ticker: pInfo.ticker_symbol,
                name: pInfo.name,
                tradeNumber: trades.length + 1,
                type: isFullExit ? 'FULL_EXIT' : 'REBALANCE_TRIM',
                sellPct: parseFloat(((sharesToPrune / pPos.shares) * 100).toFixed(1)),
                sharesSold: sharesToPrune,
                sharesRemaining: pPos.shares - sharesToPrune,
                entryDate: pPos.entryDate,
                entryPrice: pPos.entryPrice,
                shares: sharesToPrune,
                cost: costOfSold,
                entryReason: pPos.entryReason,
                exitDate: dStr,
                exitPrice: pPrice,
                revenue,
                profit,
                returnPct,
                holdingDays,
                exitReason: sellReason,
                isRebalance: true,
                targetTicker: sInfo.ticker_symbol,
                isWin: profit > 0
              });

              pPos.shares -= sharesToPrune;
              if (pPos.shares <= 0) {
                positions.delete(pStockId);
              } else {
                pPos.cost -= costOfSold;
              }
            }
          }
        }

        // Koop uitvoeren als er cash beschikbaar is
        if (cash >= price) {
          const cashToUse = Math.min(cash, Math.max(price, neededAlloc));
          const sharesToBuy = Math.max(1, Math.floor(cashToUse / price));

          if (sharesToBuy > 0 && sharesToBuy * price <= cash) {
            const cost = sharesToBuy * price;
            cash -= cost;

            const existingPos = positions.get(stockId);
            if (!existingPos) {
              positions.set(stockId, {
                shares: sharesToBuy,
                cost,
                entryPrice: price,
                entryDate: dStr,
                entryWv: wv,
                entryScore: score,
                lastEvaluatedQuarterDate: currQuarterDate,
                entryReason: `MACD Koop + Score 5/5 + WV Gestegen (${prevWv != null ? prevWv.toFixed(1) : '-'} -> ${wv.toFixed(1)})`
              });
            } else {
              existingPos.shares += sharesToBuy;
              existingPos.cost += cost;
              existingPos.entryPrice = existingPos.cost / existingPos.shares;
              existingPos.lastEvaluatedQuarterDate = currQuarterDate;
            }
          }
        }
      }

      // Snapshot na dagtransacties met actuele lastKnownPrice
      let finalDayInvested = 0;
      for (const [stockId, pos] of positions.entries()) {
        const sInfo = stockData.get(stockId);
        finalDayInvested += pos.shares * sInfo.lastKnownPrice;
      }
      const finalDayTotal = cash + finalDayInvested;

      if (finalDayTotal > peakValue) {
        peakValue = finalDayTotal;
      }
      const currentDd = ((peakValue - finalDayTotal) / peakValue) * 100;
      if (currentDd > maxDrawdown) {
        maxDrawdown = currentDd;
      }

      // Benchmark berekeningen voor vandaag
      const spyReturnPct = initialSpyPrice ? ((lastSpyPrice - initialSpyPrice) / initialSpyPrice) * 100 : 0;
      const spyValue = initialCapital * (1 + spyReturnPct / 100);
      const spyProfit = spyValue - initialCapital;

      const worldReturnPct = initialWorldPrice ? ((lastWorldPrice - initialWorldPrice) / initialWorldPrice) * 100 : 0;
      const worldValue = initialCapital * (1 + worldReturnPct / 100);
      const worldProfit = worldValue - initialCapital;

      const strategyProfit = finalDayTotal - initialCapital;
      const strategyReturnPct = ((finalDayTotal - initialCapital) / initialCapital) * 100;

      if (i % 2 === 0 || i === allDates.length - 1) {
        equityCurve.push({
          date: dStr,
          strategyValue: Math.round(finalDayTotal * 100) / 100,
          strategyProfit: Math.round(strategyProfit * 100) / 100,
          strategyReturnPct: Math.round(strategyReturnPct * 100) / 100,

          sp500Value: Math.round(spyValue * 100) / 100,
          sp500Profit: Math.round(spyProfit * 100) / 100,
          sp500ReturnPct: Math.round(spyReturnPct * 100) / 100,

          worldValue: Math.round(worldValue * 100) / 100,
          worldProfit: Math.round(worldProfit * 100) / 100,
          worldReturnPct: Math.round(worldReturnPct * 100) / 100,

          cash: Math.round(cash * 100) / 100,
          invested: Math.round(finalDayInvested * 100) / 100,
          activePositionsCount: positions.size
        });
      }
    }

    // Open posities met hun actuele koersen
    const finalDateStr = allDates[allDates.length - 1];
    const openPositionsList = [];

    for (const [stockId, pos] of positions.entries()) {
      const sInfo = stockData.get(stockId);
      const actualLatestPrice = sInfo.latestPrice || pos.entryPrice;
      const unrealizedRevenue = pos.shares * actualLatestPrice;
      const unrealizedProfit = unrealizedRevenue - pos.cost;
      const unrealizedReturnPct = ((actualLatestPrice - pos.entryPrice) / pos.entryPrice) * 100;
      const holdingDays = Math.max(1, Math.round((new Date(finalDateStr) - new Date(pos.entryDate)) / (1000 * 60 * 60 * 24)));

      const openTrade = {
        ticker: sInfo.ticker_symbol,
        name: sInfo.name,
        tradeNumber: trades.length + 1,
        type: 'OPEN_POSITION',
        sellPct: 0,
        sharesSold: 0,
        sharesRemaining: pos.shares,
        entryDate: pos.entryDate,
        entryPrice: pos.entryPrice,
        shares: pos.shares,
        cost: pos.cost,
        entryReason: pos.entryReason,
        exitDate: `${finalDateStr} (Open)`,
        exitPrice: actualLatestPrice,
        revenue: unrealizedRevenue,
        profit: unrealizedProfit,
        returnPct: unrealizedReturnPct,
        holdingDays,
        exitReason: 'Nog in Positie (Lopende Portfolio Positie)',
        isOpen: true,
        isWin: unrealizedProfit > 0
      };

      trades.push(openTrade);
      openPositionsList.push(openTrade);
    }

    // KPI berekening
    const finalSnapshot = equityCurve[equityCurve.length - 1];
    const finalPortfolioValue = finalSnapshot ? finalSnapshot.strategyValue : initialCapital;
    const totalProfit = finalPortfolioValue - initialCapital;
    const totalReturnPct = ((finalPortfolioValue - initialCapital) / initialCapital) * 100;

    const sp500TotalReturnPct = finalSnapshot ? finalSnapshot.sp500ReturnPct : 0;
    const sp500TotalProfit = finalSnapshot ? finalSnapshot.sp500Profit : 0;
    const worldTotalReturnPct = finalSnapshot ? finalSnapshot.worldReturnPct : 0;
    const worldTotalProfit = finalSnapshot ? finalSnapshot.worldProfit : 0;

    const totalTradesCount = trades.length;
    const winningTrades = trades.filter(t => t.profit > 0);
    const losingTrades = trades.filter(t => t.profit <= 0);
    const winRate = totalTradesCount > 0 ? (winningTrades.length / totalTradesCount) * 100 : 0;

    const rebalanceTradesCount = trades.filter(t => t.isRebalance).length;
    const stopLossTradesCount = trades.filter(t => t.isStopLoss).length;

    const grossGains = winningTrades.reduce((acc, t) => acc + t.profit, 0);
    const grossLosses = Math.abs(losingTrades.reduce((acc, t) => acc + t.profit, 0));
    const profitFactor = grossLosses > 0 ? grossGains / grossLosses : grossGains > 0 ? 99.9 : 1.0;

    // Jaarlijkse Prestatie (Annual Returns breakdown t.o.v. SPY en URTH)
    const byYear = {};
    equityCurve.forEach(pt => {
      const yr = pt.date.split('-')[0];
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(pt);
    });

    const years = Object.keys(byYear).sort();
    let prevStratEnd = Number(initialCapital);
    let prevSpyEnd = equityCurve[0]?.sp500Value || Number(initialCapital);
    let prevWorldEnd = equityCurve[0]?.worldValue || Number(initialCapital);

    const annualPerformance = years.map(yr => {
      const pts = byYear[yr];
      const endPt = pts[pts.length - 1];

      const stratStart = prevStratEnd;
      const stratEnd = endPt.strategyValue;
      const strategyReturnPct = stratStart > 0 ? ((stratEnd - stratStart) / stratStart) * 100 : 0;
      const strategyProfit = stratEnd - stratStart;

      const spyStart = prevSpyEnd;
      const spyEnd = endPt.sp500Value;
      const spyReturnPct = spyStart > 0 ? ((spyEnd - spyStart) / spyStart) * 100 : 0;
      const spyProfit = spyEnd - spyStart;

      const worldStart = prevWorldEnd;
      const worldEnd = endPt.worldValue;
      const worldReturnPct = worldStart > 0 ? ((worldEnd - worldStart) / worldStart) * 100 : 0;
      const worldProfit = worldEnd - worldStart;

      const alphaVsSp500 = strategyReturnPct - spyReturnPct;
      const alphaVsWorld = strategyReturnPct - worldReturnPct;

      prevStratEnd = stratEnd;
      prevSpyEnd = spyEnd;
      prevWorldEnd = worldEnd;

      return {
        year: yr,
        strategyStartValue: Math.round(stratStart * 100) / 100,
        strategyEndValue: Math.round(stratEnd * 100) / 100,
        strategyProfit: Math.round(strategyProfit * 100) / 100,
        strategyReturnPct: Math.round(strategyReturnPct * 100) / 100,

        spyReturnPct: Math.round(spyReturnPct * 100) / 100,
        spyProfit: Math.round(spyProfit * 100) / 100,
        alphaVsSp500: Math.round(alphaVsSp500 * 100) / 100,

        worldReturnPct: Math.round(worldReturnPct * 100) / 100,
        worldProfit: Math.round(worldProfit * 100) / 100,
        alphaVsWorld: Math.round(alphaVsWorld * 100) / 100
      };
    });

    res.json({
      portfolioType: 'dynamic_score5',
      timeframe: {
        startDate: allDates[0],
        endDate: allDates[allDates.length - 1],
        totalTradingDays: allDates.length
      },
      kpis: {
        initialCapital,
        finalPortfolioValue,
        totalProfit: Math.round(totalProfit * 100) / 100,
        totalReturnPct: Math.round(totalReturnPct * 100) / 100,

        // Benchmark vergelijkingen
        sp500TotalReturnPct: Math.round(sp500TotalReturnPct * 100) / 100,
        sp500TotalProfit: Math.round(sp500TotalProfit * 100) / 100,
        outperformanceVsSp500: Math.round((totalReturnPct - sp500TotalReturnPct) * 100) / 100,

        worldTotalReturnPct: Math.round(worldTotalReturnPct * 100) / 100,
        worldTotalProfit: Math.round(worldTotalProfit * 100) / 100,
        outperformanceVsWorld: Math.round((totalReturnPct - worldTotalReturnPct) * 100) / 100,

        winRate: Math.round(winRate * 10) / 10,
        totalTrades: totalTradesCount,
        rebalanceTradesCount,
        stopLossTradesCount,
        winningTradesCount: winningTrades.length,
        losingTradesCount: losingTrades.length,
        profitFactor: Math.round(profitFactor * 100) / 100,
        maxDrawdownPct: Math.round(maxDrawdown * 10) / 10,
        activePositionsCount: positions.size,
        cash: finalSnapshot ? finalSnapshot.cash : 0,
        invested: finalSnapshot ? finalSnapshot.invested : 0
      },
      annualPerformance,
      openPositions: openPositionsList.sort((a, b) => b.revenue - a.revenue),
      trades: trades.reverse(),
      equityCurve
    });

  } catch (error) {
    console.error('Fout in runDynamicScore5PortfolioBacktest:', error);
    res.status(500).json({ message: `Serverfout bij dynamische portfolio backtest: ${error.message}` });
  }
};

// 3. Batch Backtest over Alle Watchlist of Ideale Portfolio Aandelen
const runPortfolioBacktest = async (req, res) => {
  const { 
    portfolioType = 'ideal', 
    initialCapitalPerStock = 10000,
    requireScore5 = true, 
    requireWaardeverdelingRise = true,
    useMacdSell = false,
    useWaardeverdelingSell = true,
    sellOnScoreDrop = true
  } = req.body;

  try {
    const filterCol = portfolioType === 'watchlist' ? 'inWatchlist' : 'inIdealePortfolio';
    const stocksRes = await sql.query(`
      SELECT s.aandeel_id, s.ticker_symbol, s.name 
      FROM Stocks s
      WHERE s.${filterCol} = 1
    `);

    const stocks = stocksRes.recordset;
    if (stocks.length === 0) {
      return res.status(400).json({ message: `Geen aandelen gevonden in ${portfolioType === 'watchlist' ? 'Watchlist' : 'Ideale Portfolio'}.` });
    }

    const results = [];
    for (const stock of stocks) {
      const mockReq = {
        body: {
          stockId: stock.aandeel_id,
          initialCapital: initialCapitalPerStock,
          requireScore5,
          requireWaardeverdelingRise,
          useMacdSell,
          useWaardeverdelingSell,
          sellOnScoreDrop
        }
      };

      let stockResult = null;
      const mockRes = {
        json: (data) => { stockResult = data; },
        status: () => ({ json: () => {} })
      };

      await runBacktest(mockReq, mockRes);
      if (stockResult && stockResult.kpis) {
        results.push({
          ticker: stock.ticker_symbol,
          name: stock.name,
          kpis: stockResult.kpis
        });
      }
    }

    const totalInvested = results.length * initialCapitalPerStock;
    const totalStrategyEndValue = results.reduce((acc, r) => acc + r.kpis.finalStrategyValue, 0);
    const totalBuyAndHoldEndValue = results.reduce((acc, r) => acc + r.kpis.finalBuyAndHoldValue, 0);

    const strategyTotalProfit = totalStrategyEndValue - totalInvested;
    const strategyTotalReturnPct = ((totalStrategyEndValue - totalInvested) / totalInvested) * 100;

    const buyAndHoldTotalProfit = totalBuyAndHoldEndValue - totalInvested;
    const buyAndHoldTotalReturnPct = ((totalBuyAndHoldEndValue - totalInvested) / totalInvested) * 100;

    const totalTrades = results.reduce((acc, r) => acc + r.kpis.totalTrades, 0);
    const totalWins = results.reduce((acc, r) => acc + r.kpis.winningTradesCount, 0);
    const overallWinRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

    res.json({
      portfolioType,
      totalStocks: results.length,
      portfolioSummary: {
        totalInvested,
        totalStrategyEndValue: Math.round(totalStrategyEndValue * 100) / 100,
        strategyTotalProfit: Math.round(strategyTotalProfit * 100) / 100,
        strategyTotalReturnPct: Math.round(strategyTotalReturnPct * 100) / 100,

        totalBuyAndHoldEndValue: Math.round(totalBuyAndHoldEndValue * 100) / 100,
        buyAndHoldTotalProfit: Math.round(buyAndHoldTotalProfit * 100) / 100,
        buyAndHoldTotalReturnPct: Math.round(buyAndHoldTotalReturnPct * 100) / 100,

        outperformancePct: Math.round((strategyTotalReturnPct - buyAndHoldTotalReturnPct) * 100) / 100,
        overallWinRate: Math.round(overallWinRate * 10) / 10,
        totalTrades
      },
      stockBreakdown: results.sort((a, b) => b.kpis.strategyTotalReturnPct - a.kpis.strategyTotalReturnPct)
    });

  } catch (error) {
    console.error('Fout in runPortfolioBacktest:', error);
    res.status(500).json({ message: `Serverfout bij portfolio backtest: ${error.message}` });
  }
};

module.exports = {
  runBacktest,
  runDynamicScore5PortfolioBacktest,
  runPortfolioBacktest
};

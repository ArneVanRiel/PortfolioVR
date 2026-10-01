// backend/scratch_deep_analysis.js
require('dotenv').config();
const { connectToDatabase, sql } = require('./config/database');

async function testStrategies() {
  await connectToDatabase();
  
  const stocksRes = await sql.query('SELECT aandeel_id, ticker_symbol, name FROM Stocks');
  const pricesRes = await sql.query('SELECT aandeel_id, date, closing_price FROM DailyClosingPrices ORDER BY date ASC');
  const calcsRes = await sql.query('SELECT stock_id, period_end_date, selectiecriteria, waarde_verdeling FROM stock_calculations ORDER BY period_end_date ASC');
  const alertsRes = await sql.query("SELECT aandeel_id, date, type_melding FROM MACDAlerts WHERE type_melding = 'Koopsignaal'");
  
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

  const allDatesSet = new Set();
  pricesRes.recordset.forEach(p => {
    const dStr = p.date instanceof Date ? p.date.toISOString().split('T')[0] : p.date;
    allDatesSet.add(dStr);
  });
  const allDates = Array.from(allDatesSet).sort();

  function calculateEMA(data, period) {
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

  function calculateFullMACD(pricesOnly) {
    const fastEMAs = calculateEMA(pricesOnly, 30);
    const slowEMAs = calculateEMA(pricesOnly, 90);
    const macdLines = [];
    for (let i = 0; i < pricesOnly.length; i++) {
      if (i >= 29 && i >= 89 && !isNaN(fastEMAs[i]) && !isNaN(slowEMAs[i])) {
        macdLines.push(fastEMAs[i] - slowEMAs[i]);
      } else {
        macdLines.push(NaN);
      }
    }
    let signalLines = [];
    const validMacdStartIndex = macdLines.findIndex(val => !isNaN(val));
    if (validMacdStartIndex !== -1) {
      const validMacdLines = macdLines.slice(validMacdStartIndex);
      const validSignalLines = calculateEMA(validMacdLines, 9);
      signalLines = Array(validMacdStartIndex).fill(NaN).concat(validSignalLines);
    } else {
      signalLines = Array(pricesOnly.length).fill(NaN);
    }
    return { macdLines, signalLines };
  }

  const stockData = new Map();
  for (const s of stocksRes.recordset) {
    const pList = pricesByStock.get(s.aandeel_id) || [];
    if (pList.length < 5) continue;
    const pricesOnly = pList.map(p => parseFloat(p.closing_price));
    const { macdLines, signalLines } = calculateFullMACD(pricesOnly);
    
    // SMA 200
    const sma200 = [];
    for (let i = 0; i < pricesOnly.length; i++) {
      if (i >= 199) {
        const sum = pricesOnly.slice(i - 199, i + 1).reduce((a, b) => a + b, 0);
        sma200.push(sum / 200);
      } else {
        sma200.push(NaN);
      }
    }

    const priceMap = new Map();
    const sma200Map = new Map();
    const buySignals = new Set();
    const sellSignals = new Set();

    for (let i = 0; i < pList.length; i++) {
      const dStr = pList[i].date instanceof Date ? pList[i].date.toISOString().split('T')[0] : pList[i].date;
      priceMap.set(dStr, pricesOnly[i]);
      sma200Map.set(dStr, sma200[i]);
      if (i > 0) {
        const prevM = macdLines[i-1], prevS = signalLines[i-1];
        const currM = macdLines[i], currS = signalLines[i];
        if (!isNaN(prevM) && !isNaN(prevS) && !isNaN(currM) && !isNaN(currS)) {
          if (prevM <= prevS && currM > currS) buySignals.add(dStr);
          if (prevM >= prevS && currM < currS) sellSignals.add(dStr);
        }
      }
    }

    stockData.set(s.aandeel_id, {
      ...s,
      priceMap,
      sma200Map,
      buySignals,
      sellSignals,
      cList: calcsByStock.get(s.aandeel_id) || [],
      lastKnownPrice: pricesOnly[0]
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

  const scenarios = [
    { name: 'A. Huidige Dynamische Score 5 (25 Posities max, snoei voor topkansen)', maxPositions: 25, useMacdSell: false, minWv: 0, useSma200: false },
    { name: 'B. Geconcentreerd Portfolio (Top 10 hoogste WV aandelen)', maxPositions: 10, useMacdSell: false, minWv: 0, useSma200: false },
    { name: 'C. Geconcentreerd Portfolio (Top 8 hoogste WV aandelen)', maxPositions: 8, useMacdSell: false, minWv: 0, useSma200: false },
    { name: 'D. Geconcentreerd Portfolio (Top 5 hoogste WV aandelen)', maxPositions: 5, useMacdSell: false, minWv: 0, useSma200: false },
    { name: 'E. Top 10 Portfolio + Trendfilter (Koers > 200 SMA)', maxPositions: 10, useMacdSell: false, minWv: 0, useSma200: true },
    { name: 'F. Top 10 Portfolio + MACD Verkoopbescherming (Exit bij MACD verkoopkruising)', maxPositions: 10, useMacdSell: true, minWv: 0, useSma200: false },
    { name: 'G. Top 8 Portfolio + WV Drempel (WV >= 4.0%) + Trendfilter (Koers > 200 SMA)', maxPositions: 8, useMacdSell: false, minWv: 4.0, useSma200: true },
    { name: 'H. Top 10 Portfolio + WV Drempel (WV >= 3.0%) + Stop-Loss (-18%)', maxPositions: 10, useMacdSell: false, minWv: 3.0, useSma200: false, stopLoss: 18 }
  ];

  console.log('=== VERGELIJKINGSRESULTATEN (SPY = +256.0%, MSCI World = +186.9%) ===\n');

  for (const sc of scenarios) {
    let cash = 10000;
    const positions = new Map();
    let tradesCount = 0, winsCount = 0;
    let peak = 10000, maxDd = 0;

    for (let i = 0; i < allDates.length; i++) {
      const dStr = allDates[i];
      for (const [stockId, sInfo] of stockData.entries()) {
        if (sInfo.priceMap.has(dStr)) sInfo.lastKnownPrice = sInfo.priceMap.get(dStr);
      }

      let currentInvested = 0;
      for (const [stockId, pos] of positions.entries()) {
        const sInfo = stockData.get(stockId);
        currentInvested += pos.shares * (sInfo.priceMap.get(dStr) || sInfo.lastKnownPrice);
      }
      const currentTotalVal = cash + currentInvested;
      if (currentTotalVal > peak) peak = currentTotalVal;
      const dd = ((peak - currentTotalVal) / peak) * 100;
      if (dd > maxDd) maxDd = dd;

      // 1. Verkoop check
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

        let fullExit = false;
        if (score < 5 && pos.entryDate !== dStr) fullExit = true;
        else if (sc.useMacdSell && sInfo.sellSignals.has(dStr) && pos.entryDate !== dStr) fullExit = true;
        else if (sc.stopLoss && returnPct <= -sc.stopLoss && pos.entryDate !== dStr) fullExit = true;

        if (fullExit) {
          const rev = pos.shares * price;
          cash += rev;
          tradesCount++;
          if (rev > pos.cost) winsCount++;
          positions.delete(stockId);
        } else if (score === 5 && prevWv != null && wv != null && wv < prevWv && pos.lastEvaluatedQuarterDate !== currQuarterDate && pos.entryDate !== dStr) {
          const dropFraction = Math.min(1, Math.max(0, (prevWv - wv) / prevWv));
          const sharesToSell = Math.min(pos.shares, Math.max(1, Math.round(pos.shares * dropFraction)));
          if (sharesToSell > 0) {
            const rev = sharesToSell * price;
            const costSold = pos.cost * (sharesToSell / pos.shares);
            cash += rev;
            tradesCount++;
            if (rev > costSold) winsCount++;
            pos.shares -= sharesToSell;
            if (pos.shares <= 0) positions.delete(stockId);
            else {
              pos.cost -= costSold;
              pos.lastEvaluatedQuarterDate = currQuarterDate;
            }
          }
        }
      }

      // 2. Score 5 pool
      let totalScore5WvToday = 0;
      for (const [sId, sInfo] of stockData.entries()) {
        const { curr } = getCalc(sInfo.cList, dStr);
        if (curr && (curr.selectiecriteria ?? 5) === 5 && curr.waarde_verdeling > 0) {
          totalScore5WvToday += curr.waarde_verdeling;
        }
      }

      // 3. Koop kandidaten
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

        if (score === 5 && isWvRising && wv >= (sc.minWv || 0)) {
          if (sc.useSma200) {
            const sma = sInfo.sma200Map.get(dStr);
            if (!isNaN(sma) && price < sma) continue;
          }
          candidateList.push({ stockId, sInfo, price, score, wv, currQuarterDate });
        }
      }

      candidateList.sort((a, b) => b.wv - a.wv);

      for (const candidate of candidateList) {
        const { stockId, sInfo, price, score, wv, currQuarterDate } = candidate;
        
        // Check if position limit reached and this stock is not already in portfolio
        if (!positions.has(stockId) && positions.size >= sc.maxPositions) {
          // Vind laagste WV in huidige portfolio
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
          // Als nieuwe kandidaat hogere WV heeft, gooi de allerlaagste er 100% uit!
          if (lowestStockId && wv > lowestWvInPos) {
            const pInfo = stockData.get(lowestStockId);
            const pPos = positions.get(lowestStockId);
            const pPrice = pInfo.priceMap.get(dStr) || pInfo.lastKnownPrice;
            const rev = pPos.shares * pPrice;
            cash += rev;
            tradesCount++;
            if (rev > pPos.cost) winsCount++;
            positions.delete(lowestStockId);
          } else {
            continue; // Skip als we vol zitten en geen betere score hebben
          }
        }

        const relPct = totalScore5WvToday > 0 ? (wv / totalScore5WvToday) * 100 : wv;
        const idealInvested = (currentTotalVal / Math.min(sc.maxPositions, 10)) * (relPct > 0 ? (relPct / 10) : 1);
        const targetAlloc = Math.max(price * 2, Math.min(currentTotalVal * 0.20, idealInvested));
        const currentHoldingCost = positions.get(stockId)?.cost || 0;
        const neededAlloc = Math.max(price, targetAlloc - currentHoldingCost);

        // Snoei als cash < price
        if (cash < price && neededAlloc >= price) {
          const prunable = [];
          for (const [pStockId, pPos] of positions.entries()) {
            if (pStockId === stockId) continue;
            const pInfo = stockData.get(pStockId);
            const pPrice = pInfo.priceMap.get(dStr) || pInfo.lastKnownPrice;
            const { curr: pCurr } = getCalc(pInfo.cList, dStr);
            const pWv = pCurr ? pCurr.waarde_verdeling : 0;
            if (pWv < wv) prunable.push({ pStockId, pPos, pPrice, pWv });
          }
          prunable.sort((a, b) => a.pWv - b.pWv);
          for (const item of prunable) {
            if (cash >= price) break;
            const sharesToPrune = Math.min(item.pPos.shares, Math.ceil((neededAlloc - cash) / item.pPrice));
            if (sharesToPrune > 0) {
              const rev = sharesToPrune * item.pPrice;
              const costS = item.pPos.cost * (sharesToPrune / item.pPos.shares);
              cash += rev;
              tradesCount++;
              if (rev > costS) winsCount++;
              item.pPos.shares -= sharesToPrune;
              item.pPos.cost -= costS;
              if (item.pPos.shares <= 0) positions.delete(item.pStockId);
            }
          }
        }

        if (cash >= price) {
          const cashToUse = Math.min(cash, neededAlloc);
          let sharesToBuy = Math.floor(cashToUse / price);
          if (sharesToBuy === 0 && cash >= price && neededAlloc >= price * 0.75) sharesToBuy = 1;
          if (sharesToBuy > 0) {
            const cost = sharesToBuy * price;
            if (cost <= cash) {
              cash -= cost;
              const existing = positions.get(stockId);
              if (!existing) {
                positions.set(stockId, {
                  shares: sharesToBuy,
                  cost,
                  entryPrice: price,
                  entryDate: dStr,
                  lastEvaluatedQuarterDate: currQuarterDate
                });
              } else {
                existing.shares += sharesToBuy;
                existing.cost += cost;
                existing.entryPrice = existing.cost / existing.shares;
                existing.lastEvaluatedQuarterDate = currQuarterDate;
              }
            }
          }
        }
      }
    }

    let finalInvested = 0;
    for (const [stockId, pos] of positions.entries()) {
      const sInfo = stockData.get(stockId);
      finalInvested += pos.shares * sInfo.lastKnownPrice;
    }
    const endValue = cash + finalInvested;
    const profit = endValue - 10000;
    const returnPct = (profit / 10000) * 100;
    const winrate = tradesCount > 0 ? (winsCount / tradesCount) * 100 : 0;

    console.log(sc.name);
    console.log('  -> Eindwaarde: € ' + endValue.toFixed(2) + ' (+' + returnPct.toFixed(1) + '%) | Winst: € ' + profit.toFixed(2) + ' | Winrate: ' + winrate.toFixed(1) + '% | Max Drawdown: -' + maxDd.toFixed(1) + '%\n');
  }

  process.exit(0);
}

testStrategies();

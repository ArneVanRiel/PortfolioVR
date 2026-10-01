// backend/scratch_strategy_test.js
require('dotenv').config();
const { connectToDatabase, sql } = require('./config/database');

async function testImprovements() {
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
    
    // 200 SMA
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
    const buySignals = new Set(alertsByStock.get(s.aandeel_id) || []);

    for (let i = 0; i < pList.length; i++) {
      const dStr = pList[i].date instanceof Date ? pList[i].date.toISOString().split('T')[0] : pList[i].date;
      priceMap.set(dStr, pricesOnly[i]);
      sma200Map.set(dStr, sma200[i]);
      if (i > 0) {
        const prevM = macdLines[i-1], prevS = signalLines[i-1];
        const currM = macdLines[i], currS = signalLines[i];
        if (!isNaN(prevM) && !isNaN(prevS) && !isNaN(currM) && !isNaN(currS)) {
          if (prevM <= prevS && currM > currS) {
            buySignals.add(dStr);
          }
        }
      }
    }

    stockData.set(s.aandeel_id, {
      ...s,
      priceMap,
      sma200Map,
      buySignals,
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
    { name: '1. Huidige Basis Strategie (Zonder extra filters)', minWv: 0, useSma200: false, maxLossStop: null, trailingStop: null },
    { name: '2. + Min. Waardeverdeling >= 3.0%', minWv: 3.0, useSma200: false, maxLossStop: null, trailingStop: null },
    { name: '3. + Min. Waardeverdeling >= 5.0%', minWv: 5.0, useSma200: false, maxLossStop: null, trailingStop: null },
    { name: '4. + Trendfilter (Koop enkel wanneer Koers > 200 SMA)', minWv: 0, useSma200: true, maxLossStop: null, trailingStop: null },
    { name: '5. + Harde Stop-Loss (-15% max verlies per positie)', minWv: 0, useSma200: false, maxLossStop: 15, trailingStop: null },
    { name: '6. + Harde Stop-Loss (-10% max verlies per positie)', minWv: 0, useSma200: false, maxLossStop: 10, trailingStop: null },
    { name: '7. + Trailing Stop (-20% vanaf hoogste punt)', minWv: 0, useSma200: false, maxLossStop: null, trailingStop: 20 },
    { name: '8. COMBINATIE 1: WV >= 3% + Koers > 200 SMA', minWv: 3.0, useSma200: true, maxLossStop: null, trailingStop: null },
    { name: '9. COMBINATIE 2: WV >= 3% + Koers > 200 SMA + Stop-Loss 15%', minWv: 3.0, useSma200: true, maxLossStop: 15, trailingStop: null },
    { name: '10. COMBINATIE 3: WV >= 4% + Koers > 200 SMA + Trailing Stop 20%', minWv: 4.0, useSma200: true, maxLossStop: null, trailingStop: 20 },
    { name: '11. COMBINATIE 4: WV >= 5% + Koers > 200 SMA + Stop-Loss 12%', minWv: 5.0, useSma200: true, maxLossStop: 12, trailingStop: null }
  ];

  console.log('=== DATA-DRIVEN STRATEGIE VERBETERINGEN (SPY benchmark: +256.0%, MSCI World: +186.9%) ===\n');

  for (const sc of scenarios) {
    let cash = 10000;
    const positions = new Map(); // stockId -> { shares, cost, entryPrice, entryDate, highPrice }
    let tradesCount = 0, winsCount = 0;

    for (let i = 0; i < allDates.length; i++) {
      const dStr = allDates[i];
      for (const [stockId, sInfo] of stockData.entries()) {
        if (sInfo.priceMap.has(dStr)) sInfo.lastKnownPrice = sInfo.priceMap.get(dStr);
      }

      let currentInvested = 0;
      for (const [stockId, pos] of positions.entries()) {
        const sInfo = stockData.get(stockId);
        const p = sInfo.priceMap.get(dStr) || sInfo.lastKnownPrice;
        currentInvested += pos.shares * p;
        if (p > pos.highPrice) pos.highPrice = p;
      }
      const currentTotalVal = cash + currentInvested;

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
        const drawFromHighPct = ((price - pos.highPrice) / pos.highPrice) * 100;

        let shouldSellAll = false;
        if (score < 5 && pos.entryDate !== dStr) {
          shouldSellAll = true;
        } else if (sc.maxLossStop && returnPct <= -sc.maxLossStop && pos.entryDate !== dStr) {
          shouldSellAll = true;
        } else if (sc.trailingStop && drawFromHighPct <= -sc.trailingStop && pos.entryDate !== dStr) {
          shouldSellAll = true;
        }

        if (shouldSellAll) {
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

        if (score === 5 && isWvRising && wv >= sc.minWv) {
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
        const relPct = totalScore5WvToday > 0 ? (wv / totalScore5WvToday) * 100 : wv;
        const idealInvested = currentTotalVal * (relPct / 100);
        const currentHoldingCost = positions.get(stockId)?.cost || 0;
        const weightFactor = currentHoldingCost === 0 ? 2 : Math.min(2, idealInvested / Math.max(1, currentHoldingCost));
        const targetAlloc = Math.max(price, idealInvested * (weightFactor / 2));
        const neededAlloc = Math.max(price, targetAlloc - currentHoldingCost);

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
                  highPrice: price,
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
    console.log('  -> Eindwaarde: € ' + endValue.toFixed(2) + ' (Rendement: +' + returnPct.toFixed(1) + '%) | Winst: € ' + profit.toFixed(2) + ' | Winrate: ' + winrate.toFixed(1) + '% (' + winsCount + '/' + tradesCount + ' trades)\n');
  }

  process.exit(0);
}

testImprovements();

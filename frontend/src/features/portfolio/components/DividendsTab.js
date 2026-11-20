import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

const DividendsTab = ({
  divTimeframe,
  setDivTimeframe,
  divStart,
  setDivStart,
  divEnd,
  setDivEnd,
  divGrouping,
  setDivGrouping,
  filteredDivs = [],
  divChartData,
  divChartOptions,
  divByAssetData = [],
  totalDivsPeriod = 0,
  renderTimeframeSelector,
  formatCurrency,
  isIncognito,
  loading,
  processedHoldings = [],
  displayCurrency = 'EUR',
  historyTimelineData,
  timelineSliderIdx = 0,
  setTimelineSliderIdx,
  activeTimeMachinePoint,
  isViewingHistoricalDate = false,
  selectedBrokerFilter = 'ALL',
  setSelectedBrokerFilter,
  selectedTypes = [],
  setSelectedTypes,
  brokerTotals = [],
  rawTransactions = [],
  totalCashDisplay = 0
}) => {
  const timeline = useMemo(() => historyTimelineData?.timeline || [], [historyTimelineData]);
  const availableYears = useMemo(() => historyTimelineData?.availableYears || [], [historyTimelineData]);

  const totalAllBrokersVal = useMemo(
    () => brokerTotals.reduce((acc, b) => acc + Number(b.value || 0), 0),
    [brokerTotals]
  );

  // 1. Bereken werkelijk ontvangen dividenden per aandeel (op basis van échte transacties, géén dummy 2.8% meer)
  const divAnalytics = useMemo(() => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const divsByTicker = {};
    let ttmTotalEur = 0;
    let allTimeTotalEur = 0;

    const divTx = (rawTransactions || []).filter(t => t.transaction_type === 'DIVIDEND');

    divTx.forEach(t => {
      const ticker = t.ticker_symbol || `ID_${t.aandeel_id}`;
      const tDate = new Date(t.purchase_time);
      const isEur = t.currency === 'EUR';
      const fx = Number(t.exchange_rate || 1.08);
      const netValEur = isEur
        ? ((t.quantity * t.price) - (t.taxes || 0))
        : (((t.quantity * t.price) - (t.taxes || 0)) / fx);

      allTimeTotalEur += netValEur;

      if (tDate >= oneYearAgo) {
        ttmTotalEur += netValEur;
      }

      if (!divsByTicker[ticker]) {
        divsByTicker[ticker] = {
          ticker,
          name: t.stock_name || ticker,
          broker: t.broker_name || 'Onbekend',
          allTimeNetEur: 0,
          ttmNetEur: 0,
          ttmCount: 0,
          allTimeCount: 0,
          lastPayoutDate: tDate,
          payoutMonths: new Set()
        };
      }
      divsByTicker[ticker].allTimeNetEur += netValEur;
      divsByTicker[ticker].allTimeCount += 1;
      divsByTicker[ticker].payoutMonths.add(tDate.getMonth() + 1);

      if (tDate >= oneYearAgo) {
        divsByTicker[ticker].ttmNetEur += netValEur;
        divsByTicker[ticker].ttmCount += 1;
      }
      if (tDate > divsByTicker[ticker].lastPayoutDate) {
        divsByTicker[ticker].lastPayoutDate = tDate;
      }
    });

    // Bereken nu de VERWACHTE komende 12 maanden op basis van actuele posities
    let expectedAnnualEur = 0;
    let totalPortfolioValue = 0;
    let totalInvested = 0;
    const projectedHoldings = [];

    (processedHoldings || []).forEach(h => {
      const qty = Number(h.quantity || 0);
      const val = Number(h.value || 0);
      const inv = Number(h.total_invested || 0);
      totalPortfolioValue += val;
      totalInvested += inv;

      if (qty <= 0) return;

      const ticker = h.ticker || h.name;
      const history = divsByTicker[ticker];

      let estAnnualForHolding = 0;
      let estYield = 0;

      if (history && history.ttmNetEur > 0) {
        estAnnualForHolding = history.ttmNetEur;
        if (val > 0) {
          estYield = (estAnnualForHolding / val) * 100;
        }
      } else if (history && history.allTimeNetEur > 0) {
        estAnnualForHolding = history.allTimeNetEur / Math.max(1, history.allTimeCount / 4);
        if (val > 0) estYield = (estAnnualForHolding / val) * 100;
      }

      if (estAnnualForHolding > 0) {
        expectedAnnualEur += estAnnualForHolding;
        projectedHoldings.push({
          ticker,
          name: h.name || ticker,
          broker: h.primary_broker || h.broker_name || (history ? history.broker : 'Onbekend'),
          assetType: (h.asset_type === 'ETF' || String(ticker).includes('.DE') || String(ticker).includes('.AS')) ? 'ETF' : 'Aandeel',
          quantity: qty,
          value: val,
          expectedAnnual: estAnnualForHolding,
          yieldPct: estYield,
          payoutMonths: history ? Array.from(history.payoutMonths).sort((a, b) => a - b) : [3, 6, 9, 12],
          lastDate: history?.lastPayoutDate
        });
      }
    });

    const currentYield = totalPortfolioValue > 0 ? (expectedAnnualEur / totalPortfolioValue) * 100 : 0;
    const yieldOnCost = totalInvested > 0 ? (expectedAnnualEur / totalInvested) * 100 : 0;
    const monthlyAverage = expectedAnnualEur / 12;

    return {
      ttmTotalEur,
      allTimeTotalEur,
      expectedAnnualEur,
      currentYield,
      yieldOnCost,
      monthlyAverage,
      projectedHoldings: projectedHoldings.sort((a, b) => b.expectedAnnual - a.expectedAnnual),
      divsByTicker
    };
  }, [rawTransactions, processedHoldings]);

  // Splitsing van dividenden: Aandelen vs ETF's
  const assetClassBreakdown = useMemo(() => {
    let stocksDiv = 0;
    let etfDiv = 0;

    divAnalytics.projectedHoldings.forEach(p => {
      if (p.assetType === 'ETF') etfDiv += p.expectedAnnual;
      else stocksDiv += p.expectedAnnual;
    });

    const total = stocksDiv + etfDiv;
    return {
      stocksDiv,
      etfDiv,
      stocksPct: total > 0 ? (stocksDiv / total) * 100 : 0,
      etfPct: total > 0 ? (etfDiv / total) * 100 : 0
    };
  }, [divAnalytics]);

  const jumpToPrevTrade = () => {
    if (!timeline.length || !setTimelineSliderIdx) return;
    for (let i = timelineSliderIdx - 1; i >= 0; i--) {
      if (timeline[i]?.hadTrade) {
        setTimelineSliderIdx(i);
        return;
      }
    }
    setTimelineSliderIdx(Math.max(0, timelineSliderIdx - 1));
  };

  const jumpToNextTrade = () => {
    if (!timeline.length || !setTimelineSliderIdx) return;
    for (let i = timelineSliderIdx + 1; i < timeline.length; i++) {
      if (timeline[i]?.hadTrade) {
        setTimelineSliderIdx(i);
        return;
      }
    }
    setTimelineSliderIdx(Math.min(timeline.length - 1, timelineSliderIdx + 1));
  };

  const jumpToYear = (yr) => {
    if (!timeline.length || !setTimelineSliderIdx) return;
    let lastIdx = -1;
    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i]?.date?.startsWith(yr)) {
        lastIdx = i;
      }
    }
    if (lastIdx >= 0) setTimelineSliderIdx(lastIdx);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 📱 COMPACTE MOBIELE TIJDMACHINE & BROKER SELECTOR (eToro / DEGIRO Stijl) */}
      {timeline.length > 0 && (
        <div className="block md:hidden bg-white p-3 rounded-2xl shadow-sm border border-gray-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black bg-purple-50 text-purple-900 border border-purple-200">
              📅 {activeTimeMachinePoint?.date || 'Vandaag'}
              {!isViewingHistoricalDate && <span className="text-[10px] text-emerald-600 font-extrabold">• Live</span>}
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={jumpToPrevTrade}
                disabled={timelineSliderIdx === 0}
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30 text-xs font-bold"
                title="Vorige transactie"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={jumpToNextTrade}
                disabled={timelineSliderIdx >= timeline.length - 1}
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30 text-xs font-bold"
                title="Volgende transactie"
              >
                ▶
              </button>
              <button
                type="button"
                onClick={() => setTimelineSliderIdx && setTimelineSliderIdx(timeline.length - 1)}
                disabled={timelineSliderIdx >= timeline.length - 1}
                className="px-2 py-1 rounded-lg bg-purple-600 text-white text-[11px] font-black disabled:opacity-40"
              >
                Live
              </button>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, timeline.length - 1)}
            value={timelineSliderIdx}
            onChange={(e) => setTimelineSliderIdx && setTimelineSliderIdx(Number(e.target.value))}
            className="w-full h-2 bg-purple-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
          />

          {/* Horizontaal scrollende chips voor broker & asset type selectie op mobiel */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedBrokerFilter && setSelectedBrokerFilter('ALL')}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-bold shrink-0 border ${selectedBrokerFilter === 'ALL' ? 'bg-slate-900 text-white border-slate-900' : 'bg-gray-100 text-gray-700 border-gray-200'
                }`}
            >
              Alle Brokers
            </button>
            {brokerTotals.map(b => {
              const isActive = selectedBrokerFilter.toLowerCase() === b.broker_name.toLowerCase();
              const isEtoro = b.broker_name.toLowerCase().includes('etoro');
              return (
                <button
                  key={b.broker_name}
                  type="button"
                  onClick={() => setSelectedBrokerFilter && setSelectedBrokerFilter(isActive ? 'ALL' : b.broker_name)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold shrink-0 border ${isActive ? (isEtoro ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-blue-600 text-white border-blue-600') : 'bg-gray-100 text-gray-700 border-gray-200'
                    }`}
                >
                  {isEtoro ? '🟢 eToro' : '🔵 DEGIRO'} ({b.weightPct.toFixed(0)}%)
                </button>
              );
            })}
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={() => setSelectedTypes && setSelectedTypes([])}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-bold shrink-0 border ${!selectedTypes || selectedTypes.length === 0 ? 'bg-slate-900 text-white border-slate-900' : 'bg-gray-100 text-gray-700 border-gray-200'
                }`}
            >
              Alles
            </button>
            <button
              type="button"
              onClick={() => setSelectedTypes && setSelectedTypes(['Stocks'])}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-bold shrink-0 border ${selectedTypes && selectedTypes.some(t => ['STOCK', 'STOCKS', 'AANDELEN'].includes(String(t).toUpperCase())) ? 'bg-teal-600 text-white border-teal-600' : 'bg-gray-100 text-gray-700 border-gray-200'
                }`}
            >
              💎 Aandelen
            </button>
            <button
              type="button"
              onClick={() => setSelectedTypes && setSelectedTypes(['ETF'])}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-bold shrink-0 border ${selectedTypes && selectedTypes.some(t => ['ETF', 'ETFS', 'FUND'].includes(String(t).toUpperCase())) ? 'bg-amber-600 text-white border-amber-600' : 'bg-gray-100 text-gray-700 border-gray-200'
                }`}
            >
              📊 ETF's
            </button>
          </div>
        </div>
      )}

      {/* 🕰️ DESKTOP TIJDMACHINE (Verborgen op Mobiel) */}
      {timeline.length > 0 && (
        <div className={`hidden md:block bg-white rounded-2xl p-3.5 sm:p-5 border-2 shadow-sm space-y-3 sm:space-y-4 transition-all ${isViewingHistoricalDate ? 'border-purple-400 ring-2 ring-purple-100' : 'border-purple-200/80'
          }`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-200 mb-1">
                🕰️ Dividend Tijdmachine &amp; Broker-Controle
              </div>
              <h3 className="text-sm sm:text-base font-black text-gray-900">
                Bekijk je Dividenden op Elke Dag in het Verleden &amp; Controleer per Broker
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setTimelineSliderIdx && setTimelineSliderIdx(0)}
                disabled={timelineSliderIdx === 0}
                className="px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-extrabold disabled:opacity-40"
              >
                ⏮ Start
              </button>
              <button
                type="button"
                onClick={jumpToPrevTrade}
                disabled={timelineSliderIdx === 0}
                className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-extrabold disabled:opacity-40"
              >
                ◀ Vorige Transactiedag
              </button>
              <button
                type="button"
                onClick={jumpToNextTrade}
                disabled={timelineSliderIdx >= timeline.length - 1}
                className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-extrabold disabled:opacity-40"
              >
                Volgende Transactiedag ▶
              </button>
              <button
                type="button"
                onClick={() => setTimelineSliderIdx && setTimelineSliderIdx(timeline.length - 1)}
                disabled={timelineSliderIdx >= timeline.length - 1}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-extrabold disabled:opacity-40 shadow-xs"
              >
                Heden (Live) ⏭
              </button>
            </div>
          </div>

          <div className="p-3 sm:p-3.5 rounded-xl bg-gradient-to-r from-slate-50 via-purple-50/50 to-emerald-50/40 border border-purple-100 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="px-3 py-1 rounded-xl bg-purple-600 text-white font-black text-xs sm:text-sm shadow-xs">
                📅 {activeTimeMachinePoint?.date || 'Vandaag'} {!isViewingHistoricalDate && '(Huidige Live Situatie)'}
              </span>

              {availableYears.length > 1 && (
                <div className="flex flex-wrap items-center gap-1">
                  {availableYears.map(yr => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => jumpToYear(yr)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-extrabold transition-all ${activeTimeMachinePoint?.date?.startsWith(yr)
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'bg-white hover:bg-purple-50 text-gray-700 border border-gray-200'
                        }`}
                    >
                      {yr}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(0, timeline.length - 1)}
              value={timelineSliderIdx}
              onChange={(e) => setTimelineSliderIdx && setTimelineSliderIdx(Number(e.target.value))}
              className="w-full h-2.5 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-500">
              <span>Eerste transactie: {timeline[0]?.date}</span>
              <span>Stap {timelineSliderIdx + 1} van {timeline.length}</span>
              <span>Heden: {timeline[timeline.length - 1]?.date}</span>
            </div>
          </div>

          {/* 🏦 BROKER-FILTER & 📊 ASSET TYPE FILTER BALK */}
          <div className="flex flex-col gap-2 pt-1 border-t border-gray-100">
            {brokerTotals.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-extrabold text-gray-600 flex items-center gap-1">
                  <i className="ph-fill ph-bank text-purple-600"></i>
                  <span>Filter per Broker:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedBrokerFilter && setSelectedBrokerFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 border ${selectedBrokerFilter === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                >
                  <span>Alle Brokers</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black privacy-blur ${selectedBrokerFilter === 'ALL' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                    {formatCurrency(totalAllBrokersVal)}
                  </span>
                </button>

                {brokerTotals.map(b => {
                  const isActive = selectedBrokerFilter.toLowerCase() === b.broker_name.toLowerCase();
                  const isEtoro = b.broker_name.toLowerCase().includes('etoro');
                  const isDegiro = b.broker_name.toLowerCase().includes('degiro');
                  return (
                    <button
                      key={b.broker_name}
                      type="button"
                      onClick={() => setSelectedBrokerFilter && setSelectedBrokerFilter(isActive ? 'ALL' : b.broker_name)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 border ${isActive
                        ? isEtoro
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                          : isDegiro
                            ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                            : 'bg-purple-600 text-white border-purple-700 shadow-xs'
                        : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                      <span>{isEtoro ? '🟢' : isDegiro ? '🔵' : '🏦'} {b.broker_name}</span>
                      <span className="text-[11px] opacity-85">({b.count} pos.)</span>
                      <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black privacy-blur ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                        }`}>
                        {formatCurrency(b.value)} ({b.weightPct.toFixed(1)}%)
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 📊 ASSET TYPE FILTER */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
              <span className="text-xs font-extrabold text-gray-600 flex items-center gap-1">
                <i className="ph-fill ph-funnel text-purple-600"></i>
                <span>Filter Asset Type:</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedTypes && setSelectedTypes([])}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all border ${!selectedTypes || selectedTypes.length === 0
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
              >
                Alles
              </button>
              <button
                type="button"
                onClick={() => setSelectedTypes && setSelectedTypes(['Stocks'])}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all border ${selectedTypes && selectedTypes.some(t => ['STOCK', 'STOCKS', 'AANDELEN'].includes(String(t).toUpperCase()))
                  ? 'bg-teal-600 text-white border-teal-700 shadow-xs'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
              >
                💎 Aandelen
              </button>
              <button
                type="button"
                onClick={() => setSelectedTypes && setSelectedTypes(['ETF'])}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all border ${selectedTypes && selectedTypes.some(t => ['ETF', 'ETFS', 'FUND'].includes(String(t).toUpperCase()))
                  ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
              >
                📊 ETF's
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4 Stats Cards Header (2x2 op mobiel/iPhone, 4 kolommen op desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-6">
        {/* Card 1: Verwacht Komende 12 Maanden (Gebaseerd op werkelijke historie) */}
        <div className="bg-white p-3.5 sm:p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between min-h-[95px] sm:min-h-[120px]">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">
            <i className="ph ph-calendar-check text-purple-600 text-xs sm:text-sm"></i>
            Verwacht (12 mnd)
          </div>
          <div className="mt-1.5 sm:mt-3">
            <span className="text-lg sm:text-3xl font-extrabold text-purple-700 tracking-tight privacy-blur block">
              {loading ? '...' : formatCurrency(divAnalytics.expectedAnnualEur)}
            </span>
            <span className="text-[10px] sm:text-xs font-semibold text-gray-500 block mt-0.5 sm:mt-1 truncate">
              ~ {formatCurrency(divAnalytics.monthlyAverage)} / maand
            </span>
          </div>
        </div>

        {/* Card 2: Ontvangen Laatste 12 Maanden (TTM) */}
        <div className="bg-white p-3.5 sm:p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between min-h-[95px] sm:min-h-[120px]">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">
            <i className="ph ph-clock-counter-clockwise text-emerald-500 text-xs sm:text-sm"></i>
            Ontvangen TTM (1 jr)
          </div>
          <div className="mt-1.5 sm:mt-3">
            <span className="text-lg sm:text-3xl font-extrabold text-emerald-600 tracking-tight privacy-blur block">
              {loading ? '...' : formatCurrency(divAnalytics.ttmTotalEur)}
            </span>
            <span className="text-[10px] sm:text-xs font-semibold text-gray-400 block mt-0.5 sm:mt-1 truncate">
              Werkelijk ontvangen cash
            </span>
          </div>
        </div>

        {/* Card 3: In Selectie Periode */}
        <div className="bg-white p-3.5 sm:p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between min-h-[95px] sm:min-h-[120px]">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">
            <i className="ph ph-money text-blue-500 text-xs sm:text-sm"></i>
            In Periode ({divTimeframe})
          </div>
          <div className="mt-1.5 sm:mt-3">
            <span className="text-lg sm:text-3xl font-extrabold text-gray-900 tracking-tight privacy-blur block">
              {loading ? '...' : formatCurrency(totalDivsPeriod)}
            </span>
            <span className="text-[10px] sm:text-xs font-semibold text-gray-400 block mt-0.5 sm:mt-1 truncate">
              {filteredDivs.length} uitkeringen
            </span>
          </div>
        </div>

        {/* Card 4: Dividend Rendement (Yield & Yield on Cost) */}
        <div className="bg-white p-3.5 sm:p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between min-h-[95px] sm:min-h-[120px]">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">
            <i className="ph ph-percent text-amber-500 text-xs sm:text-sm"></i>
            Dividend Yield
          </div>
          <div className="mt-1.5 sm:mt-3">
            <div className="flex items-baseline gap-1 sm:gap-2 flex-wrap">
              <span className="text-lg sm:text-3xl font-extrabold text-gray-900 tracking-tight block">
                {loading ? '...' : `${divAnalytics.currentYield.toFixed(2)}%`}
              </span>
              <span className="text-[10px] sm:text-xs font-bold px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-700">
                YoC: {divAnalytics.yieldOnCost.toFixed(2)}%
              </span>
            </div>
            <span className="text-[10px] sm:text-xs font-semibold text-gray-400 block mt-0.5 sm:mt-1 truncate">
              Op huidige belegde waarde
            </span>
          </div>
        </div>
      </div>

      {/* 📊 AANDELEN VS ETF'S DIVIDENDEN SPREIDING BANNER */}
      <div className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-lg border border-purple-100 shadow-2xs">
            <i className="ph-fill ph-chart-pie-slice"></i>
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-gray-900">
              Verdeling Verwacht Dividend: Aandelen vs. ETF's
            </h4>
            <div className="flex items-center gap-3 text-xs font-semibold text-gray-600 mt-0.5">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
                💎 Aandelen: <strong>{formatCurrency(assetClassBreakdown.stocksDiv)}</strong> ({assetClassBreakdown.stocksPct.toFixed(1)}%)
              </span>
              <span className="text-gray-300">•</span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                📊 ETF's: <strong>{formatCurrency(assetClassBreakdown.etfDiv)}</strong> ({assetClassBreakdown.etfPct.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>

        {/* Progress bar van verdeling */}
        <div className="w-full sm:w-64">
          <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden flex border border-gray-200">
            <div className="bg-teal-500 h-full transition-all" style={{ width: `${assetClassBreakdown.stocksPct}%` }} title={`Aandelen: ${assetClassBreakdown.stocksPct.toFixed(1)}%`}></div>
            <div className="bg-amber-500 h-full transition-all" style={{ width: `${assetClassBreakdown.etfPct}%` }} title={`ETF's: ${assetClassBreakdown.etfPct.toFixed(1)}%`}></div>
          </div>
        </div>
      </div>

      {/* Aankomende Dividenden Prognose (Echte data van actuele posities) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
              <i className="ph-fill ph-bell-ringing text-purple-600"></i>
              Verwachte Dividendbetalers in Portefeuille
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Geprojecteerd op basis van jouw huidige aantallen en werkelijk gerealiseerde uitkeringen
            </p>
          </div>
          <span className="text-xs font-extrabold bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 rounded-full">
            {divAnalytics.projectedHoldings.length} actieve betalers
          </span>
        </div>

        {divAnalytics.projectedHoldings.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {divAnalytics.projectedHoldings.slice(0, 9).map((item, idx) => (
              <div key={idx} className="p-3.5 sm:p-4 bg-gray-50/70 rounded-xl border border-gray-200/80 flex items-center justify-between hover:bg-purple-50/40 hover:border-purple-200 transition-all">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg font-bold flex items-center justify-center text-xs sm:text-sm shadow-2xs shrink-0 ${item.assetType === 'ETF' ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'
                    }`}>
                    {item.assetType === 'ETF' ? 'ETF' : 'STK'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-gray-900 block truncate">{item.ticker}</span>
                    <span className="text-[11px] text-gray-500 block truncate">
                      {item.broker} • {parseFloat(item.quantity.toFixed(3))} stuks
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-extrabold text-emerald-600 privacy-blur block">
                    ~{formatCurrency(item.expectedAnnual)}/jr
                  </span>
                  <span className="text-[10px] text-gray-500 block font-semibold">
                    {item.yieldPct > 0 ? `${item.yieldPct.toFixed(2)}% yield` : 'dividendbetaler'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-400 text-sm">
            Geen dividendbetalende posities gevonden voor de huidige filter.
          </div>
        )}
      </div>

      {/* Dividend Historiek Grafiek */}
      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[460px] sm:h-[500px]">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-4 sm:mb-6 gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900">Dividend Historiek</h3>
            <p className="text-xs text-gray-400 mt-0.5">Overzicht van ontvangen dividenden per periode</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
            {renderTimeframeSelector(divTimeframe, setDivTimeframe, divStart, setDivStart, divEnd, setDivEnd)}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-gray-500 font-medium text-xs">Groeperen:</span>
              <select
                value={divGrouping}
                onChange={e => setDivGrouping(e.target.value)}
                className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-2.5 py-1 text-xs outline-none font-bold focus:ring-2 focus:ring-purple-500 cursor-pointer"
              >
                <option value="monthly">Per Maand</option>
                <option value="quarterly">Per Kwartaal</option>
                <option value="annually">Per Jaar</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex-grow relative min-h-0 incognito-hide">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : filteredDivs.length > 0 ? (
            <Bar data={divChartData} options={divChartOptions} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
              <i className="ph-fill ph-money text-4xl mb-2 opacity-30"></i>
              Geen dividend data beschikbaar voor deze periode.
            </div>
          )}
        </div>
        <div className="incognito-show flex-col items-center justify-center h-full text-gray-400 text-sm">
          <i className="ph-fill ph-eye-slash text-4xl mb-2 opacity-30"></i>
          Waardegrafiek verborgen in privacymodus
        </div>
      </div>

      {/* Tabellen: Top Betalers & Recente Uitbetalingen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Table: Dividends Per Asset */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center p-4 sm:p-5 border-b border-gray-100">
            <h3 className="text-sm sm:text-base font-bold text-gray-900">Top Betalers ({divTimeframe})</h3>
            <span className="text-xs font-semibold text-gray-500">{divByAssetData.length} posities</span>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[360px]">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">Asset</th>
                    <th className="px-4 py-3 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Aantal Uitkeringen</th>
                    <th className="px-4 py-3 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Netto Totaal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {divByAssetData.map((d, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-bold text-gray-900">{d.ticker}</td>
                      <td className="px-4 py-3 text-gray-600 text-right">{d.count}x</td>
                      <td className="px-4 py-3 font-bold text-emerald-600 text-right privacy-blur">{formatCurrency(d.totalNet)}</td>
                    </tr>
                  ))}
                  {divByAssetData.length === 0 && <tr><td colSpan="3" className="px-6 py-8 text-center text-sm text-gray-500">Geen data beschikbaar voor deze selectie.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Table: Recent Dividend Payouts */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center p-4 sm:p-5 border-b border-gray-100">
            <h3 className="text-sm sm:text-base font-bold text-gray-900">Recente Uitbetalingen</h3>
            <span className="text-xs font-semibold text-gray-500">{filteredDivs.length} uitkeringen</span>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[360px]">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">Datum</th>
                    <th className="px-4 py-3 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">Asset / Broker</th>
                    <th className="px-4 py-3 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Netto Ontvangen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {filteredDivs.slice().sort((a, b) => new Date(b.purchase_time) - new Date(a.purchase_time)).slice(0, 30).map((div, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{new Date(div.purchase_time).toLocaleDateString('nl-BE')}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">
                        {div.ticker_symbol || `ID: ${div.aandeel_id}`}
                        {div.broker_name && <span className="text-xs font-normal text-gray-400 block">{div.broker_name}</span>}
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-600 text-right privacy-blur whitespace-nowrap">
                        {formatCurrency((div.quantity * div.price) - (div.taxes || 0), div.currency)}
                      </td>
                    </tr>
                  ))}
                  {filteredDivs.length === 0 && <tr><td colSpan="3" className="px-6 py-8 text-center text-sm text-gray-500">Geen data beschikbaar voor deze selectie.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DividendsTab;

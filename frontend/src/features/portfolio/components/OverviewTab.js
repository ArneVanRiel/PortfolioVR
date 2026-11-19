import React, { useState, useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';

const CAT_COLORS = {
  'Funds': { bg: '#3699FF', text: 'text-blue-500', border: 'border-blue-500' },
  'Stocks': { bg: '#1BC5BD', text: 'text-teal-500', border: 'border-teal-500' },
  'Stock': { bg: '#1BC5BD', text: 'text-teal-500', border: 'border-teal-500' },
  'Cash': { bg: '#8950FC', text: 'text-purple-500', border: 'border-purple-500' },
  'Commodities': { bg: '#8B5CF6', text: 'text-indigo-500', border: 'border-indigo-500' },
  'Financials': { bg: '#10B981', text: 'text-emerald-500', border: 'border-emerald-500' },
  'Etfs': { bg: '#F59E0B', text: 'text-amber-500', border: 'border-amber-500' },
  'Etf': { bg: '#F59E0B', text: 'text-amber-500', border: 'border-amber-500' },
  'Crypto': { bg: '#EF4444', text: 'text-rose-500', border: 'border-rose-500' },
  'Etoro': { bg: '#10B981', text: 'text-emerald-600', border: 'border-emerald-500' },
  'Degiro': { bg: '#2563EB', text: 'text-blue-600', border: 'border-blue-500' },
  'Bolero': { bg: '#F59E0B', text: 'text-amber-600', border: 'border-amber-500' },
  'Saxo': { bg: '#8B5CF6', text: 'text-purple-600', border: 'border-purple-500' },
};

const HOLDING_PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899',
  '#06B6D4', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
  '#A855F7', '#0EA5E9', '#22C55E', '#EAB308'
];

const getCatColor = (catName, idx = 0) => {
  if (!catName) return { bg: HOLDING_PALETTE[idx % HOLDING_PALETTE.length], text: 'text-gray-500', border: 'border-gray-500' };
  const trimmed = catName.trim();
  const normalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  if (CAT_COLORS[normalized]) return CAT_COLORS[normalized];
  return { bg: HOLDING_PALETTE[idx % HOLDING_PALETTE.length], text: 'text-indigo-600', border: 'border-indigo-500' };
};

const OverviewTab = ({
  history,
  processedHoldings,
  baseHoldingsForDate = [],
  holdingsSort,
  handleHoldingsSort,
  getSortIcon,
  formatCurrency,
  formatPercentage,
  isIncognito,
  holdingsSearch,
  setHoldingsSearch,
  loading,
  historyTimelineData,
  timelineSliderIdx = 0,
  setTimelineSliderIdx,
  activeTimeMachinePoint,
  isViewingHistoricalDate = false,
  selectedBrokerFilter = 'ALL',
  setSelectedBrokerFilter,
  brokerTotals = []
}) => {
  const navigate = useNavigate();
  const [donutGroupBy, setDonutGroupBy] = useState('brokers'); // 'brokers' | 'categories' | 'holdings'

  const totalValue = processedHoldings.reduce((sum, h) => sum + (h.value || 0), 0);
  const timeline = useMemo(() => historyTimelineData?.timeline || [], [historyTimelineData]);
  const availableYears = useMemo(() => historyTimelineData?.availableYears || [], [historyTimelineData]);

  // Groepeer data voor Donut & Overzichtstabel op basis van donutGroupBy ('brokers', 'categories', 'holdings')
  const groupedAllocationData = useMemo(() => {
    const groups = {};
    let totalVal = 0;
    let totalInv = 0;

    if (donutGroupBy === 'brokers') {
      processedHoldings.forEach(h => {
        const brokersList = Array.isArray(h.brokers) && h.brokers.length > 0
          ? h.brokers
          : [{
              broker_name: h.broker_name || h.primary_broker || 'Onbekend',
              quantity: h.quantity || 0,
              value: h.value || 0,
              total_invested: h.total_invested || 0
            }];

        brokersList.forEach(b => {
          const bName = b.broker_name ? String(b.broker_name).trim() : 'Onbekend';
          if (!groups[bName]) {
            groups[bName] = { name: bName, value: 0, invested: 0, count: 0, isBroker: true };
          }
          groups[bName].value += Number(b.value || 0);
          groups[bName].invested += Number(b.total_invested || 0);
          groups[bName].count += 1;
          totalVal += Number(b.value || 0);
          totalInv += Number(b.total_invested || 0);
        });
      });
    } else if (donutGroupBy === 'holdings') {
      const sorted = [...processedHoldings].sort((a, b) => (b.value || 0) - (a.value || 0));
      const top = sorted.slice(0, 10);
      const rest = sorted.slice(10);

      top.forEach(h => {
        const key = h.ticker || h.name || 'Onbekend';
        groups[key] = {
          name: `${h.ticker} — ${h.name || ''}`,
          shortLabel: h.ticker,
          value: Number(h.value || 0),
          invested: Number(h.total_invested || 0),
          count: 1,
          subtitle: `${Number(h.quantity || 0).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} stuks • ${h.primary_broker || h.broker_name || ''}`
        };
        totalVal += Number(h.value || 0);
        totalInv += Number(h.total_invested || 0);
      });

      if (rest.length > 0) {
        const restVal = rest.reduce((acc, h) => acc + Number(h.value || 0), 0);
        const restInv = rest.reduce((acc, h) => acc + Number(h.total_invested || 0), 0);
        groups['Overige'] = {
          name: `Overige (${rest.length} posities)`,
          shortLabel: 'Overige',
          value: restVal,
          invested: restInv,
          count: rest.length
        };
        totalVal += restVal;
        totalInv += restInv;
      }
    } else {
      // 'categories'
      processedHoldings.forEach(h => {
        const cat = h.asset_type ? h.asset_type.trim() : 'Stocks';
        if (!groups[cat]) {
          groups[cat] = { name: cat, value: 0, invested: 0, count: 0 };
        }
        groups[cat].value += h.value || 0;
        groups[cat].invested += h.total_invested || 0;
        groups[cat].count += 1;
        totalVal += h.value || 0;
        totalInv += h.total_invested || 0;
      });
    }

    return Object.values(groups)
      .map((g, idx) => ({
        ...g,
        color: getCatColor(g.shortLabel || g.name, idx).bg,
        percentage: totalVal > 0 ? (g.value / totalVal) * 100 : 0,
        investedPercentage: totalInv > 0 ? (g.invested / totalInv) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);
  }, [processedHoldings, donutGroupBy]);

  const doughnutData = useMemo(() => {
    return {
      labels: groupedAllocationData.map(c => `${c.shortLabel || c.name} (${c.percentage.toFixed(1)}%)`),
      datasets: [{
        data: groupedAllocationData.map(c => c.value),
        backgroundColor: groupedAllocationData.map(c => c.color),
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 6
      }]
    };
  }, [groupedAllocationData]);

  const doughnutOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        padding: 10,
        cornerRadius: 6,
        callbacks: {
          label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.raw)}`
        }
      }
    }
  }), [formatCurrency]);

  // Bereken eerstvolgende vermogensmijlpaal (De Belegger feature)
  const milestone = useMemo(() => {
    if (!totalValue || totalValue <= 0) return { target: 10000, progress: 0, remaining: 10000 };
    let target = 10000;
    if (totalValue >= 500000) target = Math.ceil((totalValue + 1) / 100000) * 100000;
    else if (totalValue >= 100000) target = Math.ceil((totalValue + 1) / 50000) * 50000;
    else if (totalValue >= 50000) target = 100000;
    else if (totalValue >= 25000) target = 50000;
    else if (totalValue >= 10000) target = 25000;
    else target = 10000;

    const progress = Math.min(100, Math.max(0, (totalValue / target) * 100));
    const remaining = Math.max(0, target - totalValue);
    return { target, progress, remaining };
  }, [totalValue]);

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

  const totalAllBrokersVal = useMemo(
    () => brokerTotals.reduce((acc, b) => acc + Number(b.value || 0), 0),
    [brokerTotals]
  );

  return (
    <div className="space-y-6">
      {/* 🕰️ HISTORISCHE PORTFOLIO TIJDMACHINE & BROKER-CONTROLE BALK */}
      {timeline.length > 0 && (
        <div className={`bg-white rounded-2xl p-4 sm:p-5 border-2 shadow-sm space-y-4 transition-all ${
          isViewingHistoricalDate ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-indigo-200/80'
        }`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-900 border border-indigo-200">
                  🕰️ Historische Portfolio Tijdmachine &amp; Broker-Controle
                </span>
                {isViewingHistoricalDate && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                    ⚠️ Je bekijkt een datum in het verleden ({activeTimeMachinePoint?.date})
                  </span>
                )}
              </div>
              <h3 className="text-sm sm:text-base font-black text-gray-900">
                Bekijk je Echte Portefeuille op Elke Dag in het Verleden &amp; Controleer per Broker (eToro / DEGIRO)
              </h3>
              <p className="text-xs text-gray-500">
                Schuif de slider om je echte posities en donut-verdeling op een historische datum te bekijken, of klik op een broker om te controleren of je huidige situatie klopt.
              </p>
            </div>

            {/* Navigatieknoppen Tijdmachine */}
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setTimelineSliderIdx && setTimelineSliderIdx(0)}
                disabled={timelineSliderIdx === 0}
                className="px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-extrabold disabled:opacity-40 transition-all"
              >
                ⏮ Start
              </button>
              <button
                type="button"
                onClick={jumpToPrevTrade}
                disabled={timelineSliderIdx === 0}
                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-extrabold disabled:opacity-40 transition-all"
              >
                ◀ Vorige Transactiedag
              </button>
              <button
                type="button"
                onClick={jumpToNextTrade}
                disabled={timelineSliderIdx >= timeline.length - 1}
                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-extrabold disabled:opacity-40 transition-all"
              >
                Volgende Transactiedag ▶
              </button>
              <button
                type="button"
                onClick={() => setTimelineSliderIdx && setTimelineSliderIdx(timeline.length - 1)}
                disabled={timelineSliderIdx >= timeline.length - 1}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                  isViewingHistoricalDate
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                    : 'bg-indigo-600 text-white opacity-40'
                }`}
              >
                Heden (Live) ⏭
              </button>
            </div>
          </div>

          {/* Slider & Datum Status */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-slate-50 via-indigo-50/50 to-emerald-50/40 border border-indigo-100 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-xl font-black text-xs sm:text-sm shadow-2xs ${
                  isViewingHistoricalDate ? 'bg-amber-500 text-amber-950' : 'bg-indigo-600 text-white'
                }`}>
                  📅 {activeTimeMachinePoint?.date
                    ? new Date(activeTimeMachinePoint.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'Vandaag'}
                  {!isViewingHistoricalDate && ' (Huidige Live Situatie)'}
                </span>

                {activeTimeMachinePoint?.hadTrade && (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black">
                    ⚡ {activeTimeMachinePoint.tradesOnDate?.length || 1} transactie(s) op deze dag
                  </span>
                )}
              </div>

              {/* Jaar-Snelknoppen */}
              {availableYears.length > 1 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[11px] font-bold text-gray-500 mr-1">Jaar:</span>
                  {availableYears.map(yr => {
                    const isCurrentYr = activeTimeMachinePoint?.date?.startsWith(yr);
                    return (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => jumpToYear(yr)}
                        className={`px-2 py-0.5 rounded-lg text-xs font-extrabold transition-all ${
                          isCurrentYr
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-white hover:bg-indigo-50 text-gray-700 border border-gray-200'
                        }`}
                      >
                        {yr}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(0, timeline.length - 1)}
              value={timelineSliderIdx}
              onChange={(e) => setTimelineSliderIdx && setTimelineSliderIdx(Number(e.target.value))}
              className="w-full h-2.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-500">
              <span>Eerste transactie: {timeline[0]?.date}</span>
              <span>Stap {timelineSliderIdx + 1} van {timeline.length}</span>
              <span>Heden: {timeline[timeline.length - 1]?.date}</span>
            </div>

            {/* Uitgevoerde transacties op de gekozen datum */}
            {Array.isArray(activeTimeMachinePoint?.tradesOnDate) && activeTimeMachinePoint.tradesOnDate.length > 0 && (
              <div className="pt-2 border-t border-indigo-100 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-black text-indigo-950 mr-1">
                  Transacties op {activeTimeMachinePoint.date}:
                </span>
                {activeTimeMachinePoint.tradesOnDate.map((tr, idx) => (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${
                      tr.type === 'BUY'
                        ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                        : tr.type === 'SELL'
                        ? 'bg-rose-100 text-rose-950 border-rose-300'
                        : 'bg-purple-100 text-purple-950 border-purple-300'
                    }`}
                  >
                    {tr.type === 'BUY' ? '🟢 KOOP' : tr.type === 'SELL' ? '🔴 VERKOOP' : '💰 DIVIDEND'}{' '}
                    {tr.quantity}x <strong>{tr.ticker}</strong> @ {tr.currency === 'EUR' ? '€' : '$'}{tr.price} ({tr.broker_name})
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 🏦 BROKER-FILTER KNOPPEN VOOR DIRECTE CONTROLE (Alle Brokers / eToro / DEGIRO) */}
          {brokerTotals.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-extrabold text-gray-600 flex items-center gap-1">
                  <i className="ph-fill ph-bank text-indigo-600"></i>
                  <span>Filter &amp; Controleer per Broker:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedBrokerFilter && setSelectedBrokerFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 border ${
                    selectedBrokerFilter === 'ALL'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span>Alle Brokers</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black privacy-blur ${
                    selectedBrokerFilter === 'ALL' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
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
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 border ${
                        isActive
                          ? isEtoro
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                            : isDegiro
                            ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                            : 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                          : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <span>{isEtoro ? '🟢' : isDegiro ? '🔵' : '🏦'} {b.broker_name}</span>
                      <span className="text-[11px] opacity-85">({b.count} pos.)</span>
                      <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black privacy-blur ${
                        isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {formatCurrency(b.value)} ({b.weightPct.toFixed(1)}%)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Milestone Progress Bar (De Belegger Stijl) */}
      <div className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-base border border-amber-100 shadow-xs">
              <i className="ph-fill ph-trophy"></i>
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900">
                Op weg naar {formatCurrency(milestone.target)}
              </h4>
              <span className="text-xs text-gray-400">
                Nog {formatCurrency(milestone.remaining)} te gaan tot het volgende doel
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
              {milestone.progress.toFixed(1)}% Voltooid
            </span>
          </div>
        </div>

        {/* Bar */}
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden p-0.5 border border-gray-200/60">
          <div 
            className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-700 ease-out shadow-xs" 
            style={{ width: `${milestone.progress}%` }}
          />
        </div>
      </div>

      {/* Allocation Grid (Met schakelaar: Per Broker / Per Categorie / Per Aandeel) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Donut Chart Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between h-[390px]">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">
                Portfolio Donut {selectedBrokerFilter !== 'ALL' ? `(${selectedBrokerFilter})` : ''}
              </h3>
              {isViewingHistoricalDate && (
                <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200">
                  {activeTimeMachinePoint?.date}
                </span>
              )}
            </div>

            {/* Groepering Knoppen voor Donut */}
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-extrabold">
              <button
                type="button"
                onClick={() => setDonutGroupBy('brokers')}
                className={`py-1.5 px-2 rounded-lg transition-all text-center ${
                  donutGroupBy === 'brokers'
                    ? 'bg-white text-indigo-900 shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🏦 Per Broker
              </button>
              <button
                type="button"
                onClick={() => setDonutGroupBy('categories')}
                className={`py-1.5 px-2 rounded-lg transition-all text-center ${
                  donutGroupBy === 'categories'
                    ? 'bg-white text-indigo-900 shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📁 Categorie
              </button>
              <button
                type="button"
                onClick={() => setDonutGroupBy('holdings')}
                className={`py-1.5 px-2 rounded-lg transition-all text-center ${
                  donutGroupBy === 'holdings'
                    ? 'bg-white text-indigo-900 shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                💎 Aandelen
              </button>
            </div>
          </div>

          <div className="flex-grow relative min-h-0 flex items-center justify-center mt-2">
            {loading ? (
              <div className="w-20 h-20 rounded-full border-4 border-gray-100 border-t-blue-500 animate-spin"></div>
            ) : groupedAllocationData.length > 0 ? (
              <div className="w-full h-full relative">
                <Doughnut data={doughnutData} options={doughnutOptions} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    {selectedBrokerFilter !== 'ALL' ? selectedBrokerFilter : 'Totale Waarde'}
                  </span>
                  <span className="text-lg font-extrabold text-gray-900 tracking-tight privacy-blur">
                    {formatCurrency(totalValue)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400">Geen posities beschikbaar.</div>
            )}
          </div>
        </div>

        {/* Right: Grouped Allocation Table Card (Takes 2/3 columns on desktop) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 lg:col-span-2 overflow-hidden flex flex-col justify-between min-h-[390px]">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-2">
            <div>
              <h4 className="text-sm font-black text-gray-900">
                {donutGroupBy === 'brokers'
                  ? '🏦 Verdeling & Controle per Broker (eToro vs DEGIRO)'
                  : donutGroupBy === 'holdings'
                  ? '💎 Verdeling per Aandeel (Top Posities)'
                  : '📁 Verdeling per Asset Categorie'}
              </h4>
              <p className="text-xs text-gray-500">
                {donutGroupBy === 'brokers'
                  ? 'Klik op een broker in de lijst om de Holdings-tabel hieronder direct op die broker te filteren.'
                  : 'Overzicht van actuele waarde, totale inleg, winst/verlies en weging.'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto flex-grow">
            {loading ? (
              <div className="animate-pulse space-y-4 py-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <div className="h-4 bg-gray-100 rounded w-1/4"></div>
                    <div className="h-4 bg-gray-100 rounded w-1/6"></div>
                    <div className="h-4 bg-gray-100 rounded w-1/6"></div>
                    <div className="h-4 bg-gray-100 rounded w-1/6"></div>
                  </div>
                ))}
              </div>
            ) : groupedAllocationData.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wider">
                      {donutGroupBy === 'brokers' ? 'Broker / Platform' : donutGroupBy === 'holdings' ? 'Aandeel' : 'Categorie'}
                    </th>
                    <th className="py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Waarde / Inleg</th>
                    <th className="py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Winst / Verlies</th>
                    <th className="py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Weging (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedAllocationData.map((cat) => {
                    const profit = cat.value - cat.invested;
                    const profitPercent = cat.invested > 0 ? (profit / cat.invested) * 100 : 0;
                    const isSelectedBroker = cat.isBroker && selectedBrokerFilter.toLowerCase() === cat.name.toLowerCase();

                    return (
                      <tr
                        key={cat.name}
                        onClick={() => {
                          if (cat.isBroker && setSelectedBrokerFilter) {
                            setSelectedBrokerFilter(isSelectedBroker ? 'ALL' : cat.name);
                          }
                        }}
                        className={`transition-colors border-b border-gray-100 last:border-0 ${
                          cat.isBroker ? 'cursor-pointer hover:bg-indigo-50/40' : 'hover:bg-gray-50/50'
                        } ${isSelectedBroker ? 'bg-indigo-50/60' : ''}`}
                      >
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs"
                              style={{ backgroundColor: cat.color }}
                            >
                              {cat.isBroker ? <i className="ph-fill ph-bank text-base"></i> : <i className="ph ph-folder text-lg"></i>}
                            </div>
                            <div>
                              <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                                {cat.name}
                                {isSelectedBroker && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600 text-white font-black">
                                    Gefilterd
                                  </span>
                                )}
                              </span>
                              <span className="text-xs font-medium text-gray-400 block">
                                {cat.subtitle || `${cat.count} posities`}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <span className="text-sm font-bold text-gray-900 block privacy-blur">{formatCurrency(cat.value)}</span>
                          <span className="text-xs font-medium text-gray-400 block privacy-blur">{formatCurrency(cat.invested)}</span>
                        </td>
                        <td className="py-3 text-right">
                          <span className={`text-sm font-bold block privacy-blur ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                          </span>
                          <span className={`text-xs font-bold ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {profit >= 0 ? '▲' : '▼'} {Math.abs(profitPercent).toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <span className="text-sm font-bold text-gray-900 block">{cat.percentage.toFixed(2)}%</span>
                          <span className="text-xs font-medium text-gray-400 block">{cat.investedPercentage.toFixed(1)}% v. inleg</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-gray-400 text-center py-12">Geen data beschikbaar.</div>
            )}
          </div>
        </div>
      </div>

      {/* Holdings Tabel (Met Sortering op ALLE Kolommen & Broker-kolom) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 border-b border-gray-100 gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-bold text-gray-900">
              Holdings {isViewingHistoricalDate ? `op ${activeTimeMachinePoint?.date}` : ''}
            </h3>
            <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full">
              {processedHoldings.length} Assets
            </span>
            {selectedBrokerFilter !== 'ALL' && (
              <span className="bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-black px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <span>🏦 Enkel {selectedBrokerFilter}</span>
                <button
                  type="button"
                  onClick={() => setSelectedBrokerFilter && setSelectedBrokerFilter('ALL')}
                  className="hover:text-rose-600 font-black"
                  title="Toon weer alle brokers"
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input 
                type="text" 
                placeholder="Zoek aandeel of broker..." 
                value={holdingsSearch} 
                onChange={(e) => setHoldingsSearch(e.target.value)} 
                className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64 transition-all"
              />
            </div>
          </div>
        </div>
      
        <div className="overflow-x-auto">
          {loading ? (
            <div className="animate-pulse space-y-4 p-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex justify-between items-center py-3 border-b border-gray-100">
                  <div className="flex flex-col gap-2 w-1/4">
                    <div className="h-4 bg-gray-100 rounded w-2/3"></div>
                    <div className="h-3 bg-gray-50 rounded w-1/2"></div>
                  </div>
                  <div className="h-4 bg-gray-100 rounded w-12"></div>
                  <div className="h-4 bg-gray-100 rounded w-12"></div>
                  <div className="h-4 bg-gray-100 rounded w-12"></div>
                  <div className="h-4 bg-gray-100 rounded w-12"></div>
                  <div className="h-4 bg-gray-100 rounded w-12"></div>
                  <div className="h-4 bg-gray-100 rounded w-12"></div>
                </div>
              ))}
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[1080px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th
                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wider cursor-pointer hover:text-blue-600 select-none transition-colors ${holdingsSort?.key === 'ticker' ? 'text-blue-600' : 'text-gray-400'}`}
                    onClick={() => handleHoldingsSort('ticker')}
                  >
                    Holding{getSortIcon(holdingsSort, 'ticker')}
                  </th>
                  <th
                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wider cursor-pointer hover:text-blue-600 select-none transition-colors ${holdingsSort?.key === 'primary_broker' ? 'text-blue-600' : 'text-gray-400'}`}
                    onClick={() => handleHoldingsSort('primary_broker')}
                  >
                    Broker{getSortIcon(holdingsSort, 'primary_broker')}
                  </th>
                  <th
                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wider text-right cursor-pointer hover:text-blue-600 select-none transition-colors ${holdingsSort?.key === 'quantity' ? 'text-blue-600' : 'text-gray-400'}`}
                    onClick={() => handleHoldingsSort('quantity')}
                  >
                    Shares{getSortIcon(holdingsSort, 'quantity')}
                  </th>
                  <th
                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wider text-right cursor-pointer hover:text-blue-600 select-none transition-colors ${holdingsSort?.key === 'total_invested' ? 'text-blue-600' : 'text-gray-400'}`}
                    onClick={() => handleHoldingsSort('total_invested')}
                  >
                    Cost basis{getSortIcon(holdingsSort, 'total_invested')}
                  </th>
                  <th
                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wider text-right cursor-pointer hover:text-blue-600 select-none transition-colors ${holdingsSort?.key === 'value' ? 'text-blue-600' : 'text-gray-400'}`}
                    onClick={() => handleHoldingsSort('value')}
                  >
                    Current value{getSortIcon(holdingsSort, 'value')}
                  </th>
                  <th
                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wider text-right cursor-pointer hover:text-blue-600 select-none transition-colors ${holdingsSort?.key === 'cumulative_dividends' ? 'text-blue-600' : 'text-gray-400'}`}
                    onClick={() => handleHoldingsSort('cumulative_dividends')}
                  >
                    Dividends{getSortIcon(holdingsSort, 'cumulative_dividends')}
                  </th>
                  <th
                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wider text-right cursor-pointer hover:text-blue-600 select-none transition-colors ${holdingsSort?.key === 'dividend_yield' ? 'text-blue-600' : 'text-gray-400'}`}
                    onClick={() => handleHoldingsSort('dividend_yield')}
                  >
                    Dividend yield{getSortIcon(holdingsSort, 'dividend_yield')}
                  </th>
                  <th
                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wider text-right cursor-pointer hover:text-blue-600 select-none transition-colors ${holdingsSort?.key === 'dividend_growth_5y' ? 'text-blue-600' : 'text-gray-400'}`}
                    onClick={() => handleHoldingsSort('dividend_growth_5y')}
                  >
                    Div. growth (5Y){getSortIcon(holdingsSort, 'dividend_growth_5y')}
                  </th>
                  <th
                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wider text-right cursor-pointer hover:text-blue-600 select-none transition-colors ${holdingsSort?.key === 'gainLoss' ? 'text-blue-600' : 'text-gray-400'}`}
                    onClick={() => handleHoldingsSort('gainLoss')}
                  >
                    Total profit{getSortIcon(holdingsSort, 'gainLoss')}
                  </th>
                  <th
                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wider text-right cursor-pointer hover:text-blue-600 select-none transition-colors ${holdingsSort?.key === 'irr' ? 'text-blue-600' : 'text-gray-400'}`}
                    onClick={() => handleHoldingsSort('irr')}
                  >
                    IRR{getSortIcon(holdingsSort, 'irr')}
                  </th>
                  <th
                    className={`px-4 py-3 text-xs font-bold uppercase tracking-wider text-right cursor-pointer hover:text-blue-600 select-none transition-colors ${holdingsSort?.key === 'weight' ? 'text-blue-600' : 'text-gray-400'}`}
                    onClick={() => handleHoldingsSort('weight')}
                  >
                    Share in portfolio{getSortIcon(holdingsSort, 'weight')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {processedHoldings.map((holding) => {
                  const weight = totalValue > 0 ? (holding.value / totalValue) * 100 : 0;
                  const divYield = holding.dividend_yield || 0;
                  const divGrowth = holding.dividend_growth_5y || 0;
                  const irr = holding.irr ?? holding.gainLossPercent ?? (holding.total_invested > 0 ? (holding.gainLoss / holding.total_invested) * 100 : 0);
                  const brokersList = Array.isArray(holding.brokers) ? holding.brokers : [];

                  return (
                    <tr key={holding.ticker} className="hover:bg-gray-50/80 transition-colors border-b border-gray-100 last:border-0 group">
                      <td className="px-4 py-3">
                        <div 
                          className="flex items-center gap-3 cursor-pointer p-1 -ml-1 rounded transition-colors"
                          onClick={() => navigate(`/analysis?ticker=${holding.ticker}`)}
                        >
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs uppercase">
                            {holding.ticker ? holding.ticker.substring(0, 2) : ''}
                          </div>
                          <div>
                            <span className="text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors block">{holding.name || holding.ticker}</span>
                            <span className="text-xs font-semibold text-gray-400 block uppercase">{holding.ticker}</span>
                          </div>
                        </div>
                      </td>

                      {/* Broker Badge Kolom */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {brokersList.length > 0 ? (
                            brokersList.map(b => {
                              const bLower = String(b.broker_name || '').toLowerCase();
                              const isEtoro = bLower.includes('etoro');
                              const isDegiro = bLower.includes('degiro');
                              return (
                                <span
                                  key={b.broker_name}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-extrabold border ${
                                    isEtoro
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : isDegiro
                                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                                      : 'bg-gray-100 text-gray-700 border-gray-200'
                                  }`}
                                  title={`${b.broker_name}: ${b.quantity} stuks (${formatCurrency(b.value)})`}
                                >
                                  <span>{isEtoro ? '🟢' : isDegiro ? '🔵' : '🏦'} {b.broker_name}</span>
                                  {brokersList.length > 1 && (
                                    <span className="text-[10px] opacity-75">({Number(b.quantity).toLocaleString('nl-NL', { maximumFractionDigits: 2 })})</span>
                                  )}
                                </span>
                              );
                            })
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-gray-100 text-gray-600">
                              {holding.primary_broker || holding.broker_name || '-'}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800 privacy-blur">
                        {parseFloat(Number(holding.quantity || 0).toFixed(4))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-gray-900 block privacy-blur">{formatCurrency(holding.total_invested)}</span>
                        <span className="text-xs font-medium text-gray-400 block privacy-blur">{formatCurrency(holding.average_price)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-gray-900 block privacy-blur">{formatCurrency(holding.value)}</span>
                        <span className="text-xs font-medium text-gray-400 block privacy-blur">{formatCurrency(holding.price)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-gray-900 block privacy-blur">{formatCurrency(holding.cumulative_dividends || 0)}</span>
                        <span className="text-xs font-medium text-gray-400 block privacy-blur">{formatCurrency((holding.cumulative_dividends || 0) / (holding.quantity || 1))}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-gray-900 block">{divYield ? `${divYield.toFixed(2)}%` : '0.00%'}</span>
                        <span className="text-xs font-medium text-gray-400 block">{(divYield * 0.85).toFixed(2)}%</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-gray-600 block">{divGrowth ? `${divGrowth.toFixed(2)}%` : '0%'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className={`text-sm font-bold block privacy-blur ${holding.gainLoss >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {holding.gainLoss >= 0 ? '+' : ''}{formatCurrency(holding.gainLoss)}
                          </span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md mt-1 ${holding.gainLoss >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {holding.gainLoss >= 0 ? '▲' : '▼'} {Math.abs(holding.total_invested > 0 ? (holding.gainLoss / holding.total_invested) * 100 : 0).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-bold block ${irr >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{irr ? `${(irr >= 0 ? '▲ ' : '▼ ') + Math.abs(irr).toFixed(2)}%` : '0.00%'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-gray-900 block">{weight.toFixed(2)}%</span>
                        <span className="text-xs font-medium text-gray-400 block">{weight.toFixed(1)}%</span>
                      </td>
                    </tr>
                  );
                })}
                {processedHoldings.length === 0 && (
                  <tr><td colSpan="11" className="px-6 py-8 text-center text-sm text-gray-500">Geen holdings gevonden voor de huidige filter.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;

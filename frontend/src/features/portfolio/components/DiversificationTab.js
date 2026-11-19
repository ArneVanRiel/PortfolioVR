import React, { useState, useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';

const CAT_COLORS = [
  '#10B981', '#2563EB', '#8950FC', '#1BC5BD', '#FFA800', '#F64E60', 
  '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', 
  '#06B6D4', '#3B82F6', '#6B7280'
];

const getHoldingMetadata = (ticker, holding = {}) => {
  const norm = String(ticker || '').toUpperCase().trim();
  
  // Default values
  let sector = 'Technology & Growth';
  let assetClass = holding.asset_type || 'Stocks';
  let currency = holding.native_currency || 'USD';
  let region = 'North America';
  let country = 'United States';
  
  if (norm.includes('AAPL') || norm.includes('MSFT') || norm.includes('META') || norm.includes('TSLA') || norm.includes('GOOG') || norm.includes('INTU') || norm.includes('QLYS') || norm.includes('SWKS') || norm.includes('AMAT') || norm.includes('ACN')) {
    sector = 'Technology';
    assetClass = 'Stocks';
    currency = 'USD';
    region = 'North America';
    country = 'United States';
  } else if (norm.includes('VUSA') || norm.includes('VGWL') || norm.includes('VGWD') || norm.includes('SPY') || norm.includes('VOO') || norm.includes('VWCE') || norm.includes('IWDA') || norm.includes('EMIM')) {
    sector = 'Funds / ETFs';
    assetClass = 'ETF';
    currency = norm.includes('.DE') || norm.includes('.AS') ? 'EUR' : 'USD';
    region = norm.includes('.DE') || norm.includes('.AS') ? 'Europe' : 'North America';
    country = norm.includes('.DE') || norm.includes('.AS') ? 'Germany / Europe' : 'United States';
  } else if (norm.includes('GC') || norm.includes('GLD') || norm.includes('GOLD')) {
    sector = 'Materials';
    assetClass = 'Commodities';
    currency = 'USD';
    region = 'Global';
    country = 'Global';
  } else if (norm.includes('EUR') || norm.includes('USD') || norm.includes('CASH') || norm.includes('MONEY')) {
    sector = 'Cash';
    assetClass = 'Cash';
    currency = norm.includes('EUR') ? 'EUR' : 'USD';
    region = norm.includes('EUR') ? 'Europe' : 'North America';
    country = norm.includes('EUR') ? 'Germany' : 'United States';
  } else if (norm.includes('SBUX') || norm.includes('COST') || norm.includes('HD')) {
    sector = 'Consumer Cyclical';
    assetClass = 'Stocks';
    currency = 'USD';
    region = 'North America';
    country = 'United States';
  } else if (norm.includes('JPM') || norm.includes('JEPI')) {
    sector = 'Financials';
    assetClass = 'Stocks';
    currency = 'USD';
    region = 'North America';
    country = 'United States';
  } else if (norm.includes('VOD') || norm.includes('NFLX')) {
    sector = 'Communication Services';
    assetClass = 'Stocks';
    currency = 'USD';
    region = 'North America';
    country = 'United States';
  }
  
  return { sector, assetClass, currency, region, country };
};

const DiversificationTab = ({
  filteredHoldings,
  baseHoldingsForDate = [],
  formatCurrency,
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
  const [activeGroup, setActiveGroup] = useState('brokers'); // 'brokers', 'classes', 'sectors', 'currencies', 'regions', 'countries'

  const timeline = useMemo(() => historyTimelineData?.timeline || [], [historyTimelineData]);
  const availableYears = useMemo(() => historyTimelineData?.availableYears || [], [historyTimelineData]);

  const totalValue = useMemo(() => {
    return filteredHoldings.reduce((sum, h) => sum + (h.value || 0), 0);
  }, [filteredHoldings]);

  const totalAllBrokersVal = useMemo(
    () => brokerTotals.reduce((acc, b) => acc + Number(b.value || 0), 0),
    [brokerTotals]
  );

  // --- Section 1: All Holdings Data ---
  const allHoldingsData = useMemo(() => {
    const sorted = [...filteredHoldings].sort((a, b) => (b.value || 0) - (a.value || 0));
    return sorted.map((h, index) => ({
      ...h,
      weight: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
      color: CAT_COLORS[index % CAT_COLORS.length]
    }));
  }, [filteredHoldings, totalValue]);

  const allHoldingsChartData = useMemo(() => {
    return {
      labels: allHoldingsData.map(h => `${h.ticker} (${h.weight.toFixed(1)}%)`),
      datasets: [{
        data: allHoldingsData.map(h => h.value),
        backgroundColor: allHoldingsData.map(h => h.color),
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 6
      }]
    };
  }, [allHoldingsData]);

  // --- Section 2: Grouped Data ---
  const groupedData = useMemo(() => {
    const groups = {};

    if (activeGroup === 'brokers') {
      filteredHoldings.forEach(h => {
        const brokersList = Array.isArray(h.brokers) && h.brokers.length > 0
          ? h.brokers
          : [{
              broker_name: h.broker_name || h.primary_broker || 'Onbekend',
              value: h.value || 0
            }];
        brokersList.forEach(b => {
          const bName = String(b.broker_name || 'Onbekend').trim();
          if (!groups[bName]) groups[bName] = { value: 0, count: 0 };
          groups[bName].value += Number(b.value || 0);
          groups[bName].count += 1;
        });
      });
    } else {
      filteredHoldings.forEach(h => {
        const meta = getHoldingMetadata(h.ticker, h);
        let key = '';
        if (activeGroup === 'sectors') key = meta.sector;
        else if (activeGroup === 'classes') key = meta.assetClass;
        else if (activeGroup === 'currencies') key = meta.currency;
        else if (activeGroup === 'regions') key = meta.region;
        else if (activeGroup === 'countries') key = meta.country;

        if (!groups[key]) {
          groups[key] = { value: 0, count: 0 };
        }
        groups[key].value += h.value || 0;
        groups[key].count += 1;
      });
    }

    const sorted = Object.keys(groups).map((key, index) => {
      const val = groups[key].value;
      const isEtoro = key.toLowerCase().includes('etoro');
      const isDegiro = key.toLowerCase().includes('degiro');
      const color = activeGroup === 'brokers'
        ? (isEtoro ? '#10B981' : isDegiro ? '#2563EB' : CAT_COLORS[index % CAT_COLORS.length])
        : CAT_COLORS[index % CAT_COLORS.length];
      return {
        name: key,
        value: val,
        count: groups[key].count,
        weight: totalValue > 0 ? (val / totalValue) * 100 : 0,
        color
      };
    }).sort((a, b) => b.value - a.value);

    return sorted;
  }, [filteredHoldings, activeGroup, totalValue]);

  const groupedChartData = useMemo(() => {
    return {
      labels: groupedData.map(g => `${g.name} (${g.weight.toFixed(1)}%)`),
      datasets: [{
        data: groupedData.map(g => g.value),
        backgroundColor: groupedData.map(g => g.color),
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 6
      }]
    };
  }, [groupedData]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '75%',
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
  };

  const groupLabel = {
    brokers: '🏦 Brokers (eToro vs DEGIRO)',
    sectors: 'Sectors',
    classes: 'Asset classes',
    currencies: 'Currencies',
    regions: 'Regions',
    countries: 'Countries'
  }[activeGroup];

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
    <div className="space-y-6">
      {/* 🕰️ HISTORISCHE PORTFOLIO TIJDMACHINE & BROKER-CONTROLE BALK */}
      {timeline.length > 0 && (
        <div className={`bg-white rounded-2xl p-4 sm:p-5 border-2 shadow-sm space-y-4 transition-all ${
          isViewingHistoricalDate ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-indigo-200/80'
        }`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-900 border border-indigo-200 mb-1">
                🕰️ Historische Spreiding Tijdmachine &amp; Broker-Controle
              </div>
              <h3 className="text-sm sm:text-base font-black text-gray-900">
                Bekijk je Donuts op Elke Dag in het Verleden &amp; Groepeer per Broker
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
                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-extrabold disabled:opacity-40"
              >
                ◀ Vorige Transactiedag
              </button>
              <button
                type="button"
                onClick={jumpToNextTrade}
                disabled={timelineSliderIdx >= timeline.length - 1}
                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-extrabold disabled:opacity-40"
              >
                Volgende Transactiedag ▶
              </button>
              <button
                type="button"
                onClick={() => setTimelineSliderIdx && setTimelineSliderIdx(timeline.length - 1)}
                disabled={timelineSliderIdx >= timeline.length - 1}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold disabled:opacity-40"
              >
                Heden (Live) ⏭
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-gradient-to-r from-slate-50 via-indigo-50/50 to-emerald-50/40 border border-indigo-100 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="px-3 py-1 rounded-xl bg-indigo-600 text-white font-black text-xs sm:text-sm">
                📅 {activeTimeMachinePoint?.date || 'Vandaag'} {!isViewingHistoricalDate && '(Huidige Live Situatie)'}
              </span>

              {availableYears.length > 1 && (
                <div className="flex flex-wrap items-center gap-1">
                  {availableYears.map(yr => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => jumpToYear(yr)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-extrabold ${
                        activeTimeMachinePoint?.date?.startsWith(yr)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-gray-700 border border-gray-200'
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
              className="w-full h-2.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          {/* Broker Filter Knoppen */}
          {brokerTotals.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-gray-600">🏦 Filter Donuts op Broker:</span>
              <button
                type="button"
                onClick={() => setSelectedBrokerFilter && setSelectedBrokerFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border ${
                  selectedBrokerFilter === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-gray-700 border-gray-200'
                }`}
              >
                Alle Brokers ({formatCurrency(totalAllBrokersVal)})
              </button>
              {brokerTotals.map(b => {
                const isActive = selectedBrokerFilter.toLowerCase() === b.broker_name.toLowerCase();
                return (
                  <button
                    key={b.broker_name}
                    type="button"
                    onClick={() => setSelectedBrokerFilter && setSelectedBrokerFilter(isActive ? 'ALL' : b.broker_name)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border ${
                      isActive
                        ? 'bg-indigo-600 text-white border-indigo-700'
                        : 'bg-white text-gray-800 border-gray-200'
                    }`}
                  >
                    {b.broker_name} ({b.count} pos. • {formatCurrency(b.value)})
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Card 1: All holdings allocation */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span>All holdings {selectedBrokerFilter !== 'ALL' ? `(${selectedBrokerFilter})` : ''}</span>
            {isViewingHistoricalDate && (
              <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200">
                op {activeTimeMachinePoint?.date}
              </span>
            )}
          </h3>
          <span className="text-xs font-bold text-gray-500">
            {allHoldingsData.length} posities
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Chart column */}
          <div className="h-[300px] relative flex items-center justify-center">
            {loading ? (
              <div className="w-20 h-20 rounded-full border-4 border-gray-100 border-t-blue-500 animate-spin"></div>
            ) : allHoldingsData.length > 0 ? (
              <div className="w-full h-full relative">
                <Doughnut data={allHoldingsChartData} options={chartOptions} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Value</span>
                  <span className="text-xl font-extrabold text-gray-900 tracking-tight privacy-blur">{formatCurrency(totalValue)}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400">No assets available.</div>
            )}
          </div>

          {/* Legend list column */}
          <div className="max-h-[300px] overflow-y-auto pr-2 space-y-3 scrollbar-thin">
            {allHoldingsData.map((h) => (
              <div key={h.ticker} className="flex justify-between items-center text-sm py-1 border-b border-gray-50 last:border-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: h.color }}></span>
                  <span className="font-bold text-gray-900 block truncate max-w-[180px]" title={h.name}>{h.name || h.ticker}</span>
                  <span className="text-xs font-semibold text-gray-400 block uppercase">{h.ticker}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    {h.primary_broker || h.broker_name || ''}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-bold text-gray-900 mr-2 privacy-blur">{formatCurrency(h.value)}</span>
                  <span className="font-extrabold text-indigo-700">{h.weight.toFixed(2)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pill group buttons for active group (incl. Brokers!) */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'brokers', label: '🏦 Brokers (eToro / DEGIRO)' },
          { id: 'classes', label: '📁 Classes' },
          { id: 'sectors', label: '🏭 Sectors' },
          { id: 'currencies', label: '💱 Currencies' },
          { id: 'regions', label: '🌍 Regions' },
          { id: 'countries', label: '🏳️ Countries' }
        ].map((pill) => (
          <button
            key={pill.id}
            onClick={() => setActiveGroup(pill.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
              activeGroup === pill.id 
                ? 'bg-[#1E293B] text-white border-[#1E293B]' 
                : 'bg-white text-gray-500 hover:text-gray-900 border-gray-200'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Card 2: Grouped allocation */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
            {groupLabel}
            <span className="cursor-help text-xs text-gray-300 border border-gray-200 rounded-full w-4 h-4 flex items-center justify-center font-normal" title="Allocation weights by group">?</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Chart column */}
          <div className="h-[300px] relative flex items-center justify-center">
            {loading ? (
              <div className="w-20 h-20 rounded-full border-4 border-gray-100 border-t-blue-500 animate-spin"></div>
            ) : groupedData.length > 0 ? (
              <div className="w-full h-full relative">
                <Doughnut data={groupedChartData} options={chartOptions} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Value</span>
                  <span className="text-xl font-extrabold text-gray-900 tracking-tight privacy-blur">{formatCurrency(totalValue)}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400">No assets available.</div>
            )}
          </div>

          {/* List progress bar column */}
          <div className="max-h-[300px] overflow-y-auto pr-2 space-y-4 scrollbar-thin">
            {groupedData.map((g) => (
              <div key={g.name} className="space-y-1.5">
                <div className="flex justify-between items-center text-sm font-bold text-gray-900">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }}></span>
                    <span>{g.name}</span>
                    {g.count && (
                      <span className="text-xs font-normal text-gray-400">({g.count} posities)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-600 privacy-blur">{formatCurrency(g.value)}</span>
                    <span>{g.weight.toFixed(2)}%</span>
                  </div>
                </div>
                {/* Horizontal progress bar */}
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${g.weight}%`, backgroundColor: g.color }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiversificationTab;

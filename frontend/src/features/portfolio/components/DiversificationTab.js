import React, { useState, useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';

const CAT_COLORS = [
  '#8950FC', '#1BC5BD', '#3699FF', '#FFA800', '#F64E60', 
  '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', 
  '#06B6D4', '#3B82F6', '#6B7280'
];

const getHoldingMetadata = (ticker) => {
  const norm = String(ticker || '').toUpperCase().trim();
  
  // Default values
  let sector = 'Financials';
  let assetClass = 'Stocks';
  let currency = 'USD';
  let region = 'North America';
  let country = 'United States';
  
  if (norm.includes('AAPL') || norm.includes('MSFT') || norm.includes('META') || norm.includes('TSLA') || norm.includes('GOOG')) {
    sector = 'Technology';
    assetClass = 'Stocks';
    currency = 'USD';
    region = 'North America';
    country = 'United States';
  } else if (norm.includes('VUSA') || norm.includes('VGWL') || norm.includes('VGWD') || norm.includes('SPY') || norm.includes('VOO') || norm.includes('VWCE')) {
    sector = 'Funds / ETFs';
    assetClass = 'Funds';
    currency = norm.includes('.DE') || norm.includes('.AS') ? 'EUR' : 'USD';
    region = norm.includes('.DE') || norm.includes('.AS') ? 'Europe' : 'North America';
    country = norm.includes('.DE') || norm.includes('.AS') ? 'Germany' : 'United States';
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
  formatCurrency,
  loading
}) => {
  const [activeGroup, setActiveGroup] = useState('classes'); // 'sectors', 'classes', 'currencies', 'regions', 'countries'

  const totalValue = useMemo(() => {
    return filteredHoldings.reduce((sum, h) => sum + (h.value || 0), 0);
  }, [filteredHoldings]);

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
      labels: allHoldingsData.map(h => h.ticker),
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
    filteredHoldings.forEach(h => {
      const meta = getHoldingMetadata(h.ticker);
      let key = '';
      if (activeGroup === 'sectors') key = meta.sector;
      else if (activeGroup === 'classes') key = meta.assetClass;
      else if (activeGroup === 'currencies') key = meta.currency;
      else if (activeGroup === 'regions') key = meta.region;
      else if (activeGroup === 'countries') key = meta.country;

      if (!groups[key]) {
        groups[key] = 0;
      }
      groups[key] += h.value || 0;
    });

    const sorted = Object.keys(groups).map((key, index) => {
      const val = groups[key];
      return {
        name: key,
        value: val,
        weight: totalValue > 0 ? (val / totalValue) * 100 : 0,
        color: CAT_COLORS[index % CAT_COLORS.length]
      };
    }).sort((a, b) => b.value - a.value);

    return sorted;
  }, [filteredHoldings, activeGroup, totalValue]);

  const groupedChartData = useMemo(() => {
    return {
      labels: groupedData.map(g => g.name),
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
          label: (ctx) => ` ${ctx.label}: ${ctx.raw ? ctx.raw.toFixed(2) : 0}%`
        }
      }
    }
  };

  const groupLabel = {
    sectors: 'Sectors',
    classes: 'Asset classes',
    currencies: 'Currencies',
    regions: 'Regions',
    countries: 'Countries'
  }[activeGroup];

  return (
    <div className="space-y-8">
      {/* Action switches at the top */}
      <div className="flex justify-between items-center bg-white px-6 py-3 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="bg-blue-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">NEW</span>
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
            <input type="checkbox" id="xray" className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4" />
            <label htmlFor="xray" className="cursor-pointer">X-Ray Funds</label>
          </div>
        </div>
      </div>

      {/* Card 1: All holdings allocation */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
            All holdings
            <span className="cursor-help text-xs text-gray-300 border border-gray-200 rounded-full w-4 h-4 flex items-center justify-center font-normal" title="Detailed asset-level weights">?</span>
          </h3>
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
            <input type="checkbox" id="buyin" className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4" />
            <label htmlFor="buyin" className="cursor-pointer">Buy in</label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Chart column */}
          <div className="h-[300px] relative flex items-center justify-center">
            {loading ? (
              <div className="w-20 h-20 rounded-full border-4 border-gray-100 border-t-blue-500 animate-spin"></div>
            ) : allHoldingsData.length > 0 ? (
              <div className="w-full h-full relative">
                <Doughnut data={allHoldingsChartData} options={chartOptions} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-6">
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
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: h.color }}></span>
                  <span className="font-bold text-gray-900 block truncate max-w-[200px]" title={h.name}>{h.name || h.ticker}</span>
                  <span className="text-xs font-semibold text-gray-400 block uppercase">{h.ticker}</span>
                </div>
                <span className="font-bold text-gray-900">{h.weight.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pill group buttons for active group */}
      <div className="flex flex-wrap gap-2">
        {['sectors', 'classes', 'currencies', 'regions', 'countries'].map((pill) => (
          <button
            key={pill}
            onClick={() => setActiveGroup(pill)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
              activeGroup === pill 
                ? 'bg-[#1E293B] text-white border-[#1E293B]' 
                : 'bg-white text-gray-500 hover:text-gray-900 border-gray-200'
            }`}
          >
            {pill === 'classes' ? 'Classes' : pill.charAt(0).toUpperCase() + pill.slice(1)}
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
          <div className="flex items-center gap-4 text-xs font-bold text-gray-500">
            <div className="flex items-center gap-1.5">
              <input type="checkbox" id="reveal" defaultChecked className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4" />
              <label htmlFor="reveal" className="cursor-pointer">Reveal funds</label>
            </div>
            <div className="flex items-center gap-1.5">
              <input type="checkbox" id="buyinGroup" className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4" />
              <label htmlFor="buyinGroup" className="cursor-pointer">Buy in</label>
            </div>
            <div className="flex items-center gap-1.5">
              <input type="checkbox" id="showholdings" className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4" />
              <label htmlFor="showholdings" className="cursor-pointer">Show holdings</label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Chart column */}
          <div className="h-[300px] relative flex items-center justify-center">
            {loading ? (
              <div className="w-20 h-20 rounded-full border-4 border-gray-100 border-t-blue-500 animate-spin"></div>
            ) : groupedData.length > 0 ? (
              <div className="w-full h-full relative">
                <Doughnut data={groupedChartData} options={chartOptions} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-6">
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
                  </div>
                  <span>{g.weight.toFixed(2)}%</span>
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

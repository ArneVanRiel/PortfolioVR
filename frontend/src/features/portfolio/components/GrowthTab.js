import React, { useState, useMemo } from 'react';
import { Line, Bar } from 'react-chartjs-2';

const BENCHMARKS = [
  { ticker: 'SPY', name: 'S&P 500' },
  { ticker: 'QQQ', name: 'NASDAQ 100' },
  { ticker: 'IWM', name: 'RUSSELL 2000' },
  { ticker: 'EXS1', name: 'DAX 40' },
  { ticker: 'VT', name: 'FTSE Global' },
  { ticker: 'URTH', name: 'MSCI World' }
];

const GrowthTab = ({
  selectedBenchmark,
  setSelectedBenchmark,
  benchmarkHistory,
  displayCurrency,
  filteredHistVal,
  filteredHistPerf,
  growthShowCostBasis,
  setGrowthShowCostBasis,
  growthShowTrades,
  setGrowthShowTrades,
  valPeriod,
  setValPeriod,
  valStart,
  setValStart,
  valEnd,
  setValEnd,
  perfPeriod,
  setPerfPeriod,
  perfStart,
  setPerfStart,
  perfEnd,
  setPerfEnd,
  growthPerfType,
  setGrowthPerfType,
  dynamicsPeriod,
  setDynamicsPeriod,
  dynamicsDisplay,
  setDynamicsDisplay,
  dynamicsData,
  dynamicsLoading,
  dynPeriod,
  setDynPeriod,
  dynStart,
  setDynStart,
  dynEnd,
  setDynEnd,
  renderTimeframeSelector,
  formatCurrency,
  isIncognito,
  processedHoldings,
  loading
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyType, setHistoryType] = useState('portfolio'); // 'portfolio' | 'assets'
  const [groupBy, setGroupBy] = useState('none'); // 'none' | 'class' | 'sector'

  // Custom dataset visibility state
  const [visibleDatasets, setVisibleDatasets] = useState({
    portfolio: true,
    benchmark: true,
    costBasis: true
  });

  // Range selection states for Chart.js click-select
  const [dragStartIdx, setDragStartIdx] = useState(null);
  const [dragEndIdx, setDragEndIdx] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  // Get active benchmark name
  const benchmarkName = useMemo(() => {
    return BENCHMARKS.find(b => b.ticker === selectedBenchmark)?.name || 'S&P 500';
  }, [selectedBenchmark]);

  // --- Dynamic Date Range & Period Gains Calculations (Screenshot 11) ---
  const dateRangeText = useMemo(() => {
    if (filteredHistVal.length === 0) return '';
    const startD = new Date(filteredHistVal[0].date);
    const endD = new Date(filteredHistVal[filteredHistVal.length - 1].date);
    
    const formatDt = (d) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[d.getMonth()]} ${d.getDate()}, ${String(d.getFullYear()).substring(2)}`;
    };
    
    return `${formatDt(startD)} - ${formatDt(endD)}`;
  }, [filteredHistVal]);

  // Match benchmark timeline to user history timeline using YYYY-MM-DD
  const matchedBenchmarkValues = useMemo(() => {
    return filteredHistVal.map(h => {
      const hDateStr = h.date.substring(0, 10);
      const bPoint = benchmarkHistory.find(b => b.date.substring(0, 10) === hDateStr);
      return bPoint ? bPoint.value : null;
    });
  }, [filteredHistVal, benchmarkHistory]);

  // Rebase benchmark values to start at the exact same value as portfolio value on day 1 (re-basing)
  const rebasedBenchmarkValues = useMemo(() => {
    if (filteredHistVal.length === 0 || matchedBenchmarkValues.length === 0) return [];
    
    const startP = filteredHistVal[0].total_value || 0;
    const startB = matchedBenchmarkValues.find(v => v !== null) || 0;
    
    if (startP === 0 || startB === 0) {
      return matchedBenchmarkValues;
    }
    
    const ratio = startP / startB;
    return matchedBenchmarkValues.map(v => v === null ? null : parseFloat((v * ratio).toFixed(2)));
  }, [filteredHistVal, matchedBenchmarkValues]);

  const periodGains = useMemo(() => {
    if (filteredHistVal.length < 2 || rebasedBenchmarkValues.length < 2) return { portfolio: 0, benchmark: 0 };
    
    const startP = filteredHistVal[0].total_value || 0;
    const endP = filteredHistVal[filteredHistVal.length - 1].total_value || 0;
    
    const endB = rebasedBenchmarkValues[rebasedBenchmarkValues.length - 1] || 0;
    
    return {
      portfolio: endP - startP,
      benchmark: endB - startP
    };
  }, [filteredHistVal, rebasedBenchmarkValues]);

  // --- Dynamic Alert Block Calculations (Card 1) ---
  const alertInfo = useMemo(() => {
    if (filteredHistVal.length < 2 || benchmarkHistory.length < 2) return null;

    const startP = filteredHistVal[0].total_value || 0;
    const endP = filteredHistVal[filteredHistVal.length - 1].total_value || 0;
    
    const startDateStr = filteredHistVal[0].date.substring(0, 10);
    const endDateStr = filteredHistVal[filteredHistVal.length - 1].date.substring(0, 10);

    const startBPoint = benchmarkHistory.find(b => b.date.substring(0, 10) >= startDateStr);
    const endBPoint = benchmarkHistory.find(b => b.date.substring(0, 10) <= endDateStr);

    const startB = startBPoint ? startBPoint.value : 0;
    const endB = endBPoint ? endBPoint.value : 0;

    if (startP === 0 || startB === 0) return null;

    const pReturnPct = ((endP - startP) / startP) * 100;
    const bReturnPct = ((endB - startB) / startB) * 100;

    const diffPct = pReturnPct - bReturnPct;
    const diffVal = (endP - startP) - (endB - startB);

    return {
      isAhead: diffPct >= 0,
      diffPct: Math.abs(diffPct).toFixed(2),
      diffVal: Math.abs(diffVal),
      benchmarkName
    };
  }, [filteredHistVal, benchmarkHistory, benchmarkName]);

  // --- Chart 1: Portfolio Value ---
  const valueChartData = useMemo(() => {
    const labels = filteredHistVal.map(h => new Date(h.date).toLocaleDateString('nl-BE'));
    const datasets = [];

    if (visibleDatasets.portfolio) {
      datasets.push({
        label: 'Portfolio',
        data: filteredHistVal.map(h => h.total_value),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.05)',
        borderWidth: 2.5,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.1
      });
    }

    if (visibleDatasets.benchmark) {
      datasets.push({
        label: benchmarkName,
        data: rebasedBenchmarkValues,
        borderColor: '#F59E0B',
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.1
      });
    }

    if (visibleDatasets.costBasis && growthShowCostBasis && historyType === 'portfolio') {
      datasets.push({
        label: 'Invested',
        data: filteredHistVal.map(h => h.net_invested),
        borderColor: '#8B5CF6',
        borderWidth: 1.5,
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0
      });
    }

    return { labels, datasets };
  }, [filteredHistVal, matchedBenchmarkValues, benchmarkName, growthShowCostBasis, visibleDatasets, historyType]);

  // Custom ChartJS Plugin to draw range selection background (Screenshot 14)
  const rangeSelectionPlugin = useMemo(() => ({
    id: 'rangeSelection',
    beforeDraw: (chart) => {
      const { ctx, chartArea, scales } = chart;
      if (dragStartIdx !== null) {
        const xStart = scales.x.getPixelForValue(dragStartIdx);
        let xEnd = xStart;
        if (dragEndIdx !== null) {
          xEnd = scales.x.getPixelForValue(dragEndIdx);
        } else if (hoverIdx !== null) {
          xEnd = scales.x.getPixelForValue(hoverIdx);
        }
        
        ctx.save();
        ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
        ctx.fillRect(
          Math.min(xStart, xEnd),
          chartArea.top,
          Math.abs(xEnd - xStart),
          chartArea.bottom - chartArea.top
        );
        
        // Draw dashed vertical lines
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        
        ctx.beginPath();
        ctx.moveTo(xStart, chartArea.top);
        ctx.lineTo(xStart, chartArea.bottom);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(xEnd, chartArea.top);
        ctx.lineTo(xEnd, chartArea.bottom);
        ctx.stroke();
        
        ctx.restore();
      }
    }
  }), [dragStartIdx, dragEndIdx, hoverIdx]);

  const valueChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    onClick: (evt, activeElements, chart) => {
      const points = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, true);
      if (points.length > 0) {
        const clickedIdx = points[0].index;
        if (dragStartIdx === null || (dragStartIdx !== null && dragEndIdx !== null)) {
          setDragStartIdx(clickedIdx);
          setDragEndIdx(null);
        } else {
          const start = Math.min(dragStartIdx, clickedIdx);
          const end = Math.max(dragStartIdx, clickedIdx);
          setDragEndIdx(end);
          setDragStartIdx(start);
          
          // Trigger dates filter
          if (filteredHistVal[start] && filteredHistVal[end]) {
            setValStart(filteredHistVal[start].date);
            setValEnd(filteredHistVal[end].date);
            setValPeriod('Custom');
          }
        }
      }
    },
    onHover: (evt, activeElements, chart) => {
      const points = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, true);
      if (points.length > 0) {
        setHoverIdx(points[0].index);
      } else {
        setHoverIdx(null);
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        padding: 10,
        cornerRadius: 6,
        callbacks: {
          label: (ctx) => isIncognito ? '••••••' : ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { family: 'Inter, sans-serif' }, color: '#9CA3AF' }, border: { display: false } },
      y: { grid: { color: '#F3F4F6' }, border: { display: false }, ticks: { font: { family: 'Inter, sans-serif' }, color: '#9CA3AF', callback: (val) => isIncognito ? '•••' : new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency, maximumSignificantDigits: 3, notation: "compact", compactDisplay: "short" }).format(val) } }
    }
  }), [displayCurrency, isIncognito, formatCurrency, dragStartIdx, dragEndIdx, filteredHistVal, setValStart, setValEnd, setValPeriod]);

  // --- Chart 2: Portfolio Performance (Teal Chart) ---
  const performanceChartData = useMemo(() => {
    const labels = filteredHistPerf.map(h => new Date(h.date).toLocaleDateString('nl-BE'));
    
    // Performance data calculations
    const perfData = filteredHistPerf.map(h => {
      const profit = h.total_value - h.net_invested;
      if (growthPerfType === 'percent') {
        const invested = h.net_invested || 1;
        return (profit / invested) * 100;
      }
      return profit;
    });

    return {
      labels,
      datasets: [{
        label: 'Performance',
        data: perfData,
        borderColor: '#14B8A6',
        backgroundColor: 'rgba(20, 184, 166, 0.05)',
        borderWidth: 2,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.1
      }]
    };
  }, [filteredHistPerf, growthPerfType]);

  const performanceChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        padding: 10,
        cornerRadius: 6,
        callbacks: {
          label: (ctx) => ` Performance: ${growthPerfType === 'percent' ? ctx.raw.toFixed(2) + '%' : formatCurrency(ctx.raw)}`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { family: 'Inter, sans-serif' }, color: '#9CA3AF' }, border: { display: false } },
      y: { grid: { color: '#F3F4F6' }, border: { display: false }, ticks: { font: { family: 'Inter, sans-serif' }, color: '#9CA3AF', callback: (val) => growthPerfType === 'percent' ? `${val}%` : new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency, maximumSignificantDigits: 3, notation: "compact", compactDisplay: "short" }).format(val) } }
    }
  }), [growthPerfType, displayCurrency, formatCurrency]);

  // --- Chart 3: Dynamics of portfolio returns ---
  const dynamicsChartData = useMemo(() => {
    const labels = dynamicsData.map(d => d.period);
    const data = dynamicsData.map(d => dynamicsDisplay === 'percent' ? d.returnPercent : d.returnValue);

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: data.map(v => v >= 0 ? '#10B981' : '#EF4444'),
        borderRadius: 4,
        maxBarThickness: 35
      }]
    };
  }, [dynamicsData, dynamicsDisplay]);

  const dynamicsChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        padding: 10,
        cornerRadius: 6,
        callbacks: {
          label: (ctx) => ` Return: ${dynamicsDisplay === 'percent' ? ctx.raw.toFixed(2) + '%' : formatCurrency(ctx.raw)}`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { family: 'Inter, sans-serif' }, color: '#9CA3AF' }, border: { display: false } },
      y: { grid: { color: '#F3F4F6' }, border: { display: false }, ticks: { font: { family: 'Inter, sans-serif' }, color: '#9CA3AF', callback: (val) => dynamicsDisplay === 'percent' ? `${val}%` : new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency, maximumSignificantDigits: 3, notation: "compact", compactDisplay: "short" }).format(val) } }
    }
  }), [dynamicsDisplay, displayCurrency, formatCurrency]);

  // --- Chart 4: Holdings Performance ---
  const holdingsPerfData = useMemo(() => {
    const data = processedHoldings.map(h => {
      const returnPct = h.total_invested > 0 ? (h.gainLoss / h.total_invested) * 100 : 0;
      return {
        ticker: h.ticker,
        name: h.name || h.ticker,
        returnPct
      };
    }).sort((a, b) => b.returnPct - a.returnPct);

    return data;
  }, [processedHoldings]);

  const holdingsChartData = useMemo(() => {
    return {
      labels: holdingsPerfData.map(h => h.ticker),
      datasets: [{
        data: holdingsPerfData.map(h => h.returnPct),
        backgroundColor: holdingsPerfData.map(h => h.returnPct >= 0 ? '#10B981' : '#EF4444'),
        borderRadius: 4,
        barThickness: 16
      }]
    };
  }, [holdingsPerfData]);

  const holdingsChartOptions = useMemo(() => ({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        padding: 10,
        cornerRadius: 6,
        callbacks: {
          label: (ctx) => ` Return: ${ctx.raw.toFixed(1)}%`
        }
      }
    },
    scales: {
      x: { grid: { color: '#F3F4F6' }, border: { display: false }, ticks: { font: { family: 'Inter, sans-serif' }, color: '#9CA3AF', callback: (val) => `${val}%` } },
      y: { grid: { display: false }, ticks: { font: { family: 'Inter, sans-serif', weight: 'bold' }, color: '#374151' }, border: { display: false } }
    }
  }), []);

  // Helper to reset click selection
  const resetSelection = () => {
    setDragStartIdx(null);
    setDragEndIdx(null);
    setHoverIdx(null);
    setValPeriod('1Y');
  };

  return (
    <div className="space-y-6">
      {/* Benchmark Selector Bar */}
      <div className="bg-white px-6 py-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Benchmarks:</span>
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              {benchmarkName} ({selectedBenchmark})
              <span className="text-[10px] opacity-75">▼</span>
            </button>
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)}></div>
                <div className="absolute left-0 mt-2 w-48 rounded-xl shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50 overflow-hidden py-1">
                  {BENCHMARKS.map((b) => (
                    <button
                      key={b.ticker}
                      onClick={() => {
                        setSelectedBenchmark(b.ticker);
                        setDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-blue-50 font-semibold flex justify-between items-center"
                    >
                      <span>{b.name}</span>
                      <span className="text-[10px] text-gray-400 uppercase">{b.ticker}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <a href="#tutorial" className="text-xs font-bold text-blue-600 hover:text-blue-700">See tutorial</a>
      </div>

      {/* Card 1: Portfolio Value Compare */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[530px] relative">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
            Portfolio value
            <span className="cursor-help text-xs text-gray-300 border border-gray-200 rounded-full w-4 h-4 flex items-center justify-center font-normal" title="Compare value and cost basis with index benchmarks. Drag or click on graph to select custom date ranges.">?</span>
            {dragStartIdx !== null && (
              <button 
                onClick={resetSelection} 
                className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-500 font-bold px-2 py-0.5 rounded transition-all ml-2"
              >
                Reset selectie
              </button>
            )}
          </h3>
          
          {/* Custom Date Range & Period Gains legend (Screenshot 11) */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-gray-500 sm:text-right">
            <span>{dateRangeText}</span>
            {visibleDatasets.portfolio && (
              <span className={`flex items-center gap-1 ${periodGains.portfolio >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                {periodGains.portfolio >= 0 ? '+' : ''}{formatCurrency(periodGains.portfolio)}
              </span>
            )}
            {visibleDatasets.benchmark && (
              <span className={`flex items-center gap-1 ${periodGains.benchmark >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                <span className="w-2 h-2 rounded-full bg-[#F59E0B]"></span>
                {periodGains.benchmark >= 0 ? '+' : ''}{formatCurrency(periodGains.benchmark)}
              </span>
            )}
          </div>
        </div>

        {/* Dynamic Alert Banner */}
        {alertInfo && (
          <div className={`mb-4 px-4 py-3 rounded-lg flex items-center gap-3 border text-xs font-semibold ${
            alertInfo.isAhead 
              ? 'bg-emerald-50/50 border-emerald-100 text-emerald-700' 
              : 'bg-rose-50/50 border-rose-100 text-rose-700'
          }`}>
            <i className={`ph-fill ${alertInfo.isAhead ? 'ph-trend-up' : 'ph-trend-down'} text-base`}></i>
            <span>
              Portfolio is {alertInfo.isAhead ? 'ahead' : 'behind'} of {alertInfo.benchmarkName} by {formatCurrency(alertInfo.diffVal)} ({alertInfo.diffPct}%) over the selected period
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          {renderTimeframeSelector(valPeriod, setValPeriod, valStart, setValStart, valEnd, setValEnd)}
          
          <div className="flex items-center gap-4">
            {/* Custom legend with visibility toggles (Screenshot 11) */}
            <div className="flex items-center gap-4 text-xs font-semibold text-gray-500 select-none">
              <button
                onClick={() => setVisibleDatasets(prev => ({ ...prev, portfolio: !prev.portfolio }))}
                className={`flex items-center gap-1.5 hover:text-gray-900 transition-colors ${visibleDatasets.portfolio ? '' : 'line-through opacity-40'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Portfolio
              </button>
              <button
                onClick={() => setVisibleDatasets(prev => ({ ...prev, benchmark: !prev.benchmark }))}
                className={`flex items-center gap-1.5 hover:text-gray-900 transition-colors ${visibleDatasets.benchmark ? '' : 'line-through opacity-40'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></span> {benchmarkName}
              </button>
              {growthShowCostBasis && historyType === 'portfolio' && (
                <button
                  onClick={() => setVisibleDatasets(prev => ({ ...prev, costBasis: !prev.costBasis }))}
                  className={`flex items-center gap-1.5 hover:text-gray-900 transition-colors ${visibleDatasets.costBasis ? '' : 'line-through opacity-40'}`}
                >
                  <span className="w-2.5 h-0.5 border-t-2 border-dashed border-[#8B5CF6]"></span> Invested
                </button>
              )}
            </div>

            {/* Three Dots Button for Settings Menu (Screenshot 12) */}
            <div className="relative">
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="text-gray-400 hover:text-gray-600 p-1 flex items-center justify-center"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
                </svg>
              </button>
              {settingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSettingsOpen(false)}></div>
                  <div className="origin-top-right absolute right-0 mt-2 w-80 rounded-xl shadow-xl bg-white border border-gray-100 ring-1 ring-black ring-opacity-5 z-50 p-4 space-y-4 text-xs font-semibold text-gray-700">
                    
                    {/* Tabs row: Portfolio history vs Assets history */}
                    <div className="flex bg-gray-50 p-0.5 rounded-lg border border-gray-200">
                      <button
                        onClick={() => setHistoryType('portfolio')}
                        className={`flex-1 py-1.5 text-center rounded-md font-bold transition-all ${
                          historyType === 'portfolio' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        Portfolio history
                      </button>
                      <button
                        onClick={() => setHistoryType('assets')}
                        className={`flex-1 py-1.5 text-center rounded-md font-bold transition-all ${
                          historyType === 'assets' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        Assets history
                      </button>
                    </div>

                    {/* Subtitle text */}
                    <span className="text-[10px] text-gray-400 block -mt-1 font-bold">
                      {historyType === 'portfolio' ? 'Portfolio value considering trades' : 'Historical value of current portfolio assets'}
                    </span>

                    {/* Group by row */}
                    <div className="flex justify-between items-center pt-1">
                      <span>Group by</span>
                      <select
                        value={groupBy}
                        onChange={(e) => setGroupBy(e.target.value)}
                        className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-2 py-1 outline-none font-bold"
                      >
                        <option value="none">No grouping</option>
                        <option value="class">Asset class</option>
                        <option value="sector">Sector</option>
                      </select>
                    </div>

                    {/* Show cost basis row */}
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1">
                        Show cost basis
                        <span className="cursor-help text-[10px] text-gray-300 border border-gray-200 rounded-full w-3.5 h-3.5 flex items-center justify-center font-normal" title="Show line representing net invested money.">?</span>
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={historyType === 'assets'}
                          checked={historyType === 'portfolio' && growthShowCostBasis}
                          onChange={(e) => setGrowthShowCostBasis(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    {/* Show trades row */}
                    <div className="flex justify-between items-center">
                      <span>Show trades</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={growthShowTrades}
                          onChange={(e) => setGrowthShowTrades(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                  </div>
                </>
              )}
            </div>
          </div>
        </div>



        <div className="flex-grow relative min-h-0 incognito-hide mt-2">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-gray-100 border-t-blue-500 animate-spin"></div>
            </div>
          ) : filteredHistVal.length > 0 ? (
            <Line 
              key={`${valPeriod}-${filteredHistVal.length}-${visibleDatasets.portfolio}-${visibleDatasets.benchmark}-${historyType}`}
              data={valueChartData} 
              options={valueChartOptions} 
              plugins={[rangeSelectionPlugin]} 
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
              <i className="ph-fill ph-chart-line-up text-4xl mb-2 opacity-30"></i>
              No historical data available.
            </div>
          )}
        </div>
        <div className="incognito-show flex-col items-center justify-center h-full text-gray-400 text-sm">
          <i className="ph-fill ph-eye-slash text-4xl mb-2 opacity-30"></i>
          Waardegrafiek verborgen in privacymodus
        </div>
      </div>

      {/* Card 2: Portfolio Performance */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[480px]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
            Portfolio performance
            <span className="cursor-help text-xs text-gray-300 border border-gray-200 rounded-full w-4 h-4 flex items-center justify-center font-normal" title="Historical return on assets.">?</span>
          </h3>
          <div className="flex items-center gap-4">
            {renderTimeframeSelector(perfPeriod, setPerfPeriod, perfStart, setPerfStart, perfEnd, setPerfEnd)}
            <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
              <button onClick={() => setGrowthPerfType('percent')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${growthPerfType === 'percent' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>%</button>
              <button onClick={() => setGrowthPerfType('value')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${growthPerfType === 'value' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{displayCurrency}</button>
            </div>
          </div>
        </div>

        <div className="flex-grow relative min-h-0">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-gray-100 border-t-blue-500 animate-spin"></div>
            </div>
          ) : filteredHistPerf.length > 0 ? (
            <Line 
              key={`${perfPeriod}-${filteredHistPerf.length}-${growthPerfType}`}
              data={performanceChartData} 
              options={performanceChartOptions} 
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
              <i className="ph-fill ph-chart-bar text-4xl mb-2 opacity-30"></i>
              No performance data available.
            </div>
          )}
        </div>
      </div>

      {/* Card 3: Dynamics of portfolio returns */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[480px]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
            Dynamics of portfolio returns
            <span className="cursor-help text-xs text-gray-300 border border-gray-200 rounded-full w-4 h-4 flex items-center justify-center font-normal" title="Monthly/weekly returns timeline.">?</span>
          </h3>
          <div className="flex items-center gap-4">
            {renderTimeframeSelector(dynPeriod, setDynPeriod, dynStart, setDynStart, dynEnd, setDynEnd)}
            <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
              <button onClick={() => setDynamicsDisplay('percent')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${dynamicsDisplay === 'percent' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>%</button>
              <button onClick={() => setDynamicsDisplay('value')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${dynamicsDisplay === 'value' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{displayCurrency}</button>
            </div>
          </div>
        </div>

        <div className="flex-grow relative min-h-0">
          {dynamicsLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-gray-100 border-t-blue-500 animate-spin"></div>
            </div>
          ) : dynamicsData.length > 0 ? (
            <Bar 
              key={`${dynPeriod}-${dynamicsData.length}-${dynamicsDisplay}`}
              data={dynamicsChartData} 
              options={dynamicsChartOptions} 
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
              <i className="ph-fill ph-chart-bar-horizontal text-4xl mb-2 opacity-30"></i>
              No monthly return data available.
            </div>
          )}
        </div>
      </div>

      {/* Card 4: Holdings Performance */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[520px]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
            Holdings performance
            <span className="cursor-help text-xs text-gray-300 border border-gray-200 rounded-full w-4 h-4 flex items-center justify-center font-normal" title="Lifetime performance return by stock.">?</span>
          </h3>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">all time</span>
        </div>

        <div className="flex-grow relative min-h-0">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-gray-100 border-t-blue-500 animate-spin"></div>
            </div>
          ) : holdingsPerfData.length > 0 ? (
            <Bar 
              key={`${holdingsPerfData.length}`}
              data={holdingsChartData} 
              options={holdingsChartOptions} 
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
              <i className="ph-fill ph-chart-bar-horizontal text-4xl mb-2 opacity-30"></i>
              No holding data available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GrowthTab;

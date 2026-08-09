import React, { useState, useMemo, useEffect } from 'react';
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
  history,
  categoryHistories,
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
  rawTransactions,
  availableAssetTypes,
  loading
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyType, setHistoryType] = useState('portfolio'); // 'portfolio' | 'assets'
  const [groupBy, setGroupBy] = useState('none'); // 'none' | 'class' | 'sector'

  const [dynamicsSettingsOpen, setDynamicsSettingsOpen] = useState(false);
  const [isDynamicsModalOpen, setIsDynamicsModalOpen] = useState(false);
  const [modalPeriodFilter, setModalPeriodFilter] = useState('12m');
  const [cardPeriodFilter, setCardPeriodFilter] = useState('12m');

  const formatPeriodLabel = (pStr, grouping) => {
    if (!pStr) return '';
    try {
      if (grouping === 'monthly') {
        const parts = pStr.split('-');
        if (parts.length === 2) {
          const year = parts[0];
          const month = parseInt(parts[1]) - 1;
          const date = new Date(year, month, 1);
          return date.toLocaleDateString('nl-BE', { month: 'short', year: '2-digit' });
        }
      } else if (grouping === 'weekly') {
        const date = new Date(pStr);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: '2-digit' });
        }
      } else if (grouping === 'quarterly') {
        const parts = pStr.split('-');
        if (parts.length === 2) {
          return `${parts[1]} '${parts[0].substring(2)}`;
        }
      }
    } catch (e) {
      // fallback
    }
    return pStr;
  };

  // Performance chart specific states (Screenshot 16 & 17)
  const [perfCompareBenchmark, setPerfCompareBenchmark] = useState(false);
  const [perfSettingsOpen, setPerfSettingsOpen] = useState(false);
  const [perfCalcMethod, setPerfCalcMethod] = useState('period'); // 'period' | 'first_trade'
  const [perfGroupBy, setPerfGroupBy] = useState('none');

  // Custom category visibility state for Category Grouping (Screenshot 19)
  const [visibleCategories, setVisibleCategories] = useState({});

  useEffect(() => {
    if (availableAssetTypes && availableAssetTypes.length > 0) {
      const initial = {};
      availableAssetTypes.forEach(cat => {
        initial[cat] = true;
      });
      setVisibleCategories(initial);
    }
  }, [availableAssetTypes]);

  const CATEGORY_COLORS = {
    STOCK: '#2563eb',     // Blue
    STOCKS: '#2563eb',
    ETF: '#F59E0B',       // Orange/Yellow
    ETFS: '#F59E0B',
    FUNDS: '#F59E0B',
    COMMODITY: '#8B5CF6',   // Purple
    COMMODITIES: '#8B5CF6',
    FINANCIAL: '#14B8A6',   // Teal
    FINANCIALS: '#14B8A6',
    ONBEKEND: '#9CA3AF'     // Gray
  };

  const getCategoryColor = (cat) => CATEGORY_COLORS[cat.toUpperCase()] || '#10B981';

  const getCategoryLabel = (cat) => {
    if (cat.toUpperCase() === 'STOCK' || cat.toUpperCase() === 'STOCKS') return 'Stocks';
    if (cat.toUpperCase() === 'ETF' || cat.toUpperCase() === 'ETFS' || cat.toUpperCase() === 'FUNDS') return 'Funds';
    return cat;
  };

  // Custom dataset visibility state for default Value Chart
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

  const matchedBenchmarkValues = useMemo(() => {
    return filteredHistVal.map(h => {
      const hDateStr = h.date.substring(0, 10);
      const bPoint = benchmarkHistory.find(b => b.date.substring(0, 10) === hDateStr);
      return bPoint ? bPoint.value : null;
    });
  }, [filteredHistVal, benchmarkHistory]);

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

  const rebasedBenchmarkCost = useMemo(() => {
    if (filteredHistVal.length === 0 || matchedBenchmarkValues.length === 0) return [];
    
    const startP = filteredHistVal[0].total_value || 0;
    const startB = matchedBenchmarkValues.find(v => v !== null) || 0;
    
    if (startP === 0 || startB === 0) {
      return filteredHistVal.map(h => h.net_invested);
    }
    
    const ratio = startP / startB;
    return filteredHistVal.map(h => {
      const hDateStr = h.date.substring(0, 10);
      const bPoint = benchmarkHistory.find(b => b.date.substring(0, 10) === hDateStr);
      const bCost = bPoint ? bPoint.costBasis : 0;
      return parseFloat((bCost * ratio).toFixed(2));
    });
  }, [filteredHistVal, matchedBenchmarkValues, benchmarkHistory]);

  const periodGains = useMemo(() => {
    if (filteredHistVal.length < 2 || rebasedBenchmarkValues.length < 2 || rebasedBenchmarkCost.length < 2) return { portfolio: 0, benchmark: 0 };
    
    const startP = filteredHistVal[0].total_value || 0;
    const startInvested = filteredHistVal[0].net_invested || 0;
    const endP = filteredHistVal[filteredHistVal.length - 1].total_value || 0;
    const endInvested = filteredHistVal[filteredHistVal.length - 1].net_invested || 0;

    const endB = rebasedBenchmarkValues[rebasedBenchmarkValues.length - 1] || 0;
    const endBCost = rebasedBenchmarkCost[rebasedBenchmarkCost.length - 1] || 0;
    
    const portfolioProfit = (endP - endInvested) - (startP - startInvested);
    const benchmarkProfit = (endB - endBCost) - (startP - rebasedBenchmarkCost[0]);

    return {
      portfolio: portfolioProfit,
      benchmark: benchmarkProfit
    };
  }, [filteredHistVal, rebasedBenchmarkValues, rebasedBenchmarkCost]);

  // --- Dynamic Alert Block Calculations (Card 1) ---
  const alertInfo = useMemo(() => {
    if (filteredHistVal.length < 2 || benchmarkHistory.length < 2 || rebasedBenchmarkValues.length < 2 || rebasedBenchmarkCost.length < 2) return null;

    const startP = filteredHistVal[0].total_value || 0;
    const startInvested = filteredHistVal[0].net_invested || 0;
    const endP = filteredHistVal[filteredHistVal.length - 1].total_value || 0;
    const endInvested = filteredHistVal[filteredHistVal.length - 1].net_invested || 0;

    const endB = rebasedBenchmarkValues[rebasedBenchmarkValues.length - 1] || 0;
    const endBCost = rebasedBenchmarkCost[rebasedBenchmarkCost.length - 1] || 0;

    const startDateStr = filteredHistVal[0].date.substring(0, 10);
    const startBPoint = benchmarkHistory.find(b => b.date.substring(0, 10) >= startDateStr);
    const startB = startBPoint ? startBPoint.value : 0;

    if (startP === 0 || startB === 0) return null;

    const portfolioProfit = (endP - endInvested) - (startP - startInvested);
    const benchmarkProfit = (endB - endBCost) - (startP - rebasedBenchmarkCost[0]);

    const diffVal = portfolioProfit - benchmarkProfit;
    const diffPct = (diffVal / startP) * 100;

    return {
      isAhead: diffPct >= 0,
      diffPct: Math.abs(diffPct).toFixed(2),
      diffVal: Math.abs(diffVal),
      benchmarkName
    };
  }, [filteredHistVal, benchmarkHistory, rebasedBenchmarkValues, rebasedBenchmarkCost, benchmarkName]);

  // Compute trade markers for the Portfolio Value chart (Show trades option)
  const tradeMarkers = useMemo(() => {
    if (!growthShowTrades || !rawTransactions || rawTransactions.length === 0) {
      return null;
    }
    
    const pointRadii = [];
    const pointHoverRadii = [];
    const pointBgColors = [];
    const pointBorderColors = [];
    
    filteredHistVal.forEach(h => {
      const hDateStr = h.date.substring(0, 10);
      const dayTxs = rawTransactions.filter(t => {
        if (!t.purchase_time) return false;
        const tDateStr = new Date(t.purchase_time).toISOString().split('T')[0];
        return tDateStr === hDateStr && (t.transaction_type === 'BUY' || t.transaction_type === 'SELL');
      });
      
      if (dayTxs.length > 0) {
        const hasBuy = dayTxs.some(t => t.transaction_type === 'BUY');
        pointRadii.push(6);
        pointHoverRadii.push(8);
        pointBgColors.push(hasBuy ? '#10B981' : '#EF4444');
        pointBorderColors.push('#ffffff');
      } else {
        pointRadii.push(0);
        pointHoverRadii.push(4);
        pointBgColors.push('#2563eb');
        pointBorderColors.push('#2563eb');
      }
    });
    
    return { pointRadii, pointHoverRadii, pointBgColors, pointBorderColors };
  }, [filteredHistVal, rawTransactions, growthShowTrades]);

  // --- Chart 1: Portfolio Value ---
  const valueChartData = useMemo(() => {
    const labels = filteredHistVal.map(h => new Date(h.date).toLocaleDateString('nl-BE'));
    const datasets = [];

    if (groupBy === 'class') {
      availableAssetTypes.forEach(cat => {
        if (visibleCategories[cat]) {
          const catData = filteredHistVal.map(h => {
            const hDateStr = h.date.substring(0, 10);
            const found = (categoryHistories[cat] || []).find(c => c.date.substring(0, 10) === hDateStr);
            return found ? found.total_value : 0;
          });
          
          datasets.push({
            label: getCategoryLabel(cat),
            data: catData,
            borderColor: getCategoryColor(cat),
            backgroundColor: 'rgba(37, 99, 235, 0.02)',
            borderWidth: 2.5,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.1
          });
        }
      });
    } else {
      if (visibleDatasets.portfolio) {
        datasets.push({
          label: 'Portfolio',
          data: filteredHistVal.map(h => h.total_value),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.05)',
          borderWidth: 2.5,
          fill: true,
          pointRadius: tradeMarkers ? tradeMarkers.pointRadii : 0,
          pointHoverRadius: tradeMarkers ? tradeMarkers.pointHoverRadii : 4,
          pointBackgroundColor: tradeMarkers ? tradeMarkers.pointBgColors : '#2563eb',
          pointBorderColor: tradeMarkers ? tradeMarkers.pointBorderColors : '#2563eb',
          pointBorderWidth: tradeMarkers ? 1.5 : 0,
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
    }

    return { labels, datasets };
  }, [filteredHistVal, rebasedBenchmarkValues, benchmarkName, growthShowCostBasis, visibleDatasets, historyType, tradeMarkers, groupBy, availableAssetTypes, visibleCategories, categoryHistories]);

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

  // --- Chart 2: Portfolio Performance (Teal Chart) Calculations (Screenshot 16) ---
  const perfDateRangeText = useMemo(() => {
    if (filteredHistPerf.length === 0) return '';
    const startD = new Date(filteredHistPerf[0].date);
    const endD = new Date(filteredHistPerf[filteredHistPerf.length - 1].date);
    
    const formatDt = (d) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[d.getMonth()]} ${d.getDate()}, ${String(d.getFullYear()).substring(2)}`;
    };
    
    return `${formatDt(startD)} - ${formatDt(endD)}`;
  }, [filteredHistPerf]);

  const matchedPerfBenchmarkValues = useMemo(() => {
    return filteredHistPerf.map(h => {
      const hDateStr = h.date.substring(0, 10);
      const bPoint = benchmarkHistory.find(b => b.date.substring(0, 10) === hDateStr);
      return bPoint ? { value: bPoint.value, costBasis: bPoint.costBasis, rawPrice: bPoint.rawPrice } : null;
    });
  }, [filteredHistPerf, benchmarkHistory]);

  const fullTwrTimeline = useMemo(() => {
    if (!history || history.length === 0) return [];
    
    let currentTwr = 1.0;
    const twrValues = [];
    
    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      if (i === 0) {
        twrValues.push(0);
        continue;
      }
      
      const prev = history[i - 1];
      const prevVal = prev.total_value || 0;
      const curVal = h.total_value || 0;
      const curInvested = h.net_invested || 0;
      const prevInvested = prev.net_invested || 0;
      
      const cf = curInvested - prevInvested;
      
      let dailyReturn = 0;
      if (prevVal > 0) {
        dailyReturn = (curVal - cf) / prevVal - 1;
      }
      
      if (dailyReturn > 2.0) dailyReturn = 0;
      if (dailyReturn < -0.9) dailyReturn = 0;
      
      currentTwr = currentTwr * (1 + dailyReturn);
      twrValues.push((currentTwr - 1) * 100);
    }
    
    return twrValues;
  }, [history]);

  const twrValuesForPerf = useMemo(() => {
    return filteredHistPerf.map(h => {
      const idx = history.findIndex(p => p.date === h.date);
      if (idx !== -1 && fullTwrTimeline[idx] !== undefined) {
        return fullTwrTimeline[idx];
      }
      return 0;
    });
  }, [filteredHistPerf, history, fullTwrTimeline]);

  // Compiles TWR timelines for individual asset categories
  const categoryTwrTimelines = useMemo(() => {
    if (!history || history.length === 0 || !categoryHistories) return {};
    
    const catTimelines = {};
    
    availableAssetTypes.forEach(cat => {
      const catHistory = categoryHistories[cat] || [];
      if (catHistory.length === 0) {
        catTimelines[cat] = [];
        return;
      }
      
      let currentTwr = 1.0;
      const twrValues = [];
      
      for (let i = 0; i < catHistory.length; i++) {
        const h = catHistory[i];
        if (i === 0) {
          twrValues.push(0);
          continue;
        }
        
        const prev = catHistory[i - 1];
        const prevVal = prev.total_value || 0;
        const curVal = h.total_value || 0;
        const curInvested = h.net_invested || 0;
        const prevInvested = prev.net_invested || 0;
        
        const cf = curInvested - prevInvested;
        
        let dailyReturn = 0;
        if (prevVal > 0) {
          dailyReturn = (curVal - cf) / prevVal - 1;
        }
        
        if (dailyReturn > 2.0) dailyReturn = 0;
        if (dailyReturn < -0.9) dailyReturn = 0;
        
        currentTwr = currentTwr * (1 + dailyReturn);
        twrValues.push((currentTwr - 1) * 100);
      }
      
      catTimelines[cat] = twrValues;
    });
    
    return catTimelines;
  }, [history, categoryHistories, availableAssetTypes]);

  const getCategoryLegendValues = (cat) => {
    const catHistory = categoryHistories[cat] || [];
    const fullCatTwrValues = categoryTwrTimelines[cat] || [];
    
    if (catHistory.length === 0 || filteredHistPerf.length < 2) {
      return { val: 0, pct: 0 };
    }
    
    const startHDate = filteredHistPerf[0].date.substring(0, 10);
    const endHDate = filteredHistPerf[filteredHistPerf.length - 1].date.substring(0, 10);
    
    const startIdx = catHistory.findIndex(p => p.date.substring(0, 10) === startHDate);
    const endIdx = catHistory.findIndex(p => p.date.substring(0, 10) === endHDate);
    
    if (startIdx === -1 || endIdx === -1) {
      return { val: 0, pct: 0 };
    }
    
    const startVal = catHistory[startIdx].total_value || 0;
    const startInvested = catHistory[startIdx].net_invested || 0;
    const endVal = catHistory[endIdx].total_value || 0;
    const endInvested = catHistory[endIdx].net_invested || 0;
    
    const startProfit = startVal - startInvested;
    const endProfit = endVal - endInvested;
    
    let val = endProfit - startProfit;
    let pct = 0;
    
    const startTwrPct = fullCatTwrValues[startIdx] || 0;
    const endTwrPct = fullCatTwrValues[endIdx] || 0;
    
    if (perfCalcMethod === 'period') {
      val = endProfit - startProfit;
      pct = (((1 + endTwrPct / 100) / (1 + startTwrPct / 100)) - 1) * 100;
    } else {
      val = endProfit;
      pct = endTwrPct;
    }
    
    return { val, pct };
  };

  const perfLegendValues = useMemo(() => {
    if (filteredHistPerf.length < 2) return { portfolioVal: 0, portfolioPct: 0, benchmarkVal: 0, benchmarkPct: 0 };
    
    const startP = filteredHistPerf[0].total_value || 0;
    const startInvested = filteredHistPerf[0].net_invested || 0;
    const endP = filteredHistPerf[filteredHistPerf.length - 1].total_value || 0;
    const endInvested = filteredHistPerf[filteredHistPerf.length - 1].net_invested || 0;
    
    const startPProfit = startP - startInvested;
    const endPProfit = endP - endInvested;
    
    let pProfit = endPProfit - startPProfit;
    let pPct = 0;
    
    const startTwrPct = twrValuesForPerf[0] || 0;
    const endTwrPct = twrValuesForPerf[twrValuesForPerf.length - 1] || 0;
    
    if (perfCalcMethod === 'period') {
      pProfit = endPProfit - startPProfit;
      pPct = (((1 + endTwrPct / 100) / (1 + startTwrPct / 100)) - 1) * 100;
    } else {
      pProfit = endPProfit;
      pPct = endTwrPct;
    }
    
    const startBPoint = matchedPerfBenchmarkValues.find(v => v !== null) || { value: 0, costBasis: 0, rawPrice: 0 };
    const endBPoint = matchedPerfBenchmarkValues[matchedPerfBenchmarkValues.length - 1] || { value: 0, costBasis: 0, rawPrice: 0 };
    const firstBPoint = benchmarkHistory.length > 0 ? benchmarkHistory[0] : { value: 0, costBasis: 0, rawPrice: 0 };
    
    let bProfit = 0;
    let bPct = 0;
    
    if (perfCalcMethod === 'period') {
      const startPrice = startBPoint.rawPrice || 1;
      const endPrice = endBPoint.rawPrice || 1;
      bPct = ((endPrice - startPrice) / startPrice) * 100;
      bProfit = (bPct / 100) * endInvested;
    } else {
      const firstPrice = firstBPoint.rawPrice || 1;
      const endPrice = endBPoint.rawPrice || 1;
      bPct = ((endPrice - firstPrice) / firstPrice) * 100;
      bProfit = (bPct / 100) * endInvested;
    }
    
    return {
      portfolioVal: pProfit,
      portfolioPct: pPct,
      benchmarkVal: bProfit,
      benchmarkPct: bPct
    };
  }, [filteredHistPerf, twrValuesForPerf, matchedPerfBenchmarkValues, benchmarkHistory, perfCalcMethod]);

  const performanceChartData = useMemo(() => {
    const labels = filteredHistPerf.map(h => new Date(h.date).toLocaleDateString('nl-BE'));
    const datasets = [];

    if (perfGroupBy === 'class') {
      availableAssetTypes.forEach(cat => {
        if (visibleCategories[cat]) {
          const catHistory = categoryHistories[cat] || [];
          const fullCatTwrValues = categoryTwrTimelines[cat] || [];
          
          const catData = filteredHistPerf.map((h, idx) => {
            const fullIdx = catHistory.findIndex(p => p.date.substring(0, 10) === h.date.substring(0, 10));
            const currentTwrPct = fullIdx !== -1 ? (fullCatTwrValues[fullIdx] || 0) : 0;
            
            const startHDate = filteredHistPerf[0].date.substring(0, 10);
            const startIdx = catHistory.findIndex(p => p.date.substring(0, 10) === startHDate);
            const startTwrPct = startIdx !== -1 ? (fullCatTwrValues[startIdx] || 0) : 0;
            
            const catVal = fullIdx !== -1 ? (catHistory[fullIdx].total_value || 0) : 0;
            const catInvested = fullIdx !== -1 ? (catHistory[fullIdx].net_invested || 0) : 0;
            
            const startCatVal = startIdx !== -1 ? (catHistory[startIdx].total_value || 0) : 0;
            const startCatInvested = startIdx !== -1 ? (catHistory[startIdx].net_invested || 0) : 0;
            
            const profit = catVal - catInvested;
            const startProfit = startCatVal - startCatInvested;
            
            if (perfCalcMethod === 'period') {
              if (growthPerfType === 'percent') {
                return (((1 + currentTwrPct / 100) / (1 + startTwrPct / 100)) - 1) * 100;
              } else {
                return profit - startProfit;
              }
            } else {
              if (growthPerfType === 'percent') {
                return currentTwrPct;
              } else {
                return profit;
              }
            }
          });

          datasets.push({
            label: getCategoryLabel(cat),
            data: catData,
            borderColor: getCategoryColor(cat),
            backgroundColor: 'rgba(20, 184, 166, 0.02)',
            borderWidth: 2,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.1
          });
        }
      });
    } else {
      // Calculate Portfolio Performance Timeline
      const startP = filteredHistPerf.length > 0 ? (filteredHistPerf[0].total_value || 1) : 1;
      const startInvested = filteredHistPerf.length > 0 ? (filteredHistPerf[0].net_invested || 0) : 0;
      const startProfit = startP - startInvested;

      const pData = filteredHistPerf.map((h, idx) => {
        const profit = h.total_value - h.net_invested;
        const currentTwrPct = twrValuesForPerf[idx] || 0;
        const startTwrPct = twrValuesForPerf[0] || 0;
        
        if (perfCalcMethod === 'period') {
          if (growthPerfType === 'percent') {
            return (((1 + currentTwrPct / 100) / (1 + startTwrPct / 100)) - 1) * 100;
          } else {
            return profit - startProfit;
          }
        } else {
          if (growthPerfType === 'percent') {
            return currentTwrPct;
          } else {
            return profit;
          }
        }
      });

      datasets.push({
        label: 'Portfolio',
        data: pData,
        borderColor: '#14B8A6',
        backgroundColor: 'rgba(20, 184, 166, 0.05)',
        borderWidth: 2,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.1
      });
    }

    // Calculate Benchmark Performance Timeline
    if (perfCompareBenchmark) {
      const startBPoint = matchedPerfBenchmarkValues.find(v => v !== null) || { value: 1, costBasis: 1, rawPrice: 1 };
      const firstBPoint = benchmarkHistory.length > 0 ? benchmarkHistory[0] : { value: 1, costBasis: 1, rawPrice: 1 };

      const bData = filteredHistPerf.map((h, idx) => {
        const bPoint = matchedPerfBenchmarkValues[idx] || startBPoint;
        const bPrice = bPoint.rawPrice || 1;
        
        if (perfCalcMethod === 'period') {
          const startPrice = startBPoint.rawPrice || 1;
          const bPct = ((bPrice - startPrice) / startPrice) * 100;
          return growthPerfType === 'percent' 
            ? bPct 
            : (bPct / 100) * (h.net_invested || 1);
        } else {
          const firstPrice = firstBPoint.rawPrice || 1;
          const bPct = ((bPrice - firstPrice) / firstPrice) * 100;
          return growthPerfType === 'percent' 
            ? bPct 
            : (bPct / 100) * (h.net_invested || 1);
        }
      });

      datasets.push({
        label: benchmarkName,
        data: bData,
        borderColor: '#F59E0B',
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.1
      });
    }

    return { labels, datasets };
  }, [filteredHistPerf, growthPerfType, perfCalcMethod, perfCompareBenchmark, matchedPerfBenchmarkValues, twrValuesForPerf, benchmarkHistory, benchmarkName, perfGroupBy, availableAssetTypes, visibleCategories, categoryHistories, categoryTwrTimelines]);

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
          label: (ctx) => ` ${ctx.dataset.label}: ${growthPerfType === 'percent' ? ctx.raw.toFixed(2) + '%' : formatCurrency(ctx.raw)}`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { family: 'Inter, sans-serif' }, color: '#9CA3AF' }, border: { display: false } },
      y: { grid: { color: '#F3F4F6' }, border: { display: false }, ticks: { font: { family: 'Inter, sans-serif' }, color: '#9CA3AF', callback: (val) => growthPerfType === 'percent' ? `${val.toFixed(0)}%` : new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency, maximumSignificantDigits: 3, notation: "compact", compactDisplay: "short" }).format(val) } }
    }
  }), [growthPerfType, displayCurrency, formatCurrency]);

  // --- Chart 3: Dynamics of portfolio returns ---
  const availableYears = useMemo(() => {
    if (!dynamicsData || dynamicsData.length === 0) return [];
    const years = dynamicsData.map(d => d.period.substring(0, 4));
    return [...new Set(years)].sort((a, b) => b - a);
  }, [dynamicsData]);

  const filteredDynamicsData = useMemo(() => {
    if (cardPeriodFilter === 'all') return dynamicsData;
    if (cardPeriodFilter === '12m') return dynamicsData.slice(-12);
    return dynamicsData.filter(d => d.period.startsWith(cardPeriodFilter));
  }, [dynamicsData, cardPeriodFilter]);

  const filteredModalData = useMemo(() => {
    if (modalPeriodFilter === 'all') return dynamicsData;
    if (modalPeriodFilter === '12m') return dynamicsData.slice(-12);
    return dynamicsData.filter(d => d.period.startsWith(modalPeriodFilter));
  }, [dynamicsData, modalPeriodFilter]);

  const exportToCSV = () => {
    const headers = ['Period', 'Total profit (%)', 'Total profit ($)', 'Capital gain', 'Dividends received', 'Taxes'];
    const rows = filteredModalData.map(d => [
        formatPeriodLabel(d.period, dynamicsPeriod),
        d.returnPercent.toFixed(2),
        d.returnValue.toFixed(2),
        (d.capitalGain || 0).toFixed(2),
        (d.dividendsReceived || 0).toFixed(2),
        (d.taxes || 0).toFixed(2)
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `portfolio_dynamics_${dynamicsPeriod}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const barLabelsPlugin = useMemo(() => ({
    id: 'barLabels',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { top, bottom } } = chart;
      ctx.save();
      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        meta.data.forEach((bar, index) => {
          const val = dataset.data[index];
          if (val === null || val === undefined) return;
          
          let labelText = '';
          if (dynamicsDisplay === 'percent' || dynamicsDisplay === 'irr') {
              labelText = `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
          } else {
              labelText = formatCurrency(val);
          }
          
          ctx.font = 'bold 9px Outfit, Inter, sans-serif';
          ctx.fillStyle = val >= 0 ? '#0d9488' : '#e11d48'; // dark teal/red
          ctx.textAlign = 'center';
          
          const padding = 6;
          let yPos = bar.y - padding;
          if (val < 0) {
              yPos = bar.y + padding + 10;
          }
          
          if (yPos > bottom) yPos = bottom - 2;
          if (yPos < top) yPos = top + 10;
          
          ctx.fillText(labelText, bar.x, yPos);
        });
      });
      ctx.restore();
    }
  }), [dynamicsDisplay, formatCurrency]);

  const dynamicsChartData = useMemo(() => {
    const labels = filteredDynamicsData.map(d => formatPeriodLabel(d.period, dynamicsPeriod));
    const data = filteredDynamicsData.map(d => {
      if (dynamicsDisplay === 'percent' || dynamicsDisplay === 'irr') {
        return d.returnPercent;
      }
      return d.returnValue;
    });

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: data.map(v => v >= 0 ? '#14b8a6' : '#f43f5e'), // Teal and pink/red
        borderRadius: 4,
        maxBarThickness: 35
      }]
    };
  }, [filteredDynamicsData, dynamicsDisplay, dynamicsPeriod]);

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
          label: (ctx) => ` Return: ${dynamicsDisplay === 'percent' || dynamicsDisplay === 'irr' ? ctx.raw.toFixed(2) + '%' : formatCurrency(ctx.raw)}`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { family: 'Inter, sans-serif' }, color: '#9CA3AF' }, border: { display: false } },
      y: { grid: { color: '#F3F4F6' }, border: { display: false }, ticks: { font: { family: 'Inter, sans-serif' }, color: '#9CA3AF', callback: (val) => dynamicsDisplay === 'percent' || dynamicsDisplay === 'irr' ? `${val}%` : new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency, maximumSignificantDigits: 3, notation: "compact", compactDisplay: "short" }).format(val) } }
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
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[560px] relative">
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
          {groupBy !== 'class' && (
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
          )}
        </div>

        {/* Dynamic Alert Banner */}
        {alertInfo && groupBy !== 'class' && (
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
            {/* Custom legend with visibility toggles (Screenshot 11 & 19) */}
            {groupBy === 'class' ? (
              <div className="flex items-center gap-4 text-xs font-semibold text-gray-500 select-none">
                {availableAssetTypes.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setVisibleCategories(prev => ({ ...prev, [cat]: !prev[cat] }))}
                    className={`flex items-center gap-1.5 hover:text-gray-900 transition-colors ${visibleCategories[cat] ? '' : 'line-through opacity-40'}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getCategoryColor(cat) }}></span>
                    {getCategoryLabel(cat)}
                  </button>
                ))}
              </div>
            ) : (
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
            )}

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
                        <option value="class">Categories</option>
                        <option value="sector">Sector</option>
                      </select>
                    </div>

                    {/* Show cost basis row */}
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1">
                        Show cost basis
                        <span className="cursor-help text-[10px] text-gray-300 border border-gray-200 rounded-full w-3.5 h-3.5 flex items-center justify-center font-normal" title="Show line representing net invested money.">?</span>
                      </span>
                      <option className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={historyType === 'assets'}
                          checked={historyType === 'portfolio' && growthShowCostBasis}
                          onChange={(e) => setGrowthShowCostBasis(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                      </option>
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
              key={`${valPeriod}-${filteredHistVal.length}-${visibleDatasets.portfolio}-${visibleDatasets.benchmark}-${historyType}-${groupBy}`}
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

        {/* Checkbox selector layout below chart in class grouping (Card 1) */}
        {groupBy === 'class' && (
          <div className="flex flex-wrap justify-center gap-6 text-xs font-semibold text-gray-500 select-none mt-4 pt-4 border-t border-gray-100">
            {availableAssetTypes.map(cat => {
              const catHistory = categoryHistories[cat] || [];
              const endVal = catHistory.length > 0 ? (catHistory[catHistory.length - 1].total_value || 0) : 0;
              return (
                <label key={cat} className="flex items-center gap-2 cursor-pointer hover:text-gray-900 transition-colors">
                  <input
                    type="checkbox"
                    checked={!!visibleCategories[cat]}
                    onChange={() => setVisibleCategories(prev => ({ ...prev, [cat]: !prev[cat] }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                  />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getCategoryColor(cat) }}></span>
                  <span>
                    {getCategoryLabel(cat)}: <span className="text-gray-900 font-bold">{formatCurrency(endVal)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <div className="incognito-show flex-col items-center justify-center h-full text-gray-400 text-sm">
          <i className="ph-fill ph-eye-slash text-4xl mb-2 opacity-30"></i>
          Waardegrafiek verborgen in privacymodus
        </div>
      </div>

      {/* Card 2: Portfolio Performance (Teal Chart Upgrade) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[570px] relative">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-4">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
            Portfolio performance
            <span className="cursor-help text-xs text-gray-300 border border-gray-200 rounded-full w-4 h-4 flex items-center justify-center font-normal" title="Historical return on assets.">?</span>
          </h3>
          
          {/* Legend showing absolute gains and percentages (Screenshot 16 & 19) */}
          {perfGroupBy !== 'class' && (
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-gray-500 sm:text-right">
              <span>{perfDateRangeText}</span>
              <span className={`flex items-center gap-1 ${perfLegendValues.portfolioVal >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-[#14B8A6]"></span>
                {perfLegendValues.portfolioVal >= 0 ? '+' : ''}{formatCurrency(perfLegendValues.portfolioVal)} (▲ {perfLegendValues.portfolioPct.toFixed(2)}%)
              </span>
              {perfCompareBenchmark && (
                <span className={`flex items-center gap-1 ${perfLegendValues.benchmarkVal >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></span>
                  {perfLegendValues.benchmarkVal >= 0 ? '+' : ''}{formatCurrency(perfLegendValues.benchmarkVal)} (▲ {perfLegendValues.benchmarkPct.toFixed(2)}%)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Benchmarks row comparison selector (Screenshot 16) */}
        <div className="flex items-center gap-2 mb-4 text-xs font-semibold text-gray-500">
          <span>Benchmarks:</span>
          <button
            onClick={() => setPerfCompareBenchmark(true)}
            className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all border ${
              perfCompareBenchmark 
                ? 'bg-blue-50 text-blue-600 border-blue-100' 
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border-gray-200'
            }`}
          >
            {benchmarkName}
          </button>
          <button
            onClick={() => setPerfCompareBenchmark(!perfCompareBenchmark)}
            className="text-gray-400 hover:text-gray-600 font-bold ml-1"
          >
            {perfCompareBenchmark ? 'Disable' : 'Compare'}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          {renderTimeframeSelector(perfPeriod, setPerfPeriod, perfStart, setPerfStart, perfEnd, setPerfEnd)}
          
          {/* Settings Menu Button */}
          <div className="relative">
            <button
              onClick={() => setPerfSettingsOpen(!perfSettingsOpen)}
              className="text-gray-400 hover:text-gray-600 p-1 flex items-center justify-center"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
              </svg>
            </button>
            {perfSettingsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPerfSettingsOpen(false)}></div>
                <div className="origin-top-right absolute right-0 mt-2 w-80 rounded-xl shadow-xl bg-white border border-gray-100 ring-1 ring-black ring-opacity-5 z-50 p-4 space-y-4 text-xs font-semibold text-gray-700">
                  
                  {/* Total Profit % vs $ tabs (Screenshot 17) */}
                  <div className="flex bg-gray-50 p-0.5 rounded-lg border border-gray-200">
                    <button
                      onClick={() => setGrowthPerfType('percent')}
                      className={`flex-1 py-1.5 text-center rounded-md font-bold transition-all ${
                        growthPerfType === 'percent' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      Total profit, %
                    </button>
                    <button
                      onClick={() => setGrowthPerfType('value')}
                      className={`flex-1 py-1.5 text-center rounded-md font-bold transition-all ${
                        growthPerfType === 'value' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      Total profit, $
                    </button>
                  </div>

                  {/* Group by */}
                  <div className="flex justify-between items-center pt-1">
                    <span>Group by</span>
                    <select
                      value={perfGroupBy}
                      onChange={(e) => setPerfGroupBy(e.target.value)}
                      className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-2 py-1 outline-none font-bold"
                    >
                      <option value="none">No grouping</option>
                      <option value="class">Categories</option>
                      <option value="sector">Sector</option>
                    </select>
                  </div>

                  {/* Toggle: Group by profit source */}
                  <div className="flex justify-between items-center opacity-40">
                    <span>Group by the profit source</span>
                    <label className="relative inline-flex items-center cursor-not-allowed">
                      <input type="checkbox" disabled className="sr-only peer" />
                      <div className="w-9 h-5 bg-gray-200 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                    </label>
                  </div>

                  {/* Calculate PL for: Selected period vs From the first trade (Screenshot 17 & 18) */}
                  <div className="space-y-2 pt-1 border-t border-gray-100">
                    <span className="text-gray-900 font-bold block mb-1">Calculate PL for:</span>
                    <div className="flex bg-gray-50 p-0.5 rounded-lg border border-gray-200">
                      <button
                        onClick={() => setPerfCalcMethod('period')}
                        className={`flex-1 py-1.5 text-center rounded-md font-bold transition-all ${
                          perfCalcMethod === 'period' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        Selected period
                      </button>
                      <button
                        onClick={() => setPerfCalcMethod('first_trade')}
                        className={`flex-1 py-1.5 text-center rounded-md font-bold transition-all ${
                          perfCalcMethod === 'first_trade' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        From first trade
                      </button>
                    </div>

                    {/* Explanatory description below tabs */}
                    <p className="text-[10px] text-gray-400 leading-normal font-medium pt-1">
                      {perfCalcMethod === 'period' 
                        ? 'PL is calculated relative to the portfolio value at the beginning of the period. Realized PL is calculated relative to the price of the asset at the beginning of the selected period (NOT the purchase price).' 
                        : 'PL is always calculated from the date of the first transaction, and then the chart is "zoomed" to the selected period. Total values are calculated as the difference between PL values at the beginning and PL values at the end of the selected period.'
                      }
                    </p>
                  </div>

                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex-grow relative min-h-0">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-gray-100 border-t-blue-500 animate-spin"></div>
            </div>
          ) : filteredHistPerf.length > 0 ? (
            <Line 
              key={`${perfPeriod}-${filteredHistPerf.length}-${growthPerfType}-${perfCalcMethod}-${perfCompareBenchmark}-${perfGroupBy}`}
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

        {/* Checkbox selector layout below chart in class grouping (Card 2) */}
        {perfGroupBy === 'class' && (
          <div className="flex flex-wrap justify-center gap-6 text-xs font-semibold text-gray-500 select-none mt-4 pt-4 border-t border-gray-100">
            {availableAssetTypes.map(cat => {
              const values = getCategoryLegendValues(cat);
              return (
                <label key={cat} className="flex items-center gap-2 cursor-pointer hover:text-gray-900 transition-colors">
                  <input
                    type="checkbox"
                    checked={!!visibleCategories[cat]}
                    onChange={() => setVisibleCategories(prev => ({ ...prev, [cat]: !prev[cat] }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                  />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getCategoryColor(cat) }}></span>
                  <span>
                    {getCategoryLabel(cat)}: <span className={values.val >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>{values.val >= 0 ? '+' : ''}{growthPerfType === 'percent' ? `${values.pct.toFixed(2)}%` : formatCurrency(values.val)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Card 3: Dynamics of portfolio returns */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[520px]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
            Dynamics of portfolio returns
            <span className="cursor-help text-xs text-gray-300 border border-gray-200 rounded-full w-4 h-4 flex items-center justify-center font-normal" title="Monthly/weekly returns timeline.">?</span>
          </h3>
          <div className="relative">
            <button 
              onClick={() => setDynamicsSettingsOpen(!dynamicsSettingsOpen)} 
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-all text-gray-400 hover:text-gray-600"
            >
              <i className="ph ph-dots-three text-xl font-bold"></i>
            </button>
            {dynamicsSettingsOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setDynamicsSettingsOpen(false)}></div>
                <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-3 z-30">
                  <div className="px-4 py-2 flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs font-semibold text-gray-700">
                      <span>Period</span>
                      <select 
                        value={dynamicsPeriod} 
                        onChange={(e) => {
                          setDynamicsPeriod(e.target.value);
                          setDynamicsSettingsOpen(false);
                        }}
                        className="px-2 py-1 text-xs border border-gray-200 rounded bg-gray-50 text-gray-700 outline-none font-bold cursor-pointer"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annually">Annual</option>
                      </select>
                    </div>
                    
                    <div className="flex justify-between items-center text-xs font-semibold text-gray-700 mt-2">
                      <span>Display values</span>
                      <select 
                        value={dynamicsDisplay} 
                        onChange={(e) => {
                          setDynamicsDisplay(e.target.value);
                          setDynamicsSettingsOpen(false);
                        }}
                        className="px-2 py-1 text-xs border border-gray-200 rounded bg-gray-50 text-gray-700 outline-none font-bold cursor-pointer"
                      >
                        <option value="percent">Total profit, %</option>
                        <option value="value">Total profit, $</option>
                        <option value="irr">IRR (%)</option>
                      </select>
                    </div>

                    <div className="flex justify-between items-center text-xs font-semibold text-gray-700 mt-2">
                      <span>Group by</span>
                      <select 
                        disabled
                        className="px-2 py-1 text-xs border border-gray-200 rounded bg-gray-100 text-gray-400 outline-none font-bold cursor-not-allowed"
                      >
                        <option>No grouping</option>
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Benchmarks Compare Line */}
        <div className="flex items-center gap-3 text-xs mb-3">
          <span className="text-gray-400 font-bold">Benchmarks:</span>
          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 font-bold rounded">{benchmarkName}</span>
          <button 
            onClick={() => setDropdownOpen(true)}
            className="text-blue-600 hover:text-blue-700 font-bold transition-all"
          >
            Compare
          </button>
        </div>

        {/* Years selector matching Snowball */}
        <div className="flex flex-wrap gap-1 mb-6">
          {['all', '12m', ...availableYears].map(p => (
            <button
              key={p}
              onClick={() => setCardPeriodFilter(p)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${cardPeriodFilter === p ? 'bg-gray-100 text-gray-900 shadow-sm border border-gray-200/50' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex-grow relative min-h-0">
          {dynamicsLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-gray-100 border-t-blue-500 animate-spin"></div>
            </div>
          ) : dynamicsData.length > 0 ? (
            <Bar 
              key={`${dynPeriod}-${dynamicsData.length}-${dynamicsDisplay}-${cardPeriodFilter}`}
              data={dynamicsChartData} 
              options={dynamicsChartOptions}
              plugins={[barLabelsPlugin]}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
              <i className="ph-fill ph-chart-bar-horizontal text-4xl mb-2 opacity-30"></i>
              No monthly return data available.
            </div>
          )}
        </div>

        {/* View details link */}
        <div className="mt-4 pt-3 border-t border-gray-100 text-left">
          <button 
            onClick={() => setIsDynamicsModalOpen(true)}
            className="text-xs font-bold text-gray-600 hover:text-gray-900 transition-all flex items-center gap-1"
          >
            <i className="ph ph-list-bullets text-base"></i>
            View details →
          </button>
        </div>
      </div>

      {/* Dynamics View Details Modal */}
      {isDynamicsModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-150">
              <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                <i className="ph-fill ph-chart-bar text-base text-blue-600"></i>
                Dynamics of portfolio returns
              </h3>
              <div className="flex items-center gap-3">
                <button 
                  onClick={exportToCSV}
                  className="text-[11px] font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200/80 px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <i className="ph ph-export text-sm"></i>
                  Export to CSV
                </button>
                <button 
                  onClick={() => setIsDynamicsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition-all"
                >
                  <i className="ph ph-x text-xl font-bold"></i>
                </button>
              </div>
            </div>

            {/* Sub-header with comparison info and timeline selectors */}
            <div className="px-6 py-3 bg-gray-50/50 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                <span>Benchmarks:</span>
                <span className="px-2 py-0.5 bg-gray-200/50 text-gray-700 rounded font-bold">{benchmarkName}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {['all', '12m', ...availableYears].map(p => (
                  <button
                    key={p}
                    onClick={() => setModalPeriodFilter(p)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${modalPeriodFilter === p ? 'bg-gray-200 text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="flex-grow overflow-y-auto p-6">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50">
                    <th className="px-4 py-3 text-xs font-extrabold text-gray-400 uppercase tracking-wider">Period</th>
                    <th className="px-4 py-3 text-xs font-extrabold text-gray-400 uppercase tracking-wider text-right">Total profit</th>
                    <th className="px-4 py-3 text-xs font-extrabold text-gray-400 uppercase tracking-wider text-right">Capital gain</th>
                    <th className="px-4 py-3 text-xs font-extrabold text-gray-400 uppercase tracking-wider text-right">Dividends received</th>
                    <th className="px-4 py-3 text-xs font-extrabold text-gray-400 uppercase tracking-wider text-right">Taxes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredModalData.map((d, index) => {
                    const isPositive = d.returnValue >= 0;
                    return (
                      <tr key={index} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-4 text-xs font-bold text-gray-700">
                          {formatPeriodLabel(d.period, dynamicsPeriod)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className={`text-xs font-bold flex items-center gap-1 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {isPositive ? '▲' : '▼'} {Math.abs(d.returnPercent).toFixed(2)}%
                            </span>
                            <span className={`text-[10px] font-bold ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {isPositive ? '+' : ''}{formatCurrency(d.returnValue)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap text-xs font-bold">
                          <span className={d.capitalGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {d.capitalGain >= 0 ? '+' : ''}{formatCurrency(d.capitalGain)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap text-xs font-bold text-gray-900">
                          {d.dividendsReceived > 0 ? (
                            <span className="text-emerald-600 font-bold">+{formatCurrency(d.dividendsReceived)}</span>
                          ) : (
                            <span className="text-gray-300 font-medium">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap text-xs font-bold">
                          {d.taxes > 0 ? (
                            <span className="text-rose-600 font-bold">-{formatCurrency(d.taxes)}</span>
                          ) : (
                            <span className="text-gray-300 font-medium">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredModalData.length === 0 && (
                    <tr>
                      <td colSpan="5" className="px-4 py-8 text-center text-xs font-bold text-gray-400">
                        Geen gegevens beschikbaar voor de geselecteerde periode.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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

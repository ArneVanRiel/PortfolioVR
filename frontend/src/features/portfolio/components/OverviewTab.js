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
  'Technologie': { bg: '#3B82F6', text: 'text-blue-500', border: 'border-blue-500' },
  'Financiële Diensten': { bg: '#10B981', text: 'text-emerald-500', border: 'border-emerald-500' },
  'Consumentengoederen': { bg: '#F59E0B', text: 'text-amber-500', border: 'border-amber-500' },
  'Gezondheidszorg': { bg: '#F43F5E', text: 'text-rose-500', border: 'border-rose-500' },
  'Communicatie & Media': { bg: '#8B5CF6', text: 'text-purple-500', border: 'border-purple-500' },
  'Indexfondsen & ETFs': { bg: '#6366F1', text: 'text-indigo-500', border: 'border-indigo-500' },
  'Grondstoffen': { bg: '#F97316', text: 'text-orange-500', border: 'border-orange-500' },
  'EUR': { bg: '#2563EB', text: 'text-blue-600', border: 'border-blue-500' },
  'USD': { bg: '#10B981', text: 'text-emerald-600', border: 'border-emerald-500' },
  'GBP': { bg: '#8B5CF6', text: 'text-purple-600', border: 'border-purple-500' },
};

const HOLDING_PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899',
  '#06B6D4', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
  '#A855F7', '#0EA5E9', '#22C55E', '#EAB308', '#64748B'
];

const getCatColor = (catName, idx = 0) => {
  if (!catName) return { bg: HOLDING_PALETTE[idx % HOLDING_PALETTE.length], text: 'text-gray-500', border: 'border-gray-500' };
  const trimmed = catName.trim();
  const normalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  if (CAT_COLORS[trimmed]) return CAT_COLORS[trimmed];
  if (CAT_COLORS[normalized]) return CAT_COLORS[normalized];
  return { bg: HOLDING_PALETTE[idx % HOLDING_PALETTE.length], text: 'text-indigo-600', border: 'border-indigo-500' };
};

// Metadata helper om holdings toe te wijzen aan categorie, sector, broker en valuta
const getHoldingMeta = (h) => {
  const normTicker = String(h.ticker || '').toUpperCase().trim();
  const rawType = String(h.asset_type || '').toUpperCase().trim();

  let assetClass = 'Stocks';
  if (rawType.includes('ETF') || rawType.includes('FUND') || normTicker.includes('VGWL') || normTicker.includes('VGWD') || normTicker.includes('VUSA') || normTicker.includes('VWCE') || normTicker.includes('IWDA') || normTicker.includes('SXR8')) {
    assetClass = 'ETF';
  } else if (rawType.includes('CRYPTO')) {
    assetClass = 'Crypto';
  } else if (rawType.includes('COMMODITY') || rawType.includes('GOLD') || normTicker.includes('GLD')) {
    assetClass = 'Commodities';
  } else if (rawType.includes('CASH')) {
    assetClass = 'Cash';
  }

  let sector = h.sector && h.sector !== 'Overig' ? h.sector : '';
  if (!sector) {
    if (assetClass === 'ETF') {
      sector = 'Indexfondsen & ETFs';
    } else if (['AAPL', 'MSFT', 'META', 'GOOG', 'GOOGL', 'AMZN', 'NVDA', 'INTU', 'QLYS', 'SWKS', 'AMAT', 'ACN', 'ADBE', 'CRM'].some(t => normTicker.includes(t))) {
      sector = 'Technologie';
    } else if (['JPM', 'BAC', 'GS', 'MS', 'V', 'MA', 'NDAQ', 'PGR', 'BRK'].some(t => normTicker.includes(t))) {
      sector = 'Financiële Diensten';
    } else if (['SBUX', 'COST', 'HD', 'MCD', 'NKE', 'TSLA'].some(t => normTicker.includes(t))) {
      sector = 'Consumentengoederen';
    } else if (['JNJ', 'PFE', 'UNH', 'ABBV', 'LLY', 'MRK'].some(t => normTicker.includes(t))) {
      sector = 'Gezondheidszorg';
    } else if (['VOD', 'NFLX', 'DIS', 'T', 'CMCSA'].some(t => normTicker.includes(t))) {
      sector = 'Communicatie & Media';
    } else if (['GC', 'GLD', 'GOLD', 'RIO', 'BHP'].some(t => normTicker.includes(t))) {
      sector = 'Grondstoffen';
    } else {
      sector = 'Algemeen';
    }
  }

  let currency = h.currency || (normTicker.endsWith('.DE') || normTicker.endsWith('.AS') || normTicker.endsWith('.BR') ? 'EUR' : 'USD');
  let broker = h.primary_broker || h.broker_name || (currency === 'EUR' ? 'Degiro' : 'Etoro');

  return { assetClass, sector, currency, broker };
};

const OverviewTab = ({
  history,
  processedHoldings = [],
  baseHoldingsForDate = [],
  holdingsSort,
  handleHoldingsSort,
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
  selectedTypes = [],
  setSelectedTypes,
  brokerCash,
  totalCashDisplay = 0,
  otherCashSum = 0,
  availableBalanceData,
  brokerTotals = [],
  setIsBrokerSyncOpen
}) => {
  const navigate = useNavigate();

  // Groeperingsmodus: 'holdings' | 'assettype' | 'broker' | 'sector' | 'currencies'
  const [donutGroupBy, setDonutGroupBy] = useState('assettype');
  // Meervoudige selectie van groepen (vinkjes in de verdeling)
  const [selectedGroups, setSelectedGroups] = useState([]);

  const [selectedHoldingForModal, setSelectedHoldingForModal] = useState(null);
  const [mobileSortOption, setMobileSortOption] = useState('pl_desc');

  const timeline = useMemo(() => historyTimelineData?.timeline || [], [historyTimelineData]);
  const availableYears = useMemo(() => historyTimelineData?.availableYears || [], [historyTimelineData]);

  // Wissel meervoudige selectie
  const toggleGroupSelection = (groupKey) => {
    setSelectedGroups(prev => {
      if (prev.includes(groupKey)) {
        return prev.filter(k => k !== groupKey);
      } else {
        return [...prev, groupKey];
      }
    });
  };

  // Is Cash geselecteerd in de verdeling?
  const isCashSelected = useMemo(() => {
    return selectedGroups.some(g => String(g).toLowerCase().includes('cash'));
  }, [selectedGroups]);

  // Gefilterde holdings op basis van de geselecteerde vinkjes in de verdeling
  const displayedHoldings = useMemo(() => {
    if (!selectedGroups || selectedGroups.length === 0) {
      return processedHoldings;
    }

    return processedHoldings.filter(h => {
      const meta = getHoldingMeta(h);
      if (donutGroupBy === 'holdings') {
        const key = h.ticker || h.name;
        if (selectedGroups.includes(key) || selectedGroups.includes(h.ticker)) return true;
        if (selectedGroups.includes('Overige')) {
          const sorted = [...processedHoldings].sort((a, b) => (b.value || 0) - (a.value || 0));
          const top10Tickers = sorted.slice(0, 10).map(item => item.ticker);
          if (!top10Tickers.includes(h.ticker)) return true;
        }
        return false;
      }
      if (donutGroupBy === 'assettype') {
        return selectedGroups.some(g => String(g).toUpperCase() === String(meta.assetClass).toUpperCase());
      }
      if (donutGroupBy === 'broker') {
        const hBrokers = Array.isArray(h.brokers) && h.brokers.length > 0
          ? h.brokers.map(b => String(b.broker_name || '').trim().toLowerCase())
          : [String(meta.broker || '').trim().toLowerCase()];
        return selectedGroups.some(g => hBrokers.some(hb => hb.includes(String(g).trim().toLowerCase())));
      }
      if (donutGroupBy === 'sector') {
        return selectedGroups.includes(meta.sector);
      }
      if (donutGroupBy === 'currencies') {
        return selectedGroups.includes(meta.currency);
      }
      return true;
    });
  }, [processedHoldings, selectedGroups, donutGroupBy]);

  const sortedMobileHoldings = useMemo(() => {
    const list = [...displayedHoldings];
    if (mobileSortOption === 'pl_desc') {
      list.sort((a, b) => (Number(b.gainLoss) || 0) - (Number(a.gainLoss) || 0));
    } else if (mobileSortOption === 'pl_asc') {
      list.sort((a, b) => (Number(a.gainLoss) || 0) - (Number(b.gainLoss) || 0));
    } else if (mobileSortOption === 'val_desc') {
      list.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
    } else if (mobileSortOption === 'ticker') {
      list.sort((a, b) => String(a.ticker || '').localeCompare(String(b.ticker || '')));
    }
    return list;
  }, [displayedHoldings, mobileSortOption]);

  // Effectieve actuele of dynamische historische cash
  const effectiveCash = useMemo(() => {
    if (isViewingHistoricalDate && activeTimeMachinePoint?.cash !== undefined) {
      return Number(activeTimeMachinePoint.cash || 0);
    }
    return Number(totalCashDisplay || 0);
  }, [isViewingHistoricalDate, activeTimeMachinePoint, totalCashDisplay]);

  // Bereken gegroepeerde allocatie voor donut & verdelingstabel (INCLUSIEF CASH!)
  const groupedAllocationData = useMemo(() => {
    const groups = {};
    let totalVal = 0;
    let totalInv = 0;
    const cashVal = Number(effectiveCash || 0);

    if (donutGroupBy === 'holdings') {
      const sorted = [...processedHoldings].sort((a, b) => (b.value || 0) - (a.value || 0));
      const top = sorted.slice(0, 10);
      const rest = sorted.slice(10);

      top.forEach(h => {
        const key = h.ticker || h.name || 'Onbekend';
        groups[key] = {
          key,
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
          key: 'Overige',
          name: `Overige (${rest.length} posities)`,
          shortLabel: 'Overige',
          value: restVal,
          invested: restInv,
          count: rest.length,
          subtitle: `${rest.length} kleinere posities`
        };
        totalVal += restVal;
        totalInv += restInv;
      }

      // Voeg Cash toe aan holdings
      if (cashVal > 0) {
        groups['Cash'] = {
          key: 'Cash',
          name: 'Cash (Beschikbaar Saldo)',
          shortLabel: 'Cash',
          value: cashVal,
          invested: cashVal,
          count: 1,
          isCash: true,
          subtitle: 'Vrij beschikbaar vermogen op rekeningen & brokers'
        };
        totalVal += cashVal;
        totalInv += cashVal;
      }
    } else if (donutGroupBy === 'assettype') {
      processedHoldings.forEach(h => {
        const meta = getHoldingMeta(h);
        const cat = meta.assetClass || 'Stocks';
        const catLabel = cat === 'Stocks' ? 'Aandelen' : cat === 'ETF' ? "ETF's & Fondsen" : cat;
        if (!groups[cat]) {
          groups[cat] = { key: cat, name: catLabel, value: 0, invested: 0, count: 0, subtitle: `${catLabel} portfolio` };
        }
        groups[cat].value += (h.value || 0);
        groups[cat].invested += (h.total_invested || 0);
        groups[cat].count += 1;
        totalVal += (h.value || 0);
        totalInv += (h.total_invested || 0);
      });

      if (cashVal > 0) {
        groups['Cash'] = {
          key: 'Cash',
          name: 'Cash (Liquiditeiten)',
          shortLabel: 'Cash',
          value: cashVal,
          invested: cashVal,
          count: 1,
          isCash: true,
          subtitle: 'Beschikbaar saldo'
        };
        totalVal += cashVal;
        totalInv += cashVal;
      }
    } else if (donutGroupBy === 'broker') {
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
          let bName = b.broker_name ? String(b.broker_name).trim() : '';
          if (!bName || bName.toLowerCase() === 'onbekend') {
            bName = (h.currency === 'EUR' || (h.ticker && (h.ticker.endsWith('.DE') || h.ticker.endsWith('.AS') || h.ticker.endsWith('.BR')))) ? 'Degiro' : 'Etoro';
          }
          if (!groups[bName]) {
            groups[bName] = { key: bName, name: bName, value: 0, invested: 0, count: 0, isBroker: true, subtitle: `Belegd vermogen via ${bName}` };
          }
          groups[bName].value += Number(b.value || 0);
          groups[bName].invested += Number(b.total_invested || 0);
          groups[bName].count += 1;
          totalVal += Number(b.value || 0);
          totalInv += Number(b.total_invested || 0);
        });
      });

      if (cashVal > 0) {
        groups['Cash'] = {
          key: 'Cash',
          name: 'Cash (Beschikbare Saldi)',
          shortLabel: 'Cash',
          value: cashVal,
          invested: cashVal,
          count: 1,
          isCash: true,
          subtitle: 'Beschikbaar saldo brokers & overige'
        };
        totalVal += cashVal;
        totalInv += cashVal;
      }
    } else if (donutGroupBy === 'sector') {
      processedHoldings.forEach(h => {
        const meta = getHoldingMeta(h);
        const sector = meta.sector || 'Algemeen';
        if (!groups[sector]) {
          groups[sector] = { key: sector, name: sector, value: 0, invested: 0, count: 0, subtitle: `Posities in ${sector}` };
        }
        groups[sector].value += (h.value || 0);
        groups[sector].invested += (h.total_invested || 0);
        groups[sector].count += 1;
        totalVal += (h.value || 0);
        totalInv += (h.total_invested || 0);
      });

      if (cashVal > 0) {
        groups['Cash'] = {
          key: 'Cash',
          name: 'Cash / Liquiditeiten',
          shortLabel: 'Cash',
          value: cashVal,
          invested: cashVal,
          count: 1,
          isCash: true,
          subtitle: 'Vrij beschikbaar vermogen'
        };
        totalVal += cashVal;
        totalInv += cashVal;
      }
    } else if (donutGroupBy === 'currencies') {
      processedHoldings.forEach(h => {
        const meta = getHoldingMeta(h);
        const curr = meta.currency || 'USD';
        if (!groups[curr]) {
          groups[curr] = { key: curr, name: curr === 'EUR' ? 'EUR (€)' : curr === 'USD' ? 'USD ($)' : curr, value: 0, invested: 0, count: 0, subtitle: `Activa in ${curr}` };
        }
        groups[curr].value += (h.value || 0);
        groups[curr].invested += (h.total_invested || 0);
        groups[curr].count += 1;
        totalVal += (h.value || 0);
        totalInv += (h.total_invested || 0);
      });

      // Cash toewijzen aan EUR
      if (cashVal > 0) {
        if (!groups['EUR']) {
          groups['EUR'] = { key: 'EUR', name: 'EUR (€)', value: 0, invested: 0, count: 0, subtitle: 'Activa & cash in EUR' };
        }
        groups['EUR'].value += cashVal;
        groups['EUR'].invested += cashVal;
        totalVal += cashVal;
        totalInv += cashVal;
      }
    }

    return Object.values(groups)
      .map((g, idx) => ({
        ...g,
        color: g.isCash ? '#8B5CF6' : getCatColor(g.shortLabel || g.key || g.name, idx).bg,
        percentage: totalVal > 0 ? (g.value / totalVal) * 100 : 0,
        investedPercentage: totalInv > 0 ? (g.invested / totalInv) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);
  }, [processedHoldings, donutGroupBy, effectiveCash]);

  // Totale vermogenswaarde inclusief cash
  const totalPortfolioValue = useMemo(() => {
    return groupedAllocationData.reduce((sum, item) => sum + item.value, 0);
  }, [groupedAllocationData]);

  const totalHoldingsValue = useMemo(() => {
    return processedHoldings.reduce((sum, h) => sum + (h.value || 0), 0);
  }, [processedHoldings]);

  // Sommen van de huidige selectie voor de Holdings sectie banner (Belegd, Cash, Totaal)
  const selectionSummary = useMemo(() => {
    if (!selectedGroups || selectedGroups.length === 0) {
      const belegd = totalHoldingsValue;
      const cash = effectiveCash;
      return {
        belegd,
        cash,
        totaal: belegd + cash,
        hasFilter: false
      };
    }
    const belegd = displayedHoldings.reduce((acc, h) => acc + (Number(h.value) || 0), 0);
    const cash = isCashSelected ? effectiveCash : 0;
    return {
      belegd,
      cash,
      totaal: belegd + cash,
      hasFilter: true
    };
  }, [selectedGroups, displayedHoldings, totalHoldingsValue, effectiveCash, isCashSelected]);

  // Donut data configuratie met OPLICHTING / POP-OUT van geselecteerde schijven!
  const doughnutData = useMemo(() => {
    const isAnySelected = selectedGroups.length > 0;

    const backgroundColors = groupedAllocationData.map(item => {
      const isSelected = selectedGroups.includes(item.key || item.name);
      if (!isAnySelected) return item.color;
      return isSelected ? item.color : `${item.color}35`; // Dim niet-geselecteerde schijven
    });

    const offsets = groupedAllocationData.map(item => {
      const isSelected = selectedGroups.includes(item.key || item.name);
      return isSelected ? 12 : 0; // Oplichten & uitschuiven van geselecteerde schijven
    });

    return {
      labels: groupedAllocationData.map(c => `${c.shortLabel || c.name} (${c.percentage.toFixed(1)}%)`),
      datasets: [{
        data: groupedAllocationData.map(c => c.value),
        backgroundColor: backgroundColors,
        borderWidth: 2,
        borderColor: '#ffffff',
        offset: offsets,
        hoverOffset: 14
      }]
    };
  }, [groupedAllocationData, selectedGroups]);

  const doughnutOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.raw)}`
        }
      }
    }
  }), [formatCurrency]);

  // Tijdlijn navigatie functies
  const jumpToStart = () => {
    if (!timeline.length || !setTimelineSliderIdx) return;
    setTimelineSliderIdx(0);
  };

  const jumpToPrevTrade = () => {
    if (!timeline.length || !setTimelineSliderIdx) return;
    const currentIdx = typeof timelineSliderIdx === 'number' ? timelineSliderIdx : timeline.length - 1;
    for (let i = currentIdx - 1; i >= 0; i--) {
      if (timeline[i]?.hadTrade) {
        setTimelineSliderIdx(i);
        return;
      }
    }
    setTimelineSliderIdx(Math.max(0, currentIdx - 1));
  };

  const jumpToNextTrade = () => {
    if (!timeline.length || !setTimelineSliderIdx) return;
    const currentIdx = typeof timelineSliderIdx === 'number' ? timelineSliderIdx : timeline.length - 1;
    for (let i = currentIdx + 1; i < timeline.length; i++) {
      if (timeline[i]?.hadTrade) {
        setTimelineSliderIdx(i);
        return;
      }
    }
    setTimelineSliderIdx(Math.min(timeline.length - 1, currentIdx + 1));
  };

  const jumpToLive = () => {
    if (!timeline.length || !setTimelineSliderIdx) return;
    setTimelineSliderIdx(timeline.length - 1);
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

  const groupLabelsMap = {
    holdings: 'Holdings',
    assettype: 'Assettype',
    broker: 'Broker',
    sector: 'Sector',
    currencies: 'Currencies'
  };

  // Helper voor duidelijke actieve sorteringskop in de holdings-tabel
  const renderSortHeader = (key, label, align = 'left') => {
    const isSorted = holdingsSort?.key === key;
    const isAsc = holdingsSort?.direction === 'asc';

    return (
      <th
        onClick={() => handleHoldingsSort(key)}
        className={`px-4 py-3 text-xs uppercase tracking-wider cursor-pointer transition-colors select-none ${
          align === 'right' ? 'text-right' : 'text-left'
        } ${
          isSorted
            ? 'font-black text-blue-600 bg-blue-50/90 border-b-2 border-blue-600'
            : 'font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-100/60'
        }`}
      >
        <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
          <span>{label}</span>
          {isSorted ? (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-blue-600 text-white text-[10px] font-black shadow-2xs">
              {isAsc ? '▲' : '▼'}
            </span>
          ) : (
            <span className="text-gray-300 opacity-40 text-[10px]">↕</span>
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="space-y-6">
      {/* 🧭 DESKTOP COMMON HEADER: Groepering bovenaan + Datum Tijdmachine BALK direct op de pagina */}
      <div className="hidden md:flex flex-col gap-3.5 bg-white p-4 rounded-2xl border border-gray-200/90 shadow-2xs">
        {/* Rij 1: Groepering opties (links) + Actuele Datum status (rechts) */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Groeperingsknoppen */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1 flex items-center gap-1.5">
              <i className="ph-bold ph-squares-four text-sm text-gray-500"></i>
              <span>Groepering:</span>
            </span>
            {[
              { id: 'holdings', label: 'Holdings', icon: '💎' },
              { id: 'assettype', label: 'Assettype', icon: '📁' },
              { id: 'broker', label: 'Broker', icon: '🏦' },
              { id: 'sector', label: 'Sector', icon: '🌐' },
              { id: 'currencies', label: 'Currencies', icon: '💱' }
            ].map(grp => {
              const isActive = donutGroupBy === grp.id;
              return (
                <button
                  key={grp.id}
                  type="button"
                  onClick={() => {
                    setDonutGroupBy(grp.id);
                    setSelectedGroups([]); // reset selectie bij wisselen van groepering
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-black'
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                  }`}
                >
                  <span>{grp.icon}</span>
                  <span>{grp.label}</span>
                  {isActive && selectedGroups.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-500 text-white font-black">
                      {selectedGroups.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Datum Status Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Datum:</span>
            <span className={`px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 border ${
              isViewingHistoricalDate
                ? 'bg-amber-50 text-amber-800 border-amber-300 ring-2 ring-amber-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-300'
            }`}>
              <i className="ph-fill ph-calendar-blank text-sm"></i>
              <span>{activeTimeMachinePoint?.date || 'Vandaag (Live)'}</span>
              {isViewingHistoricalDate ? (
                <span className="text-[10px] bg-amber-600 text-white px-1.5 py-0.2 rounded-md uppercase ml-1">
                  Historisch
                </span>
              ) : (
                <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.2 rounded-md uppercase ml-1">
                  Live
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Rij 2: Datum & Tijdmachine Navigatiebalk (Direct op de pagina: Start, Vorige, Slider, Volgende, Live, Jaren) */}
        <div className="pt-3 border-t border-gray-100 space-y-2.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Stepper knoppen */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={jumpToStart}
                className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1 border border-gray-200"
                title="Naar allereerste transactiedatum"
              >
                <span>⏮ Start</span>
              </button>

              <button
                type="button"
                onClick={jumpToPrevTrade}
                className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1 border border-gray-200"
                title="Vorige transactie"
              >
                <span>◀ Vorige</span>
              </button>

              <button
                type="button"
                onClick={jumpToNextTrade}
                className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1 border border-gray-200"
                title="Volgende transactie"
              >
                <span>Volgende ▶</span>
              </button>

              <button
                type="button"
                onClick={jumpToLive}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-2xs flex items-center gap-1.5 border ${
                  isViewingHistoricalDate
                    ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700'
                    : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                }`}
                title="Reset naar vandaag (Live weergave)"
              >
                <span>{isViewingHistoricalDate ? '↺ Naar Live' : '✓ Live (Vandaag)'}</span>
              </button>
            </div>

            {/* Jaren Snelle Selectie */}
            {availableYears.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[11px] font-bold text-gray-400 mr-1">Jaar:</span>
                {availableYears.map(yr => {
                  const isCurrentYear = activeTimeMachinePoint?.date?.startsWith(yr);
                  return (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => jumpToYear(yr)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all border ${
                        isCurrentYear
                          ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                      }`}
                    >
                      {yr}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Slider input over de hele breedte */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500">
              <span>{timeline[0]?.date || 'Eerste transactie'}</span>
              <span className="font-black text-indigo-950 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-200 text-xs">
                📅 Geselecteerde datum: {activeTimeMachinePoint?.date || 'Vandaag'}
              </span>
              <span>Heden ({timeline[timeline.length - 1]?.date})</span>
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(0, timeline.length - 1)}
              value={typeof timelineSliderIdx === 'number' ? timelineSliderIdx : Math.max(0, timeline.length - 1)}
              onChange={(e) => setTimelineSliderIdx && setTimelineSliderIdx(Number(e.target.value))}
              className="w-full h-2.5 bg-indigo-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          {/* Transacties op de gekozen dag (direct zichtbaar op de pagina!) */}
          {Array.isArray(activeTimeMachinePoint?.tradesOnDate) && activeTimeMachinePoint.tradesOnDate.length > 0 && (
            <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-2.5 flex items-center gap-2 flex-wrap text-xs animate-fade-in">
              <span className="font-black text-amber-950 flex items-center gap-1 shrink-0">
                <span>⚡ Transacties op {activeTimeMachinePoint.date}:</span>
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
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
                    {tr.quantity}x {tr.ticker} ({tr.broker_name || 'Broker'})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 📱 GSM/IPHONE COMMON HEADER: Compactere weergave op mobiel */}
      <div className="block md:hidden space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Common</h2>
          <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-gray-100 text-gray-800">
            📅 {activeTimeMachinePoint?.date || 'Vandaag'}
          </span>
        </div>

        {/* Datum slider en snelle knoppen op mobiel */}
        <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={jumpToStart}
              className="px-2 py-1 bg-gray-100 text-gray-800 rounded-lg text-[11px] font-bold"
            >
              ⏮ Start
            </button>
            <button
              type="button"
              onClick={jumpToPrevTrade}
              className="px-2 py-1 bg-gray-100 text-gray-800 rounded-lg text-[11px] font-bold"
            >
              ◀ Vorige
            </button>
            <button
              type="button"
              onClick={jumpToNextTrade}
              className="px-2 py-1 bg-gray-100 text-gray-800 rounded-lg text-[11px] font-bold"
            >
              Volgende ▶
            </button>
            <button
              type="button"
              onClick={jumpToLive}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${
                isViewingHistoricalDate ? 'bg-blue-600 text-white' : 'bg-emerald-100 text-emerald-900'
              }`}
            >
              {isViewingHistoricalDate ? '↺ Live' : '✓ Live'}
            </button>
          </div>

          {/* Jaren Snelle Selectie op GSM */}
          {availableYears.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 border-t border-b border-gray-100">
              <span className="text-[10px] font-bold text-gray-400 mr-0.5 shrink-0">Jaar:</span>
              {availableYears.map(yr => {
                const isCurrentYear = activeTimeMachinePoint?.date?.startsWith(yr);
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => jumpToYear(yr)}
                    className={`px-2.5 py-0.8 rounded-lg text-xs font-bold shrink-0 transition-all border ${
                      isCurrentYear
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-black'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                    }`}
                  >
                    {yr}
                  </button>
                );
              })}
            </div>
          )}

          <input
            type="range"
            min={0}
            max={Math.max(0, timeline.length - 1)}
            value={typeof timelineSliderIdx === 'number' ? timelineSliderIdx : Math.max(0, timeline.length - 1)}
            onChange={(e) => setTimelineSliderIdx && setTimelineSliderIdx(Number(e.target.value))}
            className="w-full h-2 bg-indigo-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
        </div>

        {/* Groeperingszone op mobiel */}
        <div className="bg-white p-2.5 rounded-2xl border border-gray-200 shadow-2xs">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: 'holdings', label: 'Holdings', icon: '💎' },
              { id: 'assettype', label: 'Assettype', icon: '📁' },
              { id: 'broker', label: 'Broker', icon: '🏦' },
              { id: 'sector', label: 'Sector', icon: '🌐' },
              { id: 'currencies', label: 'Currencies', icon: '💱' }
            ].map(grp => {
              const isActive = donutGroupBy === grp.id;
              return (
                <button
                  key={grp.id}
                  type="button"
                  onClick={() => {
                    setDonutGroupBy(grp.id);
                    setSelectedGroups([]);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 border ${
                    isActive ? 'bg-slate-900 text-white border-slate-900' : 'bg-gray-100 text-gray-700 border-gray-200'
                  }`}
                >
                  {grp.icon} {grp.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 📊 MOBIELE ALLOCATIE BALK */}
      <div className="block md:hidden bg-white p-4 rounded-2xl shadow-sm border border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold text-sm text-gray-900">
            Allocatie ({groupLabelsMap[donutGroupBy]})
          </h4>
          {selectedGroups.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedGroups([])}
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              Wis selectie ({selectedGroups.length})
            </button>
          )}
        </div>

        {/* Gesegmenteerde balk */}
        <div className="w-full h-3 rounded-full overflow-hidden flex bg-gray-100 p-0.5 border border-gray-200/80 shadow-2xs">
          {groupedAllocationData.map((item, idx) => {
            const pct = item.percentage || 0;
            if (pct <= 0) return null;
            const isSelected = selectedGroups.includes(item.key || item.name);
            return (
              <div
                key={idx}
                className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-500 cursor-pointer"
                style={{
                  width: `${pct}%`,
                  backgroundColor: item.color,
                  opacity: selectedGroups.length === 0 || isSelected ? 1 : 0.35
                }}
                onClick={() => toggleGroupSelection(item.key || item.name)}
                title={`${item.shortLabel || item.name}: ${pct.toFixed(1)}%`}
              />
            );
          })}
        </div>

        {/* Chips met meervoudige selectie op mobiel */}
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {groupedAllocationData.map((item, idx) => {
            const isSelected = selectedGroups.includes(item.key || item.name);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => toggleGroupSelection(item.key || item.name)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-extrabold transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-gray-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span>{item.shortLabel || item.name}</span>
                <span className={isSelected ? 'text-white/80' : 'text-gray-400 font-semibold'}>
                  {item.percentage.toFixed(1)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 🍩 ALLOCATION GRID (DESKTOP: Donut links + Verdeling & Meervoudige Selectie rechts) */}
      <div className="hidden md:grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Links: Donut Chart Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-between h-[410px]">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>Portfolio Donut</span>
                <span className="text-xs font-semibold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-lg">
                  {groupLabelsMap[donutGroupBy]}
                </span>
              </h3>
              {selectedGroups.length > 0 && (
                <span className="text-[11px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                  {selectedGroups.length} geselecteerd
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              {selectedGroups.length > 0
                ? 'Geselecteerde schijven lichten op. Niet-geselecteerde zijn gedimd.'
                : 'Vink groepen aan in de lijst hiernaast om schijven op te lichten.'}
            </p>
          </div>

          <div className="flex-grow relative min-h-0 flex items-center justify-center mt-2">
            {loading ? (
              <div className="w-20 h-20 rounded-full border-4 border-gray-100 border-t-blue-500 animate-spin"></div>
            ) : groupedAllocationData.length > 0 ? (
              <div className="w-full h-full relative">
                <Doughnut data={doughnutData} options={doughnutOptions} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Totale Waarde (incl. Cash)
                  </span>
                  <span className="text-xl font-black text-gray-900 tracking-tight privacy-blur">
                    {formatCurrency(totalPortfolioValue)}
                  </span>
                  {Number(effectiveCash || 0) > 0 && (
                    <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.2 rounded mt-0.5">
                      waarvan {formatCurrency(effectiveCash)} cash
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400">Geen posities beschikbaar.</div>
            )}
          </div>
        </div>

        {/* Rechts: Verdeling Tabel met Checkboxes voor Meervoudige Selectie */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 lg:col-span-2 overflow-hidden flex flex-col justify-between h-[410px]">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-2">
            <div>
              <h4 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <span>Verdeling per {groupLabelsMap[donutGroupBy]}</span>
                {selectedGroups.length > 0 && (
                  <span className="text-xs font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    {selectedGroups.length} gefilterd
                  </span>
                )}
              </h4>
              <p className="text-xs text-gray-500">
                Vink een of meerdere groepen aan om ze op te lichten in de donut en de holdingstabel hieronder te filteren.
              </p>
            </div>
            {selectedGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedGroups([])}
                className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                Wis selectie
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-grow no-scrollbar">
            {loading ? (
              <div className="animate-pulse space-y-4 py-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <div className="h-4 bg-gray-100 rounded w-1/3"></div>
                    <div className="h-4 bg-gray-100 rounded w-1/6"></div>
                  </div>
                ))}
              </div>
            ) : groupedAllocationData.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                      {groupLabelsMap[donutGroupBy]}
                    </th>
                    <th className="py-2 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Waarde / Inleg</th>
                    <th className="py-2 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Winst / Verlies</th>
                    <th className="py-2 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Weging (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedAllocationData.map((cat) => {
                    const isChecked = selectedGroups.includes(cat.key || cat.name);
                    const profit = cat.value - cat.invested;
                    const profitPercent = cat.invested > 0 ? (profit / cat.invested) * 100 : 0;

                    return (
                      <tr
                        key={cat.key || cat.name}
                        onClick={() => toggleGroupSelection(cat.key || cat.name)}
                        className={`transition-colors border-b border-gray-100 last:border-0 cursor-pointer ${
                          isChecked ? 'bg-blue-50/70 hover:bg-blue-50' : 'hover:bg-gray-50/70'
                        }`}
                      >
                        <td className="py-2.5">
                          <div className="flex items-center gap-3">
                            {/* Checkbox */}
                            <div className="flex items-center justify-center shrink-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}} // afgehandeld door onClick van rij
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer pointer-events-none"
                              />
                            </div>

                            {/* Kleur indicator / Icoon */}
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0"
                              style={{ backgroundColor: cat.color }}
                            >
                              {cat.isCash ? (
                                <i className="ph-fill ph-wallet text-sm"></i>
                              ) : cat.isBroker ? (
                                <i className="ph-fill ph-bank text-sm"></i>
                              ) : (
                                <i className="ph ph-folder text-sm"></i>
                              )}
                            </div>

                            <div className="min-w-0">
                              <span className={`text-xs font-bold block truncate ${isChecked ? 'text-blue-900 font-black' : 'text-gray-900'}`}>
                                {cat.name}
                              </span>
                              {/* Blauwe onderlijn bij selectie */}
                              {isChecked ? (
                                <div className="h-0.5 w-14 bg-blue-500 rounded-full mt-0.5"></div>
                              ) : (
                                <span className="text-[11px] font-medium text-gray-400 block truncate">
                                  {cat.subtitle || `${cat.count} posities`}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 text-right">
                          <span className="text-xs font-bold text-gray-900 block privacy-blur">{formatCurrency(cat.value)}</span>
                          <span className="text-[11px] font-medium text-gray-400 block privacy-blur">{formatCurrency(cat.invested)}</span>
                        </td>

                        <td className="py-2.5 text-right">
                          {cat.isCash ? (
                            <span className="text-xs font-bold text-gray-400 block">—</span>
                          ) : (
                            <>
                              <span className={`text-xs font-bold block privacy-blur ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                              </span>
                              <span className={`text-[10px] font-bold ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {profit >= 0 ? '▲' : '▼'} {Math.abs(profitPercent).toFixed(1)}%
                              </span>
                            </>
                          )}
                        </td>

                        <td className="py-2.5 text-right">
                          <span className={`text-xs font-bold block ${isChecked ? 'text-blue-700 font-black' : 'text-gray-900'}`}>
                            {cat.percentage.toFixed(2)}%
                          </span>
                          <span className="text-[10px] font-medium text-gray-400 block">
                            {cat.investedPercentage.toFixed(1)}% v. inleg
                          </span>
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

      {/* 💰 CASH DETAIL OVERZICHT (Alleen zichtbaar wanneer Cash is aangeduid in de verdeling) */}
      {isCashSelected && (
        <div className="bg-white rounded-2xl p-5 border border-purple-200 shadow-sm space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-purple-100 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-lg">
                <i className="ph-fill ph-wallet"></i>
              </div>
              <div>
                <h4 className="text-base font-black text-gray-900">Overzicht Cash Saldi &amp; Platformen</h4>
                <p className="text-xs text-gray-500">Waar uw beschikbare liquiditeiten zich momenteel bevinden</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-black px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl privacy-blur">
                Totaal: {formatCurrency(effectiveCash)}
              </span>
              {setIsBrokerSyncOpen && (
                <button
                  type="button"
                  onClick={() => setIsBrokerSyncOpen(true)}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <i className="ph-fill ph-plug-charging text-amber-500 text-sm"></i>
                  <span>Koppelingen</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* DEGIRO Cash */}
            <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100">
              <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                <span>🔵 DEGIRO Cash</span>
              </span>
              <span className="text-base font-black text-gray-900 mt-1 block privacy-blur">
                {formatCurrency(isViewingHistoricalDate && activeTimeMachinePoint?.degiroCash !== undefined ? activeTimeMachinePoint.degiroCash : (brokerCash?.degiroCashEur || brokerCash?.degiroCash || 0))}
              </span>
              <span className="text-[11px] text-gray-500">Vrije beleggingsruimte</span>
            </div>

            {/* eToro Cash */}
            <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-100">
              <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                <span>🟢 eToro Cash</span>
              </span>
              <span className="text-base font-black text-gray-900 mt-1 block privacy-blur">
                {formatCurrency(isViewingHistoricalDate && activeTimeMachinePoint?.etoroCash !== undefined ? activeTimeMachinePoint.etoroCash : (brokerCash?.etoroCashEur || brokerCash?.etoroCash || 0))}
              </span>
              <span className="text-[11px] text-gray-500">Beschikbaar op account</span>
            </div>

            {/* Overige rekeningen uit availableBalanceData */}
            {availableBalanceData?.balances && Object.entries(availableBalanceData.balances)
              .filter(([k]) => !k.toLowerCase().includes('etoro') && !k.toLowerCase().includes('degiro'))
              .map(([name, amount]) => (
                <div key={name} className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    <i className="ph-fill ph-bank text-indigo-600"></i>
                    <span>{name}</span>
                  </span>
                  <span className="text-base font-black text-gray-900 mt-1 block privacy-blur">
                    {formatCurrency(amount)}
                  </span>
                  <span className="text-[11px] text-gray-500">Bank- / spaarrekening</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 📋 HOLDINGS TABEL MET PERMANENT ZICHTBARE VERMOGENSSAMENVATTING (BELEGD, CASH, TOTAAL) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Header van Holdings Sectie */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-base sm:text-lg font-black text-gray-900">
              Holdings {isViewingHistoricalDate ? `op ${activeTimeMachinePoint?.date}` : ''}
            </h3>
            <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">
              {displayedHoldings.length} {displayedHoldings.length !== processedHoldings.length ? `van ${processedHoldings.length}` : ''} Assets
            </span>

            {/* Actieve Filter Badge als er via de verdeling gefilterd wordt */}
            {selectedGroups.length > 0 && (
              <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-black px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                <span>🎯 Gefilterd op {groupLabelsMap[donutGroupBy]}: {selectedGroups.join(', ')}</span>
                <button
                  type="button"
                  onClick={() => setSelectedGroups([])}
                  className="hover:text-rose-600 font-black ml-1"
                  title="Filter wissen"
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          {/* PERMANENTE VERMOGENSSAMENVATTING IN DEZE SECTIE: Enkel getallen van Belegd, Cash & Totaal van huidige selectie */}
          <div className="flex items-center gap-4 sm:gap-6 bg-slate-50 px-4 py-2 rounded-xl border border-gray-200/80 shrink-0 self-start md:self-auto">
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Belegd</span>
              <span className="text-xs sm:text-sm font-black text-gray-900 privacy-blur block leading-tight">
                {formatCurrency(selectionSummary.belegd)}
              </span>
            </div>
            <div className="h-6 w-px bg-gray-200"></div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Cash</span>
              <span className="text-xs sm:text-sm font-black text-purple-600 privacy-blur block leading-tight">
                {formatCurrency(selectionSummary.cash)}
              </span>
            </div>
            <div className="h-6 w-px bg-gray-200"></div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Totaal</span>
              <span className="text-xs sm:text-sm font-black text-emerald-600 privacy-blur block leading-tight">
                {formatCurrency(selectionSummary.totaal)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            {/* Mobile Sorteer Dropdown */}
            <select
              value={mobileSortOption}
              onChange={(e) => setMobileSortOption(e.target.value)}
              className="sm:hidden text-xs font-extrabold bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700"
            >
              <option value="pl_desc">Hoogste P/L ▼</option>
              <option value="pl_asc">Laagste P/L ▲</option>
              <option value="val_desc">Hoogste Waarde ▼</option>
              <option value="ticker">Ticker A-Z</option>
            </select>

            {/* Zoekbalk */}
            <div className="relative">
              <i className="ph-bold ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                placeholder="Zoek holding..."
                value={holdingsSearch || ''}
                onChange={(e) => setHoldingsSearch && setHoldingsSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-36 sm:w-44"
              />
            </div>
          </div>
        </div>

        {/* Desktop Tabel (Duidelijke actieve sorteer-indicatoren op elke kolom!) */}
        <div className="hidden md:block overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-xs font-bold text-gray-400 animate-pulse">
              Holdings bijwerken...
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {renderSortHeader('ticker', 'Ticker', 'left')}
                  {renderSortHeader('asset_type', 'Type', 'left')}
                  {renderSortHeader('primary_broker', 'Broker', 'left')}
                  {renderSortHeader('quantity', 'Aantal', 'right')}
                  {renderSortHeader('total_invested', 'Inleg / GAK', 'right')}
                  {renderSortHeader('value', 'Waarde / Koers', 'right')}
                  {renderSortHeader('cumulative_dividends', 'Div. Ontvangen', 'right')}
                  {renderSortHeader('dividend_yield', 'Div. Yield', 'right')}
                  {renderSortHeader('dividend_growth', 'Div. Groei', 'right')}
                  {renderSortHeader('gainLoss', 'P/L Rendement', 'right')}
                  {renderSortHeader('irr', 'IRR', 'right')}
                  {renderSortHeader('weight', 'Weging', 'right')}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedHoldings.map((holding) => {
                  const brokersList = Array.isArray(holding.brokers) && holding.brokers.length > 0
                    ? holding.brokers
                    : [{
                      broker_name: holding.broker_name || holding.primary_broker || 'Onbekend',
                      quantity: holding.quantity || 0,
                      value: holding.value || 0
                    }];

                  const weight = totalHoldingsValue > 0 ? (holding.value / totalHoldingsValue) * 100 : 0;
                  const divYield = Number(holding.dividend_yield || 0);
                  const divGrowth = Number(holding.dividend_growth || 0);
                  const irr = Number(holding.irr || 0);

                  return (
                    <tr
                      key={holding.ticker}
                      onClick={() => setSelectedHoldingForModal(holding)}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                    >
                      {/* Ticker & Naam */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 font-black text-xs uppercase flex items-center justify-center border border-gray-200 shrink-0">
                            {holding.ticker ? holding.ticker.substring(0, 2) : '•'}
                          </div>
                          <div>
                            <span className="font-bold text-sm text-gray-900 block">{holding.ticker}</span>
                            <span className="text-xs text-gray-400 block truncate max-w-[160px]">{holding.name || holding.ticker}</span>
                          </div>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${
                          String(holding.asset_type).toUpperCase().includes('ETF')
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-teal-50 text-teal-800 border-teal-200'
                        }`}>
                          {String(holding.asset_type).toUpperCase().includes('ETF') ? 'ETF' : 'Aandeel'}
                        </span>
                      </td>

                      {/* Broker Badge */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {brokersList.map(b => {
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
                              >
                                <span>{isEtoro ? '🟢' : isDegiro ? '🔵' : '🏦'} {b.broker_name}</span>
                              </span>
                            );
                          })}
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
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-gray-900 block">{divYield ? `${divYield.toFixed(2)}%` : '0.00%'}</span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-gray-600 block">{divGrowth ? `${divGrowth.toFixed(2)}%` : '0%'}</span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className={`text-sm font-bold block privacy-blur ${holding.gainLoss >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {holding.gainLoss >= 0 ? '+' : ''}{formatCurrency(holding.gainLoss)}
                          </span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md mt-0.5 ${holding.gainLoss >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {holding.gainLoss >= 0 ? '▲' : '▼'} {Math.abs(holding.total_invested > 0 ? (holding.gainLoss / holding.total_invested) * 100 : 0).toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-bold block ${irr >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {irr ? `${(irr >= 0 ? '▲ ' : '▼ ') + Math.abs(irr).toFixed(2)}%` : '0.00%'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-gray-900 block">{weight.toFixed(2)}%</span>
                      </td>
                    </tr>
                  );
                })}

                {displayedHoldings.length === 0 && (
                  <tr>
                    <td colSpan="12" className="px-6 py-8 text-center text-sm text-gray-500">
                      Geen posities gevonden voor de geselecteerde filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Mobiele Compacte Holdings Lijst */}
        <div className="block md:hidden divide-y divide-gray-100">
          <div className="p-3 bg-gray-50/80 flex items-center justify-between text-xs font-bold text-gray-500 border-b border-gray-100">
            <span>Activa ({sortedMobileHoldings.length})</span>
            <span className="text-[11px] text-gray-400 font-semibold">Tik op holding voor details</span>
          </div>

          {loading ? (
            <div className="p-6 text-center text-xs text-gray-400 animate-pulse">Laden van holdings...</div>
          ) : sortedMobileHoldings.length > 0 ? (
            sortedMobileHoldings.map((h) => {
              const isPositive = (h.gainLoss || 0) >= 0;
              const profitVal = Number(h.gainLoss || 0);
              const profitPct = Number(h.gainLossPercent ?? (h.total_invested > 0 ? (profitVal / h.total_invested) * 100 : 0));
              const curPrice = Number(h.current_price || h.price || h.average_price || 0);
              const isEur = h.currency === 'EUR';

              return (
                <div
                  key={h.ticker}
                  onClick={() => setSelectedHoldingForModal(h)}
                  className="p-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center justify-between cursor-pointer gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-800 font-black text-xs uppercase flex items-center justify-center border border-gray-200 shrink-0">
                      {h.ticker ? h.ticker.substring(0, 2) : '•'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-sm text-gray-900 tracking-tight truncate block">
                          {h.ticker}
                        </span>
                        {h.primary_broker && (
                          <span className={`text-[9px] font-black px-1.5 py-0.2 rounded shrink-0 ${
                            h.primary_broker.toLowerCase().includes('etoro') ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {h.primary_broker.toLowerCase().includes('etoro') ? 'eToro' : 'DEGIRO'}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 font-medium block truncate">
                        {h.name || h.ticker}
                      </span>
                      <span className="text-[11px] text-gray-400 font-semibold block mt-0.5">
                        {isEur ? '€' : '$'}{curPrice.toFixed(2)} × {h.quantity} st.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-right">
                    <div className="flex flex-col items-end">
                      <span className="font-black text-sm text-gray-900 privacy-blur">
                        {formatCurrency(h.value || 0)}
                      </span>
                      <span className={`inline-flex items-center gap-0.5 text-[11px] font-extrabold px-1.5 py-0.5 rounded-md mt-0.5 ${
                        isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                      }`}>
                        {isPositive ? '▲ +' : '▼ '}{formatCurrency(profitVal)} ({profitPct.toFixed(1)}%)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedHoldingForModal(h);
                      }}
                      className="p-1.5 text-gray-400 hover:text-gray-700 active:bg-gray-200 rounded-lg"
                      title="Alle details openen"
                    >
                      <i className="ph-bold ph-dots-three-vertical text-base"></i>
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs font-bold text-gray-400">
              Geen posities gevonden voor de huidige filter.
            </div>
          )}
        </div>
      </div>

      {/* 📱 DETAIL BOTTOM SHEET MODAL (eToro / DEGIRO 3-Puntjes Scherm) */}
      {selectedHoldingForModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedHoldingForModal(null)}
          />
          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl p-5 space-y-4 z-10 animate-slide-up">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 font-black text-sm flex items-center justify-center border border-indigo-100">
                  {selectedHoldingForModal.ticker?.substring(0, 2) || '•'}
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900 leading-tight">
                    {selectedHoldingForModal.name || selectedHoldingForModal.ticker}
                  </h3>
                  <span className="text-xs font-bold text-gray-400 uppercase">
                    {selectedHoldingForModal.ticker} • {selectedHoldingForModal.asset_type || 'Aandeel'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHoldingForModal(null)}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:text-gray-900 flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Cijfers Grid */}
            <div className="grid grid-cols-2 gap-2.5 text-left">
              <div className="bg-slate-50 p-3 rounded-xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 block uppercase">Huidige Waarde</span>
                <span className="text-base font-black text-gray-900 privacy-blur block">
                  {formatCurrency(selectedHoldingForModal.value || 0)}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 block uppercase">Totale Inleg (Cost Basis)</span>
                <span className="text-base font-black text-gray-700 privacy-blur block">
                  {formatCurrency(selectedHoldingForModal.total_invested || 0)}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 block uppercase">Totale Winst / Verlies</span>
                <span className={`text-base font-black privacy-blur block ${(selectedHoldingForModal.gainLoss || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {(selectedHoldingForModal.gainLoss || 0) >= 0 ? '+' : ''}
                  {formatCurrency(selectedHoldingForModal.gainLoss || 0)}
                  {' '}
                  <span className="text-xs">({(selectedHoldingForModal.gainLossPercent ?? 0).toFixed(1)}%)</span>
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 block uppercase">Aantal &amp; Gem. Aankoopprijs</span>
                <span className="text-sm font-bold text-gray-800 block">
                  {selectedHoldingForModal.quantity} st. @ {selectedHoldingForModal.currency === 'EUR' ? '€' : '$'}
                  {(selectedHoldingForModal.average_price || 0).toFixed(2)}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 block uppercase">Ontvangen Dividend</span>
                <span className="text-sm font-bold text-emerald-600 block">
                  +{formatCurrency(selectedHoldingForModal.cumulative_dividends || 0)}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 block uppercase">Portefeuillegewicht</span>
                <span className="text-sm font-bold text-indigo-700 block">
                  {totalHoldingsValue > 0 ? ((selectedHoldingForModal.value / totalHoldingsValue) * 100).toFixed(1) : 0}% van portfolio
                </span>
              </div>
            </div>

            {/* Platform info */}
            <div className="p-3 bg-gray-50 rounded-xl flex items-center justify-between text-xs">
              <span className="text-gray-500 font-bold">Platform / Broker:</span>
              <span className="font-extrabold text-gray-900">
                {selectedHoldingForModal.primary_broker || 'eToro / DEGIRO'}
              </span>
            </div>

            {/* Actieknoppen */}
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  navigate(`/analysis?ticker=${selectedHoldingForModal.ticker}`);
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-2"
              >
                <i className="ph-fill ph-chart-line-up text-base"></i>
                Bekijk Uitgebreide Analyse
              </button>
              <button
                type="button"
                onClick={() => setSelectedHoldingForModal(null)}
                className="py-3 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OverviewTab;

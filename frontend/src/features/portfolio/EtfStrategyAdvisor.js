import React, { useState, useEffect, useCallback, useMemo } from 'react';
import http from '../../http-common';
import toast from 'react-hot-toast';
import { useIncognito } from '../../hooks/useIncognito';

/**
 * EtfStrategyAdvisor
 * 
 * Beheert de 100% Buy & Hold Dollar Cost Averaging (DCA) & Dip-Koop ETF Strategie.
 * Volgt dezelfde modulaire en data-gedreven structuur als Losse Aandelen:
 * 1. Tijdlijn & Historie met strikte 1-op-1 koppeling tussen MACD-koopsignalen en werkelijke aankopen
 * 2. Prijsvergelijking (Voordeliger / Boven signaal)
 * 3. Alleen koopmeldingen (geen dividenden of niet-gekoppelde handmatige transacties op deze tijdlijn)
 * 4. Volledig configureerbaar budget, startdatum en pot met persistentie in localStorage
 */
const EtfStrategyAdvisor = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Instellingen met persistentie in localStorage
  const [monthlyBudgetInput, setMonthlyBudgetInput] = useState(() => {
    return localStorage.getItem('etf_dca_monthly_budget') || '450';
  });
  const [initialPotInput, setInitialPotInput] = useState(() => {
    return localStorage.getItem('etf_dca_initial_pot') || '0';
  });
  const [startDateInput, setStartDateInput] = useState(() => {
    return localStorage.getItem('etf_dca_start_date') || '2026-01-01';
  });

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  // Subtabs & Weergaven
  const [activeSubTab, setActiveSubTab] = useState('timeline'); // 'timeline' | 'overview'

  // Tijdlijn Filters (identiek aan Losse Aandelen)
  const [filterType, setFilterType] = useState('ALL'); // 'ALL' | 'ACTION_REQUIRED' | 'MATCHED' | 'EXPIRED'
  const [selectedTicker, setSelectedTicker] = useState('ALL');
  const [comparisonFilter, setComparisonFilter] = useState('ALL'); // 'ALL' | 'CHEAPER' | 'HIGHER'
  const [sortOrder, setSortOrder] = useState('DESC'); // 'DESC' | 'ASC'
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isIncognito = useIncognito();
  const uid = localStorage.getItem('userID') || 1;

  const fetchEtfData = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const budget = parseFloat(monthlyBudgetInput) || 450;
      const pot = parseFloat(initialPotInput) || 0;
      const start = startDateInput || '2026-01-01';

      const res = await http.get(
        `/portfolio/etf-strategy?userId=${uid}&monthlyBudget=${budget}&initialPot=${pot}&startDate=${start}${force ? '&forceRefresh=true' : ''}`
      );
      setData(res.data);
    } catch (err) {
      console.error('Fout bij ophalen ETF strategie:', err);
      toast.error('Kon ETF strategie data niet laden.');
    } finally {
      setLoading(false);
    }
  }, [uid, monthlyBudgetInput, initialPotInput, startDateInput]);

  useEffect(() => {
    fetchEtfData();
  }, [fetchEtfData]);

  // Handmatige refresh trigger
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      toast.loading('Bezig met synchroniseren van actuele ETF slotkoersen & berekeningen...', { id: 'etf-refresh' });
      await http.post('/watchlist/update-data');
      await fetchEtfData(true);
      toast.success('ETF strategie data & koersen succesvol bijgewerkt!', { id: 'etf-refresh' });
    } catch (err) {
      console.error('Fout bij verversen:', err);
      toast.error('Verversen mislukt.', { id: 'etf-refresh' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleApplySettings = async () => {
    localStorage.setItem('etf_dca_monthly_budget', monthlyBudgetInput);
    localStorage.setItem('etf_dca_initial_pot', initialPotInput);
    localStorage.setItem('etf_dca_start_date', startDateInput);
    setShowSettingsModal(false);
    toast.success('ETF instellingen opgeslagen! Data wordt herberekend...', { id: 'etf-settings' });
    await fetchEtfData(true);
  };

  const handleResetDefaults = () => {
    setMonthlyBudgetInput('450');
    setInitialPotInput('0');
    setStartDateInput('2026-01-01');
    localStorage.removeItem('etf_dca_monthly_budget');
    localStorage.removeItem('etf_dca_initial_pot');
    localStorage.removeItem('etf_dca_start_date');
  };

  const formatCurrency = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '€ 0,00';
    return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(val);
  };

  const etfs = data?.etfs || [];
  const summary = data?.summary || {};
  const timeline = data?.timeline || [];
  const dataFreshness = data?.dataFreshness || {};

  // Dynamische statistieken tellen voor KPI kaarten en tabs
  const counts = useMemo(() => {
    let all = timeline.length;
    let actionRequired = 0;
    let matched = 0;
    let open = 0;
    let expired = 0;

    for (const item of timeline) {
      if (item.status === 'EXECUTED') matched++;
      else if (item.status === 'OPEN_OPPORTUNITY') {
        open++;
        actionRequired++;
      } else if (item.status === 'EXPIRED') expired++;
    }

    return { all, actionRequired, matched, open, expired };
  }, [timeline]);

  // Unieke ETF tickers in tijdlijn voor selectiemenu
  const uniqueTickers = useMemo(() => {
    const set = new Set();
    timeline.forEach(item => {
      if (item.ticker) set.add(item.ticker);
    });
    return Array.from(set).sort();
  }, [timeline]);

  // Gefilterde tijdlijn items
  const filteredTimeline = useMemo(() => {
    let items = [...timeline];

    if (selectedTicker !== 'ALL') {
      items = items.filter(t => t.ticker === selectedTicker);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(item => 
        (item.ticker && item.ticker.toLowerCase().includes(q)) ||
        (item.name && item.name.toLowerCase().includes(q))
      );
    }

    if (filterType === 'ACTION_REQUIRED') {
      items = items.filter(item => item.status === 'OPEN_OPPORTUNITY');
    } else if (filterType === 'MATCHED') {
      items = items.filter(item => item.status === 'EXECUTED');
    } else if (filterType === 'EXPIRED') {
      items = items.filter(item => item.status === 'EXPIRED');
    }

    if (filterType === 'MATCHED' && comparisonFilter !== 'ALL') {
      if (comparisonFilter === 'CHEAPER') {
        items = items.filter(item => item.isCheaper);
      } else if (comparisonFilter === 'HIGHER') {
        items = items.filter(item => !item.isCheaper);
      }
    }

    items.sort((a, b) => {
      const timeA = a.timestamp || new Date(a.date).getTime();
      const timeB = b.timestamp || new Date(b.date).getTime();
      return sortOrder === 'DESC' ? timeB - timeA : timeA - timeB;
    });

    return items;
  }, [timeline, filterType, selectedTicker, searchQuery, comparisonFilter, sortOrder]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4 bg-white rounded-3xl border border-gray-100 shadow-sm min-h-[350px]">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-gray-800 font-bold text-base">ETF Strategie Berekenen...</div>
        <p className="text-gray-400 text-xs max-w-sm text-center">
          We synchroniseren de MACD koopsignalen (30/90/9), pot-accumulatie en werkelijk uitgevoerde aankopen voor VGWL, VUSA, VGWD en SPYM.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6 animate-fade-in">
      
      {/* 1. HOOFD STATISTIEKEN BANNER (4 KPI KAARTEN - Identiek aan Losse Aandelen) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Kaart 1: Gekoppelde Aankopen */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-emerald-200 shadow-xs flex flex-col justify-between min-h-[90px] sm:min-h-auto">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-emerald-800 uppercase tracking-wider">Gekoppeld</span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs sm:text-base">
              <i className="ph-bold ph-check-circle"></i>
            </div>
          </div>
          <div className="mt-1.5 sm:mt-3">
            <div className="text-lg sm:text-2xl font-black text-gray-900">{summary.totalMatched || counts.matched} orders</div>
            <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5 sm:mt-1 flex-wrap">
              <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded-md">
                {summary.cheaperCount || 0} voordeliger
              </span>
              <span className="text-[10px] text-gray-500 hidden sm:inline">({summary.higherCount || 0} boven signaal)</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-emerald-100 text-[11px] text-gray-600 hidden sm:block">
            1-op-1 gekoppeld aan portfolio transacties
          </div>
        </div>

        {/* Kaart 2: Valide Koopkansen */}
        <div className="bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-emerald-300 shadow-xs flex flex-col justify-between min-h-[90px] sm:min-h-auto">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-emerald-800 uppercase tracking-wider">🟢 Valide Koop</span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs sm:text-base">
              <i className="ph-bold ph-shopping-cart-simple"></i>
            </div>
          </div>
          <div className="mt-1.5 sm:mt-3">
            <div className="text-lg sm:text-2xl font-black text-emerald-900">{counts.open} kansen</div>
            <p className="text-[10px] sm:text-[11px] text-emerald-700 mt-0.5 sm:mt-1 font-semibold truncate">
              Voldoende pot opgebouwd
            </p>
          </div>
          <div className="mt-2 pt-2 border-t border-emerald-100 text-[11px] text-gray-500 hidden sm:block">
            MACD crossover & pot &ge; 1 heel aandeel
          </div>
        </div>

        {/* Kaart 3: Verlopen Orders */}
        <div className="bg-gradient-to-br from-slate-500/10 via-slate-500/5 to-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between min-h-[90px] sm:min-h-auto">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider">⚪ Verlopen</span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 text-xs sm:text-base">
              <i className="ph-bold ph-clock-counter-clockwise"></i>
            </div>
          </div>
          <div className="mt-1.5 sm:mt-3">
            <div className="text-lg sm:text-2xl font-black text-slate-800">{counts.expired} orders</div>
            <p className="text-[10px] sm:text-[11px] text-slate-600 mt-0.5 sm:mt-1 font-semibold truncate">
              Niet aangekocht binnen venster
            </p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-gray-400 hidden sm:block">
            Geen aankoop binnen 30 dagen na signaal
          </div>
        </div>

        {/* Kaart 4: Directe Acties Vereist */}
        <div className="bg-gradient-to-br from-amber-500/15 via-emerald-500/5 to-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-amber-300 shadow-xs flex flex-col justify-between min-h-[90px] sm:min-h-auto">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-amber-900 uppercase tracking-wider">⚡ Actie Vereist</span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 text-xs sm:text-base">
              <i className="ph-bold ph-lightning"></i>
            </div>
          </div>
          <div className="mt-1.5 sm:mt-3">
            <div className="text-lg sm:text-2xl font-black text-gray-900">{counts.actionRequired} actie(s)</div>
            <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-gray-600 flex-wrap">
              <span className="text-emerald-700 font-bold">{counts.open} openstaand</span>
              <span>•</span>
              <span className="text-gray-500">0 verkopen (100% DCA)</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-amber-100 text-[11px] text-gray-500 hidden sm:block">
            Pure acties (alleen actieve kooporders)
          </div>
        </div>
      </div>

      {/* 2. SUB-NAVIGATIE TUSSEN WEERGAVEN & DATA FRESHNESS STATUS */}
      <div className="flex items-center justify-between gap-1.5 border-b border-gray-200 pb-2">
        <div className="flex items-center gap-1 sm:gap-1.5 bg-gray-100 p-0.5 sm:p-1 rounded-xl sm:rounded-2xl overflow-x-auto no-scrollbar flex-1 sm:flex-initial">
          <button
            onClick={() => setActiveSubTab('timeline')}
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSubTab === 'timeline'
                ? 'bg-white text-emerald-800 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ph-fill ph-clock-counter-clockwise text-emerald-600 text-sm sm:text-base"></i>
            <span>Tijdlijn & Acties ({timeline.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSubTab === 'overview'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ph-fill ph-chart-pie text-blue-600 text-sm sm:text-base"></i>
            <span>ETF Overzicht ({etfs.length} Fondsen)</span>
          </button>
        </div>

        {/* Data Status Pill & Knoppen */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span 
            className={`px-2 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${
              dataFreshness?.isUpdatedToday
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
            title={`Laatste koersen: ${dataFreshness?.lastPriceDate || 'Onbekend'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dataFreshness?.isUpdatedToday ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></span>
            <span className="hidden sm:inline">{dataFreshness?.isUpdatedToday ? 'Up-to-date' : 'Update nodig'}</span>
            <span className="font-mono">({dataFreshness?.lastPriceDate ? dataFreshness.lastPriceDate.slice(5) : '-'})</span>
          </span>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 text-xs shrink-0 disabled:opacity-50"
            title="Ververs actuele koersen & ETF signalen"
          >
            <i className={`ph-bold ph-arrows-clockwise text-xs sm:text-sm ${isRefreshing ? 'animate-spin' : ''}`}></i>
            <span className="hidden xs:inline sm:inline">{isRefreshing ? 'Bezig...' : 'Verversen'}</span>
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-2.5 sm:px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-gray-700 font-bold rounded-xl border border-gray-200 transition-all flex items-center gap-1 text-xs shrink-0"
            title="Instellingen aanpassen (Budget, Startdatum, Pot)"
          >
            <i className="ph-bold ph-gear text-sm text-gray-600"></i>
            <span className="hidden sm:inline">Instellingen</span>
          </button>

          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="hidden md:flex px-2.5 sm:px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-xl border border-emerald-200/80 transition-all items-center gap-1 text-xs shrink-0"
            title="Uitleg over werking"
          >
            <i className="ph-fill ph-info text-emerald-600"></i>
            <span>{showExplanation ? 'Verberg' : 'Uitleg'}</span>
          </button>
        </div>
      </div>

      {/* Optionele Koppelingsgarantie / Uitleg Banner */}
      {showExplanation && (
        <div className="bg-gradient-to-r from-emerald-50/70 via-teal-50/50 to-white rounded-2xl p-4 border border-emerald-200 shadow-2xs space-y-3 animate-fade-in">
          <div className="flex items-center gap-2 font-bold text-emerald-950 text-xs">
            <i className="ph-fill ph-shield-check text-emerald-600 text-base"></i>
            <span>Werking Arne Buy & Hold DCA ETF Strategie:</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-700">
            <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-2xs space-y-1">
              <span className="font-bold text-emerald-900 block">1. Pot-aangroei & Budget</span>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Het maandelijkse budget (€{summary.totalMonthlyBudget || 450}) bouwt dagelijks aan (€{summary.totalDailyRate || 15}/dag) verdeeld conform: VGWL (70%), VUSA (12%), VGWD (10%) en SPYM (8%).
              </p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-2xs space-y-1">
              <span className="font-bold text-emerald-900 block">2. Koopsignalen op MACD Cross</span>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Bij een MACD crossover (30/90/9) adviseert het algoritme hele stuks zodra de pot &ge; 1 heel aandeel bevat. Geen verkoop / 100% buy & hold.
              </p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-2xs space-y-1">
              <span className="font-bold text-emerald-900 block">3. 1-op-1 Koppelingsgarantie</span>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Zodra je een transactie in eToro/broker uitvoert na het signaal, wordt deze direct gekoppeld met een exacte prijsvergelijking (Voordeliger of Boven signaal).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* WEERGAVE 1: TIJDLIJN & HISTORIE MET KOPPELING */}
      {activeSubTab === 'timeline' && (
        <div className="space-y-2.5 sm:space-y-4">
          
          {/* Filter Bar (Identiek aan Losse Aandelen) */}
          <div className="bg-white p-2 sm:p-4 rounded-xl sm:rounded-3xl border border-gray-200 shadow-xs space-y-2 sm:space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-2.5">
              
              {/* Status Tabs */}
              <div className="flex items-center gap-1 sm:gap-1.5 bg-gray-100 p-0.5 sm:p-1 rounded-xl sm:rounded-2xl text-xs font-bold overflow-x-auto no-scrollbar w-full sm:w-auto">
                <button
                  onClick={() => setFilterType('ALL')}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-all whitespace-nowrap shrink-0 ${
                    filterType === 'ALL' ? 'bg-white text-emerald-800 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Alle Meldingen ({counts.all})
                </button>

                <button
                  onClick={() => setFilterType('ACTION_REQUIRED')}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-all flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    filterType === 'ACTION_REQUIRED'
                      ? 'bg-amber-500 text-white shadow-xs font-black'
                      : counts.actionRequired > 0
                      ? 'bg-amber-100/90 text-amber-900 hover:bg-amber-200'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span>⚡ Actie Vereist ({counts.actionRequired})</span>
                </button>

                <button
                  onClick={() => setFilterType('MATCHED')}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-all flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    filterType === 'MATCHED' ? 'bg-white text-emerald-800 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span>🟢 Gekoppeld ({counts.matched})</span>
                </button>

                <button
                  onClick={() => setFilterType('EXPIRED')}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-all flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    filterType === 'EXPIRED' ? 'bg-white text-slate-800 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span>⚪ Verlopen ({counts.expired})</span>
                </button>
              </div>

              {/* Zoekbalk & Ticker Dropdown */}
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-52 sm:flex-initial">
                  <i className="ph ph-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Zoek ETF..."
                    className="w-full pl-7 pr-3 py-1 text-xs bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <i className="ph-bold ph-x text-xs"></i>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 text-xs shrink-0">
                  <select
                    value={selectedTicker}
                    onChange={(e) => setSelectedTicker(e.target.value)}
                    className="py-1 px-2 text-xs bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl font-bold text-gray-800 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="ALL">Alle ETF's ({uniqueTickers.length})</option>
                    {uniqueTickers.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Subfilter voor Gekoppelde Aankopen: Voordeliger vs Duurder */}
            {filterType === 'MATCHED' && (
              <div className="flex items-center gap-1 bg-emerald-50/70 p-0.5 sm:p-1 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-bold border border-emerald-200/60 overflow-x-auto no-scrollbar">
                <span className="text-emerald-800 px-1.5">Prijs tov signaal:</span>
                <button
                  onClick={() => setComparisonFilter('ALL')}
                  className={`px-2 py-0.5 rounded-lg transition-all ${
                    comparisonFilter === 'ALL' ? 'bg-white text-emerald-900 shadow-2xs font-black' : 'text-emerald-700 hover:text-emerald-900'
                  }`}
                >
                  Alles ({counts.matched})
                </button>
                <button
                  onClick={() => setComparisonFilter('CHEAPER')}
                  className={`px-2 py-0.5 rounded-lg transition-all ${
                    comparisonFilter === 'CHEAPER' ? 'bg-white text-emerald-900 shadow-2xs font-black' : 'text-emerald-700 hover:text-emerald-900'
                  }`}
                >
                  🟢 Voordeliger ({summary.cheaperCount || 0})
                </button>
                <button
                  onClick={() => setComparisonFilter('HIGHER')}
                  className={`px-2 py-0.5 rounded-lg transition-all ${
                    comparisonFilter === 'HIGHER' ? 'bg-white text-amber-900 shadow-2xs font-black' : 'text-amber-700 hover:text-amber-900'
                  }`}
                >
                  🟠 Boven signaal ({summary.higherCount || 0})
                </button>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-gray-400 font-medium pt-1 border-t border-gray-100">
              <span>Startdatum tracking: <strong>{startDateInput}</strong> (Budget: €{monthlyBudgetInput}/mnd)</span>
              <span>Getoond: <strong>{filteredTimeline.length}</strong> van {timeline.length} acties</span>
            </div>
          </div>

          {/* Tijdlijn Kaarten Lijst */}
          {filteredTimeline.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-gray-200 space-y-2">
              <i className="ph-bold ph-calendar-blank text-3xl text-gray-400"></i>
              <div className="text-sm font-bold text-gray-700">Geen acties gevonden voor deze selectie</div>
              <p className="text-xs text-gray-400">
                Sinds {startDateInput} bouwt de pot aan. Zodra er een MACD crossover plaatsvindt of een aankoop wordt gekoppeld, verschijnt deze hier.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTimeline.map((item, idx) => {
                const isMatched = item.status === 'EXECUTED';
                const isOpen = item.status === 'OPEN_OPPORTUNITY';
                const isExpired = item.status === 'EXPIRED';

                let cardBg = 'bg-white border-gray-200 hover:border-gray-300';
                let dateBg = 'bg-gray-100 text-gray-700';

                if (isOpen) {
                  cardBg = 'bg-emerald-50/30 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs';
                  dateBg = 'bg-emerald-600 text-white font-black shadow-xs';
                } else if (isMatched) {
                  cardBg = 'bg-emerald-50/15 border-emerald-200 hover:border-emerald-300';
                  dateBg = 'bg-emerald-100 text-emerald-900 font-bold';
                } else if (isExpired) {
                  cardBg = 'bg-slate-50/60 border-slate-200 opacity-80';
                  dateBg = 'bg-slate-100 text-slate-600 font-semibold';
                }

                return (
                  <div
                    key={item.id || idx}
                    className={`rounded-2xl sm:rounded-3xl p-3 sm:p-5 border transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between gap-3 ${cardBg}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      
                      {/* Linkerzijde: Datum, Ticker, Badges */}
                      <div className="flex items-start sm:items-center gap-3">
                        <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center text-center shrink-0 ${dateBg}`}>
                          <span className="text-[9px] uppercase tracking-wider leading-tight">
                            {new Date(item.date).toLocaleDateString('nl-BE', { month: 'short' })}
                          </span>
                          <span className="text-sm sm:text-base font-black leading-none mt-0.5">
                            {new Date(item.date).getDate()}
                          </span>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base sm:text-lg font-black text-gray-900">{item.ticker}</span>
                            <span className={`text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-full border ${
                              isOpen
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300 animate-pulse'
                                : isMatched
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                              {item.statusBadge}
                            </span>
                            {isOpen && (
                              <span className="text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-2xs">
                                ⚡ Actie Vereist
                              </span>
                            )}
                            <span className="text-xs text-gray-500 font-medium truncate max-w-[200px]" title={item.name}>
                              {item.name}
                            </span>
                          </div>

                          {/* Subregels met datumdetails en koppelingsvergelijking */}
                          <div className="text-[11px] text-gray-500 mt-1 flex flex-wrap items-center gap-2">
                            <span>Signaaldatum: <strong>{item.date}</strong></span>
                            
                            {isMatched && item.executionDate && (
                              <span className="text-emerald-800 font-bold bg-emerald-100/60 px-2 py-0.5 rounded-md border border-emerald-200">
                                📅 Aangekocht op: {item.executionDate} {item.daysBetweenSignalAndBuy !== undefined ? `(${item.daysBetweenSignalAndBuy}d na signaal)` : ''}
                              </span>
                            )}

                            {isMatched && item.comparisonBadge && (
                              <span className="text-xs font-black">
                                {item.comparisonBadge}
                              </span>
                            )}

                            {isExpired && (
                              <span className="text-slate-500 italic">
                                Verlopen (niet aangekocht binnen venster)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Rechterzijde: Aantal stuks, Koers & Bedrag */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                        <div>
                          <span className="text-[10px] text-gray-400 font-bold uppercase block">
                            {isMatched ? 'Werkelijk Gekocht' : (isOpen ? 'Aan Te Kopen' : 'Geadviseerd')}
                          </span>
                          <div className="text-sm sm:text-base font-black text-gray-900">
                            {item.shares} stuks
                          </div>
                          <span className="text-[10px] text-gray-500">
                            à {formatCurrency(item.actualPrice || item.signalPrice)}
                          </span>
                        </div>

                        <div className="min-w-[100px]">
                          <span className="text-[10px] text-gray-400 font-bold uppercase block">
                            {isMatched ? 'Totaal Geïnvesteerd' : (isOpen ? 'Totaal Orderbedrag' : 'Voorstel')}
                          </span>
                          <div className={`text-base sm:text-lg font-black privacy-blur ${
                            isOpen ? 'text-emerald-700' : (isMatched ? 'text-gray-900' : 'text-slate-600')
                          }`}>
                            {isIncognito ? '€ ••••••' : formatCurrency(item.totalAmount)}
                          </div>
                          {item.signalPrice && isMatched && (
                            <span className="text-[10px] text-gray-400 block">
                              Signaal: {formatCurrency(item.signalPrice)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Open Koopkans Callout Banner */}
                    {isOpen && (
                      <div className="p-3 bg-white rounded-xl border border-emerald-300 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 text-emerald-900 font-bold">
                          <span className="text-base">⚡</span>
                          <span>KOOP ADVIES: {item.shares} stuks {item.ticker} (à {formatCurrency(item.signalPrice)} = {formatCurrency(item.totalAmount)})</span>
                        </div>
                        <div className="text-emerald-700 font-semibold text-[11px]">
                          Allocatie: {item.pctOfPot}% van pot • Restant pot: {formatCurrency(item.remainingPot)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* WEERGAVE 2: ACTUEEL ETF OVERZICHT (DE 4 DETAIL KAARTEN) */}
      {activeSubTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {etfs.map((etf) => {
            const isBuy = etf.isBuyCrossoverNow;
            const isBullish = etf.isMacdBullish;

            return (
              <div
                key={etf.ticker}
                className={`bg-white rounded-3xl p-6 border transition-all shadow-xs hover:shadow-md flex flex-col justify-between space-y-5 ${
                  isBuy
                    ? 'border-emerald-300 ring-2 ring-emerald-400/30 bg-gradient-to-b from-white to-emerald-50/20'
                    : 'border-gray-200'
                }`}
              >
                {/* Kaart Header */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">
                          {etf.ticker}
                        </h2>
                        <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-extrabold text-xs">
                          {etf.targetWeightPct}% Weging
                        </span>
                        <span className="text-[11px] text-gray-400 font-semibold">
                          {etf.isin}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 font-medium mt-0.5">
                        {etf.name}
                      </div>
                    </div>

                    {/* Koersbadge */}
                    <div className="text-right">
                      <div className="text-lg font-black text-gray-950">
                        {formatCurrency(etf.currentPrice)}
                      </div>
                      <span className={`text-[11px] font-bold inline-flex items-center gap-0.5 ${
                        etf.changePercent >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {etf.changePercent >= 0 ? '▲' : '▼'} {Math.abs(etf.changePercent)}%
                      </span>
                    </div>
                  </div>

                  {/* Status Indicator Pill */}
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-gray-200/80">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full shrink-0 ${
                        isBuy ? 'bg-emerald-500 animate-ping' :
                        isBullish ? 'bg-emerald-500' :
                        'bg-amber-400'
                      }`}></span>
                      <span className="text-xs font-extrabold text-gray-800">
                        {etf.statusBadge}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      Slotkoers: {new Date(etf.lastDate).toLocaleDateString('nl-BE')}
                    </span>
                  </div>
                </div>

                {/* Order Advies Box */}
                <div className={`p-4 rounded-2xl border space-y-2 text-xs ${
                  isBuy
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-slate-50 border-gray-200 text-slate-800'
                }`}>
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5 uppercase text-[10px] tracking-wider text-gray-500">
                      <i className="ph-fill ph-target text-sm text-emerald-600"></i>
                      Aankoopadvies
                    </span>
                    <span className="text-[11px] text-emerald-700 font-extrabold">
                      {etf.investmentPct}% van pot
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <span className="text-xs text-gray-600 block">Advies:</span>
                      <div className="text-base font-black text-gray-900">
                        {etf.sharesToBuyNow > 0 ? (
                          <>Koop <strong className="text-emerald-700">{etf.sharesToBuyNow} stuks</strong></>
                        ) : (
                          <span className="text-gray-500 font-semibold">0 stuks (Pot groeit aan)</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-gray-600 block">Te besteden:</span>
                      <div className="text-base font-black text-gray-900">
                        {formatCurrency(etf.actualInvestNow)}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-gray-500 pt-1 border-t border-gray-200/60 flex items-center justify-between">
                    <span>Beschikbare pot: <strong>{formatCurrency(etf.availablePot)}</strong></span>
                    <span>Restant na aankoop: <strong>{formatCurrency(etf.remainingPotAfterBuy)}</strong></span>
                  </div>
                </div>

                {/* Financiële & Technische Details */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* Pot & Aanwas */}
                  <div className="p-3 bg-slate-50/80 rounded-2xl border border-gray-200 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                      Pot & Aanwas
                    </span>
                    <div className="flex justify-between items-center text-gray-700">
                      <span>Dagelijkse aanwas:</span>
                      <strong className="text-emerald-700 font-extrabold">€ {etf.dailyRate} / dag</strong>
                    </div>
                    <div className="flex justify-between items-center text-gray-700">
                      <span>Maandelijks aandeel:</span>
                      <strong className="text-gray-900 font-bold">€ {etf.monthlyBudget} / mnd</strong>
                    </div>
                    <div className="flex justify-between items-center text-gray-700 pt-1 border-t border-gray-200/60">
                      <span>Beschikbare pot:</span>
                      <strong className="text-gray-950 font-black">{formatCurrency(etf.availablePot)}</strong>
                    </div>
                  </div>

                  {/* MACD Technische Status */}
                  <div className="p-3 bg-slate-50/80 rounded-2xl border border-gray-200 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                      MACD (30, 90, 9 EMA)
                    </span>
                    <div className="flex justify-between items-center text-gray-700">
                      <span>MACD / Signal:</span>
                      <strong className="font-bold text-gray-900">{etf.macd} / {etf.signal}</strong>
                    </div>
                    <div className="flex justify-between items-center text-gray-700">
                      <span>Histogram:</span>
                      <strong className={`font-black ${etf.hist >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {etf.hist >= 0 ? `+${etf.hist}` : etf.hist}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center text-gray-700 pt-1 border-t border-gray-200/60">
                      <span>Trend:</span>
                      <strong className={isBullish ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                        {isBullish ? 'Bullish (MACD > Sig)' : 'Bearish / Dip'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Werkelijke Portefeuille Status */}
                <div className="p-3 bg-white rounded-2xl border border-gray-200 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
                      <i className="ph-fill ph-wallet"></i>
                    </span>
                    <div>
                      <span className="text-gray-400 text-[10px] block">In je portefeuille:</span>
                      <strong className="text-gray-900 font-bold">
                        {etf.actualPortfolio.quantity} stuks
                      </strong>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-400 text-[10px] block">Positiewaarde:</span>
                    <strong className="text-gray-950 font-black privacy-blur">
                      {isIncognito ? '€ ••••••' : formatCurrency(etf.actualPortfolio.currentValue)}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. STRATEGIE INSTELLINGEN MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-200 space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-extrabold text-base text-gray-900 flex items-center gap-2">
                <i className="ph-fill ph-sliders text-emerald-600 text-xl"></i>
                ETF Strategie Instellingen
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Maandelijks ETF Budget (€)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">€</span>
                  <input
                    type="number"
                    value={monthlyBudgetInput}
                    onChange={(e) => setMonthlyBudgetInput(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-xl font-bold text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="450"
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Wordt verdeeld als: VGWL (70% = €{(parseFloat(monthlyBudgetInput || 0) * 0.70).toFixed(2)}), VUSA (12% = €{(parseFloat(monthlyBudgetInput || 0) * 0.12).toFixed(2)}), VGWD (10% = €{(parseFloat(monthlyBudgetInput || 0) * 0.10).toFixed(2)}), SPYM (8% = €{(parseFloat(monthlyBudgetInput || 0) * 0.08).toFixed(2)}).
                </p>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Startbedrag Pot (€ per ETF)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">€</span>
                  <input
                    type="number"
                    value={initialPotInput}
                    onChange={(e) => setInitialPotInput(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-xl font-bold text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="0"
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Optioneel startkapitaal per ETF bij het begin van de strategie.
                </p>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Startdatum Live DCA Tracking
                </label>
                <input
                  type="date"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-bold text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Signalen en aankopen vanaf deze datum worden opgenomen en gekoppeld.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-gray-200 text-[11px] text-gray-600">
                <strong>Vaste Parameters conform Arne Buy & Hold Model:</strong>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  <li>Fast EMA: 30 • Slow EMA: 90 • Signal EMA: 9</li>
                  <li>Pot accumuleert dagelijks (€{((parseFloat(monthlyBudgetInput || 450)) / 30).toFixed(2)}/dag)</li>
                  <li>Puur kooporders (100% buy & hold DCA, 0 verkopen)</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-3 py-2 text-gray-500 hover:text-gray-900 text-xs font-semibold"
              >
                Standaard Herstellen
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-3 py-2 text-gray-600 hover:text-gray-900 text-xs font-semibold"
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  onClick={handleApplySettings}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-md"
                >
                  Toepassen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default EtfStrategyAdvisor;

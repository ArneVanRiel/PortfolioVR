import React, { useState, useMemo } from 'react';

/**
 * StockStrategyTimeline
 * 
 * Tijdlijn & Historie van Concrete Acties voor Losse Aandelen.
 * Koppelt algoritmische koopsignalen (MACD) strikt aan werkelijke aankopen conform de regels:
 * 1. Slechts 1 aankoop per signaal (1-op-1 matching)
 * 2. Alleen gekoppeld als er VÓÓR de aankoop nog geen nieuwe kwartaalcijfers (report_date) zijn
 *    en geen nieuwer koopsignaal voor dat aandeel is geweest.
 * 3. Exacte prijsvergelijking: toont aankoopprijs t.o.v. signaalprijs in € en %.
 */
const StockStrategyTimeline = ({
  timeline = [],
  summary = {},
  formatCurrency = (v) => `€ ${Number(v || 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}) => {
  const [filterType, setFilterType] = useState('ALL'); // 'ALL' | 'MATCHED' | 'OPEN' | 'EXPIRED' | 'MANUAL_BUY' | 'SELL'
  const [selectedTicker, setSelectedTicker] = useState('ALL');
  const [comparisonFilter, setComparisonFilter] = useState('ALL'); // 'ALL' | 'CHEAPER' | 'HIGHER'
  const [sortOrder, setSortOrder] = useState('DESC'); // 'DESC' (nieuwste eerst) | 'ASC'
  const [showInfoBanner, setShowInfoBanner] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Unieke tickers in de tijdlijn voor de dropdown
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

    // Filter op Ticker
    if (selectedTicker !== 'ALL') {
      items = items.filter(item => item.ticker === selectedTicker);
    }

    // Zoekbalk filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(item => 
        (item.ticker && item.ticker.toLowerCase().includes(q)) ||
        (item.name && item.name.toLowerCase().includes(q))
      );
    }

    // Filter op Status/Type
    if (filterType === 'MATCHED') {
      items = items.filter(item => item.status === 'EXECUTED');
    } else if (filterType === 'OPEN') {
      items = items.filter(item => item.status === 'OPEN_OPPORTUNITY');
    } else if (filterType === 'SUPERVISION') {
      items = items.filter(item => item.status === 'UNDER_SUPERVISION');
    } else if (filterType === 'EXPIRED') {
      items = items.filter(item => item.status === 'EXPIRED');
    } else if (filterType === 'MANUAL_BUY') {
      items = items.filter(item => item.status === 'MANUAL_BUY');
    } else if (filterType === 'SELL') {
      items = items.filter(item => item.status === 'MANUAL_SELL' || item.status === 'EXECUTED_SELL' || item.status === 'OPEN_SELL_ORDER');
    }

    // Filter op Prijsvergelijking (enkel voor gekoppelde aankopen)
    if (filterType === 'MATCHED' && comparisonFilter !== 'ALL') {
      if (comparisonFilter === 'CHEAPER') {
        items = items.filter(item => item.isCheaper);
      } else if (comparisonFilter === 'HIGHER') {
        items = items.filter(item => !item.isCheaper);
      }
    }

    // Sortering
    items.sort((a, b) => {
      const timeA = a.timestamp || new Date(a.date).getTime();
      const timeB = b.timestamp || new Date(b.date).getTime();
      return sortOrder === 'DESC' ? timeB - timeA : timeA - timeB;
    });

    return items;
  }, [timeline, filterType, selectedTicker, searchQuery, comparisonFilter, sortOrder]);

  const matchedCount = summary.totalMatchedBuys || 0;
  const cheaperCount = summary.cheaperCount || 0;
  const higherCount = summary.higherCount || 0;
  const avgDiff = summary.avgPriceDiffPct || 0;

  return (
    <div className="space-y-2.5 sm:space-y-6">
      {/* 1. HOOFD STATISTIEKEN BANNER - Enkel op desktop/tablet (op mobiel verborgen wegens redundantie met filtertabs) */}
      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Kaart 1: Gekoppelde Aankopen */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-emerald-200 shadow-xs flex flex-col justify-between min-h-[90px] sm:min-h-auto">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-emerald-800 uppercase tracking-wider">Gekoppeld</span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs sm:text-base">
              <i className="ph-bold ph-check-circle"></i>
            </div>
          </div>
          <div className="mt-1.5 sm:mt-3">
            <div className="text-lg sm:text-2xl font-black text-gray-900">{matchedCount} orders</div>
            <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5 sm:mt-1 flex-wrap">
              <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded-md">
                {cheaperCount} voordelig
              </span>
              <span className="text-[10px] text-gray-500 hidden sm:inline">({higherCount} hoger)</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-emerald-100 text-[11px] text-gray-600 hidden sm:block">
            Gem. afwijking: <strong className={avgDiff <= 0 ? 'text-emerald-700' : 'text-amber-700'}>{avgDiff > 0 ? '+' : ''}{avgDiff}%</strong> t.o.v. signaal
          </div>
        </div>

        {/* Kaart 2: Echte Valide Koopkansen */}
        <div className="bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-emerald-300 shadow-xs flex flex-col justify-between min-h-[90px] sm:min-h-auto">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-emerald-800 uppercase tracking-wider">🟢 Valide Koop</span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs sm:text-base">
              <i className="ph-bold ph-shopping-cart-simple"></i>
            </div>
          </div>
          <div className="mt-1.5 sm:mt-3">
            <div className="text-lg sm:text-2xl font-black text-emerald-900">{summary.totalOpenSignals || 0} kansen</div>
            <p className="text-[10px] sm:text-[11px] text-emerald-700 mt-0.5 sm:mt-1 font-semibold truncate">
              Voldoet aan 5/5 criteria
            </p>
          </div>
          <div className="mt-2 pt-2 border-t border-emerald-100 text-[11px] text-gray-500 hidden sm:block">
            Niet overgewaardeerd & stabiele/stijgende WV
          </div>
        </div>

        {/* Kaart 3: Onder Toezicht (Geen Aankoop in Strategie) */}
        <div className="bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-amber-300 shadow-xs flex flex-col justify-between min-h-[90px] sm:min-h-auto">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-amber-900 uppercase tracking-wider">⚠️ Toezicht</span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 text-xs sm:text-base">
              <i className="ph-bold ph-warning"></i>
            </div>
          </div>
          <div className="mt-1.5 sm:mt-3">
            <div className="text-lg sm:text-2xl font-black text-amber-950">{summary.totalUnderSupervision || 0} signalen</div>
            <p className="text-[10px] sm:text-[11px] text-amber-800 mt-0.5 sm:mt-1 font-semibold truncate">
              Conform backtest geremd
            </p>
          </div>
          <div className="mt-2 pt-2 border-t border-amber-100 text-[11px] text-gray-500 hidden sm:block">
            Overgewaardeerd (&gt;1.3x) of dalende WV
          </div>
        </div>

        {/* Kaart 4: Verlopen & Overige Transacties */}
        <div className="bg-gradient-to-br from-gray-500/10 via-gray-500/5 to-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-gray-200 shadow-xs flex flex-col justify-between min-h-[90px] sm:min-h-auto">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-gray-600 uppercase tracking-wider">Verlopen</span>
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 text-xs sm:text-base">
              <i className="ph-bold ph-calendar-x"></i>
            </div>
          </div>
          <div className="mt-1.5 sm:mt-3">
            <div className="text-lg sm:text-2xl font-black text-gray-900">{summary.totalExpiredSignals || 0} verlopen</div>
            <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-gray-600 flex-wrap">
              <span>{summary.totalManualBuys || 0} handmatig</span>
              <span>•</span>
              <span className="text-rose-600 font-bold">{summary.totalSells || 0} verkopen</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-500 hidden sm:block">
            Niet aangekocht binnen venster
          </div>
        </div>
      </div>

      {/* 2. UITLEG OVER DE STRIKTE KOPPELINGSREGELS - Enkel op desktop */}
      <div className="hidden sm:block bg-gradient-to-r from-indigo-50/70 via-blue-50/50 to-white rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border border-indigo-200/80 shadow-2xs">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowInfoBanner(!showInfoBanner)}>
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <i className="ph-fill ph-shield-check text-sm sm:text-base"></i>
            </div>
            <div>
              <div className="text-[11px] sm:text-xs font-black text-indigo-950">
                Strikte Koppelingsgarantie: Signalen & Aankopen
              </div>
              <div className="text-[10px] sm:text-[11px] text-indigo-700 hidden sm:block">
                1 aankoop per signaal • Geen tussenliggende kwartaalcijfers • Geen nieuwer koopsignaal
              </div>
            </div>
          </div>
          <button className="text-[11px] sm:text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 shrink-0">
            {showInfoBanner ? 'Inklappen' : 'Lees Uitleg'}
            <i className={`ph-bold ${showInfoBanner ? 'ph-caret-up' : 'ph-caret-down'}`}></i>
          </button>
        </div>

        {showInfoBanner && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-indigo-100 text-xs text-gray-700 animate-fade-in">
            <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-1">
              <span className="font-bold text-indigo-900 block">1. Maximaal 1 aankoop per signaal</span>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Het is de bedoeling dat je exact 1 keer koopt per signaal. Zodra de eerste aankoop binnen het geldige venster is geregistreerd, is het signaal uitgevoerd. Latere extra aankopen worden apart aangeduid als handmatig/bijkomend.
              </p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-1">
              <span className="font-bold text-indigo-900 block">2. Geen nieuwere kwartaalcijfers</span>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Een aankoop kan alleen aan het signaal gekoppeld worden als er sinds het signaal nog géén nieuwe kwartaalcijfers zijn gepubliceerd (op de werkelijke <code>report_date</code>). Nieuwe cijfers resetten het fundament.
              </p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-1">
              <span className="font-bold text-indigo-900 block">3. Geen nieuwer koopsignaal</span>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Als er een nieuwer MACD koopsignaal voor dat aandeel verschijnt voordat je hebt gekocht, vervalt het oude signaal. Een latere aankoop koppelt dan exclusief aan het allernieuwste signaal.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. FILTER BAR VOOR TIJDLIJN */}
      <div className="bg-white p-2 sm:p-4 rounded-xl sm:rounded-3xl border border-gray-200 shadow-xs space-y-1.5 sm:space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2.5">
          {/* Status Tabs: Horizontaal scrollbaar op mobiel */}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-gray-100 p-0.5 sm:p-1 rounded-xl sm:rounded-2xl text-xs font-bold overflow-x-auto no-scrollbar w-full sm:w-auto">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-all whitespace-nowrap shrink-0 ${
                filterType === 'ALL' ? 'bg-white text-indigo-800 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Alles ({timeline.length})
            </button>
            <button
              onClick={() => setFilterType('MATCHED')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-all flex items-center gap-1 whitespace-nowrap shrink-0 ${
                filterType === 'MATCHED' ? 'bg-white text-emerald-800 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>🟢 Uitgevoerd ({summary.totalMatchedBuys || 0})</span>
            </button>
            <button
              onClick={() => setFilterType('OPEN')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-all flex items-center gap-1 whitespace-nowrap shrink-0 ${
                filterType === 'OPEN' ? 'bg-white text-emerald-800 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>🟢 Valide Koop ({summary.totalOpenSignals || 0})</span>
            </button>
            <button
              onClick={() => setFilterType('SUPERVISION')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-all flex items-center gap-1 whitespace-nowrap shrink-0 ${
                filterType === 'SUPERVISION' ? 'bg-white text-amber-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>⚠️ Toezicht ({summary.totalUnderSupervision || 0})</span>
            </button>
            <button
              onClick={() => setFilterType('EXPIRED')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-all flex items-center gap-1 whitespace-nowrap shrink-0 ${
                filterType === 'EXPIRED' ? 'bg-white text-gray-800 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>⚪ Verlopen ({summary.totalExpiredSignals || 0})</span>
            </button>
            <button
              onClick={() => setFilterType('MANUAL_BUY')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-all flex items-center gap-1 whitespace-nowrap shrink-0 ${
                filterType === 'MANUAL_BUY' ? 'bg-white text-purple-800 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>👤 Handmatig ({summary.totalManualBuys || 0})</span>
            </button>
            <button
              onClick={() => setFilterType('SELL')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition-all flex items-center gap-1 whitespace-nowrap shrink-0 ${
                filterType === 'SELL' ? 'bg-white text-rose-800 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>🔴 Verkopen ({summary.totalSells || 0})</span>
            </button>
          </div>

          {/* Sortering & Aantal */}
          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
            <button
              onClick={() => setSortOrder(sortOrder === 'DESC' ? 'ASC' : 'DESC')}
              className="px-2 py-0.5 sm:px-2.5 sm:py-1 text-xs font-bold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg sm:rounded-xl transition-all flex items-center gap-1"
            >
              <i className={`ph-bold ${sortOrder === 'DESC' ? 'ph-sort-descending' : 'ph-sort-ascending'}`}></i>
              <span>{sortOrder === 'DESC' ? 'Nieuwste' : 'Oudste'}</span>
            </button>

            <div className="text-[11px] sm:text-xs text-gray-400 font-medium">
              <strong>{filteredTimeline.length}</strong> acties
            </div>
          </div>
        </div>

        {/* Tweede rij: Zoeken en Ticker Dropdown */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-3 pt-1.5 sm:pt-2 border-t border-gray-100">
          <div className="flex items-center gap-1.5 w-full sm:w-auto flex-1">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-56 sm:flex-initial">
              <i className="ph ph-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Zoek ticker..."
                className="w-full pl-7 pr-3 py-1 text-xs bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:border-indigo-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <i className="ph-bold ph-x text-xs"></i>
                </button>
              )}
            </div>

            {/* Ticker Dropdown */}
            <div className="flex items-center gap-1 text-xs shrink-0">
              <select
                value={selectedTicker}
                onChange={(e) => setSelectedTicker(e.target.value)}
                className="py-1 px-2 text-xs bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl font-bold text-gray-800 focus:outline-none focus:border-indigo-500 max-w-[130px] sm:max-w-none"
              >
                <option value="ALL">Alle ({uniqueTickers.length})</option>
                {uniqueTickers.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
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
                Alles ({matchedCount})
              </button>
              <button
                onClick={() => setComparisonFilter('CHEAPER')}
                className={`px-2 py-0.5 rounded-lg transition-all ${
                  comparisonFilter === 'CHEAPER' ? 'bg-white text-emerald-900 shadow-2xs font-black' : 'text-emerald-700 hover:text-emerald-900'
                }`}
              >
                🟢 Voordeliger ({cheaperCount})
              </button>
              <button
                onClick={() => setComparisonFilter('HIGHER')}
                className={`px-2 py-0.5 rounded-lg transition-all ${
                  comparisonFilter === 'HIGHER' ? 'bg-white text-amber-900 shadow-2xs font-black' : 'text-amber-700 hover:text-amber-900'
                }`}
              >
                🟠 Boven signaal ({higherCount})
              </button>
            </div>
          )}

          <div className="text-xs text-gray-400 font-medium ml-auto">
            Getoond: <strong>{filteredTimeline.length}</strong> van {timeline.length} acties
          </div>
        </div>
      </div>

      {/* 4. TIJDLIJN LIJST */}
      {filteredTimeline.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-3xl border border-gray-200 space-y-2">
          <i className="ph-bold ph-calendar-blank text-3xl text-gray-400"></i>
          <div className="text-sm font-bold text-gray-700">Geen acties gevonden voor deze selectie</div>
          <p className="text-xs text-gray-400">
            Pas het filter of de zoekopdracht aan om meer historische signalen en aankopen te zien.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTimeline.map((item, idx) => {
            const isMatched = item.status === 'EXECUTED';
            const isOpen = item.status === 'OPEN_OPPORTUNITY';
            const isSupervision = item.status === 'UNDER_SUPERVISION';
            const isExpired = item.status === 'EXPIRED';
            const isManualBuy = item.status === 'MANUAL_BUY';
            const isSell = item.status === 'MANUAL_SELL' || item.status === 'EXECUTED_SELL' || item.status === 'OPEN_SELL_ORDER';

            // Kleurthema per status
            let cardBg = 'bg-white border-gray-200 hover:border-gray-300';
            let dateBg = 'bg-gray-100 text-gray-700';
            if (isMatched) {
              cardBg = item.isCheaper ? 'bg-emerald-50/20 border-emerald-300 shadow-2xs' : 'bg-amber-50/15 border-amber-300 shadow-2xs';
              dateBg = item.isCheaper ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900';
            } else if (isOpen) {
              cardBg = 'bg-emerald-50/25 border-emerald-300 shadow-2xs';
              dateBg = 'bg-emerald-100 text-emerald-900';
            } else if (isSupervision) {
              cardBg = 'bg-amber-50/30 border-amber-300 shadow-2xs';
              dateBg = 'bg-amber-100 text-amber-950';
            } else if (isExpired) {
              cardBg = 'bg-gray-50/60 border-gray-200 opacity-90';
              dateBg = 'bg-gray-200/80 text-gray-600';
            } else if (isManualBuy) {
              cardBg = 'bg-purple-50/15 border-purple-200';
              dateBg = 'bg-purple-100 text-purple-900';
            } else if (isSell) {
              cardBg = 'bg-rose-50/20 border-rose-300';
              dateBg = 'bg-rose-100 text-rose-900';
            }

            const eventDate = new Date(item.date);

            return (
              <div
                key={item.id || idx}
                className={`rounded-xl sm:rounded-2xl p-3 sm:p-4 border transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-4 ${cardBg}`}
              >
                {/* Linkerzijde: Datum, Ticker, Status Badge */}
                <div className="flex items-start sm:items-center gap-2.5 sm:gap-3.5">
                  {/* Datum Box */}
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center font-bold text-center shrink-0 shadow-2xs ${dateBg}`}>
                    <span className="text-[9px] uppercase tracking-wider leading-tight">
                      {eventDate.toLocaleDateString('nl-BE', { month: 'short' })}
                    </span>
                    <span className="text-sm sm:text-base font-black leading-none my-0.5">
                      {eventDate.getDate()}
                    </span>
                    <span className="text-[8px] sm:text-[9px] text-gray-500 font-medium leading-tight">
                      {eventDate.getFullYear()}
                    </span>
                  </div>

                  {/* Ticker & Identificatie */}
                  <div className="space-y-0.5 sm:space-y-1">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <span className="text-base sm:text-lg font-black text-gray-900 tracking-tight">{item.ticker}</span>
                      
                      {/* Status Badge */}
                      <span className={`text-[10px] font-black px-2 sm:px-2.5 py-0.5 rounded-full border ${
                        isMatched
                          ? (item.isCheaper ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-amber-100 text-amber-900 border-amber-300')
                          : isOpen
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300 animate-pulse'
                          : isSupervision
                          ? 'bg-amber-100 text-amber-950 border-amber-300'
                          : isExpired
                          ? 'bg-gray-100 text-gray-700 border-gray-300'
                          : isManualBuy
                          ? 'bg-purple-100 text-purple-900 border-purple-300'
                          : 'bg-rose-100 text-rose-900 border-rose-300'
                      }`}>
                        {item.statusBadge}
                      </span>

                      {item.score && (
                        <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-1.5 sm:px-2 py-0.5 rounded-md">
                          Score {item.score}/5
                        </span>
                      )}

                      {item.waardeVerdeling > 0 && (
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 sm:px-2 py-0.5 rounded-md">
                          WV {Number(item.waardeVerdeling).toFixed(1)}%
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-gray-500 font-medium truncate max-w-[220px] sm:max-w-[280px]">
                      {item.name}
                    </div>

                    {/* Metadata regel */}
                    <div className="text-[10px] sm:text-[11px] text-gray-500 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      {isMatched && (
                        <>
                          <span>Signaal: <strong>{new Date(item.date).toLocaleDateString('nl-BE')}</strong></span>
                          <span>•</span>
                          <span>Aankoop: <strong>{new Date(item.executionDate).toLocaleDateString('nl-BE')}</strong></span>
                          <span className="text-emerald-700 font-bold bg-emerald-100/60 px-1.5 py-0.2 rounded">
                            {item.daysBetweenSignalAndBuy === 0 ? 'Zelfde dag gekocht' : `Na ${item.daysBetweenSignalAndBuy} ${item.daysBetweenSignalAndBuy === 1 ? 'dag' : 'dagen'} gekocht`}
                          </span>
                        </>
                      )}

                      {isOpen && (
                        <>
                          <span>Signaaldatum: <strong>{new Date(item.date).toLocaleDateString('nl-BE')}</strong></span>
                          <span>•</span>
                          <span className="text-emerald-700 font-bold">
                            Actieve Koopkans (Conform Strategie)
                          </span>
                        </>
                      )}

                      {isSupervision && (
                        <>
                          <span>Signaaldatum: <strong>{new Date(item.date).toLocaleDateString('nl-BE')}</strong></span>
                          <span>•</span>
                          <span className="text-amber-800 font-bold">
                            {item.cautionReason || 'Overgeslagen conform backtest-strategie'}
                          </span>
                        </>
                      )}

                      {isExpired && (
                        <>
                          <span>Signaaldatum: <strong>{new Date(item.date).toLocaleDateString('nl-BE')}</strong></span>
                          <span>•</span>
                          <span className="text-gray-500 italic">
                            {item.expireReason}
                          </span>
                        </>
                      )}

                      {isManualBuy && (
                        <>
                          <span>Transactiedatum: <strong>{new Date(item.date).toLocaleDateString('nl-BE')}</strong></span>
                          <span>•</span>
                          <span className="text-purple-700 font-medium">{item.note}</span>
                        </>
                      )}

                      {isSell && (
                        <>
                          <span>Datum: <strong>{new Date(item.date).toLocaleDateString('nl-BE')}</strong></span>
                          <span>•</span>
                          <span className="text-rose-700 font-medium">{item.note}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Midden / Vergelijkingssectie (VOORAL VOOR GEKOPPELDE AANKOPEN) */}
                <div className="flex-1 max-w-[480px] px-0 sm:px-2 py-0.5 sm:py-1">
                  {isMatched && (
                    <div className={`p-2.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                      item.isCheaper ? 'bg-emerald-100/40 border-emerald-200' : 'bg-amber-100/40 border-amber-200'
                    }`}>
                      {/* Prijsvergelijking Details */}
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500">Signaalprijs:</span>
                          <strong className="text-gray-900 font-bold">{formatCurrency(item.signalPrice)}</strong>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500">Jouw Aankoopprijs:</span>
                          <strong className="text-gray-900 font-black">{formatCurrency(item.actualPrice)}</strong>
                        </div>
                      </div>

                      {/* Prijsverschil Badge */}
                      <div className="text-right sm:text-right shrink-0">
                        <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-black text-xs border ${
                          item.isCheaper 
                            ? 'bg-emerald-500 text-white border-emerald-600'
                            : 'bg-amber-500 text-white border-amber-600'
                        }`}>
                          <i className={`ph-bold ${item.isCheaper ? 'ph-trend-down' : 'ph-trend-up'}`}></i>
                          <span>
                            {item.isCheaper ? '-' : '+'}{formatCurrency(Math.abs(item.priceDiff))} ({item.priceDiffPct > 0 ? '+' : ''}{item.priceDiffPct.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5 font-medium">
                          {item.comparisonDetail}
                        </div>
                      </div>
                    </div>
                  )}

                  {isOpen && (
                    <div className={`p-2.5 rounded-xl space-y-1.5 border ${
                      item.isTargetReached ? 'bg-indigo-50/70 border-indigo-200' : 'bg-emerald-50/80 border-emerald-300'
                    }`}>
                      <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                        <span className="text-gray-700">Signaalprijs: <strong>{formatCurrency(item.signalPrice)}</strong></span>
                        <span className={`font-bold px-2 py-0.5 rounded-md border text-[10px] ${
                          item.isTargetReached 
                            ? 'bg-indigo-100 text-indigo-900 border-indigo-200' 
                            : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        }`}>
                          {item.isTargetReached ? '🎯 Streefdoel Reeds Bereikt' : '🟢 Actieve Koopkans'}
                        </span>
                      </div>
                      {item.isTargetReached ? (
                        <div className="text-[11px] text-indigo-900 font-medium leading-tight">
                          Je bezit momenteel al {formatCurrency(item.currentOwnedEur)} ({item.currentOwnedShares || 0} stuks) aan {item.ticker}. Conform het allocatiemodel is momenteel geen extra aankoop vereist.
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-[11px] font-bold text-emerald-950 bg-white/90 p-1.5 rounded-lg border border-emerald-200 shadow-2xs">
                          <span>Advies: <strong>KOOP {item.shares} stuks</strong></span>
                          <span>Budget: <strong>{formatCurrency(item.totalAmount)}</strong></span>
                        </div>
                      )}
                      {item.fundingSource?.message && !item.isTargetReached && (
                        <div className="text-[10px] text-emerald-800 font-medium">
                          {item.fundingSource.message}
                        </div>
                      )}
                    </div>
                  )}

                  {isSupervision && (
                    <div className="bg-amber-100/60 border border-amber-200 p-2.5 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-700">Signaalprijs was: <strong>{formatCurrency(item.signalPrice)}</strong></span>
                        <span className="text-amber-900 font-bold bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200">
                          🛑 Geen Koopkans
                        </span>
                      </div>
                      <div className="text-[11px] text-amber-900 font-medium">
                        {item.cautionReason || 'Conform de backtest-strategie wordt dit aandeel niet gekocht wegens overwaardering of dalende waardeverdeling.'}
                      </div>
                    </div>
                  )}

                  {isExpired && (
                    <div className="bg-gray-100/70 border border-gray-200 p-2 rounded-xl text-xs space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Signaalprijs was: <strong>{formatCurrency(item.signalPrice)}</strong></span>
                        <span className="text-gray-500 text-[10px] font-bold">Niet Aangekocht</span>
                      </div>
                      <div className="text-[10px] text-gray-500">
                        Venster gesloten op {item.windowEndDate ? new Date(item.windowEndDate).toLocaleDateString('nl-BE') : 'kwartaalcijfers'}: {item.expireReason}
                      </div>
                    </div>
                  )}

                  {isManualBuy && (
                    <div className="bg-purple-50 border border-purple-100 p-2 rounded-xl text-xs text-purple-900 font-medium">
                      Aankoop buiten een actief MACD-signaalvenster of bijkomende extra aankoop na signaal.
                    </div>
                  )}

                  {isSell && (
                    <div className="bg-rose-50 border border-rose-100 p-2 rounded-xl text-xs text-rose-900 font-medium">
                      Verkooptransactie ter bescherming van kapitaal of winstname conform strategie.
                    </div>
                  )}
                </div>

                {/* Rechterzijde: Aantal stuks & Totaalbedrag */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center text-right shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 min-w-[130px]">
                  {isSupervision ? (
                    <div>
                      <span className="text-[10px] text-amber-800 font-bold uppercase block">
                        Strategie Status
                      </span>
                      <span className="text-xs font-black text-amber-900 bg-amber-100 px-2.5 py-1 rounded-xl border border-amber-200 inline-block mt-1">
                        Overgeslagen
                      </span>
                    </div>
                  ) : isOpen && item.isTargetReached ? (
                    <div>
                      <span className="text-[10px] text-indigo-700 font-bold uppercase block">
                        Portefeuille Doel
                      </span>
                      <span className="text-xs font-black text-indigo-900 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg inline-block mt-1">
                        🎯 Reeds Bereikt
                      </span>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        Geen extra aankoop
                      </div>
                    </div>
                  ) : isOpen ? (
                    <div>
                      <span className="text-[10px] text-emerald-800 font-black uppercase tracking-wider block">
                        Aan te kopen
                      </span>
                      <div className="text-sm font-black text-emerald-700">
                        KOOP {Number(item.shares).toLocaleString('nl-BE', { maximumFractionDigits: 2 })} stuks
                      </div>
                      <div className="text-xs font-black text-gray-900 privacy-blur mt-0.5">
                        {formatCurrency(item.totalAmount)}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <span className="text-[10px] text-gray-400 font-bold uppercase block">
                          {isSell ? 'Aantal Verkocht' : 'Aantal Stuks'}
                        </span>
                        <div className="text-sm font-black text-gray-900">
                          {item.shares ? `${Number(item.shares).toLocaleString('nl-BE', { maximumFractionDigits: 4 })} stuks` : '-'}
                        </div>
                      </div>

                      {item.totalAmount > 0 && (
                        <div className="mt-1">
                          <span className="text-[10px] text-gray-400 font-bold uppercase block">
                            Totaalbedrag
                          </span>
                          <div className="text-xs font-black text-gray-900">
                            {formatCurrency(item.totalAmount)}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StockStrategyTimeline;

import React, { useState, useEffect } from 'react';
import http from '../../http-common';
import toast from 'react-hot-toast';

const StockScreenerTab = () => {
  const [tickerInput, setTickerInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [presets, setPresets] = useState([]);
  const [activeFilter, setActiveFilter] = useState('ALL'); // ALL, TOP, POTENTIAL, REJECTED
  const [viewMode, setViewMode] = useState('COLUMNS'); // 'COLUMNS' (3-Kolommen) of 'TABLE' (Tabel)
  const [selectedStockDetail, setSelectedStockDetail] = useState(null);
  const [importingTicker, setImportingTicker] = useState(null);

  // Historie modal & batch herberekening state
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [detailTab, setDetailTab] = useState('CURRENT'); // 'CURRENT' | 'HISTORY'

  // Aandelen Selector Modal State
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [allAvailableStocks, setAllAvailableStocks] = useState([]);
  const [loadingAvailableStocks, setLoadingAvailableStocks] = useState(false);
  const [pickerSearchQuery, setPickerSearchQuery] = useState('');
  const [selectedPickerTickers, setSelectedPickerTickers] = useState([]);
  const [onlyNotInDb, setOnlyNotInDb] = useState(false);
  const [onlyUnscreened, setOnlyUnscreened] = useState(false);
  const [hideErrors, setHideErrors] = useState(true);
  const [sortBy, setSortBy] = useState('SIZE'); // 'SIZE', 'TICKER', 'NAME'
  const [tableSortBy, setTableSortBy] = useState('WAARDEVERDELING'); // 'WAARDEVERDELING', 'SCORE', 'FCF_GROWTH', 'ROE', 'TICKER'

  // Batch voortgang
  const [batchProgress, setBatchProgress] = useState(null);

  // Initialisatie: Ophalen presets & bewaarde screener-historie uit DB
  useEffect(() => {
    const initData = async () => {
      try {
        const [presetRes, cachedRes] = await Promise.all([
          http.get('/screener/presets').catch(() => ({ data: { presets: [] } })),
          http.get('/screener/cached-results').catch(() => ({ data: { results: [] } }))
        ]);

        if (presetRes.data && presetRes.data.presets) {
          setPresets(presetRes.data.presets);
        }

        if (cachedRes.data && cachedRes.data.results && cachedRes.data.results.length > 0) {
          setResults(cachedRes.data.results);
        }
      } catch (err) {
        console.error('Fout bij initialiseren screener:', err);
      }
    };
    initData();
  }, []);

  // Detail Modal openen & live historische kwartaalberekeningen ophalen
  const handleOpenStockDetail = async (stock) => {
    setSelectedStockDetail(stock);
    setDetailTab('CURRENT');
    setHistoryData([]);
    setLoadingHistory(true);
    try {
      const res = await http.get(`/screener/history/${stock.ticker}`);
      if (res.data && res.data.history) {
        setHistoryData(res.data.history);
      }
    } catch (err) {
      console.error('Fout bij ophalen historie:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Volledige historie herberekenen voor alle DB aandelen
  const handleRecalculateAllDbHistory = async () => {
    setLoading(true);
    toast.loading('Volledige kwartaalgeschiedenis voor alle database aandelen berekenen...', { id: 'recalcToast' });
    try {
      const res = await http.post('/screener/recalculate-all-history');
      if (res.data && res.data.success) {
        toast.success(res.data.message, { id: 'recalcToast' });
        const cachedRes = await http.get('/screener/cached-results');
        if (cachedRes.data && cachedRes.data.results) {
          setResults(cachedRes.data.results);
        }
      }
    } catch (err) {
      console.error('Fout bij herberekenen:', err);
      toast.error('Fout bij herberekenen van historie.', { id: 'recalcToast' });
    } finally {
      setLoading(false);
    }
  };

  // Modal openen & alle beschikbare aandelen eenmalig inladen
  const handleOpenPickerModal = async () => {
    setShowPickerModal(true);
    if (allAvailableStocks.length === 0) {
      setLoadingAvailableStocks(true);
      try {
        const response = await http.get('/screener/all-stocks');
        if (response.data && response.data.stocks) {
          setAllAvailableStocks(response.data.stocks);
        }
      } catch (err) {
        console.error('Fout bij ophalen alle aandelen:', err);
        toast.error('Kon aandelenlijst niet laden.');
      } finally {
        setLoadingAvailableStocks(false);
      }
    }
  };

  // Uitvoeren van screening (met automatische batch-verwerking & DB opslag)
  const handleScreen = async (tickersToScreen) => {
    let tickersArray = [];
    if (Array.isArray(tickersToScreen)) {
      tickersArray = tickersToScreen;
    } else {
      if (!tickerInput.trim()) {
        toast.error('Voer minimaal één ticker in of kies een categorie.');
        return;
      }
      tickersArray = tickerInput
        .split(/[\s,]+/)
        .map(t => t.trim().toUpperCase())
        .filter(Boolean);
    }

    if (tickersArray.length === 0) return;

    setLoading(true);
    const BATCH_SIZE = 25;
    const totalBatches = Math.ceil(tickersArray.length / BATCH_SIZE);
    
    // Behoud al bestaande resultaten en voeg nieuwe toe/update
    let currentMap = new Map(results.map(item => [item.ticker, item]));

    toast.loading(`Screenen van ${tickersArray.length} aandelen gestart...`, { id: 'screeningToast' });

    try {
      for (let i = 0; i < totalBatches; i++) {
        const batchTickers = tickersArray.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        setBatchProgress({ current: i + 1, total: totalBatches, count: tickersArray.length });

        const response = await http.post('/screener/fast-screen', { tickers: batchTickers });
        if (response.data && response.data.results) {
          response.data.results.forEach(res => {
            currentMap.set(res.ticker, res);
          });
          const updatedResultsList = Array.from(currentMap.values());
          setResults(updatedResultsList);

          // Bi-directionele update van allAvailableStocks
          const screenedSet = new Set(updatedResultsList.map(r => r.ticker));
          setAllAvailableStocks(prev => prev.map(s => ({
            ...s,
            isScreened: s.isScreened || screenedSet.has(s.ticker)
          })));
        }
      }
      toast.success(`Screening afgerond en opgeslagen in DB voor ${tickersArray.length} aandelen!`, { id: 'screeningToast' });
    } catch (err) {
      console.error('Fout bij uitvoeren van screening:', err);
      toast.error('Fout bij uitvoeren van de screening.', { id: 'screeningToast' });
    } finally {
      setLoading(false);
      setBatchProgress(null);
    }
  };

  // Automatisch de Markt Screenen (Alle presets achter elkaar)
  const handleScreenAllMarketPresets = async () => {
    const allPresetTickers = [...new Set(presets.flatMap(p => p.tickers))];
    if (allPresetTickers.length === 0) return;
    toast.success(`Markt screening gestart voor ${allPresetTickers.length} top aandelen...`);
    handleScreen(allPresetTickers);
  };

  // Preset aanklikken
  const handlePresetClick = (preset) => {
    setTickerInput(preset.tickers.join(', '));
    handleScreen(preset.tickers);
  };

  // Ticker selecteren in de modal
  const togglePickerTicker = (ticker) => {
    setSelectedPickerTickers(prev =>
      prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker]
    );
  };

  // Alle zichtbare tickers in picker selecteren
  const selectAllVisiblePickerTickers = (visibleStocks) => {
    const visibleTickers = visibleStocks.map(s => s.ticker);
    const allSelected = visibleTickers.every(t => selectedPickerTickers.includes(t));
    if (allSelected) {
      setSelectedPickerTickers(prev => prev.filter(t => !visibleTickers.includes(t)));
    } else {
      setSelectedPickerTickers(prev => [...new Set([...prev, ...visibleTickers])]);
    }
  };

  // Screenen van geselecteerde tickers uit de modal
  const handleScreenSelectedFromPicker = () => {
    if (selectedPickerTickers.length === 0) {
      toast.error('Selecteer minimaal 1 aandeel om te screenen.');
      return;
    }
    setShowPickerModal(false);
    setTickerInput(selectedPickerTickers.join(', '));
    handleScreen(selectedPickerTickers);
  };

  // 1-Klik import functie
  const handleImportFull = async (stock) => {
    const ticker = stock.ticker;
    setImportingTicker(ticker);
    toast.loading(`Volledige import gestart voor ${ticker}...`, { id: `import-${ticker}` });

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${http.defaults.baseURL}/sec/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ ticker })
      });

      if (!response.ok) {
        throw new Error(`Import mislukt: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      await http.get(`/calculations/recalculate-single/${ticker}`).catch(() => {});
      toast.success(`${ticker} succesvol geïmporteerd in de database!`, { id: `import-${ticker}` });
      setResults(prev => prev.map(r => r.ticker === ticker ? { ...r, inDatabase: true } : r));
      setAllAvailableStocks(prev => prev.map(s => s.ticker === ticker ? { ...s, inDatabase: true, isScreened: true } : s));
    } catch (err) {
      console.error(`Fout bij import ${ticker}:`, err);
      toast.error(`Fout bij import van ${ticker}: ${err.message}`, { id: `import-${ticker}` });
    } finally {
      setImportingTicker(null);
    }
  };

  // 1-Klik Import & Toevoegen aan Watchlist of Ideale Portfolio
  const handleImportAndAddToWatchlist = async (stock, target = 'watchlist') => {
    const ticker = stock.ticker;
    setImportingTicker(ticker);
    toast.loading(`Import & toevoegen aan ${target === 'idealePortfolio' ? 'Ideale Portfolio' : 'Watchlist'} gestart voor ${ticker}...`, { id: `watch-${ticker}` });

    try {
      const response = await http.post('/screener/import-and-add-watchlist', { ticker, target });
      if (response.data && response.data.success) {
        toast.success(response.data.message, { id: `watch-${ticker}` });
        setResults(prev => prev.map(r => r.ticker === ticker ? { ...r, inDatabase: true, inWatchlist: target === 'watchlist' } : r));
        setAllAvailableStocks(prev => prev.map(s => s.ticker === ticker ? { ...s, inDatabase: true, isScreened: true } : s));
      }
    } catch (err) {
      console.error(`Fout bij toevoegen ${ticker}:`, err);
      toast.error(`Fout bij toevoegen van ${ticker}: ${err.response?.data?.message || err.message}`, { id: `watch-${ticker}` });
    } finally {
      setImportingTicker(null);
    }
  };

  // Bulk import alle 5/5 aandelen naar database inclusief 10j kwartaalberekeningen & 10j dagkoersen voor Backtest
  const handleBulkImportTopMatchesToWatchlist = async () => {
    const score5List = results.filter(r => r.score === 5);
    if (score5List.length === 0) {
      toast.error('Geen Score 5/5 aandelen in de screener lijst.');
      return;
    }
    toast.loading(`Bezig met importeren van ${score5List.length} Score 5/5 aandelen (inclusief 10j kwartalen & 10j dagkoersen voor backtest)...`, { id: 'bulkWatchlistToast' });
    setLoading(true);

    try {
      const tickers = score5List.map(s => s.ticker);
      const response = await http.post('/screener/import-all-score5', { tickers });
      if (response.data && response.data.success) {
        toast.success(response.data.message || `${response.data.count} Score 5/5 aandelen succesvol gesynchroniseerd!`, { id: 'bulkWatchlistToast' });
        setResults(prev => prev.map(r => tickers.includes(r.ticker) ? { ...r, inDatabase: true, inWatchlist: true } : r));
        setAllAvailableStocks(prev => prev.map(s => tickers.includes(s.ticker) ? { ...s, inDatabase: true, isScreened: true } : s));
      }
    } catch (err) {
      console.error('Fout bij bulk importeren van 5/5 aandelen:', err);
      toast.error(`Fout bij bulk import: ${err.response?.data?.message || err.message}`, { id: 'bulkWatchlistToast' });
    } finally {
      setLoading(false);
    }
  };

  // Gefilterde beschikbare aandelen in picker modal
  const screenedSet = new Set(results.map(r => r.ticker));
  const filteredAvailableStocks = allAvailableStocks.filter(s => {
    const q = pickerSearchQuery.trim().toLowerCase();
    const matchesSearch = !q || s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    const isScreened = s.isScreened || screenedSet.has(s.ticker);
    const matchesUnscreenedFilter = !onlyUnscreened || !isScreened;
    const matchesDbFilter = !onlyNotInDb || !s.inDatabase;
    const matchesErrorFilter = !hideErrors || !s.hasError;
    return matchesSearch && matchesUnscreenedFilter && matchesDbFilter && matchesErrorFilter;
  });

  const sortedAvailableStocks = [...filteredAvailableStocks].sort((a, b) => {
    if (sortBy === 'SIZE') return (a.rank || 99999) - (b.rank || 99999);
    if (sortBy === 'NAME') return a.name.localeCompare(b.name);
    return a.ticker.localeCompare(b.ticker);
  });

  // Filter logica voor resultaten
  const filteredResults = results.filter(r => {
    if (activeFilter === 'TOP') return r.score === 5;
    if (activeFilter === 'POTENTIAL') return r.score >= 3 && r.score < 5;
    if (activeFilter === 'REJECTED') return r.score < 3;
    return true;
  });

  const sortedTableResults = [...filteredResults].sort((a, b) => {
    const ma = a.metrics || {};
    const mb = b.metrics || {};
    if (tableSortBy === 'WAARDEVERDELING') {
      return (mb.waarde_verdeling || -99999) - (ma.waarde_verdeling || -99999);
    }
    if (tableSortBy === 'SCORE') {
      return b.score - a.score;
    }
    if (tableSortBy === 'FCF_GROWTH') {
      return (mb.gem_groeipercentage_FCF || 0) - (ma.gem_groeipercentage_FCF || 0);
    }
    if (tableSortBy === 'ROE') {
      return (mb.gemiddelde_stijging_ROE_10_Y || 0) - (ma.gemiddelde_stijging_ROE_10_Y || 0);
    }
    return a.ticker.localeCompare(b.ticker);
  });

  const topMatchList = results.filter(r => r.score === 5);
  const potentialList = results.filter(r => r.score >= 3 && r.score < 5);
  const rejectedList = results.filter(r => r.score < 3);

  return (
    <div className="space-y-6 font-sans text-gray-900">
      {/* Hero Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-10">
          <i className="ph-fill ph-funnel text-9xl"></i>
        </div>

        <div className="max-w-3xl relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold uppercase tracking-wider">
            <i className="ph-bold ph-lightning"></i> Fast SEC Screener & Database Cache
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Markt Screener Overzicht (3 Kolommen)
          </h2>
          <p className="text-blue-100/80 text-sm sm:text-base leading-relaxed">
            Alle gescreende aandelen worden automatisch onthouden in de database. Bekijk direct welke bedrijven aan jouw 5 selectiecriteria voldoen (Score 5), welke potentieel zijn (3-4), en welke afvallen (0-2).
          </p>
        </div>
      </div>

      {/* Invoerveld, Presets & Controls Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Screen Aandelen of Bekijk Markt
            </label>
            <span className="text-xs text-gray-500">
              Kies een categorie, selecteer aandelen uit de SEC masterlijst of start de automatische marktscreening.
            </span>
          </div>

          <div className="flex flex-wrap gap-2 flex-shrink-0">
            <button
              onClick={handleRecalculateAllDbHistory}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
              title="Berekent de volledige kwartaalgeschiedenis (selectiecriteria & waardeverdeling) voor alle aandelen in je database"
            >
              <i className="ph-bold ph-clock-counter-clockwise text-base"></i>
              <span>⚡ Bereken Geschiedenis (Alle DB Aandelen)</span>
            </button>

            <button
              onClick={handleScreenAllMarketPresets}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <i className="ph-bold ph-planet text-base"></i>
              <span>⚡ Screen Hele Markt Presets</span>
            </button>

            <button
              onClick={handleOpenPickerModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              <i className="ph-bold ph-magnifying-glass-plus text-base"></i>
              <span>Blader door Alle ~10.000 Aandelen</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleScreen()}
            placeholder="Bijv. PLTR, NVDA, AMD, COST, TXN, AVGO, LRCX..."
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
          />
          <button
            onClick={() => handleScreen()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl shadow-md transition-all disabled:opacity-50 text-sm flex-shrink-0"
          >
            {loading ? (
              <>
                <i className="ph-bold ph-spinner animate-spin text-lg"></i>
                <span>Screenen...</span>
              </>
            ) : (
              <>
                <i className="ph-bold ph-funnel text-lg"></i>
                <span>Start Screening</span>
              </>
            )}
          </button>
        </div>

        {/* Voortgang indicator voor batch verwerking */}
        {batchProgress && (
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-800 font-medium animate-pulse">
            <div className="flex items-center gap-2">
              <i className="ph-bold ph-spinner animate-spin text-lg text-blue-600"></i>
              <span>Screening bezig: batch {batchProgress.current} van {batchProgress.total} ({batchProgress.count} aandelen)...</span>
            </div>
            <span className="font-extrabold text-sm">{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
          </div>
        )}

        {/* Snelle Presets */}
        {presets.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">
              Of kies een categorie / index:
            </span>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetClick(preset)}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 text-gray-700 hover:text-blue-700 text-xs font-semibold transition-colors"
                  title={preset.description}
                >
                  <i className="ph-fill ph-list-plus text-blue-500"></i>
                  <span>{preset.name}</span>
                  <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                    {preset.tickers.length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Weergave Modus Schakelaar & Samenvatting */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Weergave:</span>
          <div className="inline-flex rounded-xl bg-gray-100 p-1 border border-gray-200">
            <button
              onClick={() => setViewMode('COLUMNS')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'COLUMNS'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <i className="ph-bold ph-[#ph-columns] ph-columns"></i>
              <span>3 Kolommen Weergave</span>
            </button>
            <button
              onClick={() => setViewMode('TABLE')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'TABLE'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <i className="ph-bold ph-table"></i>
              <span>Tabel Weergave</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
            🟢 Voldoen (5): {topMatchList.length}
          </span>
          <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800">
            🟡 Bijna (3-4): {potentialList.length}
          </span>
          <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-800">
            🔴 Niet (0-2): {rejectedList.length}
          </span>
          <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700">
            Totaal: {results.length}
          </span>
        </div>
      </div>

      {/* 3-KOLOMMEN WEERGAVE (KANBAN / SPLIT VIEW) */}
      {viewMode === 'COLUMNS' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Kolom 1: Voldoen (Score 5/5) */}
          <div className="bg-emerald-50/40 rounded-2xl border border-emerald-200/80 p-4 space-y-4 flex flex-col h-full">
            <div className="flex flex-col gap-2 pb-3 border-b border-emerald-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                  <h3 className="font-extrabold text-emerald-900 text-base">
                    1. Voldoen (Score 5/5)
                  </h3>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-extrabold text-xs">
                  {topMatchList.length}
                </span>
              </div>

              {topMatchList.length > 0 && (
                <button
                  onClick={handleBulkImportTopMatchesToWatchlist}
                  disabled={loading}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5"
                >
                  <i className="ph-bold ph-lightning text-base"></i>
                  <span>⚡ Importeer & Voeg Alle ({topMatchList.length}) Toe Aan Watchlist</span>
                </button>
              )}
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto max-h-[70vh] pr-1">
              {topMatchList.length === 0 ? (
                <div className="text-center py-10 text-emerald-700/60 text-xs font-medium border-2 border-dashed border-emerald-200 rounded-xl">
                  Geen aandelen met Score 5 in de huidige lijst.
                </div>
              ) : (
                topMatchList.map(item => (
                  <StockCardItem
                    key={item.ticker}
                    item={item}
                    type="TOP"
                    onDetail={() => handleOpenStockDetail(item)}
                    onImport={() => handleImportFull(item)}
                    onAddToWatchlist={(st, target) => handleImportAndAddToWatchlist(st, target)}
                    onAddToIdealePortfolio={(st, target) => handleImportAndAddToWatchlist(st, target)}
                    importingTicker={importingTicker}
                  />
                ))
              )}
            </div>
          </div>

          {/* Kolom 2: Bijna Voldoen (Score 3-4/5) */}
          <div className="bg-amber-50/40 rounded-2xl border border-amber-200/80 p-4 space-y-4 flex flex-col h-full">
            <div className="flex items-center justify-between pb-3 border-b border-amber-200">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                <h3 className="font-extrabold text-amber-900 text-base">
                  2. Bijna Voldoen (Score 3-4)
                </h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-extrabold text-xs">
                {potentialList.length}
              </span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto max-h-[70vh] pr-1">
              {potentialList.length === 0 ? (
                <div className="text-center py-10 text-amber-700/60 text-xs font-medium border-2 border-dashed border-amber-200 rounded-xl">
                  Geen potentiële aandelen (Score 3-4) gevonden.
                </div>
              ) : (
                potentialList.map(item => (
                  <StockCardItem
                    key={item.ticker}
                    item={item}
                    type="POTENTIAL"
                    onDetail={() => handleOpenStockDetail(item)}
                    onImport={() => handleImportFull(item)}
                    onAddToWatchlist={(st, target) => handleImportAndAddToWatchlist(st, target)}
                    onAddToIdealePortfolio={(st, target) => handleImportAndAddToWatchlist(st, target)}
                    importingTicker={importingTicker}
                  />
                ))
              )}
            </div>
          </div>

          {/* Kolom 3: Helemaal Niet (Score 0-2/5) */}
          <div className="bg-rose-50/40 rounded-2xl border border-rose-200/80 p-4 space-y-4 flex flex-col h-full">
            <div className="flex items-center justify-between pb-3 border-b border-rose-200">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                <h3 className="font-extrabold text-rose-900 text-base">
                  3. Helemaal Niet (Score 0-2)
                </h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white font-extrabold text-xs">
                {rejectedList.length}
              </span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto max-h-[70vh] pr-1">
              {rejectedList.length === 0 ? (
                <div className="text-center py-10 text-rose-700/60 text-xs font-medium border-2 border-dashed border-rose-200 rounded-xl">
                  Geen afgewezen aandelen in de lijst.
                </div>
              ) : (
                rejectedList.map(item => (
                  <StockCardItem
                    key={item.ticker}
                    item={item}
                    type="REJECTED"
                    onDetail={() => handleOpenStockDetail(item)}
                    onImport={() => handleImportFull(item)}
                    onAddToWatchlist={(st, target) => handleImportAndAddToWatchlist(st, target)}
                    onAddToIdealePortfolio={(st, target) => handleImportAndAddToWatchlist(st, target)}
                    importingTicker={importingTicker}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TABEL WEERGAVE (OVERZICHTELIJK DETAIL & SORTERING) */}
      {viewMode === 'TABLE' && results.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden space-y-3 p-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-gray-100">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <i className="ph-bold ph-sort-ascending text-blue-600 text-base"></i>
              <span>Sorteer Tabel Resultaten</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">Sorteer op:</span>
              <select
                value={tableSortBy}
                onChange={(e) => setTableSortBy(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 shadow-sm"
              >
                <option value="WAARDEVERDELING">🎯 Waardeverdeling (Hoogste eerst)</option>
                <option value="SCORE">⭐ Score (5 -&gt; 0)</option>
                <option value="FCF_GROWTH">📈 FCF Groei % (Hoogste eerst)</option>
                <option value="ROE">📊 ROE 10Y % (Hoogste eerst)</option>
                <option value="TICKER">🔤 Ticker (A-Z)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Aandeel</th>
                  <th className="py-3 px-3 text-center">Score</th>
                  <th className="py-3 px-3 text-center">🎯 Waardeverdeling</th>
                  <th className="py-3 px-3 text-center">FCF Positief (40Q)</th>
                  <th className="py-3 px-3 text-center">FCF Groei &gt; 0%</th>
                  <th className="py-3 px-3 text-center">ROE 10Y &gt;= 15%</th>
                  <th className="py-3 px-3 text-center">ROE Factor &gt; 0</th>
                  <th className="py-3 px-3 text-center">LTD/Equity &lt; 1</th>
                  <th className="py-3 px-4 text-right">Actie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {sortedTableResults.map((item) => {
                  const isTop = item.score === 5;
                  const isPotential = item.score >= 3 && item.score < 5;
                  const c = item.criteria || {};
                  const m = item.metrics || {};
                  const wv = m.waarde_verdeling || 0;

                  return (
                    <tr
                      key={item.ticker}
                      className={`hover:bg-gray-50/80 transition-colors ${
                        isTop ? 'bg-emerald-50/30' : isPotential ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="font-extrabold text-gray-900 tracking-tight text-base">
                            {item.ticker}
                          </span>
                          {item.inDatabase && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                              In DB
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 truncate max-w-[200px]">
                          {item.name}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-black shadow-sm ${
                            isTop
                              ? 'bg-emerald-600 text-white'
                              : isPotential
                              ? 'bg-amber-500 text-white'
                              : 'bg-rose-500 text-white'
                          }`}
                        >
                          {item.score} / 5
                        </span>
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-black shadow-sm ${
                            wv > 0
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-gray-100 text-gray-600 border border-gray-200'
                          }`}
                        >
                          {wv ? wv.toFixed(2) : '0.00'}
                        </span>
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        {c.allFcfPositive ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">✓</span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-rose-100 text-rose-700 font-bold text-xs">✕</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        <div className="flex flex-col items-center">
                          {c.fcfGrowthPositive ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">✓</span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-rose-100 text-rose-700 font-bold text-xs">✕</span>
                          )}
                          <span className="text-[10px] font-semibold text-gray-500 mt-0.5">
                            {(m.gem_groeipercentage_FCF * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        <div className="flex flex-col items-center">
                          {c.avgRoe10Y_gt_15 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">✓</span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-rose-100 text-rose-700 font-bold text-xs">✕</span>
                          )}
                          <span className="text-[10px] font-semibold text-gray-500 mt-0.5">
                            {(m.gemiddelde_stijging_ROE_10_Y * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        <div className="flex flex-col items-center">
                          {c.roeWaardefactorPositive ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">✓</span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-rose-100 text-rose-700 font-bold text-xs">✕</span>
                          )}
                          <span className="text-[10px] font-semibold text-gray-500 mt-0.5">
                            {m.waardefactor_ROE ? m.waardefactor_ROE.toFixed(2) : '0.00'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-center">
                        <div className="flex flex-col items-center">
                          {c.ltdWaardefactor_lt_1 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">✓</span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-rose-100 text-rose-700 font-bold text-xs">✕</span>
                          )}
                          <span className="text-[10px] font-semibold text-gray-500 mt-0.5">
                            {m.ltd_equity_mean ? m.ltd_equity_mean.toFixed(2) : '0.00'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenStockDetail(item)}
                            className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 text-xs font-semibold transition-colors"
                          >
                            Details
                          </button>

                          <button
                            onClick={() => handleImportAndAddToWatchlist(item, 'watchlist')}
                            disabled={importingTicker === item.ticker}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all disabled:opacity-50 inline-flex items-center gap-1"
                            title="Importeren in DB & Toevoegen aan Watchlist"
                          >
                            <i className="ph-bold ph-star text-amber-500"></i>
                            <span>+Watchlist</span>
                          </button>

                          <button
                            onClick={() => handleImportAndAddToWatchlist(item, 'idealePortfolio')}
                            disabled={importingTicker === item.ticker}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition-all disabled:opacity-50 inline-flex items-center gap-1"
                            title="Importeren in DB & Toevoegen aan Ideale Portfolio"
                          >
                            <i className="ph-bold ph-trophy text-emerald-600"></i>
                            <span>+Ideale PF</span>
                          </button>

                          {item.inDatabase && (
                            <a
                              href={`/analysis?ticker=${item.ticker}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold hover:bg-emerald-200 transition-colors"
                            >
                              <span>Naar Analyse</span>
                              <i className="ph-bold ph-arrow-right"></i>
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Aandelen Selector (~10.000 SEC bedrijven doorzoeken & kiezen) */}
      {showPickerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden relative">
            <div className="p-6 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <i className="ph-bold ph-magnifying-glass-plus text-blue-600"></i>
                  Alle SEC Beursgenoteerde Aandelen
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Zoek op bedrijfsnaam of ticker. Vink aandelen aan om ze direct samen te screenen.
                </p>
              </div>
              <button
                onClick={() => setShowPickerModal(false)}
                className="p-2 text-gray-400 hover:text-gray-700 rounded-xl transition-colors"
              >
                <i className="ph-bold ph-x text-xl"></i>
              </button>
            </div>

            <div className="p-4 border-b border-gray-100 bg-white space-y-3 flex-shrink-0">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <i className="ph ph-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                  <input
                    type="text"
                    value={pickerSearchQuery}
                    onChange={(e) => setPickerSearchQuery(e.target.value)}
                    placeholder="Zoek op bedrijfsnaam (bijv. Costco, Microsoft, Nvidia, Apple)..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <button
                    onClick={() => selectAllVisiblePickerTickers(sortedAvailableStocks.slice(0, 50))}
                    className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
                  >
                    Selecteer Top 50 zichtbaar
                  </button>

                  <button
                    onClick={() => setSelectedPickerTickers([])}
                    disabled={selectedPickerTickers.length === 0}
                    className="px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    Deselecteer alles ({selectedPickerTickers.length})
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500 pt-1">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hideErrors}
                      onChange={(e) => setHideErrors(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Verberg <strong>foutmeldingen / geen SEC data</strong></span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={onlyUnscreened}
                      onChange={(e) => setOnlyUnscreened(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Verberg al <strong>gescreende</strong> aandelen</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={onlyNotInDb}
                      onChange={(e) => setOnlyNotInDb(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>Verberg al in <strong>SQL DB</strong></span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-500">Sorteer:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-bold text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="SIZE">🏆 Bedrijfsgrootte (Grootst eerst)</option>
                    <option value="TICKER">🔤 Ticker (A-Z)</option>
                    <option value="NAME">📝 Bedrijfsnaam (A-Z)</option>
                  </select>

                  <span className="ml-2 font-bold text-gray-700">
                    Geselecteerd: <strong className="text-blue-600">{selectedPickerTickers.length}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingAvailableStocks ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 space-y-3">
                  <i className="ph-bold ph-spinner animate-spin text-4xl text-blue-600"></i>
                  <span className="text-sm font-medium">Laden van ~10.000 SEC bedrijven...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {sortedAvailableStocks.slice(0, 150).map((stock) => {
                    const isSelected = selectedPickerTickers.includes(stock.ticker);
                    const isScreened = stock.isScreened || screenedSet.has(stock.ticker);

                    return (
                      <div
                        key={stock.ticker}
                        onClick={() => togglePickerTicker(stock.ticker)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-blue-50 border-blue-500 shadow-sm'
                            : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50/80'
                        }`}
                      >
                        <div className="truncate mr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-gray-900 text-sm">{stock.ticker}</span>
                            {stock.rank <= 100 && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800" title="Top Marktkapitalisatie">
                                Mega Cap
                              </span>
                            )}
                            {stock.hasError && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-700">
                                Geen SEC Data
                              </span>
                            )}
                            {stock.inDatabase && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-700">
                                DB
                              </span>
                            )}
                            {isScreened && !stock.hasError && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-gray-100 text-gray-700">
                                Gescreend
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{stock.name}</div>
                        </div>

                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between flex-shrink-0">
              <span className="text-xs text-gray-500">
                Totaal {filteredAvailableStocks.length} zoekresultaten
              </span>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowPickerModal(false)}
                  className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold rounded-xl text-xs transition-all"
                >
                  Annuleren
                </button>

                <button
                  onClick={handleScreenSelectedFromPicker}
                  disabled={selectedPickerTickers.length === 0}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all disabled:opacity-50 shadow-md inline-flex items-center gap-2"
                >
                  <i className="ph-bold ph-funnel"></i>
                  <span>Screen Geselecteerde ({selectedPickerTickers.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal voor Details van 1 Gescreend Aandeel (Inclusief Historische Kwartalen) */}
      {selectedStockDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden relative">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-extrabold text-xl shadow-md ${
                    selectedStockDetail.score === 5
                      ? 'bg-emerald-600'
                      : selectedStockDetail.score >= 3
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                >
                  {selectedStockDetail.score}/5
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    {selectedStockDetail.ticker} - {selectedStockDetail.name}
                  </h3>
                  <span className="text-xs text-gray-500">
                    {selectedStockDetail.inDatabase ? 'Reeds aanwezig in SQL Database' : 'Lichtgewicht SEC Fast Screening'}
                    {historyData.length > 0 && ` • ${historyData.length} historische kwartalen beschikbaar`}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedStockDetail(null)}
                className="p-2 text-gray-400 hover:text-gray-700 rounded-xl transition-colors"
              >
                <i className="ph-bold ph-x text-xl"></i>
              </button>
            </div>

            {/* Tab Navigatie binnen Modal */}
            <div className="flex border-b border-gray-200 bg-white px-6 pt-3 gap-3 flex-shrink-0">
              <button
                onClick={() => setDetailTab('CURRENT')}
                className={`pb-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
                  detailTab === 'CURRENT'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <i className="ph-bold ph-check-circle"></i>
                <span>Actuele Criteria (Laatste Kwartaal)</span>
              </button>

              <button
                onClick={() => setDetailTab('HISTORY')}
                className={`pb-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
                  detailTab === 'HISTORY'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <i className="ph-bold ph-chart-line-up"></i>
                <span>📈 Historische Tijdlijn & Waardeverdeling ({historyData.length})</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {detailTab === 'CURRENT' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Score</span>
                      <span className="text-lg font-extrabold text-gray-900">{selectedStockDetail.score} / 5</span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Waardeverdeling</span>
                      <span className="text-lg font-extrabold text-blue-600">
                        {(selectedStockDetail.metrics?.waarde_verdeling || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Gem. FCF Groei</span>
                      <span className="text-lg font-extrabold text-emerald-600">
                        {((selectedStockDetail.metrics?.gem_groeipercentage_FCF || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Gem. ROE 10Y</span>
                      <span className="text-lg font-extrabold text-indigo-600">
                        {((selectedStockDetail.metrics?.gemiddelde_stijging_ROE_10_Y || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-2">
                    5 Selectiecriteria Checklist
                  </h4>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <span className="text-sm font-medium text-gray-700">1. Vrije Kasstroom Positief (40Q):</span>
                      <span className={`font-bold text-xs px-2.5 py-1 rounded-full ${selectedStockDetail.criteria?.allFcfPositive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {selectedStockDetail.criteria?.allFcfPositive ? '✓ Altijd Positief' : '✕ Negatieve Kwartalen'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <div>
                        <div className="text-sm font-medium text-gray-700">2. Gemiddelde FCF Groei &gt; 0%:</div>
                        <div className="text-xs text-gray-500">Groei: {((selectedStockDetail.metrics?.gem_groeipercentage_FCF || 0) * 100).toFixed(2)}%</div>
                      </div>
                      <span className={`font-bold text-xs px-2.5 py-1 rounded-full ${selectedStockDetail.criteria?.fcfGrowthPositive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {selectedStockDetail.criteria?.fcfGrowthPositive ? '✓ Positieve Groei' : '✕ Geen Groei'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <div>
                        <div className="text-sm font-medium text-gray-700">3. Gemiddelde ROE (10-Jaar) &gt;= 15%:</div>
                        <div className="text-xs text-gray-500">Gemiddelde: {((selectedStockDetail.metrics?.gemiddelde_stijging_ROE_10_Y || 0) * 100).toFixed(2)}%</div>
                      </div>
                      <span className={`font-bold text-xs px-2.5 py-1 rounded-full ${selectedStockDetail.criteria?.avgRoe10Y_gt_15 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {selectedStockDetail.criteria?.avgRoe10Y_gt_15 ? '✓ >= 15%' : '✕ < 15%'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <div>
                        <div className="text-sm font-medium text-gray-700">4. ROE Waardefactor &gt; 0:</div>
                        <div className="text-xs text-gray-500">Factor: {(selectedStockDetail.metrics?.waardefactor_ROE || 0).toFixed(3)}</div>
                      </div>
                      <span className={`font-bold text-xs px-2.5 py-1 rounded-full ${selectedStockDetail.criteria?.roeWaardefactorPositive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {selectedStockDetail.criteria?.roeWaardefactorPositive ? '✓ Stabiel / Stijgend' : '✕ Onstabiel'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <div>
                        <div className="text-sm font-medium text-gray-700">5. LTD / Equity Waardefactor &lt; 1:</div>
                        <div className="text-xs text-gray-500">Schuld / Eigen Vermogen Mean: {(selectedStockDetail.metrics?.ltd_equity_mean || 0).toFixed(2)}</div>
                      </div>
                      <span className={`font-bold text-xs px-2.5 py-1 rounded-full ${selectedStockDetail.criteria?.ltdWaardefactor_lt_1 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {selectedStockDetail.criteria?.ltdWaardefactor_lt_1 ? '✓ Lage Schuld' : '✕ Hoge Schuld'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {loadingHistory ? (
                    <div className="py-16 text-center text-gray-400 space-y-3">
                      <i className="ph-bold ph-spinner animate-spin text-4xl text-blue-600"></i>
                      <p className="text-sm font-medium">Historische kwartaalberekeningen ophalen...</p>
                    </div>
                  ) : historyData.length === 0 ? (
                    <div className="py-12 text-center text-gray-500 text-xs">
                      Geen historische kwartaaldata gevonden.
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-3 text-xs text-gray-500">
                        <span>Tijdlijn van {historyData.length} kwartalen (nieuwste bovenaan):</span>
                        <span className="font-bold text-gray-700">
                          🟢 5/5 Matches: {historyData.filter(h => h.score === 5).length} van {historyData.length} kwartalen
                        </span>
                      </div>

                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase">
                            <tr>
                              <th className="py-2.5 px-3">Kwartaal</th>
                              <th className="py-2.5 px-2 text-center">Score</th>
                              <th className="py-2.5 px-2 text-center">Waardeverdeling</th>
                              <th className="py-2.5 px-2 text-center">FCF Groei</th>
                              <th className="py-2.5 px-2 text-center">ROE 10Y</th>
                              <th className="py-2.5 px-2 text-center">LTD/Equity</th>
                              <th className="py-2.5 px-3 text-right">Intrinsiek</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {historyData.map((row, idx) => {
                              const isTop = row.score === 5;
                              const isPot = row.score >= 3 && row.score < 5;
                              const wv = row.metrics?.waarde_verdeling || 0;
                              const dateFormatted = row.period_end_date ? row.period_end_date.substring(0, 10) : '-';

                              return (
                                <tr key={idx} className={`hover:bg-gray-50 ${isTop ? 'bg-emerald-50/20' : ''}`}>
                                  <td className="py-2.5 px-3 font-bold text-gray-800">
                                    {dateFormatted}
                                  </td>
                                  <td className="py-2.5 px-2 text-center">
                                    <span
                                      className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-extrabold text-white ${
                                        isTop ? 'bg-emerald-600' : isPot ? 'bg-amber-500' : 'bg-rose-500'
                                      }`}
                                    >
                                      {row.score}/5
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-2 text-center font-extrabold">
                                    <span className={wv > 0 ? 'text-emerald-700' : 'text-gray-500'}>
                                      {wv.toFixed(2)}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-2 text-center">
                                    {((row.metrics?.gem_groeipercentage_FCF || 0) * 100).toFixed(1)}%
                                  </td>
                                  <td className="py-2.5 px-2 text-center">
                                    {((row.metrics?.gemiddelde_stijging_ROE_10_Y || 0) * 100).toFixed(1)}%
                                  </td>
                                  <td className="py-2.5 px-2 text-center text-gray-600">
                                    {(row.metrics?.ltd_equity_mean || 0).toFixed(2)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-gray-800">
                                    {row.raw?.intrinsieke_waarde ? `$${row.raw.intrinsieke_waarde.toFixed(2)}` : '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center flex-shrink-0">
              <div>
                {selectedStockDetail.inDatabase && (
                  <a
                    href={`/analysis?ticker=${selectedStockDetail.ticker}`}
                    className="text-xs font-bold text-emerald-700 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Naar Volledige Analyse Pagina</span>
                    <i className="ph-bold ph-arrow-right"></i>
                  </a>
                )}
              </div>

              <div className="flex gap-3">
                {!selectedStockDetail.inDatabase && (
                  <button
                    onClick={() => {
                      const st = selectedStockDetail;
                      setSelectedStockDetail(null);
                      handleImportFull(st);
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all shadow-sm"
                  >
                    <i className="ph-bold ph-download-simple mr-1"></i> Importeer Volledig in DB
                  </button>
                )}
                <button
                  onClick={() => setSelectedStockDetail(null)}
                  className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-800 font-bold rounded-xl text-xs transition-all"
                >
                  Sluiten
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Sub-component voor Stock Cards in de 3 kolommen
const StockCardItem = ({ item, type, onDetail, onImport, onAddToWatchlist, onAddToIdealePortfolio, importingTicker }) => {
  const m = item.metrics || {};
  const c = item.criteria || {};

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-gray-900 text-base tracking-tight">
              {item.ticker}
            </span>
            {item.inDatabase && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-700">
                DB
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 truncate max-w-[180px]">
            {item.name}
          </div>
        </div>

        <span
          className={`px-2.5 py-1 rounded-full text-xs font-black text-white ${
            type === 'TOP'
              ? 'bg-emerald-600'
              : type === 'POTENTIAL'
              ? 'bg-amber-500'
              : 'bg-rose-500'
          }`}
        >
          {item.score}/5
        </span>
      </div>

      {/* Mini Kpi grid */}
      <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-gray-100 text-[11px]">
        <div className="bg-gray-50 p-1.5 rounded-lg">
          <span className="text-gray-400 block text-[9px] uppercase font-bold">FCF Groei</span>
          <span className={`font-extrabold ${c.fcfGrowthPositive ? 'text-emerald-700' : 'text-rose-600'}`}>
            {(m.gem_groeipercentage_FCF * 100).toFixed(1)}%
          </span>
        </div>

        <div className="bg-gray-50 p-1.5 rounded-lg">
          <span className="text-gray-400 block text-[9px] uppercase font-bold">ROE 10Y</span>
          <span className={`font-extrabold ${c.avgRoe10Y_gt_15 ? 'text-emerald-700' : 'text-rose-600'}`}>
            {(m.gemiddelde_stijging_ROE_10_Y * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Actie knoppen */}
      <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <button
            onClick={onDetail}
            className="text-xs font-bold text-gray-500 hover:text-blue-600 transition-colors"
          >
            Details
          </button>

          {item.inDatabase ? (
            <a
              href={`/analysis?ticker=${item.ticker}`}
              className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1"
            >
              <span>Analyse</span>
              <i className="ph-bold ph-arrow-right"></i>
            </a>
          ) : (
            <button
              onClick={onImport}
              disabled={importingTicker === item.ticker}
              className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-all disabled:opacity-50 inline-flex items-center gap-1"
            >
              {importingTicker === item.ticker ? (
                <span>Laden...</span>
              ) : (
                <>
                  <i className="ph-bold ph-download-simple"></i>
                  <span>Alleen DB Import</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* 1-Klik Toevoegen aan Watchlist / Ideale Portfolio */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <button
            onClick={() => onAddToWatchlist(item, 'watchlist')}
            disabled={importingTicker === item.ticker}
            className="py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50 inline-flex items-center justify-center gap-1"
            title="Importeren in DB & Toevoegen aan Watchlist"
          >
            <i className="ph-bold ph-star text-amber-500"></i>
            <span>+Watchlist</span>
          </button>

          <button
            onClick={() => onAddToIdealePortfolio(item, 'idealePortfolio')}
            disabled={importingTicker === item.ticker}
            className="py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold rounded-lg transition-all disabled:opacity-50 inline-flex items-center justify-center gap-1"
            title="Importeren in DB & Toevoegen aan Ideale Portfolio"
          >
            <i className="ph-bold ph-trophy text-emerald-600"></i>
            <span>+Ideale PF</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockScreenerTab;

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import http from '../../http-common';

import AnalysisDataTab from './AnalysisDataTab';
import AnalysisCalculationsTab from './AnalysisCalculationsTab';
import AnalysisChartTab from './AnalysisChartTab';
import AnalysisAlertsTab from './AnalysisAlertsTab';
import AnalysisCalculationsChart from './AnalysisCalculationsChart';
import AnalysisPortfolioTab from './AnalysisPortfolioTab';
import SearchSecFields from './searchSecFields';
import StockScreenerTab from './StockScreenerTab';
import StrategyExplorerTab from './StrategyExplorerTab';

const Analysis = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tickerParam = searchParams.get('ticker');
  const tabParam = searchParams.get('tab');
  
  // Data states
  const [stocks, setStocks] = useState([]);
  const [calcsSummary, setCalcsSummary] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // eToro Ontdek Categorie (wanneer geen aandeel geselecteerd is)
  // 'overview' | 'stocks' | 'strategies'
  const [discoverCategory, setDiscoverCategory] = useState(tabParam === 'strategies' ? 'strategies' : (tabParam === 'stocks' ? 'stocks' : 'overview'));
  
  // Aandeel detail sub-tab (wanneer een aandeel geselecteerd is)
  // 'overview' | 'calculations' | 'alerts' | 'portfolio' | 'data_admin'
  const [stockDetailTab, setStockDetailTab] = useState('overview');

  // Actieve beheerder tool (indien geopend)
  // null | 'screener' | 'data' | 'calculations_admin' | 'sec_fields'
  const [activeAdminTool, setActiveAdminTool] = useState(tabParam === 'screener' ? 'screener' : null);

  // Filters voor ontdekpagina
  const [discoverSearchQuery, setDiscoverSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState('ALL'); // 'ALL' | 'SCORE_5' | 'DISCOUNT' | 'RISING_WV'
  const [adminDropdownOpen, setAdminDropdownOpen] = useState(false);

  // Gedeelde data voor het geselecteerde aandeel (voorkomt dubbele API-calls)
  const [sharedStockData, setSharedStockData] = useState({
    stockId: null,
    calculations: null,
    alerts: null,
    loading: false,
  });

  const userRole = localStorage.getItem('role') || 'user';
  const uid = localStorage.getItem('userID') || 1;
  const isAdmin = Number(uid) === 1 || userRole === 'admin';
  const userPermissions = useMemo(() => {
    if (isAdmin) {
      return { canViewScreener: true, canViewFormulas: true, canEditSystemData: true };
    }
    try {
      const saved = localStorage.getItem('user_permissions');
      return saved ? JSON.parse(saved) : { canViewScreener: false, canViewFormulas: false, canEditSystemData: false };
    } catch {
      return { canViewScreener: false, canViewFormulas: false, canEditSystemData: false };
    }
  }, [isAdmin]);

  // Haal aandelen en meest recente berekeningen op
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const [stocksRes, calcsRes] = await Promise.all([
          http.get('/stocks'),
          http.get('/calculations/latest-summary').catch(() => ({ data: [] }))
        ]);
        setStocks(stocksRes.data || []);
        setCalcsSummary(calcsRes.data || []);
      } catch (err) {
        setError('Kon gegevens niet laden.');
        console.error('Error fetching analysis stocks:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Voeg berekeningsdata (score, intrinsiek, waardeverdeling) samen met basis aandeleninfo
  const enrichedStocks = useMemo(() => {
    const calcMap = new Map();
    calcsSummary.forEach(c => {
      if (c.stock_id) calcMap.set(c.stock_id, c);
    });

    return stocks.map(s => {
      const stockId = s.stock_id || s.aandeel_id;
      const c = calcMap.get(stockId);
      const ticker = s.ticker || s.ticker_symbol || '';
      return {
        ...s,
        stock_id: stockId,
        ticker,
        score: c ? c.selectiecriteria : null,
        intrinsicValue: c ? c.intrinsieke_waarde : null,
        waardeVerdeling: c ? c.waarde_verdeling : null,
        numCalculations: c ? c.num_calculations : 0,
        periodEndDate: c ? c.period_end_date : null
      };
    });
  }, [stocks, calcsSummary]);

  // Synchroniseer geselecteerd aandeel met de URL parameter (?ticker=AAPL)
  useEffect(() => {
    if (enrichedStocks.length > 0 && tickerParam) {
      const found = enrichedStocks.find(s => s.ticker === tickerParam);
      if (found) {
        setSelectedStock(found);
      }
    } else if (!tickerParam) {
      setSelectedStock(null);
    }
  }, [enrichedStocks, tickerParam]);

  // Haal gedeelde berekeningen en alerts op voor het geselecteerde aandeel
  const selectedStockId = selectedStock?.stock_id || null;
  useEffect(() => {
    if (!selectedStockId) return;
    if (sharedStockData.stockId === selectedStockId && sharedStockData.calculations && sharedStockData.alerts) {
      return;
    }

    let isCancelled = false;
    setSharedStockData({
      stockId: selectedStockId,
      calculations: null,
      alerts: null,
      loading: true,
    });

    Promise.all([
      http.get(`/calculations/${selectedStockId}`),
      http.get(`/calculations/${selectedStockId}/macd-alerts`),
    ])
      .then(([calcsRes, alertsRes]) => {
        if (isCancelled) return;
        setSharedStockData({
          stockId: selectedStockId,
          calculations: calcsRes.data || [],
          alerts: alertsRes.data || [],
          loading: false,
        });
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error('Error fetching stock calculations:', err);
        setSharedStockData({
          stockId: selectedStockId,
          calculations: [],
          alerts: [],
          loading: false,
        });
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedStockId, sharedStockData.stockId, sharedStockData.calculations, sharedStockData.alerts]);

  // Selecteer een aandeel (schakelt direct over naar de eToro Aandeel Detail Weergave)
  const handleSelectStock = (stock) => {
    setSelectedStock(stock);
    setActiveAdminTool(null);
    setStockDetailTab('overview');
    if (stock) {
      navigate(`/analysis?ticker=${stock.ticker}`);
    } else {
      navigate(`/analysis`);
    }
  };

  // Terugkeren naar de eToro Ontdekpagina
  const handleBackToDiscover = (category = 'overview') => {
    setSelectedStock(null);
    setActiveAdminTool(null);
    setDiscoverCategory(category);
    navigate(`/analysis?tab=${category}`);
  };

  // Gefilterde aandelen voor de Ontdekpagina
  const filteredStocks = useMemo(() => {
    return enrichedStocks.filter(s => {
      if (discoverSearchQuery.trim()) {
        const q = discoverSearchQuery.toLowerCase();
        const matchesTicker = s.ticker?.toLowerCase().includes(q);
        const matchesName = s.name?.toLowerCase().includes(q);
        if (!matchesTicker && !matchesName) return false;
      }
      if (stockFilter === 'SCORE_5') {
        return s.score === 5;
      }
      if (stockFilter === 'DISCOUNT') {
        return s.intrinsicValue && s.intrinsicValue > 0;
      }
      if (stockFilter === 'RISING_WV') {
        return s.waardeVerdeling && s.waardeVerdeling > 15;
      }
      return true;
    }).sort((a, b) => (a.ticker || '').localeCompare(b.ticker || ''));
  }, [enrichedStocks, discoverSearchQuery, stockFilter]);

  // Top 5/5 aandelen voor de "Overzicht" carrousel
  const topScore5Stocks = useMemo(() => {
    return enrichedStocks.filter(s => s.score === 5).slice(0, 6);
  }, [enrichedStocks]);

  // ==========================================
  // WEERGAVE 1: BEHEERDER TOOL (als Arne erop klikt)
  // ==========================================
  if (activeAdminTool && isAdmin) {
    return (
      <div className="space-y-6 font-sans text-gray-900 bg-gray-50/50 min-h-screen pb-12">
        {/* Beheerder Header & Terugknop */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleBackToDiscover('stocks')}
              className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs"
            >
              <i className="ph-bold ph-arrow-left text-sm"></i>
              <span>Terug naar Ontdekken</span>
            </button>
            <div className="h-5 w-px bg-gray-200"></div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Beheerder Tool (Privé)</span>
              <h2 className="text-base font-extrabold text-gray-900">
                {activeAdminTool === 'screener' && '🔍 Aandelen Screener'}
                {activeAdminTool === 'data' && '🗄️ Data Beheer (Aandelen & Beurzen)'}
                {activeAdminTool === 'calculations_admin' && '🧮 Berekeningen Beheer'}
                {activeAdminTool === 'sec_fields' && '🔎 SEC Velden Zoeken'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-200">
              Admin Rechten
            </span>
          </div>
        </div>

        {/* Content van de geselecteerde beheerderstool */}
        <div className="animate-fade-in">
          {activeAdminTool === 'screener' && <StockScreenerTab />}
          {activeAdminTool === 'data' && <AnalysisDataTab selectedStock={selectedStock || enrichedStocks[0]} />}
          {activeAdminTool === 'calculations_admin' && <AnalysisCalculationsTab selectedStock={selectedStock || enrichedStocks[0]} />}
          {activeAdminTool === 'sec_fields' && <SearchSecFields />}
        </div>
      </div>
    );
  }

  // ==========================================
  // WEERGAVE 2: AANDEEL DETAIL WEERGAVE (als een aandeel is aangeklikt, eToro Stijl)
  // ==========================================
  if (selectedStock) {
    const isScore5 = selectedStock.score === 5;

    return (
      <div className="space-y-6 font-sans text-gray-900 bg-gray-50/50 min-h-screen pb-12">
        {/* 1. eToro Breadcrumb & Terugknop */}
        <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBackToDiscover('stocks')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-100 active:scale-95 text-gray-800 rounded-xl border border-gray-200 shadow-xs font-bold transition-all"
            >
              <i className="ph-bold ph-arrow-left text-sm"></i>
              <span>Ontdekken</span>
            </button>
            <span className="text-gray-300">/</span>
            <span>Aandelen</span>
            <span className="text-gray-300">/</span>
            <span className="text-gray-900 font-extrabold">{selectedStock.ticker}</span>
          </div>

          {isAdmin && (
            <button
              onClick={() => setActiveAdminTool('data')}
              className="text-gray-400 hover:text-gray-700 text-xs font-semibold flex items-center gap-1"
              title="Beheer systeemdata voor dit aandeel"
            >
              <i className="ph-bold ph-gear"></i>
              <span>Data Beheer</span>
            </button>
          )}
        </div>

        {/* 2. eToro Aandeel Hero Header */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-xl flex items-center justify-center shadow-md shadow-blue-500/20 tracking-tighter">
                {selectedStock.ticker}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                    {selectedStock.name}
                  </h1>
                  <span className="px-2 py-0.5 rounded text-xs font-black bg-gray-100 text-gray-700 border border-gray-200">
                    {selectedStock.ticker}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {isScore5 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                      <i className="ph-fill ph-star text-amber-500 text-xs"></i>
                      Score 5/5 Super-Kwaliteit
                    </span>
                  ) : selectedStock.score ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-amber-50 text-amber-900 border border-amber-200">
                      Score {selectedStock.score}/5
                    </span>
                  ) : null}

                  {selectedStock.intrinsicValue && (
                    <span className="px-2.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-900 border border-blue-200">
                      Intrinsiek: €{Number(selectedStock.intrinsicValue).toFixed(2)}
                    </span>
                  )}

                  {selectedStock.waardeVerdeling && (
                    <span className="px-2.5 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-700">
                      Waardeverdeling: {Number(selectedStock.waardeVerdeling).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Snel wisselen van aandeel via zoekveld */}
            <div className="w-full md:w-64">
              <div className="relative">
                <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  placeholder="Ander aandeel..."
                  value={discoverSearchQuery}
                  onChange={(e) => setDiscoverSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
                {discoverSearchQuery.trim() && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto divide-y divide-gray-100">
                    {filteredStocks.slice(0, 6).map(s => (
                      <button
                        key={s.stock_id}
                        onClick={() => {
                          handleSelectStock(s);
                          setDiscoverSearchQuery('');
                        }}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-blue-50 flex items-center justify-between transition-colors"
                      >
                        <span className="font-extrabold text-gray-900">{s.ticker}</span>
                        <span className="text-gray-500 truncate max-w-[140px]">{s.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. AANDEEL SPECIFIEKE TABS (PAS ZICHTBAAR BIJ GESELECTEERD AANDEEL) */}
          <nav className="flex space-x-6 overflow-x-auto hide-scrollbar border-t border-gray-100 mt-6 pt-1" aria-label="Aandeel Tabs">
            {[
              { id: 'overview', label: 'Overzicht & Grafiek', icon: 'ph-chart-line-up' },
              ...((isAdmin || userPermissions.canViewFormulas) ? [
                { id: 'calculations', label: 'Berekeningen & Waardering', icon: 'ph-calculator' }
              ] : []),
              { id: 'alerts', label: 'Strategie Alerts (MACD)', icon: 'ph-bell-ringing' },
              { id: 'portfolio', label: 'In Mijn Portfolio', icon: 'ph-briefcase' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStockDetailTab(tab.id)}
                className={`whitespace-nowrap py-3 px-1 border-b-2 font-bold text-xs transition-colors flex items-center gap-2 ${
                  stockDetailTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className={`ph-fill ${tab.icon} text-base`}></i>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* 4. Tab Inhoud van het Aandeel */}
        <div className="animate-fade-in">
          {stockDetailTab === 'overview' && (
            <AnalysisChartTab
              selectedStock={selectedStock}
              useSharedData={true}
              sharedCalculations={sharedStockData.stockId === selectedStockId ? sharedStockData.calculations : null}
              sharedAlerts={sharedStockData.stockId === selectedStockId ? sharedStockData.alerts : null}
            />
          )}

          {stockDetailTab === 'calculations' && (isAdmin || userPermissions.canViewFormulas) && (
            <div className="space-y-6">
              <AnalysisCalculationsChart
                selectedStock={selectedStock}
                useSharedData={true}
                sharedCalculations={sharedStockData.stockId === selectedStockId ? sharedStockData.calculations : null}
              />
              <AnalysisCalculationsTab selectedStock={selectedStock} />
            </div>
          )}

          {stockDetailTab === 'alerts' && (
            <AnalysisAlertsTab
              selectedStock={selectedStock}
              useSharedData={true}
              sharedAlerts={sharedStockData.stockId === selectedStockId ? sharedStockData.alerts : null}
            />
          )}

          {stockDetailTab === 'portfolio' && (
            <AnalysisPortfolioTab selectedStock={selectedStock} />
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // WEERGAVE 3: ETORO ONTDEKPAGINA (wanneer GEEN aandeel geselecteerd is)
  // ==========================================
  return (
    <div className="space-y-8 font-sans text-gray-900 bg-gray-50/50 min-h-screen pb-12">
      {/* 1. eToro Hoofd Categorie Balk (Overzicht | Aandelen | Strategieën) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 pb-0">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-200">
                  Ontdek &amp; Opzoeken
                </span>
                <span className="text-xs text-gray-400 font-semibold">Markten verkennen</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                {discoverCategory === 'overview' && 'Ontdek Markten & Strategieën'}
                {discoverCategory === 'stocks' && 'Ontdek Aandelen'}
                {discoverCategory === 'strategies' && 'Strategieën Catalogus'}
              </h1>
            </div>

            {/* Rechtergroep: Zoekbalk & Beheerder Tools Dropdown */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              {/* Zoekbalk */}
              <div className="relative flex-1 md:w-72">
                <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base"></i>
                <input
                  type="text"
                  placeholder="Zoek aandeel of ticker..."
                  value={discoverSearchQuery}
                  onChange={(e) => setDiscoverSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-xs"
                />
                {discoverSearchQuery && (
                  <button
                    onClick={() => setDiscoverSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    <i className="ph-bold ph-x"></i>
                  </button>
                )}
              </div>

              {/* Beheerder Dropdown (enkel voor Arne/admin, NOOIT in de hoofdbalk!) */}
              {isAdmin && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAdminDropdownOpen(!adminDropdownOpen)}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shadow-xs"
                    title="Beheertools (Screener, Data, Berekeningen, SEC)"
                  >
                    <i className="ph-bold ph-gear text-purple-600"></i>
                    <span>Beheer Tools</span>
                    <i className={`ph-bold ph-caret-down text-xs transition-transform ${adminDropdownOpen ? 'rotate-180' : ''}`}></i>
                  </button>

                  {adminDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setAdminDropdownOpen(false)}></div>
                      <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-2 divide-y divide-gray-100 animate-fade-in text-xs font-bold">
                        <button
                          onClick={() => { setActiveAdminTool('screener'); setAdminDropdownOpen(false); }}
                          className="w-full px-4 py-2.5 text-left text-gray-800 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2"
                        >
                          <i className="ph-bold ph-funnel text-purple-600"></i>
                          <span>Aandelen Screener (Privé)</span>
                        </button>
                        <button
                          onClick={() => { setActiveAdminTool('data'); setAdminDropdownOpen(false); }}
                          className="w-full px-4 py-2.5 text-left text-gray-800 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2"
                        >
                          <i className="ph-bold ph-database text-blue-600"></i>
                          <span>Data Beheer</span>
                        </button>
                        <button
                          onClick={() => { setActiveAdminTool('calculations_admin'); setAdminDropdownOpen(false); }}
                          className="w-full px-4 py-2.5 text-left text-gray-800 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2"
                        >
                          <i className="ph-bold ph-calculator text-emerald-600"></i>
                          <span>Berekeningen Beheer</span>
                        </button>
                        <button
                          onClick={() => { setActiveAdminTool('sec_fields'); setAdminDropdownOpen(false); }}
                          className="w-full px-4 py-2.5 text-left text-gray-800 hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2"
                        >
                          <i className="ph-bold ph-magnifying-glass text-amber-600"></i>
                          <span>SEC Velden Zoeken</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* eToro Category Switcher: Overzicht | Aandelen | Strategieën */}
          <nav className="flex space-x-8 overflow-x-auto hide-scrollbar border-t border-gray-100 pt-1" aria-label="Ontdek Categorieën">
            <button
              onClick={() => { setDiscoverCategory('overview'); navigate('/analysis?tab=overview'); }}
              className={`whitespace-nowrap py-3.5 px-1 border-b-2 font-bold text-sm transition-colors flex items-center gap-2 ${
                discoverCategory === 'overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className="ph-fill ph-squares-four text-base"></i>
              <span>Overzicht</span>
            </button>

            <button
              onClick={() => { setDiscoverCategory('stocks'); navigate('/analysis?tab=stocks'); }}
              className={`whitespace-nowrap py-3.5 px-1 border-b-2 font-bold text-sm transition-colors flex items-center gap-2 ${
                discoverCategory === 'stocks'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className="ph-fill ph-chart-line-up text-base"></i>
              <span>Aandelen</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-gray-100 text-gray-600">
                {enrichedStocks.length}
              </span>
            </button>

            <button
              onClick={() => { setDiscoverCategory('strategies'); navigate('/analysis?tab=strategies'); }}
              className={`whitespace-nowrap py-3.5 px-1 border-b-2 font-bold text-sm transition-colors flex items-center gap-2 ${
                discoverCategory === 'strategies'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className="ph-fill ph-compass text-base"></i>
              <span>Strategieën</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                Live
              </span>
            </button>
          </nav>
        </div>
      </div>

      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl mx-6 shadow-sm" role="alert">{error}</div>}

      {/* 2. Content per Ontdek Categorie */}
      <div className="animate-fade-in space-y-8">
        {/* ========================================================= */}
        {/* CATEGORIE A: OVERZICHT (eToro Screenshot 1 Stijl)        */}
        {/* ========================================================= */}
        {discoverCategory === 'overview' && (
          <div className="space-y-8">
            {/* Sectie 1: Uitgelichte Strategieën (Smart Portfolio Stijl) */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Beleggingsmogelijkheden</span>
                  <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
                    Uitgelichte Strategieën &amp; Portefeuilles
                  </h2>
                </div>
                <button
                  onClick={() => setDiscoverCategory('strategies')}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <span>Alles bekijken</span>
                  <i className="ph-bold ph-arrow-right"></i>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Kaart 1: Huidige Live Strategie Arne */}
                <div 
                  onClick={() => setDiscoverCategory('strategies')}
                  className="group relative bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white cursor-pointer shadow-md hover:shadow-xl transition-all duration-300 border border-indigo-500/30 overflow-hidden flex flex-col justify-between"
                >
                  <div className="absolute top-0 right-0 -mt-8 -mr-8 w-44 h-44 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none"></div>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                        <i className="ph-fill ph-star text-amber-400"></i>
                        Officiële Live Strategie
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">ArneVR</span>
                    </div>
                    <h3 className="text-lg font-black text-white group-hover:text-amber-300 transition-colors">
                      5/5 Kwaliteit &amp; Waardeverdeling
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                      Datagedreven kwartaalstrategie op Score 5/5 aandelen met stijgende waardeverdeling en deelaandelen.
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-white/10 flex items-end justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">10-Jaars Rendement</div>
                      <div className="text-2xl font-black text-emerald-400">+333,9%</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">XIRR / Jaar</div>
                      <div className="text-lg font-black text-indigo-300">+14,7%</div>
                    </div>
                  </div>
                </div>

                {/* Kaart 2: Super-Kwaliteit Alpha */}
                <div 
                  onClick={() => setDiscoverCategory('strategies')}
                  className="group relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white cursor-pointer shadow-md hover:shadow-xl transition-all duration-300 border border-slate-700 overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                        Kwaliteit
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">Max 1.3x</span>
                    </div>
                    <h3 className="text-lg font-black text-white group-hover:text-blue-300 transition-colors">
                      Super-Kwaliteit Focus
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                      Selecteert enkel de top van het universum met strikte waarderingsgrens van maximaal 1.3x intrinsiek.
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-white/10 flex items-end justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Verwacht Rendement</div>
                      <div className="text-2xl font-black text-emerald-400">+369%</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Win Rate</div>
                      <div className="text-lg font-black text-white">82%</div>
                    </div>
                  </div>
                </div>

                {/* Kaart 3: Korting op Intrinsiek */}
                <div 
                  onClick={() => setDiscoverCategory('strategies')}
                  className="group relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white cursor-pointer shadow-md hover:shadow-xl transition-all duration-300 border border-slate-700 overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/30">
                        Value Alpha
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">Korting</span>
                    </div>
                    <h3 className="text-lg font-black text-white group-hover:text-amber-300 transition-colors">
                      Korting op Intrinsiek
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                      Koopt uitsluitend aandelen die onder hun intrinsieke waarde noteren voor maximale veiligheidsmarge.
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-white/10 flex items-end justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Verwacht Rendement</div>
                      <div className="text-2xl font-black text-emerald-400">+358%</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Drawdown</div>
                      <div className="text-lg font-black text-rose-300">-18%</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sectie 2: Top Kwaliteitsaandelen (Score 5/5) */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Uitgelichte Kwaliteit</span>
                  <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
                    Top Score 5/5 Aandelen
                  </h2>
                </div>
                <button
                  onClick={() => { setDiscoverCategory('stocks'); setStockFilter('SCORE_5'); }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <span>Bekijk alle 5/5 aandelen ({topScore5Stocks.length}) →</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {topScore5Stocks.map((stock) => (
                  <div
                    key={stock.stock_id}
                    onClick={() => handleSelectStock(stock)}
                    className="bg-white rounded-2xl p-4 border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 font-black text-sm flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          {stock.ticker}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800">
                          5/5
                        </span>
                      </div>
                      <h4 className="font-extrabold text-sm text-gray-900 truncate">
                        {stock.ticker}
                      </h4>
                      <p className="text-[11px] text-gray-400 truncate">
                        {stock.name}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-baseline justify-between text-xs font-bold">
                      <span className="text-gray-400 text-[10px]">Intrinsiek</span>
                      <span className="text-gray-900">
                        {stock.intrinsicValue ? `€${Number(stock.intrinsicValue).toFixed(1)}` : '-'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* CATEGORIE B: AANDELEN (eToro Screenshot 2 Stijl)          */}
        {/* ========================================================= */}
        {discoverCategory === 'stocks' && (
          <div className="space-y-6">
            {/* Filterbalk & Optionele Screener Knop (zoals op eToro screenshot 2) */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar w-full md:w-auto">
                <button
                  onClick={() => setStockFilter('ALL')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    stockFilter === 'ALL'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Alle Aandelen ({enrichedStocks.length})
                </button>
                <button
                  onClick={() => setStockFilter('SCORE_5')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    stockFilter === 'SCORE_5'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <i className="ph-fill ph-star text-amber-400"></i>
                  <span>Score 5/5 Kwaliteit ({enrichedStocks.filter(s => s.score === 5).length})</span>
                </button>
                <button
                  onClick={() => setStockFilter('DISCOUNT')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    stockFilter === 'DISCOUNT'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Met Intrinsieke Waardering
                </button>
                <button
                  onClick={() => setStockFilter('RISING_WV')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    stockFilter === 'RISING_WV'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Hoge Waardeverdeling (&gt;15%)
                </button>
              </div>

              {/* Aandelen Screener knop (voor admin / beheerder) */}
              {isAdmin && (
                <button
                  onClick={() => setActiveAdminTool('screener')}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shadow-sm shadow-purple-900/20"
                >
                  <i className="ph-bold ph-funnel text-sm"></i>
                  <span>Aandelen Screener</span>
                </button>
              )}
            </div>

            {/* Aandelen Grid & Tabel */}
            {loading ? (
              <div className="bg-white rounded-2xl p-16 text-center border border-gray-200">
                <i className="ph-bold ph-spinner animate-spin text-3xl text-blue-600 mb-2"></i>
                <p className="text-xs font-bold text-gray-500">Aandelen ophalen...</p>
              </div>
            ) : filteredStocks.length === 0 ? (
              <div className="bg-white rounded-2xl p-16 text-center border border-gray-200 space-y-2">
                <i className="ph-fill ph-magnifying-glass text-4xl text-gray-300"></i>
                <h3 className="text-base font-bold text-gray-800">Geen aandelen gevonden</h3>
                <p className="text-xs text-gray-400">Probeer een andere zoekterm of filter.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="py-3 px-4">Aandeel</th>
                        <th className="py-3 px-4">Kwaliteitsscore</th>
                        <th className="py-3 px-4 text-right">Intrinsieke Waarde</th>
                        <th className="py-3 px-4 text-right">Waardeverdeling</th>
                        <th className="py-3 px-4 text-center">Historische Kwartalen</th>
                        <th className="py-3 px-4 text-right">Actie</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                      {filteredStocks.map((stock) => (
                        <tr 
                          key={stock.stock_id} 
                          onClick={() => handleSelectStock(stock)}
                          className="hover:bg-blue-50/60 cursor-pointer transition-colors group"
                        >
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <span className="w-9 h-9 rounded-xl bg-gray-100 text-gray-700 font-black text-xs flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                {stock.ticker}
                              </span>
                              <div>
                                <div className="font-extrabold text-sm text-gray-900 group-hover:text-blue-600 transition-colors">
                                  {stock.ticker}
                                </div>
                                <div className="text-[11px] text-gray-400 truncate max-w-xs">
                                  {stock.name}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            {stock.score === 5 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                                <i className="ph-fill ph-star text-amber-500 text-xs"></i>
                                Score 5/5
                              </span>
                            ) : stock.score ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                Score {stock.score}/5
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-gray-900 text-sm">
                            {stock.intrinsicValue ? `€ ${Number(stock.intrinsicValue).toFixed(2)}` : '-'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-gray-700">
                            {stock.waardeVerdeling ? `${Number(stock.waardeVerdeling).toFixed(1)}%` : '-'}
                          </td>
                          <td className="py-3.5 px-4 text-center text-xs text-gray-500">
                            {stock.numCalculations > 0 ? `${stock.numCalculations} kwartalen` : '-'}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 group-hover:bg-blue-600 group-hover:text-white text-gray-700 font-bold text-xs rounded-xl transition-colors">
                              <span>Bekijk</span>
                              <i className="ph-bold ph-arrow-right text-xs"></i>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* CATEGORIE C: STRATEGIEËN (Strategie Catalogus Tab)        */}
        {/* ========================================================= */}
        {discoverCategory === 'strategies' && (
          <StrategyExplorerTab />
        )}
      </div>
    </div>
  );
};

export default Analysis;

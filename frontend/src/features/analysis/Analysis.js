import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import http from '../../http-common';
import DataStatusIndicator from '../../components/ui/DataStatusIndicator';

import AnalysisDataTab from './AnalysisDataTab';
import AnalysisCalculationsTab from './AnalysisCalculationsTab';
import AnalysisChartTab from './AnalysisChartTab';
import AnalysisAlertsTab from './AnalysisAlertsTab';
import AnalysisCalculationsChart from './AnalysisCalculationsChart';
import AnalysisPortfolioTab from './AnalysisPortfolioTab';
import SearchSecFields from './searchSecFields';
import StockScreenerTab from './StockScreenerTab';
import StrategyExplorerTab from './StrategyExplorerTab';
import AnalysisTaxAndCostTab from './AnalysisTaxAndCostTab';

const Analysis = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tickerParam = searchParams.get('ticker');
  const tabParam = searchParams.get('tab');
  
  // Data states
  const [stocks, setStocks] = useState([]);
  const [calcsSummary, setCalcsSummary] = useState([]);
  const [marketExplorerItems, setMarketExplorerItems] = useState([]);
  const [curvoEtfCatalog, setCurvoEtfCatalog] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Ontdek Categorie (wanneer geen aandeel/ETF geselecteerd is)
  // 'overview' | 'stocks' | 'etfs' | 'tob_checker' | 'strategies'
  const [discoverCategory, setDiscoverCategory] = useState(
    ['strategies', 'stocks', 'etfs', 'tob_checker'].includes(tabParam) ? tabParam : 'overview'
  );
  
  // Aandeel / ETF detail sub-tab (wanneer een aandeel of ETF geselecteerd is)
  // 'overview' | 'taxes' | 'portfolio' | 'calculations' | 'alerts'
  const [stockDetailTab, setStockDetailTab] = useState('overview');

  // Actieve beheerder tool (indien geopend)
  // null | 'screener' | 'data' | 'calculations_admin' | 'sec_fields'
  const [activeAdminTool, setActiveAdminTool] = useState(tabParam === 'screener' ? 'screener' : null);

  // Filters voor ontdekpagina
  const [discoverSearchQuery, setDiscoverSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState('ALL'); // 'ALL' | 'BIG_DIP' | 'NEAR_ATH' | 'SCORE_5' | 'DISCOUNT'
  const [etfFilter, setEtfFilter] = useState('ALL'); // 'ALL' | 'TOB_012' | 'TOB_132' | 'ACC' | 'DIST'
  const [stockSortBy, setStockSortBy] = useState('DRAWDOWN'); // 'DRAWDOWN' | 'TICKER' | 'RETURN_1Y'

  // Gedeelde data voor het geselecteerde aandeel (voorkomt dubbele API-calls)
  const [sharedStockData, setSharedStockData] = useState({
    stockId: null,
    calculations: null,
    alerts: null,
    loading: false,
  });

  const userRole = localStorage.getItem('role') || 'user';
  const uid = localStorage.getItem('userID') || 1;
  const isRealAdmin = Number(uid) === 1 || userRole === 'admin';
  const [previewRole, setPreviewRole] = useState(() => localStorage.getItem('admin_preview_role') || '');
  const isAdmin = isRealAdmin && !previewRole;

  useEffect(() => {
    const syncPreview = () => setPreviewRole(localStorage.getItem('admin_preview_role') || '');
    window.addEventListener('adminPreviewChanged', syncPreview);
    window.addEventListener('permissionsUpdated', syncPreview);
    return () => {
      window.removeEventListener('adminPreviewChanged', syncPreview);
      window.removeEventListener('permissionsUpdated', syncPreview);
    };
  }, []);
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

  // Haal aandelen, algemene markt/ATH/TOB data en (voor admin) berekeningen op
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const [stocksRes, calcsRes, explorerRes] = await Promise.all([
          http.get('/stocks'),
          http.get('/calculations/latest-summary').catch(() => ({ data: [] })),
          http.get('/calculations/market-explorer').catch(() => ({ data: { items: [], curvoEtfCatalog: [] } }))
        ]);
        setStocks(stocksRes.data || []);
        setCalcsSummary(calcsRes.data || []);
        setMarketExplorerItems(explorerRes.data?.items || []);
        setCurvoEtfCatalog(explorerRes.data?.curvoEtfCatalog || []);
      } catch (err) {
        setError('Kon gegevens niet laden.');
        console.error('Error fetching analysis stocks:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Voeg algemene marktdata (ATH drawdown, 52W, fundamentals, TOB) en admin-berekeningen samen
  const enrichedStocks = useMemo(() => {
    const calcMap = new Map();
    calcsSummary.forEach(c => {
      if (c.stock_id) calcMap.set(c.stock_id, c);
    });

    const explorerMap = new Map();
    marketExplorerItems.forEach(m => {
      if (m.stock_id) explorerMap.set(m.stock_id, m);
    });

    const baseList = stocks.length > 0 ? stocks : marketExplorerItems;

    return baseList.map(s => {
      const stockId = s.stock_id || s.aandeel_id;
      const c = calcMap.get(stockId);
      const m = explorerMap.get(stockId) || {};
      const ticker = (s.ticker || s.ticker_symbol || m.ticker || '').toUpperCase();
      const assetTypeName = (m.asset_type_name || s.asset_type_name || (s.asset_type_id === 2 ? 'ETF' : s.asset_type_id === 3 ? 'CRYPTO' : 'STOCK')).toUpperCase();

      return {
        ...s,
        ...m,
        stock_id: stockId,
        ticker,
        name: m.name || s.name || ticker,
        asset_type_name: assetTypeName,
        score: c ? c.selectiecriteria : null,
        intrinsicValue: c ? c.intrinsieke_waarde : null,
        waardeVerdeling: c ? c.waarde_verdeling : null,
        numCalculations: c ? c.num_calculations : 0,
        periodEndDate: c ? c.period_end_date : null
      };
    });
  }, [stocks, calcsSummary, marketExplorerItems]);

  // Splits aandelen en ETF's duidelijk op
  const allStocksOnly = useMemo(() => {
    return enrichedStocks.filter(s => s.asset_type_name !== 'ETF' && s.asset_type_name !== 'CRYPTO');
  }, [enrichedStocks]);

  const allEtfsOnly = useMemo(() => {
    return enrichedStocks.filter(s => s.asset_type_name === 'ETF');
  }, [enrichedStocks]);

  // Synchroniseer geselecteerd aandeel met de URL parameter (?ticker=AAPL)
  useEffect(() => {
    if (enrichedStocks.length > 0 && tickerParam) {
      const found = enrichedStocks.find(s => s.ticker?.toUpperCase() === tickerParam.toUpperCase());
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

  // Selecteer een aandeel of ETF (met optionele directe sub-tab zoals 'taxes')
  const handleSelectStock = (stock, initialSubTab = 'overview') => {
    setSelectedStock(stock);
    setActiveAdminTool(null);
    setStockDetailTab(initialSubTab);
    if (stock) {
      navigate(`/analysis?ticker=${stock.ticker}`);
    } else {
      navigate(`/analysis`);
    }
  };

  // Terugkeren naar de Ontdekpagina
  const handleBackToDiscover = (category = 'overview') => {
    setSelectedStock(null);
    setActiveAdminTool(null);
    setDiscoverCategory(category);
    navigate(`/analysis?tab=${category}`);
  };

  // Gefilterde Aandelen (exclusief ETF's)
  const filteredStocks = useMemo(() => {
    const list = allStocksOnly.filter(s => {
      if (discoverSearchQuery.trim()) {
        const q = discoverSearchQuery.toLowerCase();
        const matchesTicker = s.ticker?.toLowerCase().includes(q);
        const matchesName = s.name?.toLowerCase().includes(q);
        const matchesIsin = s.isin?.toLowerCase().includes(q);
        if (!matchesTicker && !matchesName && !matchesIsin) return false;
      }
      if (stockFilter === 'BIG_DIP') {
        return s.drawdownFromAthPct !== null && s.drawdownFromAthPct <= -15;
      }
      if (stockFilter === 'NEAR_ATH') {
        return s.drawdownFromAthPct !== null && s.drawdownFromAthPct >= -5;
      }
      if (stockFilter === 'SCORE_5') {
        return s.score === 5;
      }
      if (stockFilter === 'DISCOUNT') {
        return s.intrinsicValue && s.intrinsicValue > 0;
      }
      return true;
    });

    return list.sort((a, b) => {
      if (stockSortBy === 'DRAWDOWN') {
        const da = a.drawdownFromAthPct ?? 999;
        const db = b.drawdownFromAthPct ?? 999;
        return da - db; // Grootste daling eerst (bv. -45% voor -10%)
      }
      if (stockSortBy === 'RETURN_1Y') {
        const ra = a.return1yPct ?? -999;
        const rb = b.return1yPct ?? -999;
        return rb - ra;
      }
      return (a.ticker || '').localeCompare(b.ticker || '');
    });
  }, [allStocksOnly, discoverSearchQuery, stockFilter, stockSortBy]);

  // Gefilterde ETF's
  const filteredEtfs = useMemo(() => {
    return allEtfsOnly.filter(s => {
      if (discoverSearchQuery.trim()) {
        const q = discoverSearchQuery.toLowerCase();
        const matchesTicker = s.ticker?.toLowerCase().includes(q);
        const matchesName = s.name?.toLowerCase().includes(q);
        const matchesIsin = s.isin?.toLowerCase().includes(q);
        if (!matchesTicker && !matchesName && !matchesIsin) return false;
      }
      const tobRate = s.taxProfile?.tobRatePct;
      const divPolicy = s.taxProfile?.dividendPolicy || '';
      if (etfFilter === 'TOB_012') return tobRate === 0.12;
      if (etfFilter === 'TOB_132') return tobRate === 1.32;
      if (etfFilter === 'ACC') return divPolicy.toLowerCase().includes('kapitaliserend');
      if (etfFilter === 'DIST') return divPolicy.toLowerCase().includes('uitkerend');
      return true;
    }).sort((a, b) => {
      const da = a.drawdownFromAthPct ?? 999;
      const db = b.drawdownFromAthPct ?? 999;
      return da - db;
    });
  }, [allEtfsOnly, discoverSearchQuery, etfFilter]);

  // Grootste dips t.o.v. Hoogste Prijs (voor Overzicht)
  const biggestDipItems = useMemo(() => {
    return [...enrichedStocks]
      .filter(s => s.drawdownFromAthPct !== null && s.drawdownFromAthPct < -3 && s.currentPrice > 0)
      .sort((a, b) => (a.drawdownFromAthPct ?? 0) - (b.drawdownFromAthPct ?? 0))
      .slice(0, 6);
  }, [enrichedStocks]);

  const DISCOVER_TABS = [
    { id: 'overview', label: 'Overzicht', icon: 'ph-squares-four', badge: null },
    { id: 'stocks', label: 'Aandelen', icon: 'ph-chart-line-up', badge: allStocksOnly.length },
    { id: 'etfs', label: "ETF's & Fondsen", icon: 'ph-pie-chart', badge: allEtfsOnly.length },
    { id: 'tob_checker', label: 'TOB & Belasting Checker', icon: 'ph-scales', badge: '🇧🇪' },
    { id: 'strategies', label: 'Strategieën', icon: 'ph-compass', badge: 'Live' }
  ];

  const STOCK_DETAIL_TABS = [
    { id: 'overview', label: 'Overzicht, Grafiek & Statistieken', icon: 'ph-chart-line-up' },
    { id: 'taxes', label: 'Belastingen & Kosten (1j / 5j / 10j)', icon: 'ph-scales' },
    { id: 'portfolio', label: 'In Mijn Portfolio', icon: 'ph-briefcase' },
    ...((isAdmin || userPermissions.canViewFormulas)
      ? [
          { id: 'calculations', label: 'Strategie Waardering (Admin)', icon: 'ph-calculator' },
          { id: 'alerts', label: 'Strategie Alerts (Admin)', icon: 'ph-bell-ringing' }
        ]
      : [])
  ];

  const ADMIN_TOOLS = [
    { id: 'screener', label: 'Aandelen Screener', icon: 'ph-funnel' },
    { id: 'data', label: 'Data Beheer', icon: 'ph-database' },
    { id: 'calculations_admin', label: 'Berekeningen Beheer', icon: 'ph-calculator' },
    { id: 'sec_fields', label: 'SEC Velden Zoeken', icon: 'ph-magnifying-glass' }
  ];

  return (
    <div className="font-sans text-gray-900 w-full">
      {/* Twee-koloms indeling op Desktop (Links vaste zijkolom zoals bij Portfolio, Rechts inhoud) */}
      <div className="flex flex-col md:flex-row items-start gap-4 lg:gap-5 w-full -mt-1">
        {/* Linkse deel: Zijkolom Navigatie (Desktop) - Exact dezelfde stijl als Portfolio */}
        <aside className="hidden md:flex flex-col w-52 lg:w-56 shrink-0 sticky top-14 h-[calc(100vh-4.8rem)] max-h-[calc(100vh-4.8rem)] justify-between -ml-1 lg:-ml-2 pb-1">
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-3 pr-1">
            {/* 1. Hoofdnavigatie Analyse */}
            <div className="space-y-0.5">
              <div className="px-3 py-1 text-[11px] font-black uppercase tracking-wider text-gray-400">
                Analyse &amp; Ontdekken
              </div>
              {DISCOVER_TABS.map(tab => {
                const isActive = !selectedStock && !activeAdminTool && discoverCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleBackToDiscover(tab.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm transition-all text-left ${
                      isActive
                        ? 'font-black text-blue-600 bg-blue-50/90 shadow-2xs'
                        : 'font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100/70'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <i className={`ph-fill ${tab.icon} text-lg shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}></i>
                      <span className="truncate">{tab.label}</span>
                    </div>
                    {tab.badge !== null && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : tab.id === 'strategies'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-gray-200 text-gray-700'
                      }`}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 2. Sub-navigatie wanneer een specifiek Aandeel geselecteerd is */}
            {selectedStock && !activeAdminTool && (
              <div className="pt-2 border-t border-gray-200/80 space-y-0.5">
                <div className="px-3 py-1 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 truncate">
                    Aandeel: {selectedStock.ticker}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleBackToDiscover('stocks')}
                    className="text-[10px] font-extrabold text-gray-400 hover:text-gray-700"
                    title="Sluit aandeel"
                  >
                    ✕ Sluit
                  </button>
                </div>
                {STOCK_DETAIL_TABS.map(tab => {
                  const isActive = stockDetailTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStockDetailTab(tab.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left ${
                        isActive
                          ? 'font-black text-blue-600 bg-blue-50/90 shadow-2xs'
                          : 'font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100/70'
                      }`}
                    >
                      <i className={`ph-fill ${tab.icon} text-base shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}></i>
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 3. Beheerder Tools in de linker zijkolom (enkel voor Arne/Admin) */}
            {isAdmin && (
              <div className="pt-2 border-t border-gray-200/80 space-y-0.5">
                <div className="px-3 py-1 text-[11px] font-black uppercase tracking-wider text-purple-600">
                  Beheer Tools
                </div>
                {ADMIN_TOOLS.map(tool => {
                  const isActive = activeAdminTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => setActiveAdminTool(isActive ? null : tool.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left ${
                        isActive
                          ? 'font-black text-purple-700 bg-purple-50/90 shadow-2xs'
                          : 'font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100/70'
                      }`}
                    >
                      <i className={`ph-fill ${tool.icon} text-base shrink-0 ${isActive ? 'text-purple-600' : 'text-gray-400'}`}></i>
                      <span className="truncate">{tool.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Onderste vaste sectie: Snel zoeken + Status + Mijn Actieve Strategieën */}
          <div className="shrink-0 mt-auto pt-2 border-t border-gray-200/80 space-y-2 pb-1">
            <div className="relative">
              <i className="ph ph-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                placeholder="Zoek aandeel / ticker..."
                value={discoverSearchQuery}
                onChange={(e) => {
                  setDiscoverSearchQuery(e.target.value);
                  if (selectedStock || activeAdminTool) {
                    setSelectedStock(null);
                    setActiveAdminTool(null);
                    setDiscoverCategory('stocks');
                  }
                }}
                className="w-full pl-7 pr-6 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {discoverSearchQuery && (
                <button
                  type="button"
                  onClick={() => setDiscoverSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Status</span>
              <DataStatusIndicator />
            </div>

            <Link
              to="/strategy-builder"
              state={{ tab: 'active' }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-xs"
            >
              <i className="ph-fill ph-target text-sm"></i>
              <span>Actieve Strategieën</span>
            </Link>
          </div>
        </aside>

        {/* Mobiele Horizontale Navigatiebalk */}
        <div className="md:hidden w-full bg-white p-2.5 rounded-2xl border border-gray-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5">
              {DISCOVER_TABS.map(tab => {
                const isActive = !selectedStock && !activeAdminTool && discoverCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleBackToDiscover(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                      isActive
                        ? 'bg-blue-600 text-white font-black shadow-2xs'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    <i className={`ph-fill ${tab.icon}`}></i>
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <Link
              to="/strategy-builder"
              state={{ tab: 'active' }}
              className="px-2.5 py-1.5 rounded-xl bg-purple-50 text-purple-800 text-xs font-extrabold shrink-0"
            >
              🎯 Actief
            </Link>
          </div>
        </div>

        {/* Rechtse deel: Inhoud van de pagina */}
        <div className="flex-1 min-w-0 w-full space-y-5">
          {activeAdminTool && isAdmin ? (
            <div className="space-y-5">
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-2xs flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleBackToDiscover('stocks')}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                  >
                    <i className="ph-bold ph-arrow-left text-sm"></i>
                    <span>Terug</span>
                  </button>
                  <div>
                    <span className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">Beheerder Tool</span>
                    <h2 className="text-base font-extrabold text-gray-900">
                      {activeAdminTool === 'screener' && '🔍 Aandelen Screener'}
                      {activeAdminTool === 'data' && '🗄️ Data Beheer (Aandelen & Beurzen)'}
                      {activeAdminTool === 'calculations_admin' && '🧮 Berekeningen Beheer'}
                      {activeAdminTool === 'sec_fields' && '🔎 SEC Velden Zoeken'}
                    </h2>
                  </div>
                </div>
              </div>

              <div className="animate-fade-in">
                {activeAdminTool === 'screener' && <StockScreenerTab />}
                {activeAdminTool === 'data' && <AnalysisDataTab selectedStock={selectedStock || enrichedStocks[0]} />}
                {activeAdminTool === 'calculations_admin' && <AnalysisCalculationsTab selectedStock={selectedStock || enrichedStocks[0]} />}
                {activeAdminTool === 'sec_fields' && <SearchSecFields />}
              </div>
            </div>
          ) : selectedStock ? (
            <div className="space-y-5">
              {/* Aandeel / ETF Hero Header (Algemene marktinfo voor alle gebruikers) */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-2xs">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex items-center gap-3.5">
                    <button
                      type="button"
                      onClick={() => handleBackToDiscover(selectedStock.asset_type_name === 'ETF' ? 'etfs' : 'stocks')}
                      className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold"
                      title="Terug naar overzicht"
                    >
                      <i className="ph-bold ph-arrow-left text-sm"></i>
                    </button>
                    <div className={`w-12 h-12 rounded-2xl text-white font-black text-lg flex items-center justify-center shadow-sm tracking-tighter ${
                      selectedStock.asset_type_name === 'ETF'
                        ? 'bg-gradient-to-br from-emerald-600 to-teal-700'
                        : 'bg-gradient-to-br from-blue-600 to-indigo-700'
                    }`}>
                      {selectedStock.ticker}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
                          {selectedStock.name}
                        </h1>
                        <span className="px-2 py-0.5 rounded text-xs font-black bg-gray-100 text-gray-700 border border-gray-200">
                          {selectedStock.ticker}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${
                          selectedStock.asset_type_name === 'ETF'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}>
                          {selectedStock.asset_type_name === 'ETF' ? 'ETF / Fonds' : selectedStock.asset_type_name === 'CRYPTO' ? 'Crypto' : 'Aandeel'}
                        </span>
                        {selectedStock.isin && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-gray-50 text-gray-500 border border-gray-200">
                            ISIN: {selectedStock.isin}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        {/* Algemene Markt Badges (Zichtbaar voor IEDEREEN) */}
                        {selectedStock.currentPrice != null && (
                          <span className="px-2.5 py-0.5 rounded-full font-black bg-gray-900 text-white">
                            Koers: €{Number(selectedStock.currentPrice).toFixed(2)}
                          </span>
                        )}

                        {selectedStock.drawdownFromAthPct != null && (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-black border ${
                            selectedStock.drawdownFromAthPct >= -0.5
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : selectedStock.drawdownFromAthPct <= -20
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-amber-50 text-amber-900 border-amber-200'
                          }`}>
                            <i className="ph-bold ph-trend-down"></i>
                            {selectedStock.drawdownFromAthPct >= -0.5
                              ? `Op Hoogste Prijs (€${Number(selectedStock.athPrice).toFixed(2)})`
                              : `${Number(selectedStock.drawdownFromAthPct).toFixed(1).replace('.', ',')}% onder hoogste prijs (€${Number(selectedStock.athPrice).toFixed(2)} · ${selectedStock.timeSinceAthLabel || selectedStock.athDate})`}
                          </span>
                        )}

                        {selectedStock.taxProfile && (
                          <button
                            type="button"
                            onClick={() => setStockDetailTab('taxes')}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-black bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 transition-colors"
                          >
                            <span>🇧🇪 TOB: {String(selectedStock.taxProfile.tobRatePct).replace('.', ',')}%</span>
                            {selectedStock.taxProfile.terPct != null && (
                              <span>· TER {String(selectedStock.taxProfile.terPct).replace('.', ',')}%</span>
                            )}
                          </button>
                        )}

                        {/* Eigen Strategie Badges (ENKEL zichtbaar voor Beheerder Arne) */}
                        {isAdmin && selectedStock.score === 5 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-black bg-purple-100 text-purple-900 border border-purple-300">
                            <i className="ph-fill ph-lock-key text-purple-700 text-xs"></i>
                            Admin Score 5/5
                          </span>
                        )}

                        {isAdmin && selectedStock.intrinsicValue && (
                          <span className="px-2.5 py-0.5 rounded-full font-bold bg-purple-50 text-purple-900 border border-purple-200">
                            🔒 Intrinsiek: €{Number(selectedStock.intrinsicValue).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sub-tabs voor Aandeel / ETF (ook klikbaar in de linker zijkolom) */}
                <nav className="flex space-x-5 overflow-x-auto no-scrollbar border-t border-gray-100 mt-4 pt-1">
                  {STOCK_DETAIL_TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setStockDetailTab(tab.id)}
                      className={`whitespace-nowrap py-2.5 px-1 border-b-2 font-bold text-xs transition-colors flex items-center gap-1.5 ${
                        stockDetailTab === tab.id
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <i className={`ph-fill ${tab.icon} text-sm`}></i>
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </nav>
              </div>

              <div className="animate-fade-in">
                {stockDetailTab === 'overview' && (
                  <AnalysisChartTab
                    selectedStock={selectedStock}
                    useSharedData={true}
                    sharedCalculations={sharedStockData.stockId === selectedStockId ? sharedStockData.calculations : null}
                    sharedAlerts={sharedStockData.stockId === selectedStockId ? sharedStockData.alerts : null}
                  />
                )}

                {stockDetailTab === 'taxes' && (
                  <AnalysisTaxAndCostTab
                    selectedStock={selectedStock}
                    curvoEtfCatalog={curvoEtfCatalog}
                    allMarketItems={enrichedStocks}
                    onSelectStock={(item) => handleSelectStock(item, 'taxes')}
                  />
                )}

                {stockDetailTab === 'portfolio' && (
                  <AnalysisPortfolioTab selectedStock={selectedStock} />
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

                {stockDetailTab === 'alerts' && (isAdmin || userPermissions.canViewFormulas) && (
                  <AnalysisAlertsTab
                    selectedStock={selectedStock}
                    useSharedData={true}
                    sharedAlerts={sharedStockData.stockId === selectedStockId ? sharedStockData.alerts : null}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Compacte Top Balk voor de actieve Analyse categorie */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">
                    Algemene Markt &amp; Belasting Verkenner
                  </span>
                  <h1 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight">
                    {discoverCategory === 'overview' && "Marktoverzicht: Aandelen, ETF's, Dips & Strategieën"}
                    {discoverCategory === 'stocks' && `Aandelen Verkenner (${filteredStocks.length})`}
                    {discoverCategory === 'etfs' && `ETF's & Fondsen Overzicht (${filteredEtfs.length})`}
                    {discoverCategory === 'tob_checker' && '🇧🇪 Belgische Beurstaks (TOB) & Kosten Checker (1j / 5j / 10j)'}
                    {discoverCategory === 'strategies' && 'Strategie Bibliotheek & Kapitaalverdeling'}
                  </h1>
                </div>

                {discoverCategory !== 'tob_checker' && discoverCategory !== 'strategies' && (
                  <div className="relative w-full sm:w-64">
                    <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                    <input
                      type="text"
                      placeholder="Zoek op naam, ticker of ISIN..."
                      value={discoverSearchQuery}
                      onChange={(e) => setDiscoverSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                    />
                    {discoverSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setDiscoverSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl shadow-2xs text-xs font-bold" role="alert">
                  {error}
                </div>
              )}

              {/* Content per Ontdek Categorie */}
              <div className="animate-fade-in space-y-8">
                {/* ========================================================= */}
                {/* CATEGORIE 1: OVERZICHT (Markt Dips, ETF TOB & Strategieën) */}
                {/* ========================================================= */}
                {discoverCategory === 'overview' && (
                  <div className="space-y-8">
                    {/* Sectie A: Grootste Dips t.o.v. Hoogste Prijs (All-Time High Drawdown) */}
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-rose-600">
                            Algemene Prijsanalyse &amp; Drawdown Radar
                          </span>
                          <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight">
                            Gedaalde Aandelen &amp; ETF&apos;s t.o.v. Hoogste Prijs (All-Time High)
                          </h2>
                          <p className="text-xs text-gray-500">
                            Zie direct hoeveel lager een aandeel of ETF vandaag noteert t.o.v. zijn hoogste koers en hoe lang die piek geleden is.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setDiscoverCategory('stocks'); setStockFilter('BIG_DIP'); }}
                            className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-black transition-colors"
                          >
                            Alle Aandelen ({allStocksOnly.length}) →
                          </button>
                          <button
                            onClick={() => setDiscoverCategory('etfs')}
                            className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-black transition-colors"
                          >
                            Alle ETF&apos;s ({allEtfsOnly.length}) →
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {biggestDipItems.map((item) => (
                          <div
                            key={item.stock_id}
                            onClick={() => handleSelectStock(item)}
                            className="bg-white rounded-2xl p-4 border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2 mb-2.5">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className={`w-10 h-10 rounded-xl font-black text-xs flex items-center justify-center shrink-0 transition-colors ${
                                    item.asset_type_name === 'ETF'
                                      ? 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white'
                                      : 'bg-blue-50 text-blue-700 group-hover:bg-blue-600 group-hover:text-white'
                                  }`}>
                                    {item.ticker}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <h4 className="font-black text-sm text-gray-900 truncate">
                                        {item.ticker}
                                      </h4>
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-gray-100 text-gray-600">
                                        {item.asset_type_name === 'ETF' ? 'ETF' : 'Aandeel'}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 truncate">
                                      {item.name}
                                    </p>
                                  </div>
                                </div>

                                <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                                  {Number(item.drawdownFromAthPct).toFixed(1).replace('.', ',')}%
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 mt-3 p-2.5 rounded-xl bg-gray-50 border border-gray-100 text-xs">
                                <div>
                                  <span className="text-[10px] text-gray-400 font-bold block">Huidige Koers</span>
                                  <span className="font-black text-gray-900">
                                    € {Number(item.currentPrice || 0).toFixed(2)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-gray-400 font-bold block">Hoogste Prijs (ATH)</span>
                                  <span className="font-black text-gray-800">
                                    € {Number(item.athPrice || 0).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px]">
                              <span className="text-gray-500 font-semibold flex items-center gap-1">
                                <i className="ph-fill ph-clock-counter-clockwise text-gray-400"></i>
                                <span>Hoogste punt:</span>
                              </span>
                              <span className="font-black text-gray-800">
                                {item.timeSinceAthLabel || item.athDate || '-'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Sectie B: Belgische Beurstaks (TOB) & 1j / 5j / 10j Kosten Banner */}
                    <div className="bg-gradient-to-r from-blue-950 via-indigo-950 to-slate-900 rounded-2xl p-5 sm:p-6 text-white border border-blue-500/30 shadow-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                      <div className="space-y-1.5 max-w-2xl">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                            🇧🇪 Curvo TOB &amp; ETF Kosten Simulator
                          </span>
                          <span className="text-xs text-blue-200 font-bold">
                            0,12% · 0,35% · 1,32%
                          </span>
                        </div>
                        <h3 className="text-lg sm:text-xl font-black text-white">
                          Hoeveel belastingen &amp; kosten betaal je op een Aandeel of ETF na 1 jaar, 5 jaar of 10 jaar?
                        </h3>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Vergelijk verschillende ETF&apos;s (zoals IWDA, VWCE, SWRD, CSPX, EMIM) en aandelen naast elkaar inclusief Belgische beurstaks (TOB), lopende TER-kosten en 30% roerende voorheffing op dividenden.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDiscoverCategory('tob_checker')}
                        className="px-4 py-2.5 rounded-xl bg-white hover:bg-blue-50 text-slate-900 font-black text-xs transition-all shadow-sm shrink-0 flex items-center gap-2"
                      >
                        <i className="ph-fill ph-scales text-blue-600 text-base"></i>
                        <span>Open TOB &amp; ETF Checker →</span>
                      </button>
                    </div>

                    {/* Sectie C: Uitgelichte Strategieën */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Automatische Signalen &amp; Kapitaalverdeling</span>
                          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
                            Beschikbare Strategieën
                          </h2>
                        </div>
                        <button
                          onClick={() => setDiscoverCategory('strategies')}
                          className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <span>Bekijk &amp; activeer strategieën</span>
                          <i className="ph-bold ph-arrow-right"></i>
                        </button>
                      </div>

                      <StrategyExplorerTab />
                    </div>
                  </div>
                )}

                {/* ========================================================= */}
                {/* CATEGORIE 2: AANDELEN (Algemene Markt, ATH Drawdown, P/E) */}
                {/* ========================================================= */}
                {discoverCategory === 'stocks' && (
                  <div className="space-y-5">
                    {/* Filterbalk & Sortering */}
                    <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-2xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full lg:w-auto">
                        <button
                          onClick={() => setStockFilter('ALL')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                            stockFilter === 'ALL'
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Alle Aandelen ({allStocksOnly.length})
                        </button>
                        <button
                          onClick={() => setStockFilter('BIG_DIP')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                            stockFilter === 'BIG_DIP'
                              ? 'bg-rose-600 text-white shadow-2xs'
                              : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                          }`}
                        >
                          📉 Flink Gedaald (&gt;15% onder hoogste prijs)
                        </button>
                        <button
                          onClick={() => setStockFilter('NEAR_ATH')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                            stockFilter === 'NEAR_ATH'
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          🚀 Dichtbij Hoogste Prijs (&lt;5% van top)
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => setStockFilter('SCORE_5')}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
                              stockFilter === 'SCORE_5'
                                ? 'bg-purple-600 text-white shadow-2xs'
                                : 'bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100'
                            }`}
                          >
                            <span>🔒 Admin Score 5/5 ({allStocksOnly.filter(s => s.score === 5).length})</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
                        <span className="text-[11px] font-bold text-gray-400">Sorteer op:</span>
                        <select
                          value={stockSortBy}
                          onChange={(e) => setStockSortBy(e.target.value)}
                          className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800"
                        >
                          <option value="DRAWDOWN">Grootste daling t.o.v. Hoogste Prijs</option>
                          <option value="RETURN_1Y">Beste 1-Jaars Rendement</option>
                          <option value="TICKER">Ticker (A - Z)</option>
                        </select>
                      </div>
                    </div>

                    {/* Aandelen Tabel met Algemene Marktinfo + ATH Drawdown & Hoe lang geleden */}
                    {loading ? (
                      <div className="bg-white rounded-2xl p-16 text-center border border-gray-200">
                        <i className="ph-bold ph-spinner animate-spin text-3xl text-blue-600 mb-2"></i>
                        <p className="text-xs font-bold text-gray-500">Aandelen &amp; koersstatistieken ophalen...</p>
                      </div>
                    ) : filteredStocks.length === 0 ? (
                      <div className="bg-white rounded-2xl p-16 text-center border border-gray-200 space-y-2">
                        <i className="ph-fill ph-magnifying-glass text-4xl text-gray-300"></i>
                        <h3 className="text-base font-bold text-gray-800">Geen aandelen gevonden</h3>
                        <p className="text-xs text-gray-400">Probeer een andere zoekterm of filter.</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
                              <tr>
                                <th className="py-3 px-4">Aandeel</th>
                                <th className="py-3 px-4 text-right">Huidige Koers</th>
                                <th className="py-3 px-4 text-right">Hoogste Prijs (ATH)</th>
                                <th className="py-3 px-4 text-right">T.o.v. Hoogste Prijs &amp; Geleden</th>
                                <th className="py-3 px-4 text-center">52-Weken Bandbreedte</th>
                                <th className="py-3 px-4 text-right">1J Rendement</th>
                                <th className="py-3 px-4 text-right">P/E &amp; ROE</th>
                                <th className="py-3 px-4 text-center">🇧🇪 TOB</th>
                                <th className="py-3 px-4 text-right">Details</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                              {filteredStocks.map((stock) => {
                                const isAtAth = stock.drawdownFromAthPct != null && stock.drawdownFromAthPct >= -0.5;
                                return (
                                  <tr
                                    key={stock.stock_id}
                                    onClick={() => handleSelectStock(stock)}
                                    className="hover:bg-blue-50/60 cursor-pointer transition-colors group"
                                  >
                                    <td className="py-3.5 px-4">
                                      <div className="flex items-center gap-3">
                                        <span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 font-black text-xs flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                          {stock.ticker}
                                        </span>
                                        <div>
                                          <div className="flex items-center gap-1.5">
                                            <span className="font-extrabold text-sm text-gray-900 group-hover:text-blue-600 transition-colors">
                                              {stock.ticker}
                                            </span>
                                            {isAdmin && stock.score === 5 && (
                                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-purple-100 text-purple-800" title="Admin Score 5/5">
                                                5/5
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-[11px] text-gray-400 truncate max-w-[200px]">
                                            {stock.name}
                                          </div>
                                        </div>
                                      </div>
                                    </td>

                                    <td className="py-3.5 px-4 text-right font-black text-gray-900 text-sm">
                                      {stock.currentPrice != null ? `€ ${Number(stock.currentPrice).toFixed(2)}` : '-'}
                                    </td>

                                    <td className="py-3.5 px-4 text-right font-bold text-gray-700">
                                      {stock.athPrice != null ? (
                                        <div>
                                          <div>€ {Number(stock.athPrice).toFixed(2)}</div>
                                          <div className="text-[10px] text-gray-400">{stock.athDate}</div>
                                        </div>
                                      ) : '-'}
                                    </td>

                                    <td className="py-3.5 px-4 text-right">
                                      {stock.drawdownFromAthPct != null ? (
                                        <div className="inline-flex flex-col items-end">
                                          <span className={`px-2 py-0.5 rounded-lg text-xs font-black ${
                                            isAtAth
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : stock.drawdownFromAthPct <= -20
                                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                                          }`}>
                                            {isAtAth ? 'Op Hoogste Prijs' : `${Number(stock.drawdownFromAthPct).toFixed(1).replace('.', ',')}%`}
                                          </span>
                                          <span className="text-[10px] font-bold text-gray-400 mt-0.5">
                                            {stock.timeSinceAthLabel || '-'}
                                          </span>
                                        </div>
                                      ) : '-'}
                                    </td>

                                    <td className="py-3.5 px-4">
                                      {stock.low52w != null && stock.high52w != null ? (
                                        <div className="w-32 mx-auto">
                                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                              className="h-full bg-gradient-to-r from-amber-400 to-blue-600 rounded-full"
                                              style={{ width: `${Math.min(100, Math.max(5, stock.range52wPositionPct || 50))}%` }}
                                            />
                                          </div>
                                          <div className="flex justify-between text-[10px] text-gray-400 font-bold mt-1">
                                            <span>€{Number(stock.low52w).toFixed(0)}</span>
                                            <span>€{Number(stock.high52w).toFixed(0)}</span>
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-gray-300 block text-center">-</span>
                                      )}
                                    </td>

                                    <td className="py-3.5 px-4 text-right font-black">
                                      {stock.return1yPct != null ? (
                                        <span className={stock.return1yPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                          {stock.return1yPct > 0 ? '+' : ''}{Number(stock.return1yPct).toFixed(1).replace('.', ',')}%
                                        </span>
                                      ) : '-'}
                                    </td>

                                    <td className="py-3.5 px-4 text-right text-[11px]">
                                      {stock.fundamentals ? (
                                        <div>
                                          <div className="font-black text-gray-800">
                                            {stock.fundamentals.peRatio != null ? `P/E ${Number(stock.fundamentals.peRatio).toFixed(1)}x` : '-'}
                                          </div>
                                          <div className="text-[10px] text-gray-400 font-bold">
                                            {stock.fundamentals.roePct != null ? `ROE ${Number(stock.fundamentals.roePct).toFixed(1)}%` : ''}
                                          </div>
                                        </div>
                                      ) : '-'}
                                    </td>

                                    <td className="py-3.5 px-4 text-center">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSelectStock(stock, 'taxes');
                                        }}
                                        className="px-2 py-0.5 rounded-lg text-[11px] font-black bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
                                        title="Bekijk 1j / 5j / 10j belastingen & kosten"
                                      >
                                        {stock.taxProfile ? `${String(stock.taxProfile.tobRatePct).replace('.', ',')}%` : '0,35%'}
                                      </button>
                                    </td>

                                    <td className="py-3.5 px-4 text-right">
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 group-hover:bg-blue-600 group-hover:text-white text-gray-700 font-bold text-xs rounded-xl transition-colors">
                                        <span>Analyse</span>
                                        <i className="ph-bold ph-arrow-right text-xs"></i>
                                      </span>
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

                {/* ========================================================= */}
                {/* CATEGORIE 3: ETF'S & FONDSEN (Onderscheid + Belgische TOB) */}
                {/* ========================================================= */}
                {discoverCategory === 'etfs' && (
                  <div className="space-y-5">
                    {/* Filterbalk voor ETF's */}
                    <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-2xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full lg:w-auto">
                        <button
                          onClick={() => setEtfFilter('ALL')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                            etfFilter === 'ALL'
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Alle ETF&apos;s in Database ({allEtfsOnly.length})
                        </button>
                        <button
                          onClick={() => setEtfFilter('TOB_012')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                            etfFilter === 'TOB_012'
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          🇧🇪 Lage Beurstaks: 0,12% TOB
                        </button>
                        <button
                          onClick={() => setEtfFilter('TOB_132')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                            etfFilter === 'TOB_132'
                              ? 'bg-rose-600 text-white shadow-2xs'
                              : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                          }`}
                        >
                          ⚠️ Hoge Beurstaks: 1,32% TOB (bv. VWCE)
                        </button>
                        <button
                          onClick={() => setEtfFilter('ACC')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                            etfFilter === 'ACC'
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Kapitaliserend (0% dividendbelasting)
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setDiscoverCategory('tob_checker')}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition-all shrink-0 flex items-center gap-1.5"
                      >
                        <i className="ph-fill ph-scales"></i>
                        <span>Vergelijk 1j / 5j / 10j ETF Kosten →</span>
                      </button>
                    </div>

                    {/* ETF Tabel */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
                            <tr>
                              <th className="py-3 px-4">ETF / Tracker</th>
                              <th className="py-3 px-4 text-right">Huidige Koers</th>
                              <th className="py-3 px-4 text-right">Hoogste Prijs (ATH)</th>
                              <th className="py-3 px-4 text-right">T.o.v. Hoogste Prijs &amp; Geleden</th>
                              <th className="py-3 px-4 text-right">1J Rendement</th>
                              <th className="py-3 px-4 text-center">🇧🇪 Belgische TOB</th>
                              <th className="py-3 px-4 text-center">Dividend &amp; RV</th>
                              <th className="py-3 px-4 text-right">Jaarlijkse TER</th>
                              <th className="py-3 px-4 text-right">1j / 5j / 10j Kosten</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                            {filteredEtfs.map((etf) => {
                              const isAtAth = etf.drawdownFromAthPct != null && etf.drawdownFromAthPct >= -0.5;
                              const tobRate = etf.taxProfile?.tobRatePct ?? 0.12;
                              return (
                                <tr
                                  key={etf.stock_id}
                                  onClick={() => handleSelectStock(etf)}
                                  className="hover:bg-emerald-50/50 cursor-pointer transition-colors group"
                                >
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center gap-3">
                                      <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 font-black text-xs flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                        {etf.ticker}
                                      </span>
                                      <div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-extrabold text-sm text-gray-900 group-hover:text-emerald-700 transition-colors">
                                            {etf.ticker}
                                          </span>
                                          {etf.isin && (
                                            <span className="text-[10px] font-mono text-gray-400">
                                              {etf.isin}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[11px] text-gray-500 truncate max-w-[230px]">
                                          {etf.name}
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  <td className="py-3.5 px-4 text-right font-black text-gray-900 text-sm">
                                    {etf.currentPrice != null ? `€ ${Number(etf.currentPrice).toFixed(2)}` : '-'}
                                  </td>

                                  <td className="py-3.5 px-4 text-right font-bold text-gray-700">
                                    {etf.athPrice != null ? (
                                      <div>
                                        <div>€ {Number(etf.athPrice).toFixed(2)}</div>
                                        <div className="text-[10px] text-gray-400">{etf.athDate}</div>
                                      </div>
                                    ) : '-'}
                                  </td>

                                  <td className="py-3.5 px-4 text-right">
                                    {etf.drawdownFromAthPct != null ? (
                                      <div className="inline-flex flex-col items-end">
                                        <span className={`px-2 py-0.5 rounded-lg text-xs font-black ${
                                          isAtAth
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                                        }`}>
                                          {isAtAth ? 'Op Hoogste Prijs' : `${Number(etf.drawdownFromAthPct).toFixed(1).replace('.', ',')}%`}
                                        </span>
                                        <span className="text-[10px] font-bold text-gray-400 mt-0.5">
                                          {etf.timeSinceAthLabel || '-'}
                                        </span>
                                      </div>
                                    ) : '-'}
                                  </td>

                                  <td className="py-3.5 px-4 text-right font-black">
                                    {etf.return1yPct != null ? (
                                      <span className={etf.return1yPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                        {etf.return1yPct > 0 ? '+' : ''}{Number(etf.return1yPct).toFixed(1).replace('.', ',')}%
                                      </span>
                                    ) : '-'}
                                  </td>

                                  <td className="py-3.5 px-4 text-center">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border ${
                                      tobRate === 0.12
                                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                        : tobRate === 1.32
                                        ? 'bg-rose-100 text-rose-900 border-rose-300'
                                        : 'bg-amber-100 text-amber-900 border-amber-300'
                                    }`}>
                                      {String(tobRate).replace('.', ',')}% TOB
                                    </span>
                                  </td>

                                  <td className="py-3.5 px-4 text-center">
                                    <span className="text-[11px] font-bold text-gray-700">
                                      {etf.taxProfile?.dividendPolicy?.includes('Kapitaliserend') ? 'Kapitaliserend (0% RV)' : 'Uitkerend (30% RV)'}
                                    </span>
                                  </td>

                                  <td className="py-3.5 px-4 text-right font-black text-gray-800">
                                    {etf.taxProfile?.terPct != null ? `${String(etf.taxProfile.terPct).replace('.', ',')}% / jr` : '0,20% / jr'}
                                  </td>

                                  <td className="py-3.5 px-4 text-right">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectStock(etf, 'taxes');
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 font-black text-xs rounded-xl transition-colors"
                                    >
                                      <i className="ph-fill ph-scales"></i>
                                      <span>1j / 5j / 10j</span>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ========================================================= */}
                {/* CATEGORIE 4: BELGISCHE TOB & ETF KOSTEN CHECKER (CURVO)    */}
                {/* ========================================================= */}
                {discoverCategory === 'tob_checker' && (
                  <AnalysisTaxAndCostTab
                    selectedStock={null}
                    curvoEtfCatalog={curvoEtfCatalog}
                    allMarketItems={enrichedStocks}
                    onSelectStock={(item) => handleSelectStock(item, 'taxes')}
                  />
                )}

                {/* ========================================================= */}
                {/* CATEGORIE 5: STRATEGIEËN (Strategie Catalogus Tab)        */}
                {/* ========================================================= */}
                {discoverCategory === 'strategies' && (
                  <StrategyExplorerTab />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analysis;

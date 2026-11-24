import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import http from '../../http-common';
import toast from 'react-hot-toast';

const StrategyExplorerTab = ({ onSelectStrategyForBuilder }) => {
  const navigate = useNavigate();
  const uid = Number(localStorage.getItem('userID') || 0);
  const userRole = localStorage.getItem('role') || 'user';
  const isRealAdmin = uid === 1 || userRole === 'admin';
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

  const [strategies, setStrategies] = useState([]);
  const [activeStrategies, setActiveStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'official' | 'my'
  const [activatingId, setActivatingId] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Modal state voor direct configureren van Kapitaalverdeling & Prioriteit bij het selecteren van een strategie
  const [configModalStrat, setConfigModalStrat] = useState(null);
  const [modalPriority, setModalPriority] = useState(1);
  const [modalFundingMode, setModalFundingMode] = useState('available_cash');
  const [modalBudgetOrPct, setModalBudgetOrPct] = useState(500);
  const [modalAllowSelling, setModalAllowSelling] = useState('full_strategy');

  const fetchStrategies = async () => {
    setLoading(true);
    setError('');
    try {
      const [res, cfgRes] = await Promise.all([
        http.get('/strategies'),
        http.get('/strategies/my-config').catch(() => ({ data: null }))
      ]);
      setStrategies(res.data || []);
      if (cfgRes?.data?.activeStrategies) {
        setActiveStrategies(cfgRes.data.activeStrategies);
      }
    } catch (err) {
      console.error('Fout bij ophalen strategieën:', err);
      setError('Kon strategieën niet ophalen. Probeer het later opnieuw.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStrategies();
  }, []);

  // Bereken hoeveel % van de totale portefeuillewaarde al door andere actieve strategieën wordt gebruikt
  const usedTotalPortfolioPct = useMemo(() => {
    return activeStrategies
      .filter(a => a.funding_mode === 'pct_total_portfolio' && Number(a.strategy_id) !== Number(configModalStrat?.strategy_id))
      .reduce((sum, a) => sum + Number(a.monthly_budget || 0), 0);
  }, [activeStrategies, configModalStrat]);

  const remainingPortfolioPct = Math.max(0, 100 - usedTotalPortfolioPct);

  const openConfigureAndActivateModal = (strategy) => {
    const existingActive = activeStrategies.find(a => Number(a.strategy_id) === Number(strategy.strategy_id));
    const isEtf = (strategy.strategy_type || 'STOCKS').toUpperCase() === 'ETF';

    setConfigModalStrat(strategy);
    setModalPriority(existingActive ? Number(existingActive.priority_order || 1) : (activeStrategies.length + 1));
    const defaultMode = existingActive
      ? existingActive.funding_mode
      : (isEtf ? 'monthly_amount' : 'available_cash');
    setModalFundingMode(defaultMode);
    setModalBudgetOrPct(
      existingActive
        ? Number(existingActive.monthly_budget || (isEtf ? 450 : 500))
        : (defaultMode === 'monthly_amount' ? 450 : defaultMode === 'pct_total_portfolio' ? Math.max(10, Math.min(100, remainingPortfolioPct)) : 100)
    );
    setModalAllowSelling(
      existingActive
        ? existingActive.allow_selling
        : (isEtf ? 'buy_only' : 'full_strategy')
    );
  };

  const handleConfirmActivateStrategy = async () => {
    if (!configModalStrat) return;
    if (modalFundingMode === 'pct_total_portfolio' && (Number(modalBudgetOrPct) <= 0 || Number(modalBudgetOrPct) > remainingPortfolioPct)) {
      toast.error(`Kies een percentage tussen 1% en ${remainingPortfolioPct}% (totaal mag niet boven 100% uitkomen).`);
      return;
    }

    setActivatingId(configModalStrat.strategy_id);
    setSuccessMessage('');
    setError('');
    try {
      const existingActive = activeStrategies.find(a => Number(a.strategy_id) === Number(configModalStrat.strategy_id));
      const res = await http.post('/strategies/my-active', {
        active_entry_id: existingActive?.active_entry_id || null,
        strategy_id: Number(configModalStrat.strategy_id),
        priority_order: Number(modalPriority),
        funding_mode: modalFundingMode,
        monthly_budget: Number(modalBudgetOrPct || 0),
        allow_selling: modalAllowSelling
      });
      const msg = res.data?.message || `Strategie "${configModalStrat.name}" is nu actief voor jouw portefeuille!`;
      setSuccessMessage(msg);
      toast.success('Strategie geactiveerd & kapitaalverdeling opgeslagen!');
      setConfigModalStrat(null);
      await fetchStrategies();
      setTimeout(() => setSuccessMessage(''), 6000);
    } catch (err) {
      console.error('Fout bij activeren strategie:', err);
      const errMsg = err.response?.data?.message || 'Kon strategie niet activeren.';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setActivatingId(null);
    }
  };

  const filteredStrategies = useMemo(() => {
    return strategies.filter(strat => {
      const matchesSearch = 
        (strat.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (strat.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (strat.creator_username || '').toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (activeFilter === 'official') return strat.is_system_default;
      if (activeFilter === 'my') return strat.is_owner;
      return true;
    });
  }, [strategies, searchQuery, activeFilter]);

  return (
    <div className="space-y-6">
      {/* 1. Header & Zoekbalk */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <i className="ph-fill ph-compass text-2xl"></i>
              </span>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Strategie Bibliotheek &amp; Zoeken</h2>
                <p className="text-sm text-gray-500">
                  Verken gevalideerde handelsstrategieën, bekijk historische prestaties en activeer ze voor jouw live signalen.
                </p>
              </div>
            </div>
          </div>

          {/* Zoekbalk */}
          <div className="w-full md:w-80 relative">
            <i className="ph ph-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
            <input
              type="text"
              placeholder="Zoek op naam, trefwoord of maker..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-xs"
            />
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 pt-4 flex-wrap">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeFilter === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Alle Strategieën ({strategies.length})
          </button>
          <button
            onClick={() => setActiveFilter('official')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeFilter === 'official'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <i className="ph-fill ph-star text-amber-300"></i>
            Officiële Live Strategieën ({strategies.filter(s => s.is_system_default).length})
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveFilter('my')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeFilter === 'my'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <i className="ph-fill ph-user"></i>
              Door Mij Gemaakt ({strategies.filter(s => s.is_owner).length})
            </button>
          )}

          <Link
            to="/strategy-builder"
            state={{ tab: 'active' }}
            className="ml-auto px-3.5 py-1.5 rounded-lg text-xs font-extrabold bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 transition-all flex items-center gap-1.5"
          >
            <i className="ph-fill ph-target text-purple-600"></i>
            <span>Mijn Actieve Strategieën &amp; Prioriteit ({activeStrategies.length})</span>
          </Link>
        </div>
      </div>

      {/* Notificaties */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-sm flex items-center gap-3 animate-fade-in shadow-xs">
          <i className="ph-fill ph-check-circle text-xl text-emerald-600 flex-shrink-0"></i>
          <span className="font-semibold">{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm flex items-center gap-3 shadow-xs">
          <i className="ph-fill ph-warning-circle text-xl flex-shrink-0"></i>
          <span>{error}</span>
        </div>
      )}

      {/* 2. Grid met Strategieën */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 shadow-sm">
          <i className="ph-bold ph-spinner animate-spin text-3xl text-blue-600 mb-3"></i>
          <p className="text-sm font-semibold text-gray-600">Strategieën ophalen...</p>
        </div>
      ) : filteredStrategies.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 shadow-sm space-y-3">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400 text-2xl">
            <i className="ph ph-folder-notch-open"></i>
          </div>
          <h3 className="text-base font-bold text-gray-900">Geen strategieën gevonden</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            {searchQuery 
              ? `Er zijn geen strategieën die overeenkomen met "${searchQuery}".` 
              : 'Er zijn nog geen strategieën aangemaakt in deze weergave.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredStrategies.map((strat) => {
            const perf = strat.performance_summary || {};
            const isReturnPositive = (perf.totalReturnPct || 0) >= 0;

            return (
              <div 
                key={strat.strategy_id} 
                className={`bg-white rounded-2xl p-6 border transition-all flex flex-col justify-between shadow-xs hover:shadow-md ${
                  strat.is_active_for_me 
                    ? 'border-emerald-400 ring-2 ring-emerald-500/20' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div>
                  {/* Bovenste badges */}
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      {strat.is_system_default ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
                          <i className="ph-fill ph-star text-amber-500 text-xs"></i>
                          Officiële Live Strategie
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          <i className="ph-fill ph-lightbulb"></i>
                          Aangepaste Strategie
                        </span>
                      )}

                      {strat.is_public ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">
                          🌐 Publiek
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          🔒 Privé
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                      <i className="ph-fill ph-user-circle text-gray-400 text-sm"></i>
                      Door <strong className="text-gray-900">{strat.creator_username}</strong>
                    </span>
                  </div>

                  {/* Strategienaam & Omschrijving */}
                  <h3 className="text-lg font-extrabold text-gray-900 mb-2">
                    {strat.name}
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed mb-5 min-h-[36px]">
                    {strat.description || 'Geen uitgebreide beschrijving opgegeven.'}
                  </p>

                  {/* Prestatie Kaartjes met XIRR (Geen formules, enkel resultaten!) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-gray-50/80 rounded-xl border border-gray-200 mb-5">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Totaal Rendement</div>
                      <div className={`text-base font-black mt-0.5 ${isReturnPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                        {perf.totalReturnPct != null ? `${perf.totalReturnPct >= 0 ? '+' : ''}${perf.totalReturnPct.toFixed(1)}%` : 'N.v.t.'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-1" title="Extended Internal Rate of Return (Geannualiseerd rendement per jaar)">
                        <span>XIRR / Jaar</span>
                        <i className="ph ph-info text-xs"></i>
                      </div>
                      <div className="text-base font-black text-indigo-700 mt-0.5">
                        {perf.xirrPct != null 
                          ? `${perf.xirrPct >= 0 ? '+' : ''}${perf.xirrPct.toFixed(1)}%` 
                          : perf.cagrPct != null
                          ? `${perf.cagrPct >= 0 ? '+' : ''}${perf.cagrPct.toFixed(1)}%`
                          : (perf.totalReturnPct ? `+${((Math.pow(1 + perf.totalReturnPct / 100, 1 / 10.75) - 1) * 100).toFixed(1)}%` : '-')}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Win Rate</div>
                      <div className="text-base font-black text-gray-800 mt-0.5">
                        {perf.winRate != null ? `${perf.winRate.toFixed(0)}%` : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Max Drawdown</div>
                      <div className="text-base font-black text-rose-600 mt-0.5">
                        {perf.maxDrawdownPct != null ? `-${perf.maxDrawdownPct.toFixed(1)}%` : '-'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actiebalk */}
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                  {/* Intellectueel Eigendom Bescherming Label */}
                  {!strat.can_view_details && (
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      <i className="ph ph-lock text-xs"></i>
                      Formules &amp; parameters beschermd
                    </span>
                  )}

                  {/* Knoppen */}
                  <div className="flex items-center gap-2 ml-auto">
                    {/* Bewerkknop ENKEL voor beheerder (Arne) */}
                    {isAdmin && (
                      <button
                        onClick={() => {
                          if (onSelectStrategyForBuilder) {
                            onSelectStrategyForBuilder(strat);
                          } else {
                            navigate('/strategy-builder', { state: { strategyToEdit: strat } });
                          }
                        }}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-800 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
                        title="Open en bewerk deze strategie in de Strategie Builder"
                      >
                        <i className="ph-bold ph-sliders-horizontal text-blue-600"></i>
                        <span>Bewerken</span>
                      </button>
                    )}

                    {/* Selecteer & Configureer knop voor iedereen */}
                    {strat.is_active_for_me ? (
                      <button
                        type="button"
                        onClick={() => openConfigureAndActivateModal(strat)}
                        className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-300 flex items-center gap-1.5 shadow-xs transition-all"
                        title="Pas inlegmethode, percentage/bedrag of prioriteit van deze actieve strategie aan"
                      >
                        <i className="ph-fill ph-check-circle text-emerald-600 text-sm"></i>
                        <span>Actief (Prio #{strat.priority_order || 1}) • Instellen</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openConfigureAndActivateModal(strat)}
                        disabled={activatingId === strat.strategy_id}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <i className="ph-bold ph-lightning"></i>
                        <span>Selecteer &amp; Configureer</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Modal: Direct bij het selecteren van een strategie aanduiden hoe de strategie met kapitaal moet omgaan */}
      {configModalStrat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 border border-gray-200 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-200">
                  Strategie Selecteren &amp; Kapitaal Instellen
                </span>
                <h3 className="text-base sm:text-lg font-black text-gray-900 mt-1">
                  {configModalStrat.name}
                </h3>
                <p className="text-xs text-gray-500">
                  Geef aan hoe deze strategie met je kapitaal, maandbedrag of cash moet omgaan (ook i.c.m. andere strategieën).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfigModalStrat(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* 1. Prioriteitsvolgorde */}
              <div>
                <label className="block font-extrabold text-gray-800 mb-1">
                  1. Prioriteit (Volgorde waarin je strategieën kapitaal reserveren):
                </label>
                <select
                  value={modalPriority}
                  onChange={(e) => setModalPriority(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl font-bold text-gray-900 outline-none focus:bg-white focus:border-blue-500"
                >
                  {Array.from({ length: Math.max(1, activeStrategies.length + (configModalStrat.is_active_for_me ? 0 : 1)) }, (_, i) => i + 1).map(p => (
                    <option key={p} value={p}>
                      Prioriteit #{p} {p === 1 ? '— Hoogste prioriteit (reserveert als eerste cash)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Hoe gaat deze strategie om met je geld? */}
              <div>
                <label className="block font-extrabold text-gray-800 mb-1">
                  2. Hoe moet deze strategie met je geld omgaan?
                </label>
                <select
                  value={modalFundingMode}
                  onChange={(e) => {
                    const m = e.target.value;
                    setModalFundingMode(m);
                    if (m === 'monthly_amount') setModalBudgetOrPct(450);
                    else if (m === 'pct_total_portfolio') setModalBudgetOrPct(Math.max(10, Math.min(100, remainingPortfolioPct)));
                    else if (m === 'pct_available_cash') setModalBudgetOrPct(100);
                  }}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl font-bold text-gray-900 outline-none focus:bg-white focus:border-blue-500"
                >
                  <option value="monthly_amount">📅 Vast Maandelijks Bedrag (€ / maand)</option>
                  <option value="pct_total_portfolio">📊 Percentage van Totale Portefeuillewaarde (Belegd + Cash samen)</option>
                  <option value="pct_available_cash">💰 Percentage van Beschikbare Vrije Cash</option>
                  <option value="available_cash">💵 100% van Resterende Beschikbare Vrije Cash</option>
                  <option value="cash_plus_rotation">🔄 Vrije Cash + Actieve Rotatie (Snoeien in zwakkere posities)</option>
                </select>
              </div>

              {/* 3. Bedrag of Percentage invullen */}
              {['monthly_amount', 'pct_total_portfolio', 'pct_available_cash'].includes(modalFundingMode) && (
                <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-1.5">
                  <label className="block font-black text-blue-950">
                    {modalFundingMode === 'monthly_amount'
                      ? 'Maandelijks Bedrag (€ per maand):'
                      : modalFundingMode === 'pct_total_portfolio'
                      ? `Percentage van Totale Portefeuillewaarde (max. ${remainingPortfolioPct}% beschikbaar):`
                      : 'Percentage van Beschikbare Vrije Cash (%):'}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={modalFundingMode === 'monthly_amount' ? '25' : '5'}
                      max={modalFundingMode === 'monthly_amount' ? '100000' : String(modalFundingMode === 'pct_total_portfolio' ? remainingPortfolioPct : 100)}
                      step={modalFundingMode === 'monthly_amount' ? '25' : '5'}
                      value={modalBudgetOrPct}
                      onChange={(e) => setModalBudgetOrPct(e.target.value)}
                      className="w-40 px-3 py-2 bg-white border border-blue-300 rounded-xl font-black text-sm text-gray-900 outline-none"
                    />
                    <span className="font-bold text-blue-900">
                      {modalFundingMode === 'monthly_amount' ? '€ / maand' : '%'}
                    </span>
                  </div>
                  {modalFundingMode === 'pct_total_portfolio' && usedTotalPortfolioPct > 0 && (
                    <p className="text-[11px] text-blue-800">
                      Je andere actieve strategieën gebruiken al <strong>{usedTotalPortfolioPct}%</strong> van je totale waarde. Samen blijft het zo gegarandeerd ≤ 100%.
                    </p>
                  )}
                </div>
              )}

              {/* 4. Verkoopregels */}
              <div>
                <label className="block font-extrabold text-gray-800 mb-1">
                  3. Hoe moet deze strategie omgaan met verkopen?
                </label>
                <select
                  value={modalAllowSelling}
                  onChange={(e) => setModalAllowSelling(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl font-bold text-gray-900 outline-none focus:bg-white focus:border-blue-500"
                >
                  <option value="full_strategy">✅ Volledige verkoop- &amp; snoeiregels van de strategie volgen</option>
                  <option value="score_drop_only">🛡️ Enkel verkopen bij kwaliteitsverlies (Score &lt; 5)</option>
                  <option value="buy_only">🔒 Nooit verkopen (100% Buy &amp; Hold / Enkel koopsignalen)</option>
                </select>
              </div>

              {/* Waterval Uitleg */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-gray-600 leading-relaxed">
                <strong>💡 Hoe werkt dit samen met andere strategieën?</strong> Het systeem werkt met een strikte <strong>Prioriteits-waterval (#1 ➔ #2 ➔ #3)</strong>. Strategie #1 reserveert altijd als eerste haar maandpot of percentage; Strategie #2 rekent uitsluitend met de overgebleven cash of haar eigen %-plafond. Je kunt deze volgorde altijd aanpassen onder <em>Mijn Actieve Strategieën &amp; Prioriteit</em>.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setConfigModalStrat(null)}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-extrabold"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={handleConfirmActivateStrategy}
                disabled={activatingId === configModalStrat.strategy_id}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <i className="ph-bold ph-check-circle"></i>
                <span>{configModalStrat.is_active_for_me ? 'Instellingen Opslaan' : 'Strategie Activeren'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StrategyExplorerTab;


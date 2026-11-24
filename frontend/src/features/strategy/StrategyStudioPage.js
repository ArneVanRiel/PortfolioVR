import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, Link } from 'react-router-dom';
import http from '../../http-common';
import toast from 'react-hot-toast';
import StrategyBuilderTab from '../analysis/StrategyBuilderTab';
import StrategyBacktestTab from '../analysis/StrategyBacktestTab';
import DataStatusIndicator from '../../components/ui/DataStatusIndicator';

const StrategyStudioPage = () => {
  const location = useLocation();
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

  const [activeTab, setActiveTab] = useState(() => (isAdmin ? 'builder' : 'active')); // 'active' | 'builder' | 'backtest'
  const [strategyToEdit, setStrategyToEdit] = useState(null);

  // Voor normale gebruikers is ENKEL het tabblad 'Mijn Actieve Strategieën & Prioriteit' ('active') zichtbaar!
  useEffect(() => {
    if (!isAdmin && activeTab !== 'active') {
      setActiveTab('active');
    }
  }, [isAdmin, activeTab]);

  // Mijn Actieve Strategieën & Prioriteit state (verplaatst vanuit Strategie Assistent naar Strategie Builder)
  const [myStrategyConfig, setMyStrategyConfig] = useState(null);
  const [allStrategiesList, setAllStrategiesList] = useState([]);
  const [activeStrategiesDraft, setActiveStrategiesDraft] = useState([]);
  const [showAddStrategyForm, setShowAddStrategyForm] = useState(false);
  const [newStratId, setNewStratId] = useState(1);
  const [newStratPriority, setNewStratPriority] = useState(1);
  const [newStratFundingMode, setNewStratFundingMode] = useState('available_cash');
  const [newStratMonthlyBudget, setNewStratMonthlyBudget] = useState(500);
  const [newStratAllowSelling, setNewStratAllowSelling] = useState('full_strategy');
  const [savingConfigType, setSavingConfigType] = useState('');
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    description: '',
    details: [],
    confirmLabel: 'Bevestigen',
    variant: 'indigo',
    onConfirm: null
  });

  const fetchMyStrategyConfig = useCallback(async () => {
    try {
      const [cfgRes, listRes] = await Promise.all([
        http.get('/strategies/my-config'),
        http.get('/strategies')
      ]);
      if (cfgRes.data) {
        setMyStrategyConfig(cfgRes.data);
        const activeList = Array.isArray(cfgRes.data.activeStrategies) ? cfgRes.data.activeStrategies : [];
        setActiveStrategiesDraft(
          activeList.map((item, idx) => ({
            entry_id: item.entry_id,
            strategy_id: Number(item.strategy_id),
            name: item.name,
            strategy_type: item.strategy_type || 'STOCKS',
            priority_order: Number(item.priority_order || idx + 1),
            funding_mode: item.funding_mode || (item.strategy_type === 'ETF' ? 'monthly_amount' : 'available_cash'),
            monthly_budget: Number(item.monthly_budget ?? (item.strategy_type === 'ETF' ? 450 : 500)),
            allow_selling: item.allow_selling || (item.strategy_type === 'ETF' ? 'buy_only' : 'full_strategy'),
            activated_at: item.activated_at
          }))
        );
        setNewStratPriority(activeList.length + 1);
      }
      if (listRes.data) {
        setAllStrategiesList(listRes.data);
        if (listRes.data.length > 0) {
          setNewStratId(listRes.data[0].strategy_id);
        }
      }
    } catch (err) {
      console.warn('Kon persoonlijke strategie-configuratie niet laden:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchMyStrategyConfig();
  }, [fetchMyStrategyConfig]);

  useEffect(() => {
    if (!isAdmin) {
      setActiveTab('active');
      return;
    }
    if (location.state?.strategyToEdit) {
      setStrategyToEdit(location.state.strategyToEdit);
      setActiveTab('builder');
    } else if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
  }, [location.state, isAdmin]);

  const updateDraftField = (index, field, value) => {
    setActiveStrategiesDraft(prev => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };
      if (field === 'strategy_id') {
        const found = allStrategiesList.find(s => Number(s.strategy_id) === Number(value));
        if (found) {
          item.name = found.name;
          item.strategy_type = found.strategy_type || 'STOCKS';
        }
      }
      next[index] = item;
      return next;
    });
  };

  const formatFundingLabel = (mode, budget) => {
    const val = Number(budget || 0);
    if (mode === 'monthly_amount') return `Vast bedrag (€${val > 0 ? val : 450}/mnd)`;
    if (mode === 'pct_total_portfolio') return `${val > 0 ? val : 50}% van Totale Portefeuillewaarde`;
    if (mode === 'pct_available_cash') return `${val > 0 ? val : 100}% van Beschikbare Vrije Cash`;
    if (mode === 'cash_plus_rotation') return 'Beschikbaar vrij geld + Rotatie';
    return '100% van Beschikbaar vrij geld';
  };

  // Bereken het totale gebruikte % voor pct_total_portfolio zodat dit altijd klopt (max 100%)
  const totalAllocatedPortfolioPct = activeStrategiesDraft
    .filter(s => s.funding_mode === 'pct_total_portfolio')
    .reduce((sum, s) => sum + Number(s.monthly_budget || 0), 0);

  const formatSellingLabel = (rule) => {
    if (rule === 'buy_only') return 'Nooit verkopen (100% Buy & Hold)';
    if (rule === 'score_drop_only') return 'Enkel verkopen bij Score < 5';
    return 'Volledige verkoop- & snoeiregels';
  };

  const requestSaveActiveStrategy = (draftItem) => {
    const chosenStrat = allStrategiesList.find(s => Number(s.strategy_id) === Number(draftItem.strategy_id));
    const stratName = chosenStrat ? chosenStrat.name : draftItem.name;
    setConfirmModal({
      isOpen: true,
      title: 'Bevestig aanpassing van actieve strategie',
      description: `Weet je zeker dat je jouw actieve strategie op Prioriteit #${draftItem.priority_order} wilt aanpassen?`,
      details: [
        `Strategie: ${stratName} (${(chosenStrat?.strategy_type || draftItem.strategy_type) === 'ETF' ? 'ETF DCA' : 'Losse Aandelen'})`,
        `Prioriteit: #${draftItem.priority_order}`,
        `Inlegmethode: ${formatFundingLabel(draftItem.funding_mode, draftItem.monthly_budget)}`,
        `Verkoopregel: ${formatSellingLabel(draftItem.allow_selling)}`,
        `Meldingen van eventuele vorige strategieën blijven altijd bewaard.`
      ],
      confirmLabel: 'Ja, wijziging opslaan',
      variant: 'indigo',
      onConfirm: async () => {
        setSavingConfigType(`save-${draftItem.entry_id || draftItem.priority_order}`);
        try {
          const res = await http.post('/strategies/my-active', {
            entry_id: draftItem.entry_id,
            strategy_id: Number(draftItem.strategy_id),
            priority_order: Number(draftItem.priority_order),
            funding_mode: draftItem.funding_mode,
            monthly_budget: Number(draftItem.monthly_budget || 0),
            allow_selling: draftItem.allow_selling
          });
          toast.success(res.data?.message || 'Actieve strategie bijgewerkt!');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          await fetchMyStrategyConfig();
        } catch (err) {
          toast.error(err.response?.data?.message || 'Kon strategie niet aanpassen.');
        } finally {
          setSavingConfigType('');
        }
      }
    });
  };

  const requestChangePriority = (draftItem, newPriority) => {
    if (!draftItem.entry_id) return;
    setConfirmModal({
      isOpen: true,
      title: 'Prioriteit van strategie wijzigen',
      description: `Wil je "${draftItem.name}" verplaatsen van Prioriteit #${draftItem.priority_order} naar Prioriteit #${newPriority}?`,
      details: [
        `Prioriteit #1 heeft altijd als eerste recht op jouw beschikbare cash of maandbudget.`,
        `De overige actieve strategieën schuiven automatisch mee op.`
      ],
      confirmLabel: `Ja, zet op Prioriteit #${newPriority}`,
      variant: 'indigo',
      onConfirm: async () => {
        setSavingConfigType(`prio-${draftItem.entry_id}`);
        try {
          const res = await http.put(`/strategies/my-active/${draftItem.entry_id}/priority`, {
            new_priority: Number(newPriority)
          });
          toast.success(res.data?.message || `Prioriteit aangepast naar #${newPriority}`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          await fetchMyStrategyConfig();
        } catch (err) {
          toast.error(err.response?.data?.message || 'Kon prioriteit niet aanpassen.');
        } finally {
          setSavingConfigType('');
        }
      }
    });
  };

  const requestRemoveActiveStrategy = (draftItem) => {
    if (!draftItem.entry_id) return;
    setConfirmModal({
      isOpen: true,
      title: 'Actieve strategie verwijderen / stopzetten?',
      description: `Weet je zeker dat je "${draftItem.name}" (Prioriteit #${draftItem.priority_order}) uit jouw actieve strategieën wilt verwijderen?`,
      details: [
        `Je ontvangt voor deze strategie geen nieuwe dagelijkse meldingen meer.`,
        `Alle eerdere meldingen van "${draftItem.name}" blijven wél netjes bewaard in je historiek met hun oorspronkelijke strategielabel.`,
        `De strategie zelf blijft gewoon beschikbaar in de lijst mocht je haar later opnieuw willen activeren.`
      ],
      confirmLabel: 'Ja, actieve strategie verwijderen',
      variant: 'red',
      onConfirm: async () => {
        setSavingConfigType(`del-${draftItem.entry_id}`);
        try {
          const res = await http.delete(`/strategies/my-active/${draftItem.entry_id}`);
          toast.success(res.data?.message || 'Strategie verwijderd uit je actieve lijst.');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          await fetchMyStrategyConfig();
        } catch (err) {
          toast.error(err.response?.data?.message || 'Kon actieve strategie niet verwijderen.');
        } finally {
          setSavingConfigType('');
        }
      }
    });
  };

  const requestAddActiveStrategy = () => {
    const chosenStrat = allStrategiesList.find(s => Number(s.strategy_id) === Number(newStratId));
    if (!chosenStrat) {
      toast.error('Selecteer eerst een strategie.');
      return;
    }
    const alreadyActive = activeStrategiesDraft.some(s => Number(s.strategy_id) === Number(newStratId));
    setConfirmModal({
      isOpen: true,
      title: alreadyActive ? 'Bestaande actieve strategie bijwerken?' : 'Nieuwe actieve strategie toevoegen?',
      description: alreadyActive
        ? `"${chosenStrat.name}" staat al in je actieve lijst. Wil je haar instellingen en prioriteit (#${newStratPriority}) bijwerken?`
        : `Wil je "${chosenStrat.name}" toevoegen aan jouw actieve strategieën op Prioriteit #${newStratPriority}?`,
      details: [
        `Type: ${(chosenStrat.strategy_type || 'STOCKS') === 'ETF' ? 'ETF DCA Strategie' : 'Losse Aandelen Strategie'}`,
        `Prioriteit: #${newStratPriority}`,
        `Inlegmethode: ${formatFundingLabel(newStratFundingMode, newStratMonthlyBudget)}`,
        `Verkoopregel: ${formatSellingLabel(newStratAllowSelling)}`
      ],
      confirmLabel: alreadyActive ? 'Ja, bijwerken' : 'Ja, strategie activeren',
      variant: 'indigo',
      onConfirm: async () => {
        setSavingConfigType('add-new');
        try {
          const res = await http.post('/strategies/my-active', {
            strategy_id: Number(newStratId),
            priority_order: Number(newStratPriority),
            funding_mode: newStratFundingMode,
            monthly_budget: Number(newStratMonthlyBudget || 0),
            allow_selling: newStratAllowSelling
          });
          toast.success(res.data?.message || 'Strategie geactiveerd!');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          setShowAddStrategyForm(false);
          await fetchMyStrategyConfig();
        } catch (err) {
          toast.error(err.response?.data?.message || 'Kon strategie niet toevoegen.');
        } finally {
          setSavingConfigType('');
        }
      }
    });
  };

  const STUDIO_TABS = [
    {
      id: 'active',
      label: 'Actieve Strategieën',
      icon: 'ph-target',
      badge: activeStrategiesDraft.length
    },
    ...(isAdmin
      ? [
          {
            id: 'builder',
            label: 'Strategie Ontwerpen',
            icon: 'ph-sliders-horizontal',
            badge: null
          },
          {
            id: 'backtest',
            label: '10-Jarige Backtest',
            icon: 'ph-chart-line-up',
            badge: null
          }
        ]
      : [])
  ];

  return (
    <div className="font-sans text-gray-900 w-full">
      {/* Twee-koloms indeling op Desktop (Links zijkolom zoals bij Portfolio, Rechts inhoud) */}
      <div className="flex flex-col md:flex-row items-start gap-4 lg:gap-5 w-full -mt-1">
        {/* Linkse deel: Deeltabs Navigatie (Desktop) - Exact dezelfde stijl als Portfolio */}
        <aside className="hidden md:flex flex-col w-52 lg:w-56 shrink-0 sticky top-14 h-[calc(100vh-4.8rem)] max-h-[calc(100vh-4.8rem)] justify-between -ml-1 lg:-ml-2 pb-1">
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-0.5 pr-1">
            <div className="px-3 py-1 text-[11px] font-black uppercase tracking-wider text-gray-400">
              {isAdmin ? 'Strategie Builder' : 'Mijn Strategieën'}
            </div>
            {STUDIO_TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
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
                      isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Onderste vaste sectie in de linker zijkolom */}
          <div className="shrink-0 mt-auto pt-2 border-t border-gray-200/80 space-y-1.5 pb-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Status</span>
              <DataStatusIndicator />
            </div>

            <Link
              to="/analysis?tab=strategies"
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-xs"
            >
              <i className="ph-bold ph-compass text-sm"></i>
              <span>Zoek Strategieën</span>
            </Link>

            <Link
              to="/portfolio"
              className="w-full flex items-center justify-center gap-1.5 py-1 text-[11px] text-gray-500 hover:text-indigo-600 font-semibold transition-colors"
            >
              <i className="ph-bold ph-arrow-left"></i>
              <span>Terug naar Portfolio</span>
            </Link>
          </div>
        </aside>

        {/* Mobiele Horizontale Navigatiebalk */}
        <div className="md:hidden w-full bg-white p-2.5 rounded-2xl border border-gray-200 shadow-2xs flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5">
            {STUDIO_TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
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
            to="/analysis?tab=strategies"
            className="px-2.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-extrabold shrink-0"
          >
            🔍 Zoek
          </Link>
        </div>

        {/* Rechtse deel: Inhoud van de pagina */}
        <div className="flex-1 min-w-0 w-full space-y-5">
        {activeTab === 'active' ? (
          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-2xs space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-base sm:text-lg font-black text-gray-900">
                  Mijn Actieve Strategieën ({activeStrategiesDraft.length}) &amp; Prioriteitsvolgorde
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Kies welke strategieën actief zijn op jouw portefeuille en in welke volgorde ze recht hebben op je beschikbare cash of maandbudget.
                </p>
              </div>
              <button
                onClick={() => {
                  setNewStratPriority(activeStrategiesDraft.length + 1);
                  setShowAddStrategyForm(prev => !prev);
                }}
                className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-extrabold shadow-xs flex items-center gap-1.5 transition-all self-start sm:self-center shrink-0"
              >
                <i className="ph-bold ph-plus-circle text-sm"></i>
                <span>Extra Strategie Activeren</span>
              </button>
            </div>

            {showAddStrategyForm && (
              <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs sm:text-sm font-black text-purple-950 flex items-center gap-2">
                    <i className="ph-fill ph-plus-circle text-purple-600 text-base"></i>
                    <span>Extra Strategie Activeren</span>
                  </h3>
                  <button
                    onClick={() => setShowAddStrategyForm(false)}
                    className="text-xs font-bold text-gray-500 hover:text-gray-800"
                  >
                    Sluiten ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-gray-700 mb-1">Strategie:</label>
                    <select
                      value={newStratId}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setNewStratId(val);
                        const found = allStrategiesList.find(s => Number(s.strategy_id) === val);
                        if (found?.strategy_type === 'ETF') {
                          setNewStratFundingMode('monthly_amount');
                          setNewStratMonthlyBudget(450);
                          setNewStratAllowSelling('buy_only');
                        } else {
                          setNewStratFundingMode('available_cash');
                          setNewStratMonthlyBudget(500);
                          setNewStratAllowSelling('full_strategy');
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-bold text-gray-900 outline-none"
                    >
                      {allStrategiesList.map(s => {
                        const sType = (s.strategy_type || 'STOCKS').toUpperCase();
                        const typeLabel = sType === 'ETF' ? '📈 ETF' : sType === 'CRYPTO' ? '🪙 Crypto' : '💎 Aandelen';
                        return (
                          <option key={s.strategy_id} value={s.strategy_id}>
                            [{typeLabel}] {s.name}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Prioriteit:</label>
                    <select
                      value={newStratPriority}
                      onChange={(e) => setNewStratPriority(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-bold text-purple-900 outline-none"
                    >
                      {Array.from({ length: activeStrategiesDraft.length + 1 }, (_, i) => i + 1).map(p => (
                        <option key={p} value={p}>
                          Prioriteit #{p} {p === 1 ? '(Hoogste)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Inlegmethode (Kapitaal):</label>
                    <select
                      value={newStratFundingMode}
                      onChange={(e) => {
                        const mode = e.target.value;
                        setNewStratFundingMode(mode);
                        if (mode === 'pct_total_portfolio') {
                          setNewStratMonthlyBudget(Math.max(10, Math.min(100, 100 - totalAllocatedPortfolioPct)));
                        } else if (mode === 'pct_available_cash') {
                          setNewStratMonthlyBudget(100);
                        } else if (mode === 'monthly_amount') {
                          setNewStratMonthlyBudget(450);
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-semibold text-gray-800 outline-none"
                    >
                      <option value="monthly_amount">📅 Vast bedrag (€ / maand)</option>
                      <option value="pct_total_portfolio">📊 % van Totale Portefeuillewaarde (Alles samen)</option>
                      <option value="pct_available_cash">💰 % van Beschikbare Vrije Cash</option>
                      <option value="available_cash">💵 100% van Beschikbaar vrij geld</option>
                      <option value="cash_plus_rotation">🔄 Vrij geld + Actieve Rotatie</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs items-end">
                  {['monthly_amount', 'pct_total_portfolio', 'pct_available_cash'].includes(newStratFundingMode) && (
                    <div>
                      <label className="block font-bold text-gray-700 mb-1">
                        {newStratFundingMode === 'monthly_amount'
                          ? 'Maandbedrag (€/mnd):'
                          : newStratFundingMode === 'pct_total_portfolio'
                          ? `Percentage van Totale Waarde (nog ${Math.max(0, 100 - totalAllocatedPortfolioPct)}% vrij):`
                          : 'Percentage van Vrije Cash (%):'}
                      </label>
                      <input
                        type="number"
                        min={newStratFundingMode === 'monthly_amount' ? '25' : '5'}
                        max={newStratFundingMode === 'monthly_amount' ? '100000' : '100'}
                        step={newStratFundingMode === 'monthly_amount' ? '25' : '5'}
                        value={newStratMonthlyBudget}
                        onChange={(e) => setNewStratMonthlyBudget(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-bold text-gray-900 outline-none"
                      />
                    </div>
                  )}

                  <div className={['monthly_amount', 'pct_total_portfolio', 'pct_available_cash'].includes(newStratFundingMode) ? '' : 'sm:col-span-2'}>
                    <label className="block font-bold text-gray-700 mb-1">Verkoopregels:</label>
                    <select
                      value={newStratAllowSelling}
                      onChange={(e) => setNewStratAllowSelling(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-semibold text-gray-800 outline-none"
                    >
                      <option value="full_strategy">✅ Volledige verkoop- &amp; snoeiregels</option>
                      <option value="score_drop_only">🛡️ Enkel verkopen bij Score &lt; 5</option>
                      <option value="buy_only">🔒 Nooit verkopen (100% Buy &amp; Hold)</option>
                    </select>
                  </div>

                  <button
                    onClick={requestAddActiveStrategy}
                    disabled={savingConfigType === 'add-new'}
                    className="py-2.5 px-4 bg-purple-700 hover:bg-purple-800 text-white font-extrabold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <i className="ph-bold ph-check-circle"></i>
                    <span>Strategie Activeren</span>
                  </button>
                </div>
              </div>
            )}

            {/* Uitleg & Garantie-balk voor Waterval Kapitaalverdeling bij meerdere strategieën */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="font-black text-gray-900 flex items-center gap-1.5">
                  <span>🛡️ Automatische Waterval &amp; 100%-Garantie bij gecombineerde strategieën</span>
                </div>
                <p className="text-gray-600">
                  <strong>1. Prioriteit #1</strong> reserveert altijd eerst haar geld (bv. een vast maandbedrag voor ETF DCA).{' '}
                  <strong>2. Prioriteit #2 &amp; #3</strong> werken uitsluitend met het resterende kapitaal of hun toegewezen % van de totale portefeuillewaarde (max. 100% samen). Zo geven twee strategieën nooit tegelijk hetzelfde geld uit.
                </p>
              </div>
              {totalAllocatedPortfolioPct > 0 && (
                <div className={`px-3 py-1.5 rounded-xl font-black shrink-0 border ${
                  totalAllocatedPortfolioPct > 100
                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}>
                  Toegewezen % Totale Waarde: {totalAllocatedPortfolioPct}% / 100%
                </div>
              )}
            </div>

            {activeStrategiesDraft.length === 0 ? (
              <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-2">
                <p className="text-sm font-black text-amber-950">Geen actieve strategieën gekoppeld.</p>
                <p className="text-xs text-amber-800">
                  Klik op <strong>"Extra Strategie Activeren"</strong> of activeer een strategie vanuit de Strategie Ontwerper.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {activeStrategiesDraft.map((item, idx) => {
                  const isEtf = item.strategy_type === 'ETF';
                  return (
                    <div
                      key={item.entry_id || `draft-${idx}`}
                      className={`p-4 rounded-2xl border space-y-3 transition-all ${
                        isEtf ? 'bg-emerald-50/30 border-emerald-200' : 'bg-indigo-50/30 border-indigo-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-lg font-black text-xs ${
                            item.priority_order === 1 ? 'bg-amber-400 text-amber-950' : 'bg-slate-800 text-white'
                          }`}>
                            #{item.priority_order}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${
                            isEtf ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-indigo-100 text-indigo-900 border-indigo-300'
                          }`}>
                            {isEtf ? '📈 ETF DCA' : '💎 Aandelen'}
                          </span>
                          <span className="font-black text-xs sm:text-sm text-gray-900 truncate max-w-[180px]">
                            {item.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {activeStrategiesDraft.length > 1 && (
                            <>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => requestChangePriority(item, item.priority_order - 1)}
                                className="px-2 py-1 rounded-lg bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 text-[11px] font-extrabold disabled:opacity-35"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={idx === activeStrategiesDraft.length - 1}
                                onClick={() => requestChangePriority(item, item.priority_order + 1)}
                                className="px-2 py-1 rounded-lg bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 text-[11px] font-extrabold disabled:opacity-35"
                              >
                                ▼
                              </button>
                            </>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                const found = allStrategiesList.find(s => Number(s.strategy_id) === Number(item.strategy_id));
                                if (found) {
                                  setStrategyToEdit(found);
                                  setActiveTab('builder');
                                }
                              }}
                              className="px-2 py-1 rounded-lg bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-extrabold"
                            >
                              Bekijk parameters
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => requestRemoveActiveStrategy(item)}
                            className="px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-extrabold"
                          >
                            <i className="ph-bold ph-trash"></i>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                        <div>
                          <label className="block font-bold text-gray-600 mb-1 text-[11px]">Strategie:</label>
                          <select
                            value={item.strategy_id}
                            onChange={(e) => updateDraftField(idx, 'strategy_id', Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-bold text-gray-900 outline-none"
                          >
                            {allStrategiesList.map(s => (
                              <option key={s.strategy_id} value={s.strategy_id}>
                                [{(s.strategy_type || 'STOCKS') === 'ETF' ? '📈 ETF' : '💎 Aandelen'}] {s.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-gray-600 mb-1 text-[11px]">Inlegmethode (Kapitaal):</label>
                          <select
                            value={item.funding_mode}
                            onChange={(e) => {
                              const nextMode = e.target.value;
                              updateDraftField(idx, 'funding_mode', nextMode);
                              if (nextMode === 'pct_total_portfolio' && Number(item.monthly_budget) > 100) {
                                updateDraftField(idx, 'monthly_budget', 50);
                              } else if (nextMode === 'pct_available_cash' && Number(item.monthly_budget) > 100) {
                                updateDraftField(idx, 'monthly_budget', 100);
                              }
                            }}
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-semibold text-gray-800 outline-none"
                          >
                            <option value="monthly_amount">📅 Vast bedrag (€ / maand)</option>
                            <option value="pct_total_portfolio">📊 % van Totale Portefeuillewaarde</option>
                            <option value="pct_available_cash">💰 % van Beschikbare Vrije Cash</option>
                            <option value="available_cash">💵 100% van Beschikbaar vrij geld</option>
                            <option value="cash_plus_rotation">🔄 Vrij geld + Actieve Rotatie</option>
                          </select>
                        </div>

                        {['monthly_amount', 'pct_total_portfolio', 'pct_available_cash'].includes(item.funding_mode) && (
                          <div>
                            <label className="block font-bold text-gray-600 mb-1 text-[11px]">
                              {item.funding_mode === 'monthly_amount'
                                ? 'Maandbedrag (€/mnd):'
                                : item.funding_mode === 'pct_total_portfolio'
                                ? '% van Totale Waarde (max 100% samen):'
                                : '% van Beschikbare Vrije Cash:'}
                            </label>
                            <input
                              type="number"
                              min={item.funding_mode === 'monthly_amount' ? '25' : '5'}
                              max={item.funding_mode === 'monthly_amount' ? '100000' : '100'}
                              step={item.funding_mode === 'monthly_amount' ? '25' : '5'}
                              value={item.monthly_budget}
                              onChange={(e) => updateDraftField(idx, 'monthly_budget', e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-bold text-gray-900 outline-none"
                            />
                          </div>
                        )}

                        <div className={['monthly_amount', 'pct_total_portfolio', 'pct_available_cash'].includes(item.funding_mode) ? '' : 'sm:col-span-2'}>
                          <label className="block font-bold text-gray-600 mb-1 text-[11px]">Verkoopregels:</label>
                          <select
                            value={item.allow_selling}
                            onChange={(e) => updateDraftField(idx, 'allow_selling', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-semibold text-gray-800 outline-none"
                          >
                            <option value="full_strategy">✅ Volledige verkoop- &amp; snoeiregels</option>
                            <option value="score_drop_only">🛡️ Enkel verkopen bij Score &lt; 5</option>
                            <option value="buy_only">🔒 Nooit verkopen (100% Buy &amp; Hold)</option>
                          </select>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => requestSaveActiveStrategy(item)}
                        disabled={savingConfigType === `save-${item.entry_id || item.priority_order}`}
                        className={`w-full py-2 px-3 text-white text-xs font-extrabold rounded-xl shadow-2xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                          isEtf ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                      >
                        <i className="ph-bold ph-floppy-disk"></i>
                        <span>Wijziging Opslaan</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Historiek van Strategiewissels */}
            {myStrategyConfig?.strategyHistory?.length > 0 && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <h3 className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                  <i className="ph-fill ph-clock-counter-clockwise text-purple-600 text-sm"></i>
                  <span>Historiek van Strategiewissels ({myStrategyConfig.strategyHistory.length})</span>
                </h3>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {myStrategyConfig.strategyHistory.map((item) => (
                    <div
                      key={item.history_id}
                      className="p-2.5 bg-white rounded-xl border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded font-black text-[10px] ${
                          item.strategy_type === 'ETF' ? 'bg-emerald-100 text-emerald-900' : 'bg-indigo-100 text-indigo-900'
                        }`}>
                          {item.strategy_type === 'ETF' ? '📈 ETF' : '💎 Aandelen'}
                        </span>
                        <span className="font-bold text-gray-800">
                          {item.old_strategy_name ? `${item.old_strategy_name} ➔ ` : ''}{item.new_strategy_name || 'Stopgezet'}
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400 font-mono">
                        {new Date(item.changed_at).toLocaleDateString('nl-BE')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'builder' ? (
          <StrategyBuilderTab
            initialStrategyToEdit={strategyToEdit}
            onStrategySaved={fetchMyStrategyConfig}
            onOpenBacktest={() => setActiveTab('backtest')}
          />
        ) : (
          <StrategyBacktestTab />
        )}
        </div>
      </div>

      {/* Bevestigingsmodal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 border border-gray-200 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-black text-gray-900">{confirmModal.title}</h3>
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-400 hover:text-gray-700 font-bold text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-700 leading-relaxed">{confirmModal.description}</p>
            {confirmModal.details?.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-xs text-gray-700">
                {confirmModal.details.map((line, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-indigo-600 font-black">•</span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-extrabold"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={() => confirmModal.onConfirm && confirmModal.onConfirm()}
                className={`px-4 py-2 rounded-xl text-white text-xs font-extrabold shadow-sm ${
                  confirmModal.variant === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StrategyStudioPage;

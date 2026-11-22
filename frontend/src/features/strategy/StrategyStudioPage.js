import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, Link } from 'react-router-dom';
import http from '../../http-common';
import toast from 'react-hot-toast';
import StrategyBuilderTab from '../analysis/StrategyBuilderTab';
import StrategyBacktestTab from '../analysis/StrategyBacktestTab';

const StrategyStudioPage = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('builder'); // 'active' | 'builder' | 'backtest'
  const [strategyToEdit, setStrategyToEdit] = useState(null);

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
    if (location.state?.strategyToEdit) {
      setStrategyToEdit(location.state.strategyToEdit);
      setActiveTab('builder');
    } else if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
  }, [location.state]);

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
    if (mode === 'monthly_amount') return `Vast bedrag (€${Number(budget || 0)}/mnd)`;
    if (mode === 'cash_plus_rotation') return 'Beschikbaar vrij geld + Rotatie';
    return 'Enkel beschikbaar vrij geld';
  };

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

  return (
    <div className="space-y-6 font-sans text-gray-900 bg-gray-50/50 min-h-screen pb-12">
      {/* 1. Compacte Header & Tabs (Common-tab stijl) */}
      <div className="bg-white rounded-2xl shadow-2xs border border-gray-200/90 overflow-hidden">
        <div className="p-4 sm:p-6 pb-0">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-200">
                  Strategie Builder
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-200">
                  {activeStrategiesDraft.length} Actieve Strategie{activeStrategiesDraft.length === 1 ? '' : 'ën'}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                Strategie Builder &amp; Mijn Actieve Strategieën
              </h1>
              <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
                Beheer welke strategieën je volgt, stel je prioriteitsvolgorde in, of ontwerp en backtest je eigen strategieën.
              </p>
            </div>

            <Link
              to="/portfolio"
              className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 shrink-0"
            >
              <i className="ph-bold ph-arrow-left"></i>
              <span>Terug naar Portfolio</span>
            </Link>
          </div>

          {/* Tab Navigatie */}
          <nav className="flex space-x-4 sm:space-x-6 overflow-x-auto no-scrollbar border-t border-gray-100" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('builder')}
              className={`whitespace-nowrap py-3.5 px-1 border-b-2 font-extrabold text-xs sm:text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'builder'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className="ph-fill ph-sliders-horizontal text-base"></i>
              <span>Strategie Ontwerpen &amp; Inzien</span>
            </button>

            <button
              onClick={() => setActiveTab('active')}
              className={`whitespace-nowrap py-3.5 px-1 border-b-2 font-extrabold text-xs sm:text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'active'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className="ph-fill ph-target text-base"></i>
              <span>Mijn Actieve Strategieën &amp; Prioriteit ({activeStrategiesDraft.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('backtest')}
              className={`whitespace-nowrap py-3.5 px-1 border-b-2 font-extrabold text-xs sm:text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'backtest'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <i className="ph-fill ph-chart-line-up text-base"></i>
              <span>10-Jarige Backtest &amp; Simulator</span>
            </button>
          </nav>
        </div>
      </div>

      {/* 2. Tab Content */}
      <div>
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
                    <label className="block font-bold text-gray-700 mb-1">Inlegmethode:</label>
                    <select
                      value={newStratFundingMode}
                      onChange={(e) => setNewStratFundingMode(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-semibold text-gray-800 outline-none"
                    >
                      <option value="available_cash">💰 Beschikbaar vrij geld</option>
                      <option value="monthly_amount">📅 Vast bedrag (€/mnd)</option>
                      <option value="cash_plus_rotation">🔄 Vrij geld + Rotatie</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs items-end">
                  {newStratFundingMode === 'monthly_amount' && (
                    <div>
                      <label className="block font-bold text-gray-700 mb-1">Maandbedrag (€/mnd):</label>
                      <input
                        type="number"
                        min="25"
                        step="25"
                        value={newStratMonthlyBudget}
                        onChange={(e) => setNewStratMonthlyBudget(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-bold text-gray-900 outline-none"
                      />
                    </div>
                  )}

                  <div className={newStratFundingMode === 'monthly_amount' ? '' : 'sm:col-span-2'}>
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
                          <label className="block font-bold text-gray-600 mb-1 text-[11px]">Inlegmethode:</label>
                          <select
                            value={item.funding_mode}
                            onChange={(e) => updateDraftField(idx, 'funding_mode', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-semibold text-gray-800 outline-none"
                          >
                            <option value="available_cash">💰 Beschikbaar vrij geld</option>
                            <option value="monthly_amount">📅 Vast bedrag (€/mnd)</option>
                            <option value="cash_plus_rotation">🔄 Vrij geld + Rotatie</option>
                          </select>
                        </div>

                        {item.funding_mode === 'monthly_amount' && (
                          <div>
                            <label className="block font-bold text-gray-600 mb-1 text-[11px]">Maandbedrag (€/mnd):</label>
                            <input
                              type="number"
                              min="25"
                              step="25"
                              value={item.monthly_budget}
                              onChange={(e) => updateDraftField(idx, 'monthly_budget', e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-bold text-gray-900 outline-none"
                            />
                          </div>
                        )}

                        <div className={item.funding_mode === 'monthly_amount' ? '' : 'sm:col-span-2'}>
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

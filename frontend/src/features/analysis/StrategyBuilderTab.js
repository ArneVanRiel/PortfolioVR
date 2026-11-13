import React, { useState, useEffect } from 'react';
import http from '../../http-common';

const StrategyBuilderTab = ({ initialStrategyToEdit, onStrategySaved }) => {
  const [strategies, setStrategies] = useState([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState(initialStrategyToEdit?.strategy_id || 'new');

  // Metadata
  const [strategyName, setStrategyName] = useState(initialStrategyToEdit?.name || '');
  const [strategyDescription, setStrategyDescription] = useState(initialStrategyToEdit?.description || '');
  const [isPublic, setIsPublic] = useState(initialStrategyToEdit?.is_public !== undefined ? initialStrategyToEdit.is_public : true);

  // Parameters
  const [initialCapital, setInitialCapital] = useState(10000);
  const [sellOnScoreDrop, setSellOnScoreDrop] = useState(true);
  const [useWaardeverdelingSell, setUseWaardeverdelingSell] = useState(true);
  const [usePortfolioRelativeWeight, setUsePortfolioRelativeWeight] = useState(true);
  const [enableActiveRebalance, setEnableActiveRebalance] = useState(true);
  const [useTrendFilter200Sma, setUseTrendFilter200Sma] = useState(false);
  const [maxPriceToIntrinsicRatio, setMaxPriceToIntrinsicRatio] = useState(1.3);
  const [takeProfitAtIntrinsicRatio, setTakeProfitAtIntrinsicRatio] = useState(0);
  const [stopLossPct, setStopLossPct] = useState(0);
  const [maxPositions, setMaxPositions] = useState(0);
  const [allowFractionalShares, setAllowFractionalShares] = useState(true);
  const [minOrderAmount, setMinOrderAmount] = useState(100);
  const [minOrderSkipThreshold, setMinOrderSkipThreshold] = useState(50);
  const [feePerOrder, setFeePerOrder] = useState(1.0);
  const [taxRatePct, setTaxRatePct] = useState(0.35);
  const [enableCapitalGainsTax, setEnableCapitalGainsTax] = useState(true);
  const [capitalGainsTaxRate, setCapitalGainsTaxRate] = useState(10);
  const [capitalGainsExemption, setCapitalGainsExemption] = useState(10000);
  const [capitalGainsScope, setCapitalGainsScope] = useState('from_2026');

  // Test Simulatie Resultaat & State
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  // Haal eigen strategieën op voor de dropdown
  const fetchMyStrategies = async () => {
    try {
      const res = await http.get('/strategies');
      const myOnly = (res.data || []).filter(s => s.can_view_details);
      setStrategies(myOnly);
    } catch (err) {
      console.error('Fout bij ophalen eigen strategieën:', err);
    }
  };

  useEffect(() => {
    fetchMyStrategies();
  }, []);

  // Laad strategie als initialStrategyToEdit verandert
  useEffect(() => {
    if (initialStrategyToEdit) {
      loadStrategyData(initialStrategyToEdit);
    }
  }, [initialStrategyToEdit]);

  const loadStrategyData = (strat) => {
    setSelectedStrategyId(strat.strategy_id || 'new');
    setStrategyName(strat.name || '');
    setStrategyDescription(strat.description || '');
    setIsPublic(strat.is_public !== undefined ? strat.is_public : true);

    const p = strat.parameters || {};
    if (p.initialCapital !== undefined) setInitialCapital(p.initialCapital);
    if (p.sellOnScoreDrop !== undefined) setSellOnScoreDrop(p.sellOnScoreDrop);
    if (p.useWaardeverdelingSell !== undefined) setUseWaardeverdelingSell(p.useWaardeverdelingSell);
    if (p.usePortfolioRelativeWeight !== undefined) setUsePortfolioRelativeWeight(p.usePortfolioRelativeWeight);
    if (p.enableActiveRebalance !== undefined) setEnableActiveRebalance(p.enableActiveRebalance);
    if (p.useTrendFilter200Sma !== undefined) setUseTrendFilter200Sma(p.useTrendFilter200Sma);
    if (p.maxPriceToIntrinsicRatio !== undefined) setMaxPriceToIntrinsicRatio(p.maxPriceToIntrinsicRatio);
    if (p.takeProfitAtIntrinsicRatio !== undefined) setTakeProfitAtIntrinsicRatio(p.takeProfitAtIntrinsicRatio);
    if (p.stopLossPct !== undefined) setStopLossPct(p.stopLossPct);
    if (p.maxPositions !== undefined) setMaxPositions(p.maxPositions);
    if (p.allowFractionalShares !== undefined) setAllowFractionalShares(p.allowFractionalShares);
    if (p.minOrderAmount !== undefined) setMinOrderAmount(p.minOrderAmount);
    if (p.minOrderSkipThreshold !== undefined) setMinOrderSkipThreshold(p.minOrderSkipThreshold);
    if (p.feePerOrder !== undefined) setFeePerOrder(p.feePerOrder);
    if (p.taxRatePct !== undefined) setTaxRatePct(p.taxRatePct);
    if (p.enableCapitalGainsTax !== undefined) setEnableCapitalGainsTax(p.enableCapitalGainsTax);
    if (p.capitalGainsTaxRate !== undefined) setCapitalGainsTaxRate(p.capitalGainsTaxRate);
    if (p.capitalGainsExemption !== undefined) setCapitalGainsExemption(p.capitalGainsExemption);
    if (p.capitalGainsScope !== undefined) setCapitalGainsScope(p.capitalGainsScope);
    setTestResult(strat.performance_summary ? { kpis: strat.performance_summary } : null);
  };

  const resetToNew = () => {
    setSelectedStrategyId('new');
    setStrategyName('');
    setStrategyDescription('');
    setIsPublic(true);
    setSellOnScoreDrop(true);
    setUseWaardeverdelingSell(true);
    setUsePortfolioRelativeWeight(true);
    setEnableActiveRebalance(true);
    setUseTrendFilter200Sma(false);
    setMaxPriceToIntrinsicRatio(1.3);
    setTakeProfitAtIntrinsicRatio(0);
    setStopLossPct(0);
    setMaxPositions(0);
    setAllowFractionalShares(true);
    setMinOrderAmount(100);
    setMinOrderSkipThreshold(50);
    setFeePerOrder(1.0);
    setTaxRatePct(0.35);
    setEnableCapitalGainsTax(true);
    setCapitalGainsTaxRate(10);
    setCapitalGainsExemption(10000);
    setCapitalGainsScope('from_2026');
    setTestResult(null);
    setFeedback({ type: '', text: '' });
  };

  // Test Backtest uitvoeren
  const handleTestStrategy = async () => {
    setTesting(true);
    setFeedback({ type: '', text: '' });
    try {
      const res = await http.post('/backtest/dynamic-score5', {
        initialCapital: Number(initialCapital),
        sellOnScoreDrop,
        useWaardeverdelingSell,
        usePortfolioRelativeWeight,
        enableActiveRebalance,
        useTrendFilter200Sma,
        maxPriceToIntrinsicRatio: Number(maxPriceToIntrinsicRatio),
        takeProfitAtIntrinsicRatio: Number(takeProfitAtIntrinsicRatio),
        stopLossPct: Number(stopLossPct),
        maxPositions: Number(maxPositions),
        allowFractionalShares,
        minOrderAmount: Number(minOrderAmount),
        minOrderSkipThreshold: Number(minOrderSkipThreshold),
        feePerOrder: Number(feePerOrder),
        taxRatePct: Number(taxRatePct),
        enableCapitalGainsTax,
        capitalGainsTaxRate: Number(capitalGainsTaxRate),
        capitalGainsExemption: Number(capitalGainsExemption),
        capitalGainsScope
      });
      setTestResult(res.data);
      setFeedback({ type: 'success', text: `Simulatie voltooid! Rendement over 10 jaar: +${res.data.kpis.totalReturnPct.toFixed(1)}%` });
    } catch (err) {
      console.error('Fout bij testen strategie:', err);
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Fout bij uitvoeren test.' });
    } finally {
      setTesting(false);
    }
  };

  // Strategie Opslaan
  const handleSaveStrategy = async () => {
    if (!strategyName.trim()) {
      setFeedback({ type: 'error', text: 'Geef eerst een naam op voor deze strategie.' });
      return;
    }

    setSaving(true);
    setFeedback({ type: '', text: '' });

    const parameters = {
      initialCapital: Number(initialCapital),
      requireScore5: true,
      requireWaardeverdelingRise: true,
      sellOnScoreDrop,
      useWaardeverdelingSell,
      useMacdSell: false,
      usePortfolioRelativeWeight,
      enableActiveRebalance,
      useTrendFilter200Sma,
      allowFractionalShares,
      minOrderAmount: Number(minOrderAmount),
      minOrderSkipThreshold: Number(minOrderSkipThreshold),
      feePerOrder: Number(feePerOrder),
      taxRatePct: Number(taxRatePct),
      enableCapitalGainsTax,
      capitalGainsTaxRate: Number(capitalGainsTaxRate),
      capitalGainsExemption: Number(capitalGainsExemption),
      capitalGainsScope,
      stopLossPct: Number(stopLossPct),
      maxPositions: Number(maxPositions),
      maxPriceToIntrinsicRatio: Number(maxPriceToIntrinsicRatio),
      takeProfitAtIntrinsicRatio: Number(takeProfitAtIntrinsicRatio)
    };

    const performanceSummary = testResult?.kpis ? {
      totalReturnPct: testResult.kpis.totalReturnPct,
      totalProfit: testResult.kpis.totalProfit,
      winRate: testResult.kpis.winRate,
      maxDrawdownPct: testResult.kpis.maxDrawdownPct,
      totalTrades: testResult.kpis.totalTrades,
      outperformanceVsSp500: testResult.kpis.outperformanceVsSp500,
      outperformanceVsWorld: testResult.kpis.outperformanceVsWorld
    } : null;

    try {
      if (selectedStrategyId && selectedStrategyId !== 'new') {
        // Update
        await http.put(`/strategies/${selectedStrategyId}`, {
          name: strategyName.trim(),
          description: strategyDescription.trim(),
          is_public: isPublic,
          parameters,
          performance_summary: performanceSummary
        });
        setFeedback({ type: 'success', text: `Strategie "${strategyName}" succesvol bijgewerkt!` });
      } else {
        // Create new
        const res = await http.post('/strategies', {
          name: strategyName.trim(),
          description: strategyDescription.trim(),
          is_public: isPublic,
          parameters,
          performance_summary: performanceSummary
        });
        setSelectedStrategyId(res.data.strategy_id);
        setFeedback({ type: 'success', text: `Nieuwe strategie "${strategyName}" succesvol aangemaakt en opgeslagen!` });
      }
      fetchMyStrategies();
      if (onStrategySaved) onStrategySaved();
    } catch (err) {
      console.error('Fout bij opslaan:', err);
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Fout bij opslaan strategie.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Card met Dropdown & Acties */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                <i className="ph-fill ph-wrench text-2xl"></i>
              </span>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Strategie Builder</h2>
                <p className="text-sm text-gray-500">
                  Ontwerp, parameteriseer en test jouw eigen datagedreven kwartaal- en momentumstrategieën.
                </p>
              </div>
            </div>
          </div>

          {/* Strategie Selectie Dropdown */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={selectedStrategyId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'new') {
                  resetToNew();
                } else {
                  const found = strategies.find(s => s.strategy_id === Number(val));
                  if (found) loadStrategyData(found);
                }
              }}
              className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="new">✨ + Nieuwe Strategie Maken</option>
              {strategies.map(s => (
                <option key={s.strategy_id} value={s.strategy_id}>
                  {s.is_system_default ? '⭐ ' : ''}{s.name}
                </option>
              ))}
            </select>

            <button
              onClick={resetToNew}
              className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-all"
              title="Reset naar een nieuw leeg template"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Feedback Notificatie */}
        {feedback.text && (
          <div className={`mt-4 p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            <i className={`ph-fill ${feedback.type === 'success' ? 'ph-check-circle text-emerald-600' : 'ph-warning-circle text-red-600'} text-base`}></i>
            <span>{feedback.text}</span>
          </div>
        )}

        {/* 2. Metadata (Naam, Beschrijving, Zichtbaarheid) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
          <div className="md:col-span-2 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Strategienaam <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="bv. Arne's 5/5 Kwaliteit &amp; Waardeverdeling..."
                value={strategyName}
                onChange={(e) => setStrategyName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Omschrijving &amp; Doel van de Strategie
              </label>
              <textarea
                rows={2}
                placeholder="Licht toe wat deze strategie uniek maakt, welk type aandelen ze koopt en voor welk risicoprofiel ze bedoeld is..."
                value={strategyDescription}
                onChange={(e) => setStrategyDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-200/80 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-purple-950 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <i className="ph-fill ph-shield-check text-purple-600"></i>
                Zichtbaarheid &amp; Intellectueel Eigendom
              </h4>
              <p className="text-[11px] text-purple-900 leading-relaxed mb-3">
                Andere gebruikers zien enkel jouw naam, omschrijving en het historische rendement. <strong>Jouw exacte formules blijven 100% geheim.</strong>
              </p>
            </div>

            <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-purple-200 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 border-purple-300"
              />
              <span className="text-xs font-bold text-purple-950">
                Publiceer in Strategie Bibliotheek
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* 3. Parameter Bouwblokken (4 kolommen of groepen) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Groep 1: Koopcriteria & Kwaliteitsfilters */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-black">🟢</span>
            <h3 className="text-sm font-bold text-gray-900">1. Koopcriteria &amp; Kwaliteit</h3>
          </div>

          <div className="space-y-3">
            <div className="p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-200 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-emerald-950">Score 5/5 Vereist</div>
                <div className="text-[10px] text-emerald-700">Koop enkel aandelen die 100% scoren op alle SEC criteria</div>
              </div>
              <span className="text-xs font-black text-emerald-800">Altijd Actief</span>
            </div>

            <div className="p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-200 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-emerald-950">Stijgende Waardeverdeling Vereist</div>
                <div className="text-[10px] text-emerald-700">Enkel instappen als de fundamentals sterker worden</div>
              </div>
              <span className="text-xs font-black text-emerald-800">Altijd Actief</span>
            </div>

            <label className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
              <div>
                <div className="text-xs font-bold text-gray-900">Trendfilter 200 SMA</div>
                <div className="text-[10px] text-gray-500">Koop enkel als koers boven 200 daags gemiddelde staat</div>
              </div>
              <input
                type="checkbox"
                checked={useTrendFilter200Sma}
                onChange={(e) => setUseTrendFilter200Sma(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-gray-300"
              />
            </label>

            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200">
              <div>
                <div className="text-xs font-bold text-gray-900">Max. Waardering t.o.v. Intrinsiek:</div>
                <div className="text-[10px] text-gray-500">Koers mag maximaal X keer de intrinsieke waarde bedragen</div>
              </div>
              <select
                value={maxPriceToIntrinsicRatio}
                onChange={(e) => setMaxPriceToIntrinsicRatio(Number(e.target.value))}
                className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-bold text-gray-800"
              >
                <option value="0">Geen limiet</option>
                <option value="1.0">Max 1.0x (Korting op Intrinsiek)</option>
                <option value="1.3">Max 1.3x (Super-Kwaliteit)</option>
                <option value="1.6">Max 1.6x (Gematigd)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Groep 2: Verkoopregels & Bescherming */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <span className="p-1.5 bg-rose-100 text-rose-700 rounded-lg text-xs font-black">🔴</span>
            <h3 className="text-sm font-bold text-gray-900">2. Verkoopregels &amp; Bescherming</h3>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
              <div>
                <div className="text-xs font-bold text-gray-900">100% Verkoop bij Score &lt; 5</div>
                <div className="text-[10px] text-gray-500">Positie volledig liquideren zodra kwaliteit verzwakt</div>
              </div>
              <input
                type="checkbox"
                checked={sellOnScoreDrop}
                onChange={(e) => setSellOnScoreDrop(e.target.checked)}
                className="w-4 h-4 text-rose-600 rounded focus:ring-rose-500 border-gray-300"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
              <div>
                <div className="text-xs font-bold text-gray-900">Deelverkoop bij daling Waardeverdeling</div>
                <div className="text-[10px] text-gray-500">Verkoop proportioneel % als kwartaalscore daalt</div>
              </div>
              <input
                type="checkbox"
                checked={useWaardeverdelingSell}
                onChange={(e) => setUseWaardeverdelingSell(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 border-gray-300"
              />
            </label>

            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200">
              <div>
                <div className="text-xs font-bold text-gray-900">Winstname bij Extreme Overwaardering:</div>
                <div className="text-[10px] text-gray-500">Volledig uitstappen bij extreme pieken</div>
              </div>
              <select
                value={takeProfitAtIntrinsicRatio}
                onChange={(e) => setTakeProfitAtIntrinsicRatio(Number(e.target.value))}
                className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-bold text-gray-800"
              >
                <option value="0">Uit (Laat winst lopen)</option>
                <option value="2.0">Bij 2.0x Intrinsiek</option>
                <option value="2.5">Bij 2.5x Intrinsiek</option>
                <option value="3.0">Bij 3.0x Intrinsiek</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200">
              <div>
                <div className="text-xs font-bold text-gray-900">Harde Stop-Loss (%):</div>
                <div className="text-[10px] text-gray-500">Automatische noodverkoop bij koersval</div>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="5"
                  value={stopLossPct}
                  onChange={(e) => setStopLossPct(Number(e.target.value))}
                  className="w-16 px-2 py-1 bg-white border border-gray-300 rounded text-xs font-bold text-gray-800 text-center"
                />
                <span className="text-xs text-gray-500">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Groep 3: Allocatie, Snoei & Deelaandelen */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-black">🧩</span>
            <h3 className="text-sm font-bold text-gray-900">3. Allocatie, Snoei &amp; Deelaandelen</h3>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-2.5 bg-blue-50/50 rounded-xl border border-blue-200 cursor-pointer">
              <div>
                <div className="text-xs font-bold text-blue-950">Exacte Relatieve Weging</div>
                <div className="text-[10px] text-blue-800">Allokeer proportioneel aan de totale 5/5 pool</div>
              </div>
              <input
                type="checkbox"
                checked={usePortfolioRelativeWeight}
                onChange={(e) => setUsePortfolioRelativeWeight(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-blue-300"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-purple-50/50 rounded-xl border border-purple-200 cursor-pointer">
              <div>
                <div className="text-xs font-bold text-purple-950">✂️ Actieve Herbalancering / Snoeien</div>
                <div className="text-[10px] text-purple-800">Snoei zwakkere posities om cash te maken voor topkansen</div>
              </div>
              <input
                type="checkbox"
                checked={enableActiveRebalance}
                onChange={(e) => setEnableActiveRebalance(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 border-purple-300"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer">
              <div>
                <div className="text-xs font-bold text-gray-900">🧩 Deelaandelen Toegestaan (0,1 stuks)</div>
                <div className="text-[10px] text-gray-500">Min. order €{minOrderAmount}, skip onder €{minOrderSkipThreshold}</div>
              </div>
              <input
                type="checkbox"
                checked={allowFractionalShares}
                onChange={(e) => setAllowFractionalShares(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
              />
            </label>

            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200">
              <div>
                <div className="text-xs font-bold text-gray-900">Max. Aantal Posities:</div>
                <div className="text-[10px] text-gray-500">Focus portefeuille op beste posities (0 = onbeperkt)</div>
              </div>
              <input
                type="number"
                min="0"
                max="50"
                value={maxPositions}
                onChange={(e) => setMaxPositions(Number(e.target.value))}
                className="w-16 px-2 py-1 bg-white border border-gray-300 rounded text-xs font-bold text-gray-800 text-center"
              />
            </div>
          </div>
        </div>

        {/* Groep 4: Kosten & Meerwaardebelasting */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <span className="p-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-black">💸</span>
            <h3 className="text-sm font-bold text-gray-900">4. Transactiekosten &amp; Meerwaardebelasting</h3>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-200">
                <span className="text-[10px] font-bold text-amber-900 uppercase">Brokerkost / order</span>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs font-bold text-amber-800">€</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={feePerOrder}
                    onChange={(e) => setFeePerOrder(Number(e.target.value))}
                    className="w-14 px-1.5 py-0.5 bg-white border border-amber-300 rounded text-xs font-bold text-amber-950 text-right"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-200">
                <span className="text-[10px] font-bold text-amber-900 uppercase">Beurstaks (TOB)</span>
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="number"
                    min="0"
                    step="0.05"
                    value={taxRatePct}
                    onChange={(e) => setTaxRatePct(Number(e.target.value))}
                    className="w-14 px-1.5 py-0.5 bg-white border border-amber-300 rounded text-xs font-bold text-amber-950 text-right"
                  />
                  <span className="text-xs font-bold text-amber-800">%</span>
                </div>
              </div>
            </div>

            <label className="flex items-center justify-between p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-200 cursor-pointer">
              <div>
                <div className="text-xs font-bold text-emerald-950">🏛️ Meerwaardebelasting Simuleren</div>
                <div className="text-[10px] text-emerald-800">10% belasting met € 10.000 voetvrijstelling</div>
              </div>
              <input
                type="checkbox"
                checked={enableCapitalGainsTax}
                onChange={(e) => setEnableCapitalGainsTax(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-emerald-300"
              />
            </label>
          </div>
        </div>
      </div>

      {/* 4. Test Resultaat Kaart (indien gesimuleerd) */}
      {testResult && testResult.kpis && (
        <div className="bg-gradient-to-br from-emerald-500 to-teal-700 rounded-2xl p-6 text-white shadow-md animate-fade-in">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 pb-3 border-b border-white/20">
            <div>
              <span className="text-xs font-bold text-emerald-200 uppercase tracking-widest">Testresultaat over 10-Jarige Beurshistorie</span>
              <h3 className="text-xl font-extrabold text-white">
                Verwacht Rendement: +{testResult.kpis.totalReturnPct.toFixed(1)}% (+€ {testResult.kpis.totalProfit.toLocaleString('nl-NL', { maximumFractionDigits: 0 })})
              </h3>
            </div>
            <span className="px-3 py-1 bg-white/20 rounded-lg text-xs font-bold text-white border border-white/30">
              {testResult.kpis.totalTrades} Orders Gesimuleerd
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-white">
            <div className="bg-white/10 p-3 rounded-xl border border-white/15">
              <span className="text-[10px] uppercase font-bold text-emerald-200">Win Rate</span>
              <div className="text-lg font-black">{testResult.kpis.winRate.toFixed(0)}%</div>
            </div>
            <div className="bg-white/10 p-3 rounded-xl border border-white/15">
              <span className="text-[10px] uppercase font-bold text-emerald-200">Max Drawdown</span>
              <div className="text-lg font-black text-rose-200">-{testResult.kpis.maxDrawdownPct.toFixed(1)}%</div>
            </div>
            <div className="bg-white/10 p-3 rounded-xl border border-white/15">
              <span className="text-[10px] uppercase font-bold text-emerald-200">vs S&amp;P 500</span>
              <div className="text-lg font-black">{testResult.kpis.outperformanceVsSp500 >= 0 ? '+' : ''}{testResult.kpis.outperformanceVsSp500.toFixed(1)}%</div>
            </div>
            <div className="bg-white/10 p-3 rounded-xl border border-white/15">
              <span className="text-[10px] uppercase font-bold text-emerald-200">Totale Frictiekosten</span>
              <div className="text-lg font-black">€ {testResult.kpis.totalCosts?.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}</div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Vaste Opslag & Test Balk */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-4 z-10 backdrop-blur-md bg-white/95">
        <div className="text-xs text-gray-500 font-medium">
          {selectedStrategyId !== 'new' ? (
            <span>Bestaande strategie bewerken (ID #{selectedStrategyId})</span>
          ) : (
            <span>Nieuwe strategie klaar om opgeslagen te worden</span>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleTestStrategy}
            disabled={testing}
            className="flex-1 sm:flex-none px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {testing ? (
              <>
                <i className="ph-bold ph-spinner animate-spin"></i>
                Bezig met Simuleren...
              </>
            ) : (
              <>
                <i className="ph-bold ph-play"></i>
                ▶ Test Strategie (Simulatie)
              </>
            )}
          </button>

          <button
            onClick={handleSaveStrategy}
            disabled={saving}
            className="flex-1 sm:flex-none px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <i className="ph-bold ph-spinner animate-spin"></i>
                Opslaan...
              </>
            ) : (
              <>
                <i className="ph-bold ph-floppy-disk"></i>
                💾 Strategie Opslaan
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StrategyBuilderTab;


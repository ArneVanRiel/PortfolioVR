import React, { useState, useEffect, useMemo } from 'react';
import http from '../../http-common';

const StrategyBuilderTab = ({ initialStrategyToEdit, onStrategySaved, onOpenBacktest }) => {
  const [strategies, setStrategies] = useState([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState(initialStrategyToEdit?.strategy_id || 'new');

  // Metadata
  const [strategyName, setStrategyName] = useState(initialStrategyToEdit?.name || '');
  const [strategyDescription, setStrategyDescription] = useState(initialStrategyToEdit?.description || '');
  const [isPublic, setIsPublic] = useState(initialStrategyToEdit?.is_public !== undefined ? initialStrategyToEdit.is_public : true);

  // Kapitaalallocatie & Volg-Instelling
  const [allocationMode, setAllocationMode] = useState('cash_percent'); // 'cash_percent' | 'monthly_amount' | 'fixed_capital'
  const [allocationPercent, setAllocationPercent] = useState(80); // % van de vrije cash
  const [monthlyAmount, setMonthlyAmount] = useState(500); // € per maand
  const [userAvailableCash, setUserAvailableCash] = useState(0);
  const [advisorData, setAdvisorData] = useState(null);
  const [actionFilter, setActionFilter] = useState('ALL'); // 'ALL' | 'BUY' | 'HOLD' | 'SELL'
  const [activating, setActivating] = useState(false);

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

  // Haal live portfolio en marktsituatie op voor de actie-screener
  useEffect(() => {
    const fetchAdvisorContext = async () => {
      try {
        const res = await http.get('/portfolio/strategy-advisor');
        if (res.data) {
          setAdvisorData(res.data);
          const cash = Number(res.data.cashAllocation?.availableCashEur || res.data.totalAvailableCash || 2805.13);
          setUserAvailableCash(cash);
        }
      } catch (err) {
        console.warn('Kon portfolio advisor context niet laden in builder:', err.message);
      }
    };
    fetchAdvisorContext();
  }, []);

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

  // Bereken het actuele inzetbare kapitaal op basis van de gekozen modus
  const deployableCapital = useMemo(() => {
    if (allocationMode === 'cash_percent') {
      return (userAvailableCash * (allocationPercent / 100)) || 0;
    }
    if (allocationMode === 'monthly_amount') {
      return Number(monthlyAmount) || 0;
    }
    return Number(initialCapital) || 10000;
  }, [allocationMode, allocationPercent, monthlyAmount, initialCapital, userAvailableCash]);

  // Realtime Data-Driven Actie-Screener
  const screenedActions = useMemo(() => {
    if (!advisorData) return [];
    const candidates = advisorData.topBuyCandidates || [];
    const holdings = advisorData.holdings || [];

    // Filter koopkandidaten op basis van de gekozen builder-parameters
    const qualifiedBuys = candidates.filter(c => {
      const pToI = Number(c.priceToIntrinsicRatio || (c.price && c.intrinsicValue ? c.price / c.intrinsicValue : 1.0));
      if (maxPriceToIntrinsicRatio > 0 && pToI > maxPriceToIntrinsicRatio) return false;
      return true;
    });

    const numPicks = Math.max(1, Math.min(qualifiedBuys.length, 5));
    const budgetPerStock = qualifiedBuys.length > 0 ? (deployableCapital / numPicks) : 0;

    const buyActions = qualifiedBuys.slice(0, 5).map(c => {
      const price = Number(c.price || c.current_price || 100);
      let orderAmount = Math.max(0, budgetPerStock);
      if (orderAmount < minOrderSkipThreshold) orderAmount = 0;
      let rawShares = price > 0 ? orderAmount / price : 0;
      let shares = allowFractionalShares ? Math.round(rawShares * 10) / 10 : Math.floor(rawShares);
      if (!allowFractionalShares && shares === 0 && orderAmount >= price) shares = 1;
      const actualCost = shares * price;

      return {
        type: 'BUY',
        ticker: c.ticker,
        name: c.name || c.ticker,
        score: c.score || 5,
        price,
        intrinsicValue: c.intrinsicValue,
        priceToIntrinsicRatio: c.priceToIntrinsicRatio,
        orderAmount: actualCost > 0 ? actualCost : orderAmount,
        shares,
        statusBadge: '🟢 Kooporder',
        badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        reason: `Score ${c.score || 5}/5 • Koers ${c.priceToIntrinsicRatio ? c.priceToIntrinsicRatio.toFixed(2) + 'x' : 'gunstig'} intrinsiek • MACD Koopsignaal`
      };
    });

    // Evalueer huidige portefeuilleposities
    const holdingActions = holdings.map(h => {
      const score = Number(h.score || 5);
      const isWvDown = h.prevWaardeVerdeling != null && h.waardeVerdeling < h.prevWaardeVerdeling;

      if (sellOnScoreDrop && score < 5) {
        return {
          type: 'SELL',
          ticker: h.ticker,
          name: h.name || h.ticker,
          score,
          price: h.currentPrice || h.price,
          orderAmount: h.currentValue || (h.shares * (h.currentPrice || h.price)),
          shares: h.shares,
          statusBadge: '🔴 100% Verkoop',
          badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
          reason: `Score is gedaald naar ${score}/5 (strategieregel: enkel 5/5 behouden)`
        };
      }
      if (useWaardeverdelingSell && isWvDown) {
        const dropAmount = Math.max(0, (h.currentValue || 0) * 0.25);
        return {
          type: 'SELL',
          ticker: h.ticker,
          name: h.name || h.ticker,
          score,
          price: h.currentPrice || h.price,
          orderAmount: dropAmount,
          shares: allowFractionalShares ? Math.round((dropAmount / (h.currentPrice || 1)) * 10) / 10 : Math.floor(dropAmount / (h.currentPrice || 1)),
          statusBadge: '✂️ Deelverkoop (Snoei)',
          badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
          reason: `Waardeverdeling daalde van ${h.prevWaardeVerdeling}% naar ${h.waardeVerdeling}%`
        };
      }
      return {
        type: 'HOLD',
        ticker: h.ticker,
        name: h.name || h.ticker,
        score,
        price: h.currentPrice || h.price,
        orderAmount: h.currentValue || 0,
        shares: h.shares,
        statusBadge: '🔵 Behouden',
        badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
        reason: 'Positie voldoet aan kwaliteitsregels en waardering binnen limiet'
      };
    });

    return [...buyActions, ...holdingActions];
  }, [advisorData, deployableCapital, maxPriceToIntrinsicRatio, minOrderSkipThreshold, allowFractionalShares, sellOnScoreDrop, useWaardeverdelingSell]);

  const filteredScreenedActions = useMemo(() => {
    if (actionFilter === 'ALL') return screenedActions;
    return screenedActions.filter(a => a.type === actionFilter);
  }, [screenedActions, actionFilter]);

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
    if (p.allocationMode !== undefined) setAllocationMode(p.allocationMode);
    if (p.allocationPercent !== undefined) setAllocationPercent(p.allocationPercent);
    if (p.monthlyAmount !== undefined) setMonthlyAmount(p.monthlyAmount);
    setTestResult(strat.performance_summary ? { kpis: strat.performance_summary } : null);
  };

  const resetToNew = () => {
    setSelectedStrategyId('new');
    setStrategyName('');
    setStrategyDescription('');
    setIsPublic(true);
    setAllocationMode('cash_percent');
    setAllocationPercent(80);
    setMonthlyAmount(500);
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
      allocationMode,
      allocationPercent: Number(allocationPercent),
      monthlyAmount: Number(monthlyAmount),
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
      xirrPct: testResult.kpis.xirrPct || testResult.kpis.cagrPct,
      cagrPct: testResult.kpis.cagrPct,
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

  // Strategie direct activeren op de eigen portefeuille
  const handleActivateOnPortfolio = async () => {
    setActivating(true);
    setFeedback({ type: '', text: '' });
    try {
      let stratId = selectedStrategyId;
      if (!stratId || stratId === 'new') {
        if (!strategyName.trim()) {
          setFeedback({ type: 'error', text: 'Geef eerst een naam op voor deze strategie om ze te kunnen activeren.' });
          setActivating(false);
          return;
        }
        const res = await http.post('/strategies', {
          name: strategyName.trim(),
          description: strategyDescription.trim(),
          is_public: isPublic,
          parameters: {
            allocationMode,
            allocationPercent: Number(allocationPercent),
            monthlyAmount: Number(monthlyAmount),
            initialCapital: Number(initialCapital),
            requireScore5: true,
            requireWaardeverdelingRise: true,
            sellOnScoreDrop,
            useWaardeverdelingSell,
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
          },
          performance_summary: testResult?.kpis ? {
            totalReturnPct: testResult.kpis.totalReturnPct,
            xirrPct: testResult.kpis.xirrPct || testResult.kpis.cagrPct,
            totalProfit: testResult.kpis.totalProfit,
            winRate: testResult.kpis.winRate,
            maxDrawdownPct: testResult.kpis.maxDrawdownPct,
            totalTrades: testResult.kpis.totalTrades
          } : null
        });
        stratId = res.data.strategy_id;
        setSelectedStrategyId(stratId);
      }
      await http.post(`/strategies/${stratId}/activate`);
      setFeedback({
        type: 'success',
        text: `⚡ Strategie "${strategyName || 'Aangepaste Strategie'}" is nu actief gekoppeld aan jouw portefeuille! De Strategie Assistent in Portfolio volgt vanaf nu deze regels en dit budget.`
      });
      fetchMyStrategies();
    } catch (err) {
      console.error('Fout bij activeren strategie:', err);
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Fout bij activeren van strategie.' });
    } finally {
      setActivating(false);
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

        {/* 2b. Kapitaalallocatie & Volg-Instelling */}
        <div className="mt-6 pt-6 border-t border-gray-100">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <i className="ph-fill ph-coins text-amber-500 text-lg"></i>
                <span>Kapitaalallocatie &amp; Volg-Instelling</span>
              </h3>
              <p className="text-xs text-gray-500">
                Kies hoeveel kapitaal je aan deze strategie toewijst. De actie-screener hieronder berekent exact welke orders hierbij horen.
              </p>
            </div>
            <div className="px-3.5 py-1.5 rounded-xl bg-blue-50 text-blue-900 font-extrabold text-xs border border-blue-200 flex items-center gap-1.5 shadow-xs">
              <i className="ph-fill ph-wallet text-blue-600"></i>
              <span>Vrije Cash: € {userAvailableCash.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Optie 1: Percentage van vrije cash */}
            <div 
              onClick={() => setAllocationMode('cash_percent')}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                allocationMode === 'cash_percent' 
                  ? 'border-blue-600 bg-blue-50/50 shadow-xs' 
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <i className="ph-fill ph-percent text-blue-600"></i>
                  % van Beschikbaar Saldo
                </span>
                <input
                  type="radio"
                  name="alloc_mode"
                  checked={allocationMode === 'cash_percent'}
                  onChange={() => setAllocationMode('cash_percent')}
                  className="w-4 h-4 text-blue-600"
                />
              </div>
              <p className="text-[11px] text-gray-500 mb-3">
                Zet automatisch een percentage van je actuele vrije liquiditeit in.
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-blue-900">{allocationPercent}% van cash</span>
                  <span className="text-emerald-700 font-black">€ {((userAvailableCash * allocationPercent) / 100).toLocaleString('nl-NL', { maximumFractionDigits: 0 })} budget</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={allocationPercent}
                  onChange={(e) => setAllocationPercent(Number(e.target.value))}
                  disabled={allocationMode !== 'cash_percent'}
                  className="w-full accent-blue-600"
                />
                <div className="flex gap-1.5">
                  {[25, 50, 75, 80, 100].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setAllocationMode('cash_percent'); setAllocationPercent(pct); }}
                      className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                        allocationPercent === pct && allocationMode === 'cash_percent'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Optie 2: Vast maandbedrag (DCA) */}
            <div 
              onClick={() => setAllocationMode('monthly_amount')}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                allocationMode === 'monthly_amount' 
                  ? 'border-indigo-600 bg-indigo-50/50 shadow-xs' 
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <i className="ph-fill ph-calendar text-indigo-600"></i>
                  Vast Maandbedrag (DCA)
                </span>
                <input
                  type="radio"
                  name="alloc_mode"
                  checked={allocationMode === 'monthly_amount'}
                  onChange={() => setAllocationMode('monthly_amount')}
                  className="w-4 h-4 text-indigo-600"
                />
              </div>
              <p className="text-[11px] text-gray-500 mb-3">
                Periodieke maandelijkse inleg gespreid over de top koopkansen.
              </p>
              <div className="space-y-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">€</span>
                  <input
                    type="number"
                    min="50"
                    step="50"
                    value={monthlyAmount}
                    onChange={(e) => setMonthlyAmount(Number(e.target.value))}
                    disabled={allocationMode !== 'monthly_amount'}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-800"
                  />
                </div>
                <div className="flex gap-1.5">
                  {[250, 500, 750, 1000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setAllocationMode('monthly_amount'); setMonthlyAmount(amt); }}
                      className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                        monthlyAmount === amt && allocationMode === 'monthly_amount'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      €{amt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Optie 3: Vast startkapitaal */}
            <div 
              onClick={() => setAllocationMode('fixed_capital')}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                allocationMode === 'fixed_capital' 
                  ? 'border-purple-600 bg-purple-50/50 shadow-xs' 
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <i className="ph-fill ph-wallet text-purple-600"></i>
                  Vast Startkapitaal
                </span>
                <input
                  type="radio"
                  name="alloc_mode"
                  checked={allocationMode === 'fixed_capital'}
                  onChange={() => setAllocationMode('fixed_capital')}
                  className="w-4 h-4 text-purple-600"
                />
              </div>
              <p className="text-[11px] text-gray-500 mb-3">
                Eenmalig lump-sum budget voor initiële portefeuille-opbouw.
              </p>
              <div className="space-y-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">€</span>
                  <input
                    type="number"
                    min="500"
                    step="500"
                    value={initialCapital}
                    onChange={(e) => setInitialCapital(Number(e.target.value))}
                    disabled={allocationMode !== 'fixed_capital'}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-800"
                  />
                </div>
                <div className="flex gap-1.5">
                  {[5000, 10000, 20000, 50000].map(cap => (
                    <button
                      key={cap}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setAllocationMode('fixed_capital'); setInitialCapital(cap); }}
                      className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                        initialCapital === cap && allocationMode === 'fixed_capital'
                          ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                          : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      €{cap >= 1000 ? `${cap / 1000}k` : cap}
                    </button>
                  ))}
                </div>
              </div>
            </div>
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

      {/* 4. Live Data-Driven Actie-Screener */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold">
                <i className="ph-fill ph-lightning text-lg"></i>
              </span>
              <div>
                <h3 className="text-base font-extrabold text-gray-900">
                  Actie-Screener: Concrete Voorgestelde Transacties
                </h3>
                <p className="text-xs text-gray-500">
                  Live screening op basis van jouw gekozen kwaliteitsregels en een deployable budget van <strong>€ {deployableCapital.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}</strong>.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl text-xs font-bold flex-wrap">
            <button
              type="button"
              onClick={() => setActionFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all ${actionFilter === 'ALL' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}
            >
              Alle ({screenedActions.length})
            </button>
            <button
              type="button"
              onClick={() => setActionFilter('BUY')}
              className={`px-3 py-1.5 rounded-lg transition-all ${actionFilter === 'BUY' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:bg-emerald-50'}`}
            >
              🟢 Kopen ({screenedActions.filter(a => a.type === 'BUY').length})
            </button>
            <button
              type="button"
              onClick={() => setActionFilter('HOLD')}
              className={`px-3 py-1.5 rounded-lg transition-all ${actionFilter === 'HOLD' ? 'bg-blue-600 text-white shadow-xs' : 'text-blue-700 hover:bg-blue-50'}`}
            >
              🔵 Houden ({screenedActions.filter(a => a.type === 'HOLD').length})
            </button>
            <button
              type="button"
              onClick={() => setActionFilter('SELL')}
              className={`px-3 py-1.5 rounded-lg transition-all ${actionFilter === 'SELL' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-700 hover:bg-rose-50'}`}
            >
              🔴 Verkopen / Snoeien ({screenedActions.filter(a => a.type === 'SELL').length})
            </button>
          </div>
        </div>

        {filteredScreenedActions.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-xs">
            Geen concrete acties gevonden onder deze filter of criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Aandeel</th>
                  <th className="py-3 px-4">Kwaliteit &amp; Waardering</th>
                  <th className="py-3 px-4">Voorgestelde Actie</th>
                  <th className="py-3 px-4 text-right">Inzetbedrag</th>
                  <th className="py-3 px-4 text-right">Aantal Stuks</th>
                  <th className="py-3 px-4">Strategie Signaal &amp; Toelichting</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {filteredScreenedActions.map((act, idx) => (
                  <tr key={`${act.ticker}-${idx}`} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-extrabold text-sm text-gray-900">{act.ticker}</div>
                      <div className="text-[11px] text-gray-400 truncate max-w-[140px]">{act.name}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${act.score === 5 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {act.score}/5
                        </span>
                        <span className="text-[11px] text-gray-600">
                          {act.priceToIntrinsicRatio ? `${Number(act.priceToIntrinsicRatio).toFixed(2)}x intrinsiek` : `€${Number(act.price).toFixed(2)}`}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 ${act.badgeColor}`}>
                        {act.statusBadge}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-extrabold text-gray-900">
                      {act.orderAmount > 0 ? `€ ${act.orderAmount.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-blue-600">
                      {act.shares > 0 ? (allowFractionalShares ? act.shares.toFixed(1) : act.shares) : '-'}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-[11px] max-w-xs leading-snug">
                      {act.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Test Resultaat Kaart (indien gesimuleerd) */}
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
              <span className="text-[10px] uppercase font-bold text-emerald-200">XIRR / Jaar</span>
              <div className="text-lg font-black">{testResult.kpis.xirrPct != null ? `${testResult.kpis.xirrPct >= 0 ? '+' : ''}${testResult.kpis.xirrPct.toFixed(1)}%` : '-'}</div>
            </div>
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
          </div>
        </div>
      )}

      {/* 6. Vaste Opslag, Activatie & Test Balk */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-4 z-10 backdrop-blur-md bg-white/95">
        <div className="text-xs text-gray-500 font-medium">
          {selectedStrategyId !== 'new' ? (
            <span>Bestaande strategie bewerken (ID #{selectedStrategyId})</span>
          ) : (
            <span>Nieuwe strategie klaar om opgeslagen of geactiveerd te worden</span>
          )}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap justify-end">
          {onOpenBacktest && (
            <button
              onClick={onOpenBacktest}
              type="button"
              className="px-3.5 py-2.5 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-800 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
            >
              <i className="ph-bold ph-chart-line-up text-purple-600"></i>
              <span>Open Backtest</span>
            </button>
          )}

          <button
            onClick={handleTestStrategy}
            disabled={testing}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {testing ? (
              <>
                <i className="ph-bold ph-spinner animate-spin"></i>
                Simuleren...
              </>
            ) : (
              <>
                <i className="ph-bold ph-play"></i>
                ▶ Test (Simulatie)
              </>
            )}
          </button>

          <button
            onClick={handleActivateOnPortfolio}
            disabled={activating}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            title="Koppel deze strategie direct aan je portefeuille zodat de assistent conform deze regels adviseert"
          >
            {activating ? (
              <>
                <i className="ph-bold ph-spinner animate-spin"></i>
                Koppelen...
              </>
            ) : (
              <>
                <i className="ph-fill ph-lightning text-amber-300"></i>
                ⚡ Activeer op Portfolio
              </>
            )}
          </button>

          <button
            onClick={handleSaveStrategy}
            disabled={saving}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <>
                <i className="ph-bold ph-spinner animate-spin"></i>
                Opslaan...
              </>
            ) : (
              <>
                <i className="ph-bold ph-floppy-disk"></i>
                💾 Opslaan
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StrategyBuilderTab;


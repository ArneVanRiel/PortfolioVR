import React, { useState, useEffect, useMemo } from 'react';
import http from '../../http-common';

const StrategyBuilderTab = ({ initialStrategyToEdit, onStrategySaved, onOpenBacktest }) => {
  const [strategies, setStrategies] = useState([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState(initialStrategyToEdit?.strategy_id || 'new');

  // Metadata
  const [strategyType, setStrategyType] = useState(initialStrategyToEdit?.strategy_type || 'STOCKS'); // 'STOCKS' | 'ETF'
  const [strategyName, setStrategyName] = useState(initialStrategyToEdit?.name || '');
  const [strategyDescription, setStrategyDescription] = useState(initialStrategyToEdit?.description || '');
  const [isPublic, setIsPublic] = useState(initialStrategyToEdit?.is_public !== undefined ? initialStrategyToEdit.is_public : true);

  // Kapitaalallocatie & Volg-Instelling (Hoe kopen & Moeten er aandelen verkocht worden?)
  const [allocationMode, setAllocationMode] = useState('cash_percent'); // 'cash_percent' | 'monthly_amount' | 'fixed_capital'
  const [allocationPercent, setAllocationPercent] = useState(100); // % van de vrije cash
  const [monthlyAmount, setMonthlyAmount] = useState(450); // € per maand
  const [allowSellingMode, setAllowSellingMode] = useState('full_strategy'); // 'full_strategy' | 'score_drop_only' | 'buy_only'
  const [etfAllocations, setEtfAllocations] = useState([
    { ticker: 'VGWL.DE', name: 'Vanguard FTSE All-World UCITS ETF', weightPct: 70 },
    { ticker: 'VUSA.DE', name: 'Vanguard S&P 500 UCITS ETF', weightPct: 12 },
    { ticker: 'VGWD.DE', name: 'Vanguard All-World High Dividend', weightPct: 10 },
    { ticker: 'SPYM', name: 'SPDR MSCI Emerging Markets UCITS ETF', weightPct: 8 }
  ]);
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
  const [userActiveStrategies, setUserActiveStrategies] = useState([]);
  const [activatePriority, setActivatePriority] = useState(1);

  // Verplichte Bevestigingsmodal voor Opslaan/Aanpassen, Activeren en Verwijderen
  const [builderConfirmModal, setBuilderConfirmModal] = useState({
    isOpen: false,
    mode: '', // 'UPDATE_EXISTING' | 'SAVE_NEW' | 'ACTIVATE' | 'DEACTIVATE_ACTIVE' | 'DELETE_STRATEGY'
    title: '',
    description: '',
    details: []
  });

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

  // Haal eigen strategieën én actieve strategie-koppelingen op
  const fetchMyStrategies = async () => {
    try {
      const [stratRes, cfgRes] = await Promise.all([
        http.get('/strategies'),
        http.get('/strategies/my-config').catch(() => ({ data: null }))
      ]);
      const myOnly = (stratRes.data || []).filter(s => s.can_view_details);
      setStrategies(myOnly);
      if (cfgRes?.data?.activeStrategies) {
        setUserActiveStrategies(cfgRes.data.activeStrategies);
        setActivatePriority(cfgRes.data.activeStrategies.length + 1);
      }
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
    const sType = (strat.strategy_type || p.strategyType || 'STOCKS').toUpperCase() === 'ETF' ? 'ETF' : 'STOCKS';
    setStrategyType(sType);

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
    else if (p.fundingMode === 'monthly_amount') setAllocationMode('monthly_amount');
    else if (p.fundingMode === 'available_cash') setAllocationMode('cash_percent');
    if (p.allocationPercent !== undefined) setAllocationPercent(p.allocationPercent);
    if (p.monthlyAmount !== undefined) setMonthlyAmount(p.monthlyAmount);
    else if (p.monthlyBudget !== undefined) setMonthlyAmount(p.monthlyBudget);
    if (p.allowSelling !== undefined) setAllowSellingMode(p.allowSelling);
    if (Array.isArray(p.etfAllocations) && p.etfAllocations.length > 0) setEtfAllocations(p.etfAllocations);
    setTestResult(strat.performance_summary ? { kpis: strat.performance_summary } : null);
  };

  const resetToNew = (targetType = 'STOCKS') => {
    const cleanType = targetType === 'ETF' ? 'ETF' : 'STOCKS';
    setSelectedStrategyId('new');
    setStrategyType(cleanType);
    setStrategyName('');
    setStrategyDescription('');
    setIsPublic(true);
    setAllocationMode(cleanType === 'ETF' ? 'monthly_amount' : 'cash_percent');
    setAllocationPercent(100);
    setMonthlyAmount(cleanType === 'ETF' ? 450 : 500);
    setAllowSellingMode(cleanType === 'ETF' ? 'buy_only' : 'full_strategy');
    setSellOnScoreDrop(cleanType !== 'ETF');
    setUseWaardeverdelingSell(cleanType !== 'ETF');
    setUsePortfolioRelativeWeight(true);
    setEnableActiveRebalance(true);
    setUseTrendFilter200Sma(false);
    setMaxPriceToIntrinsicRatio(1.3);
    setTakeProfitAtIntrinsicRatio(0);
    setStopLossPct(0);
    setMaxPositions(0);
    setAllowFractionalShares(cleanType !== 'ETF');
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

  const buildParametersPayload = () => {
    const fundingMode = allocationMode === 'monthly_amount' ? 'monthly_amount' : 'available_cash';
    return {
      strategyType,
      fundingMode,
      allowSelling: allowSellingMode,
      monthlyBudget: Number(monthlyAmount),
      allocationMode,
      allocationPercent: Number(allocationPercent),
      monthlyAmount: Number(monthlyAmount),
      initialCapital: Number(initialCapital),
      requireScore5: strategyType === 'STOCKS',
      requireWaardeverdelingRise: strategyType === 'STOCKS',
      sellOnScoreDrop: allowSellingMode === 'buy_only' ? false : sellOnScoreDrop,
      useWaardeverdelingSell: allowSellingMode === 'full_strategy' ? useWaardeverdelingSell : false,
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
      takeProfitAtIntrinsicRatio: Number(takeProfitAtIntrinsicRatio),
      etfAllocations: strategyType === 'ETF' ? etfAllocations : undefined
    };
  };

  const currentSelectedStrategyObj = useMemo(() => {
    if (!selectedStrategyId || selectedStrategyId === 'new') return null;
    return strategies.find(s => Number(s.strategy_id) === Number(selectedStrategyId)) || null;
  }, [strategies, selectedStrategyId]);

  const activeEntryForSelected = useMemo(() => {
    if (!selectedStrategyId || selectedStrategyId === 'new') return null;
    return userActiveStrategies.find(a => Number(a.strategy_id) === Number(selectedStrategyId)) || null;
  }, [userActiveStrategies, selectedStrategyId]);

  // Daadwerkelijke API-call voor opslaan (als update of als nieuwe kopie)
  const executeSaveStrategy = async (forceAsNewCopy = false) => {
    if (!strategyName.trim()) {
      setFeedback({ type: 'error', text: 'Geef eerst een naam op voor deze strategie.' });
      return;
    }

    setSaving(true);
    setFeedback({ type: '', text: '' });
    setBuilderConfirmModal(prev => ({ ...prev, isOpen: false }));

    const parameters = buildParametersPayload();

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
      if (!forceAsNewCopy && selectedStrategyId && selectedStrategyId !== 'new') {
        await http.put(`/strategies/${selectedStrategyId}`, {
          name: strategyName.trim(),
          description: strategyDescription.trim(),
          is_public: isPublic,
          strategy_type: strategyType,
          parameters,
          performance_summary: performanceSummary
        });
        setFeedback({ type: 'success', text: `Strategie "${strategyName}" succesvol bijgewerkt!` });
      } else {
        const copyName = forceAsNewCopy && currentSelectedStrategyObj && strategyName.trim() === currentSelectedStrategyObj.name
          ? `${strategyName.trim()} (Kopie)`
          : strategyName.trim();
        const res = await http.post('/strategies', {
          name: copyName,
          description: strategyDescription.trim(),
          is_public: isPublic,
          strategy_type: strategyType,
          parameters,
          performance_summary: performanceSummary
        });
        setStrategyName(copyName);
        setSelectedStrategyId(res.data.strategy_id);
        setFeedback({ type: 'success', text: `Nieuwe ${strategyType === 'ETF' ? 'ETF-' : 'Aandelen-'}strategie "${copyName}" succesvol aangemaakt en opgeslagen!` });
      }
      await fetchMyStrategies();
      if (onStrategySaved) onStrategySaved();
    } catch (err) {
      console.error('Fout bij opslaan:', err);
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Fout bij opslaan strategie.' });
    } finally {
      setSaving(false);
    }
  };

  // Vraag ALTIJD bevestiging vóór het aanpassen/opslaan van een bestaande strategie
  const handleSaveStrategy = () => {
    if (!strategyName.trim()) {
      setFeedback({ type: 'error', text: 'Geef eerst een naam op voor deze strategie.' });
      return;
    }

    if (selectedStrategyId && selectedStrategyId !== 'new') {
      setBuilderConfirmModal({
        isOpen: true,
        mode: 'UPDATE_EXISTING',
        title: `Strategie "${strategyName}" aanpassen of als nieuwe kopie opslaan?`,
        description: `Je bewerkt momenteel een bestaande strategie (ID #${selectedStrategyId}). Wil je deze bestaande strategie overschrijven, of liever opslaan als een aparte nieuwe strategie?`,
        details: [
          `Naam: ${strategyName}`,
          `Type: ${strategyType === 'ETF' ? 'ETF DCA Strategie' : 'Losse Aandelen Strategie'}`,
          `Tip: Kies "Opslaan als Nieuwe Kopie" als je de bestaande strategie ongewijzigd wilt laten.`
        ]
      });
    } else {
      executeSaveStrategy(false);
    }
  };

  // Vraag bevestiging vóór het activeren op de portefeuille (met Prioriteit-keuze)
  const handleActivateOnPortfolio = () => {
    if ((!selectedStrategyId || selectedStrategyId === 'new') && !strategyName.trim()) {
      setFeedback({ type: 'error', text: 'Geef eerst een naam op voor deze strategie om ze te kunnen activeren.' });
      return;
    }
    const existingPrio = activeEntryForSelected ? activeEntryForSelected.priority_order : userActiveStrategies.length + 1;
    setActivatePriority(existingPrio);
    setBuilderConfirmModal({
      isOpen: true,
      mode: 'ACTIVATE',
      title: `Strategie "${strategyName || 'Gekozen Strategie'}" activeren op je portefeuille?`,
      description: activeEntryForSelected
        ? `Deze strategie staat al in je actieve lijst (Prioriteit #${activeEntryForSelected.priority_order}). Bevestig hieronder om de volg-instellingen en prioriteit bij te werken.`
        : `Je kunt 1, 2 of meer strategieën tegelijk volgen (bijv. 2 aandelen-strategieën of enkel 1 ETF-strategie). Kies hieronder welke prioriteit deze strategie krijgt.`,
      details: [
        `Type: ${strategyType === 'ETF' ? '📈 ETF DCA Strategie' : '💎 Losse Aandelen Strategie'}`,
        `Inleg: ${allocationMode === 'monthly_amount' ? `Vast bedrag (€${monthlyAmount}/mnd)` : 'Beschikbaar vrij geld'}`,
        `Verkopen: ${allowSellingMode === 'buy_only' ? 'Nooit verkopen (Buy & Hold)' : allowSellingMode === 'score_drop_only' ? 'Enkel verkopen bij Score < 5' : 'Volledige verkoop- & snoeiregels'}`
      ]
    });
  };

  const executeActivateOnPortfolio = async () => {
    setActivating(true);
    setFeedback({ type: '', text: '' });
    setBuilderConfirmModal(prev => ({ ...prev, isOpen: false }));
    try {
      let stratId = selectedStrategyId;
      const parameters = buildParametersPayload();
      if (!stratId || stratId === 'new') {
        const res = await http.post('/strategies', {
          name: strategyName.trim(),
          description: strategyDescription.trim(),
          is_public: isPublic,
          strategy_type: strategyType,
          parameters,
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
      const fundingMode = allocationMode === 'monthly_amount' ? 'monthly_amount' : 'available_cash';
      await http.post('/strategies/my-active', {
        entry_id: activeEntryForSelected?.entry_id,
        strategy_id: Number(stratId),
        priority_order: Number(activatePriority || 1),
        funding_mode: fundingMode,
        monthly_budget: Number(monthlyAmount),
        allow_selling: allowSellingMode
      });
      setFeedback({
        type: 'success',
        text: `⚡ Strategie "${strategyName || 'Gekozen Strategie'}" is nu actief op Prioriteit #${activatePriority}! Eerdere meldingen blijven altijd bewaard.`
      });
      await fetchMyStrategies();
    } catch (err) {
      console.error('Fout bij activeren strategie:', err);
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Fout bij activeren van strategie.' });
    } finally {
      setActivating(false);
    }
  };

  // Actieve strategie verwijderen / stopzetten voor deze gebruiker (met bevestiging)
  const requestDeactivateFromPortfolio = () => {
    if (!activeEntryForSelected) return;
    setBuilderConfirmModal({
      isOpen: true,
      mode: 'DEACTIVATE_ACTIVE',
      title: `Actieve strategie "${strategyName}" stopzetten?`,
      description: `Weet je zeker dat je "${strategyName}" (Prioriteit #${activeEntryForSelected.priority_order}) wilt verwijderen uit jouw actieve strategieën?`,
      details: [
        `Je ontvangt voor deze strategie geen nieuwe meldingen meer.`,
        `Alle historische meldingen van deze strategie blijven bewaard in je overzicht.`,
        `De strategie zelf blijft bewaard in de Strategie Builder.`
      ]
    });
  };

  const executeDeactivateFromPortfolio = async () => {
    if (!activeEntryForSelected) return;
    setBuilderConfirmModal(prev => ({ ...prev, isOpen: false }));
    try {
      await http.delete(`/strategies/my-active/${activeEntryForSelected.entry_id}`);
      setFeedback({
        type: 'success',
        text: `🗑️ "${strategyName}" is verwijderd uit je actieve strategieën. Historische meldingen blijven bewaard.`
      });
      await fetchMyStrategies();
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Kon actieve strategie niet verwijderen.' });
    }
  };

  // Custom strategie definitief verwijderen uit de database (met bevestiging)
  const requestDeleteCustomStrategy = () => {
    if (!currentSelectedStrategyObj || currentSelectedStrategyObj.is_system_default) return;
    setBuilderConfirmModal({
      isOpen: true,
      mode: 'DELETE_STRATEGY',
      title: `Strategie "${strategyName}" definitief verwijderen?`,
      description: `Weet je zeker dat je de zelfgemaakte strategie "${strategyName}" definitief wilt verwijderen uit de Strategie Builder?`,
      details: [
        `Deze actie verwijdert de strategie uit de lijst.`,
        `Oude meldingen die ooit door deze strategie zijn gegenereerd blijven bewaard.`
      ]
    });
  };

  const executeDeleteCustomStrategy = async () => {
    if (!currentSelectedStrategyObj) return;
    setBuilderConfirmModal(prev => ({ ...prev, isOpen: false }));
    try {
      if (activeEntryForSelected) {
        await http.delete(`/strategies/my-active/${activeEntryForSelected.entry_id}`).catch(() => {});
      }
      await http.delete(`/strategies/${currentSelectedStrategyObj.strategy_id}`);
      const deletedName = currentSelectedStrategyObj.name;
      resetToNew('STOCKS');
      setFeedback({ type: 'success', text: `🗑️ Strategie "${deletedName}" is definitief verwijderd.` });
      await fetchMyStrategies();
      if (onStrategySaved) onStrategySaved();
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Kon strategie niet verwijderen.' });
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
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-gray-900">Strategie Builder</h2>
                  {activeEntryForSelected && (
                    <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[11px] font-black">
                      🏆 Actief op jouw Portfolio (Prioriteit #{activeEntryForSelected.priority_order})
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  Ontwerp, parameteriseer en test jouw eigen datagedreven kwartaal- en momentumstrategieën. Elke aanpassing of verwijdering vraagt eerst om bevestiging.
                </p>
              </div>
            </div>
          </div>

          {/* Strategie Selectie Dropdown */}
          <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
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
              {strategies.map(s => {
                const activeMatch = userActiveStrategies.find(a => Number(a.strategy_id) === Number(s.strategy_id));
                return (
                  <option key={s.strategy_id} value={s.strategy_id}>
                    {activeMatch ? `[Actief #${activeMatch.priority_order}] ` : ''}{s.is_system_default ? '⭐ ' : ''}{s.name}
                  </option>
                );
              })}
            </select>

            <button
              onClick={() => resetToNew(strategyType)}
              className="px-3 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-bold text-xs rounded-xl transition-all"
              title="Start een nieuwe lege strategie"
            >
              + Nieuw
            </button>

            {activeEntryForSelected && (
              <button
                type="button"
                onClick={requestDeactivateFromPortfolio}
                className="px-3 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs rounded-xl transition-all flex items-center gap-1"
                title="Haal deze strategie uit jouw actieve strategieën (met bevestiging)"
              >
                <i className="ph-bold ph-plugs"></i>
                <span>Actieve Strategie Verwijderen</span>
              </button>
            )}

            {currentSelectedStrategyObj && !currentSelectedStrategyObj.is_system_default && (
              <button
                type="button"
                onClick={requestDeleteCustomStrategy}
                className="px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1"
                title="Verwijder deze eigen strategie definitief (met bevestiging)"
              >
                <i className="ph-bold ph-trash"></i>
                <span>Verwijder Strategie</span>
              </button>
            )}
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

        {/* 2. Metadata (Strategie Type, Naam, Beschrijving, Zichtbaarheid) */}
        <div className="pt-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Welk type strategie wil je bouwen of aanpassen?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setStrategyType('STOCKS');
                  if (selectedStrategyId === 'new') {
                    setAllocationMode('cash_percent');
                    setAllowSellingMode('full_strategy');
                  }
                }}
                className={`p-3.5 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${
                  strategyType === 'STOCKS'
                    ? 'border-indigo-600 bg-indigo-50/60 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <span className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-lg shrink-0">
                  💎
                </span>
                <div>
                  <div className="text-xs sm:text-sm font-black text-gray-900">Losse Aandelen Strategie</div>
                  <div className="text-[11px] text-gray-500">Score 5/5 kwaliteitsaandelen, intrinsieke waarde &amp; waardeverdeling</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStrategyType('ETF');
                  if (selectedStrategyId === 'new') {
                    setAllocationMode('monthly_amount');
                    setMonthlyAmount(450);
                    setAllowSellingMode('buy_only');
                  }
                }}
                className={`p-3.5 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${
                  strategyType === 'ETF'
                    ? 'border-emerald-600 bg-emerald-50/60 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <span className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-lg shrink-0">
                  📈
                </span>
                <div>
                  <div className="text-xs sm:text-sm font-black text-gray-900">ETF DCA &amp; Dip-Buy Strategie</div>
                  <div className="text-[11px] text-gray-500">Kern-ETF mandje met vaste maandpot &amp; MACD oversold koopmomenten</div>
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Strategienaam <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder={strategyType === 'ETF' ? "bv. Arne ETF DCA & MACD Dip-Buy (€450/mnd)..." : "bv. Arne's 5/5 Kwaliteit & Waardeverdeling..."}
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

          {/* Verkoopvoorkeur: Moeten er ook aandelen verkocht worden? */}
          <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-extrabold text-gray-900 flex items-center gap-1.5">
                <i className="ph-fill ph-scales text-indigo-600 text-base"></i>
                <span>Moeten er binnen deze strategie ook posities verkocht worden?</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                Bepaalt of de Strategie Assistent verkoopmeldingen stuurt
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <button
                type="button"
                onClick={() => {
                  setAllowSellingMode('full_strategy');
                  setSellOnScoreDrop(true);
                  setUseWaardeverdelingSell(true);
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  allowSellingMode === 'full_strategy'
                    ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 font-bold shadow-2xs'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="font-extrabold">✅ Ja, volledige verkoop- &amp; snoeiregels</div>
                <div className="text-[11px] text-gray-500 mt-0.5 font-normal">
                  100% verkoop bij Score &lt; 5 én deelverkoop bij daling waardeverdeling.
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAllowSellingMode('score_drop_only');
                  setSellOnScoreDrop(true);
                  setUseWaardeverdelingSell(false);
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  allowSellingMode === 'score_drop_only'
                    ? 'border-amber-600 bg-amber-50/80 text-amber-950 font-bold shadow-2xs'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="font-extrabold">🛡️ Enkel noodverkoop bij Score &lt; 5</div>
                <div className="text-[11px] text-gray-500 mt-0.5 font-normal">
                  Geen tussentijdse deelverkopen/snoei, enkel verkopen bij kwaliteitsverlies.
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAllowSellingMode('buy_only');
                  setSellOnScoreDrop(false);
                  setUseWaardeverdelingSell(false);
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  allowSellingMode === 'buy_only'
                    ? 'border-emerald-600 bg-emerald-50/80 text-emerald-950 font-bold shadow-2xs'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="font-extrabold">🔒 Nee, nooit verkopen (100% Buy &amp; Hold)</div>
                <div className="text-[11px] text-gray-500 mt-0.5 font-normal">
                  Enkel aankoopmeldingen ontvangen; bestaande posities nooit verkopen.
                </div>
              </button>
            </div>
          </div>

          {/* Specifieke ETF Mandje & Wegingen sectie wanneer ETF Strategie gekozen is */}
          {strategyType === 'ETF' && (
            <div className="mt-4 p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                  <i className="ph-fill ph-chart-pie-slice text-emerald-600 text-base"></i>
                  <span>ETF DCA Mandje &amp; Doelwegingen (Totaal: {etfAllocations.reduce((s, e) => s + Number(e.weightPct || 0), 0)}%)</span>
                </div>
                <span className="text-[11px] font-bold text-emerald-800">
                  Dagelijkse pot-opbouw: € {(Number(monthlyAmount || 450) / 30).toFixed(2)} / dag
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {etfAllocations.map((etf, idx) => (
                  <div key={etf.ticker} className="p-3 bg-white rounded-xl border border-emerald-200 space-y-1.5">
                    <div className="flex items-center justify-between font-black text-gray-900">
                      <span>{etf.ticker}</span>
                      <span className="text-emerald-700">€ {((Number(monthlyAmount || 450) * (Number(etf.weightPct) / 100))).toFixed(0)}/mnd</span>
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">{etf.name}</div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="text-[10px] font-bold text-gray-500">Weging (%):</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={etf.weightPct}
                        onChange={(e) => {
                          const next = [...etfAllocations];
                          next[idx] = { ...next[idx], weightPct: Number(e.target.value) };
                          setEtfAllocations(next);
                        }}
                        className="w-full px-2 py-1 border border-gray-200 rounded-lg font-bold text-gray-900 text-right"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
        <div className="text-xs text-gray-500 font-medium flex items-center gap-2 flex-wrap">
          {selectedStrategyId !== 'new' ? (
            <>
              <span>Bestaande strategie geselecteerd (ID #{selectedStrategyId})</span>
              {activeEntryForSelected && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md font-bold text-[11px]">
                  Actief op Prioriteit #{activeEntryForSelected.priority_order}
                </span>
              )}
            </>
          ) : (
            <span>Nieuwe strategie klaar om opgeslagen of geactiveerd te worden</span>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap justify-end">
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

          {activeEntryForSelected && (
            <button
              type="button"
              onClick={requestDeactivateFromPortfolio}
              className="px-3.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
              title="Verwijder uit jouw actieve strategieën (met bevestiging)"
            >
              <i className="ph-bold ph-trash"></i>
              <span>Actieve Strategie Verwijderen</span>
            </button>
          )}

          <button
            onClick={handleActivateOnPortfolio}
            disabled={activating}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            title="Koppel deze strategie aan je portefeuille met gekozen prioriteit (vraagt eerst bevestiging)"
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

          {selectedStrategyId !== 'new' && (
            <button
              type="button"
              onClick={() => executeSaveStrategy(true)}
              disabled={saving}
              className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              title="Sla op als een nieuwe losstaande strategie zonder de huidige te overschrijven"
            >
              <i className="ph-bold ph-copy"></i>
              <span>✨ Opslaan als Nieuwe Kopie</span>
            </button>
          )}

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
                <span>{selectedStrategyId !== 'new' ? '💾 Aanpassen (met bevestiging)' : '💾 Nieuwe Strategie Opslaan'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* VERPLICHTE BEVESTIGINGSMODAL VOOR OPSLAAN/AANPASSEN, ACTIVEREN EN VERWIJDEREN */}
      {builderConfirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 border-2 border-gray-200 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-black shrink-0 ${
                  builderConfirmModal.mode === 'DEACTIVATE_ACTIVE' || builderConfirmModal.mode === 'DELETE_STRATEGY'
                    ? 'bg-red-100 text-red-700 border border-red-200'
                    : 'bg-purple-100 text-purple-700 border border-purple-200'
                }`}>
                  {builderConfirmModal.mode === 'DEACTIVATE_ACTIVE' || builderConfirmModal.mode === 'DELETE_STRATEGY' ? '🗑️' : '🛡️'}
                </span>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Bevestiging Vereist
                  </span>
                  <h3 className="text-base font-black text-gray-900">
                    {builderConfirmModal.title}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBuilderConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-400 hover:text-gray-700 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed font-medium">
              {builderConfirmModal.description}
            </p>

            {builderConfirmModal.details?.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs text-gray-700">
                {builderConfirmModal.details.map((line, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-purple-600 font-black">•</span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Prioriteit-kiezer bij Activeren op Portfolio */}
            {builderConfirmModal.mode === 'ACTIVATE' && (
              <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 space-y-2 text-xs">
                <label className="block font-black text-purple-950">
                  Welke prioriteit krijgt deze strategie op je portefeuille?
                </label>
                <select
                  value={activatePriority}
                  onChange={(e) => setActivatePriority(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  {Array.from({ length: (activeEntryForSelected ? userActiveStrategies.length : userActiveStrategies.length + 1) }, (_, i) => i + 1).map(p => (
                    <option key={p} value={p}>
                      Prioriteit #{p} {p === 1 ? '(Hoogste prioriteit / Eerste recht op cash)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-purple-800">
                  Huidige actieve strategieën op jouw portfolio: <strong>{userActiveStrategies.length}</strong>. Je kunt 1 strategie volgen, of meerdere (bijv. 2 aandelen-strategieën of 1 ETF + 1 aandelen).
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setBuilderConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-extrabold transition-all"
              >
                Annuleren
              </button>

              {builderConfirmModal.mode === 'UPDATE_EXISTING' && (
                <>
                  <button
                    type="button"
                    onClick={() => executeSaveStrategy(true)}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <i className="ph-bold ph-copy"></i>
                    <span>✨ Opslaan als Nieuwe Kopie</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => executeSaveStrategy(false)}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <i className="ph-bold ph-check"></i>
                    <span>💾 Ja, Bestaande Overschrijven</span>
                  </button>
                </>
              )}

              {builderConfirmModal.mode === 'ACTIVATE' && (
                <button
                  type="button"
                  onClick={executeActivateOnPortfolio}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-extrabold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <i className="ph-bold ph-lightning"></i>
                  <span>Ja, Activeer op Prioriteit #{activatePriority}</span>
                </button>
              )}

              {builderConfirmModal.mode === 'DEACTIVATE_ACTIVE' && (
                <button
                  type="button"
                  onClick={executeDeactivateFromPortfolio}
                  className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <i className="ph-bold ph-trash"></i>
                  <span>Ja, Actieve Strategie Verwijderen</span>
                </button>
              )}

              {builderConfirmModal.mode === 'DELETE_STRATEGY' && (
                <button
                  type="button"
                  onClick={executeDeleteCustomStrategy}
                  className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <i className="ph-bold ph-trash"></i>
                  <span>Ja, Strategie Definitief Verwijderen</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StrategyBuilderTab;


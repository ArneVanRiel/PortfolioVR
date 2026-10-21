import React, { useState, useEffect, useCallback, useMemo } from 'react';
import http from '../../http-common';
import toast from 'react-hot-toast';
import { useIncognito } from '../../hooks/useIncognito';

const EtfStrategyAdvisor = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [monthlyBudgetInput, setMonthlyBudgetInput] = useState('450');
  const [initialPotInput, setInitialPotInput] = useState('0'); // Standaard 0 per 1 okt 2026
  const [startDateInput, setStartDateInput] = useState('2026-10-01'); // Standaard 1 oktober 2026
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showFormulaExplanation, setShowFormulaExplanation] = useState(false);
  const [selectedEtfFilter, setSelectedEtfFilter] = useState('ALL');
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview' | 'timeline'
  const [timelineSourceFilter, setTimelineSourceFilter] = useState('ALL'); // 'ALL' | 'ACTUAL' | 'ALGO'
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isIncognito = useIncognito();
  const uid = localStorage.getItem('userID') || 1;

  const fetchEtfData = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const budget = parseFloat(monthlyBudgetInput) || 450;
      const pot = parseFloat(initialPotInput) || 0;
      const start = startDateInput || '2026-10-01';

      const res = await http.get(
        `/portfolio/etf-strategy?userId=${uid}&monthlyBudget=${budget}&initialPot=${pot}&startDate=${start}${force ? '&forceRefresh=true' : ''}`
      );
      setData(res.data);
    } catch (err) {
      console.error('Fout bij ophalen ETF strategie:', err);
      toast.error('Kon ETF strategie data niet laden.');
    } finally {
      setLoading(false);
    }
  }, [uid, monthlyBudgetInput, initialPotInput, startDateInput]);

  useEffect(() => {
    fetchEtfData();
  }, [fetchEtfData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      toast.loading('Bezig met synchroniseren van koersen & ETF status...', { id: 'etf-refresh' });
      await http.post('/watchlist/update-data');
      await fetchEtfData(true);
      toast.success('ETF strategie data succesvol bijgewerkt!', { id: 'etf-refresh' });
    } catch (err) {
      console.error('Fout bij verversen:', err);
      toast.error('Verversen mislukt.', { id: 'etf-refresh' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatCurrency = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '€ 0,00';
    return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(val);
  };

  const etfs = data?.etfs || [];
  const summary = data?.summary || {};
  const cashAllocation = data?.cashAllocation || {};
  const timeline = data?.timeline || [];

  // Filter ETF's voor kaartenoverzicht
  const filteredEtfs = useMemo(() => {
    if (selectedEtfFilter === 'ALL') return etfs;
    return etfs.filter(e => e.ticker === selectedEtfFilter);
  }, [etfs, selectedEtfFilter]);

  // Filter tijdlijn items
  const filteredTimeline = useMemo(() => {
    let items = [...timeline];
    if (selectedEtfFilter !== 'ALL') {
      items = items.filter(t => t.ticker === selectedEtfFilter);
    }
    if (timelineSourceFilter === 'ACTUAL') {
      items = items.filter(t => t.source === 'ACTUAL_PORTFOLIO');
    } else if (timelineSourceFilter === 'ALGO') {
      items = items.filter(t => t.source === 'ALGORITHM');
    }
    return items;
  }, [timeline, selectedEtfFilter, timelineSourceFilter]);

  // Zoek actieve koopsignalen
  const buyAlertEtfs = useMemo(() => {
    return etfs.filter(e => e.isBuyCrossoverNow || (e.sharesToBuyNow > 0 && e.isMacdBullish));
  }, [etfs]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4 bg-white rounded-3xl border border-gray-100 shadow-sm min-h-[350px]">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-gray-800 font-bold text-base">ETF Strategie Berekenen...</div>
        <p className="text-gray-400 text-xs max-w-sm text-center">
          We analyseren de MACD crossovers (30/90/9), 5-jaar genormaliseerde potentiële allocatie en pot-aangroei voor VGWL, VUSA, VGWD en SPYM.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* 1. HERO BANNER: ETF DCA & TIMING STRATEGIE */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-slate-900 to-teal-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-emerald-800/40">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider border border-emerald-500/30 flex items-center gap-1.5">
                <i className="ph-fill ph-chart-line-up text-amber-300 text-sm"></i>
                Arne Buy & Hold DCA ETF Strategie
              </span>
              <span className="px-2.5 py-0.5 bg-white/10 text-slate-200 rounded-full text-xs font-medium border border-white/15">
                Inleg: € {summary.totalMonthlyBudget || 450} / mnd
              </span>
              <span className="px-2.5 py-0.5 bg-emerald-400/20 text-emerald-200 rounded-full text-xs font-medium border border-emerald-400/30">
                Aanwas: € {summary.totalDailyRate || 15} / dag
              </span>
              <span className="px-2.5 py-0.5 bg-teal-400/20 text-teal-200 rounded-full text-xs font-bold border border-teal-400/30">
                Start: 01-10-2026 (€0)
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              ETF Dollar Cost Averaging & Dip-Koop Strategie
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
              Puur accumuleren zonder verkoop (100% buy & hold). Dagelijks groeit de pot met <strong>€15/dag (€450/mnd)</strong>. Bij een <strong>MACD crossover (30/90/9)</strong> berekent het algoritme exact hoeveel hele stuks er gekocht moeten worden.
            </p>
          </div>

          {/* Knoppen & Instellingen */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full lg:w-auto bg-slate-800/90 backdrop-blur-md p-3.5 rounded-2xl border border-slate-700/60 shadow-inner">
            <div className="text-center sm:text-left pr-3 border-r border-slate-700/60">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Beschikbare Pot (Totaal)</div>
              <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300 privacy-blur">
                {isIncognito ? '€ ••••••' : formatCurrency(summary.totalPot || 0)}
              </div>
              <div className="text-[10px] text-slate-400">over alle 4 ETF's</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-xl shadow-md shadow-emerald-600/30 transition-all flex items-center gap-1.5 text-xs disabled:opacity-50"
                title="Koersen synchroniseren"
              >
                <i className={`ph-bold ph-arrows-clockwise text-base ${isRefreshing ? 'animate-spin' : ''}`}></i>
                <span>Verversen</span>
              </button>

              <button
                onClick={() => setShowSettingsModal(true)}
                className="px-3.5 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl border border-slate-600 transition-all flex items-center gap-1.5 text-xs"
                title="Budget en parameters aanpassen"
              >
                <i className="ph-fill ph-sliders text-base"></i>
                <span>Instellingen</span>
              </button>
            </div>
          </div>
        </div>

        {/* 4 Summary Mini-Statistieken */}
        <div className="mt-6 pt-5 border-t border-slate-800/90 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-800/50 p-3 rounded-2xl border border-slate-700/50">
            <span className="text-slate-400 text-[11px] block">Doelverdeling ETF's</span>
            <div className="text-sm font-extrabold text-white mt-0.5">
              VGWL 70% • VUSA 12% • VGWD 10% • SPYM 8%
            </div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-2xl border border-slate-700/50">
            <span className="text-slate-400 text-[11px] block">Maandelijkse Spaarallocatie</span>
            <div className="text-sm font-extrabold text-emerald-300 mt-0.5">
              € 450 naar ETF's <span className="text-[10px] text-slate-300 font-normal">(Restant → Losse aandelen)</span>
            </div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-2xl border border-slate-700/50">
            <span className="text-slate-400 text-[11px] block">Werkelijke Portefeuillewaarde</span>
            <div className="text-sm font-extrabold text-white mt-0.5 privacy-blur">
              {isIncognito ? '€ ••••••' : formatCurrency(summary.totalActualPortfolioValue || 0)}
            </div>
          </div>

          <div className={`p-3 rounded-2xl border ${
            summary.activeBuySignalsCount > 0 
              ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200' 
              : 'bg-slate-800/50 border-slate-700/50 text-slate-300'
          }`}>
            <span className="text-[11px] block opacity-80">Koopsignalen Status</span>
            <div className="text-sm font-black mt-0.5 flex items-center gap-1.5">
              {summary.activeBuySignalsCount > 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span className="text-emerald-300">🟢 {summary.activeBuySignalsCount} Koopadvies actief!</span>
                </>
              ) : (
                <span>⏳ Pot aan het opbouwen</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. CASH ALLOCATIE & RESERVERING WIDGET (ETF's vs Losse Aandelen) */}
      {cashAllocation && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-base font-black">
                <i className="ph-fill ph-wallet"></i>
              </span>
              <div>
                <h3 className="text-sm font-black text-gray-900 tracking-tight">
                  Cash Reservering ETF-Pot vs Losse Aandelen
                </h3>
                <p className="text-[11px] text-gray-500 font-medium">
                  {cashAllocation.explanation}
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
              €15,00 per dag pot-aanwas
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between">
              <div className="flex items-center justify-between text-gray-500 text-[11px] font-bold uppercase">
                <span>Totale Broker Cash</span>
                <i className="ph-bold ph-bank text-sm"></i>
              </div>
              <div className="text-xl font-black text-gray-900 mt-1 privacy-blur">
                {isIncognito ? '€ ••••••' : formatCurrency(cashAllocation.totalBrokerCash)}
              </div>
              <span className="text-[10px] text-gray-400 mt-0.5">Saldo op rekeningen</span>
            </div>

            <div className="p-3.5 bg-emerald-50/80 rounded-2xl border border-emerald-200 flex flex-col justify-between">
              <div className="flex items-center justify-between text-emerald-800 text-[11px] font-bold uppercase">
                <span>Gereserveerd voor ETF's</span>
                <span className="text-[10px] bg-emerald-200 px-1.5 py-0.5 rounded font-black text-emerald-900">
                  {cashAllocation.daysSinceEtfStart || 0} dagen actief
                </span>
              </div>
              <div className="text-xl font-black text-emerald-700 mt-1 privacy-blur">
                {isIncognito ? '€ ••••••' : formatCurrency(cashAllocation.etfReservedCash)}
              </div>
              <span className="text-[10px] text-emerald-800/80 mt-0.5">
                Start: 01-10-2026 (€0) • Aangegroeid: €{cashAllocation.theoreticalEtfPotAccrued}
              </span>
            </div>

            <div className="p-3.5 bg-indigo-50/80 rounded-2xl border border-indigo-200 flex flex-col justify-between">
              <div className="flex items-center justify-between text-indigo-900 text-[11px] font-bold uppercase">
                <span>Restant voor Losse Aandelen</span>
                <span className="text-[10px] bg-indigo-200 px-1.5 py-0.5 rounded font-black text-indigo-900">Vrij Kapitaal</span>
              </div>
              <div className="text-xl font-black text-indigo-700 mt-1 privacy-blur">
                {isIncognito ? '€ ••••••' : formatCurrency(cashAllocation.stocksAvailableCash)}
              </div>
              <span className="text-[10px] text-indigo-800/80 mt-0.5">
                Beschikbaar voor Super-Kwaliteit aandelen
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. ACTIEF KOOPSIGNAAL BANNER */}
      {buyAlertEtfs.length > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-400 shadow-md space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-lg font-black shadow-sm">
                <i className="ph-fill ph-bell-ringing"></i>
              </span>
              <div>
                <h3 className="text-sm font-black text-emerald-950 uppercase tracking-wide">
                  Actief Koopsignaal ({buyAlertEtfs.length} ETF{buyAlertEtfs.length > 1 ? "'s" : ''})
                </h3>
                <p className="text-xs text-emerald-800">
                  MACD Golden Cross gedetecteerd. Hieronder staat exact hoeveel hele stuks je kunt aanschaffen.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-emerald-600 text-white font-extrabold text-xs rounded-xl shadow-xs">
              Kooporder Klaarzetten
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {buyAlertEtfs.map(e => (
              <div key={e.ticker} className="bg-white p-3.5 rounded-2xl border border-emerald-300 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-base text-gray-900">{e.ticker}</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    {e.targetWeightPct}% Weging
                  </span>
                </div>
                <div className="text-xs">
                  <span className="text-gray-500 block text-[11px]">Advies:</span>
                  <strong className="text-emerald-700 text-sm font-black">
                    Koop {e.sharesToBuyNow} stuks
                  </strong>
                  <span className="text-gray-600 block text-[11px]">
                    aan {formatCurrency(e.currentPrice)} = <strong className="text-gray-900 font-bold">{formatCurrency(e.actualInvestNow)}</strong>
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 pt-1 border-t border-gray-100 flex justify-between">
                  <span>Pot: {formatCurrency(e.availablePot)}</span>
                  <span>Restant: {formatCurrency(e.remainingPotAfterBuy)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. SUB-TAB WEERGAVE: OVERZICHT VS TIJDLIJN & HISTORIE */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-2xl">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'overview'
                ? 'bg-white text-emerald-800 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ph-fill ph-squares-four text-base text-emerald-600"></i>
            Actueel ETF Overzicht ({etfs.length})
          </button>

          <button
            onClick={() => setActiveSubTab('timeline')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'timeline'
                ? 'bg-white text-emerald-800 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ph-fill ph-clock-counter-clockwise text-base text-teal-600"></i>
            Tijdlijn & Historie van Acties ({timeline.length})
          </button>
        </div>

        {/* ETF Filter Tabs & Uitleg */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-2xl text-xs font-bold text-gray-600">
            <button
              onClick={() => setSelectedEtfFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                selectedEtfFilter === 'ALL' ? 'bg-white text-emerald-800 shadow-xs' : 'hover:text-gray-900'
              }`}
            >
              Alle ETF's
            </button>
            {etfs.map(e => (
              <button
                key={e.ticker}
                onClick={() => setSelectedEtfFilter(e.ticker)}
                className={`px-2.5 py-1.5 rounded-xl transition-all ${
                  selectedEtfFilter === e.ticker ? 'bg-white text-emerald-800 shadow-xs' : 'hover:text-gray-900'
                }`}
              >
                {e.ticker}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowFormulaExplanation(!showFormulaExplanation)}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5"
          >
            <i className="ph-fill ph-info"></i>
            {showFormulaExplanation ? 'Verberg Uitleg' : 'Hoe werkt de timing?'}
          </button>
        </div>
      </div>

      {/* FORMULE UITLEG ACCORDION */}
      {showFormulaExplanation && (
        <div className="p-5 rounded-3xl bg-slate-50 border border-gray-200 text-xs text-gray-700 space-y-3 animate-fade-in shadow-2xs">
          <div className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
            <i className="ph-fill ph-book-open text-emerald-600 text-lg"></i>
            Wiskundige Logica van de DCA & Timing Strategie (100% Buy & Hold):
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 bg-white rounded-2xl border border-gray-200">
              <strong className="text-gray-900 block font-black mb-1">1. MACD Indicator (30 / 90 / 9)</strong>
              <p className="text-gray-600 text-[11px] leading-relaxed">
                Berekent het verschil tussen Fast EMA (30) en Slow EMA (90). De Signal-lijn is een 9-periode EMA. Een aankoopmoment ontstaat exact bij een opwaartse crossover (<code className="bg-gray-100 px-1 py-0.5 rounded text-indigo-700 font-bold">ta.crossover(macd, signal)</code>). Er wordt NOOIT verkocht; winstname is uitgeschakeld.
              </p>
            </div>
            <div className="p-3.5 bg-white rounded-2xl border border-gray-200">
              <strong className="text-gray-900 block font-black mb-1">2. 5-Jaar Rolling Normalisatie</strong>
              <p className="text-gray-600 text-[11px] leading-relaxed">
                Bij elke crossover wordt een ruwe koopfactor berekend: <code className="bg-gray-100 px-1 py-0.5 rounded text-indigo-700">1 + (-signal / close) * 4</code>. Deze factor wordt genormaliseerd tegen de hoogste factor van de afgelopen 5 jaar. Hoe dieper de dip, hoe groter het percentage van de pot dat wordt ingezet!
              </p>
            </div>
            <div className="p-3.5 bg-white rounded-2xl border border-gray-200">
              <strong className="text-gray-900 block font-black mb-1">3. Gehele Aandelen & Pot Aangroei</strong>
              <p className="text-gray-600 text-[11px] leading-relaxed">
                Elke dag groeit de pot aan (€10,50 voor VGWL, €1,80 voor VUSA, €1,50 voor VGWD, €1,20 voor SPYM). Bij een koopsignaal wordt het aantal hele stuks berekend (<code className="bg-gray-100 px-1 py-0.5 rounded text-indigo-700 font-bold">floor(investering / koers)</code>). Alleen het daadwerkelijk uitgegeven bedrag wordt van de pot afgetrokken; de rest blijft staan.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* WEERGAVE 1: ACTUEEL ETF OVERZICHT (DE 4 DETAIL KAARTEN) */}
      {activeSubTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredEtfs.map((etf) => {
            const isBuy = etf.isBuyCrossoverNow;
            const isBullish = etf.isMacdBullish;

            return (
              <div
                key={etf.ticker}
                className={`bg-white rounded-3xl p-6 border transition-all shadow-xs hover:shadow-md flex flex-col justify-between space-y-5 ${
                  isBuy
                    ? 'border-emerald-300 ring-2 ring-emerald-400/30 bg-gradient-to-b from-white to-emerald-50/20'
                    : 'border-gray-200'
                }`}
              >
                {/* Kaart Header */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">
                          {etf.ticker}
                        </h2>
                        <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-extrabold text-xs">
                          {etf.targetWeightPct}% Weging
                        </span>
                        <span className="text-[11px] text-gray-400 font-semibold">
                          {etf.isin}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 font-medium mt-0.5">
                        {etf.name}
                      </div>
                    </div>

                    {/* Koersbadge */}
                    <div className="text-right">
                      <div className="text-lg font-black text-gray-950">
                        {formatCurrency(etf.currentPrice)}
                      </div>
                      <span className={`text-[11px] font-bold inline-flex items-center gap-0.5 ${
                        etf.changePercent >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {etf.changePercent >= 0 ? '▲' : '▼'} {Math.abs(etf.changePercent)}%
                      </span>
                    </div>
                  </div>

                  {/* Status Indicator Pill */}
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-gray-200/80">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full shrink-0 ${
                        isBuy ? 'bg-emerald-500 animate-ping' :
                        isBullish ? 'bg-emerald-500' :
                        'bg-amber-400'
                      }`}></span>
                      <span className="text-xs font-extrabold text-gray-800">
                        {etf.statusBadge}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      Slotkoers: {new Date(etf.lastDate).toLocaleDateString('nl-BE')}
                    </span>
                  </div>
                </div>

                {/* Order Advies Box */}
                <div className={`p-4 rounded-2xl border space-y-2 text-xs ${
                  isBuy
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-slate-50 border-gray-200 text-slate-800'
                }`}>
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5 uppercase text-[10px] tracking-wider text-gray-500">
                      <i className="ph-fill ph-target text-sm text-emerald-600"></i>
                      Aankoopadvies
                    </span>
                    <span className="text-[11px] text-emerald-700 font-extrabold">
                      {etf.investmentPct}% van pot
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <span className="text-xs text-gray-600 block">Advies:</span>
                      <div className="text-base font-black text-gray-900">
                        {etf.sharesToBuyNow > 0 ? (
                          <>Koop <strong className="text-emerald-700">{etf.sharesToBuyNow} stuks</strong></>
                        ) : (
                          <span className="text-gray-500 font-semibold">0 stuks (Pot groeit aan)</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-gray-600 block">Te besteden:</span>
                      <div className="text-base font-black text-gray-900">
                        {formatCurrency(etf.actualInvestNow)}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-gray-500 pt-1 border-t border-gray-200/60 flex items-center justify-between">
                    <span>Beschikbare pot: <strong>{formatCurrency(etf.availablePot)}</strong></span>
                    <span>Restant na aankoop: <strong>{formatCurrency(etf.remainingPotAfterBuy)}</strong></span>
                  </div>
                </div>

                {/* Financiële & Technische Details */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* Pot & Aanwas */}
                  <div className="p-3 bg-slate-50/80 rounded-2xl border border-gray-200 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                      Pot & Aanwas
                    </span>
                    <div className="flex justify-between items-center text-gray-700">
                      <span>Dagelijkse aanwas:</span>
                      <strong className="text-emerald-700 font-extrabold">€ {etf.dailyRate} / dag</strong>
                    </div>
                    <div className="flex justify-between items-center text-gray-700">
                      <span>Maandelijks aandeel:</span>
                      <strong className="text-gray-900 font-bold">€ {etf.monthlyBudget} / mnd</strong>
                    </div>
                    <div className="flex justify-between items-center text-gray-700 pt-1 border-t border-gray-200/60">
                      <span>Beschikbare pot:</span>
                      <strong className="text-gray-950 font-black">{formatCurrency(etf.availablePot)}</strong>
                    </div>
                  </div>

                  {/* MACD Technische Status */}
                  <div className="p-3 bg-slate-50/80 rounded-2xl border border-gray-200 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                      MACD (30, 90, 9 EMA)
                    </span>
                    <div className="flex justify-between items-center text-gray-700">
                      <span>MACD / Signal:</span>
                      <strong className="font-bold text-gray-900">{etf.macd} / {etf.signal}</strong>
                    </div>
                    <div className="flex justify-between items-center text-gray-700">
                      <span>Histogram:</span>
                      <strong className={`font-black ${etf.hist >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {etf.hist >= 0 ? `+${etf.hist}` : etf.hist}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center text-gray-700 pt-1 border-t border-gray-200/60">
                      <span>Trend:</span>
                      <strong className={isBullish ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                        {isBullish ? 'Bullish (MACD > Sig)' : 'Bearish / Dip'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Werkelijke Portefeuille Status */}
                <div className="p-3 bg-white rounded-2xl border border-gray-200 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
                      <i className="ph-fill ph-wallet"></i>
                    </span>
                    <div>
                      <span className="text-gray-400 text-[10px] block">Werkelijk in je portefeuille:</span>
                      <strong className="text-gray-900 font-bold">
                        {etf.actualPortfolio.quantity} stuks
                      </strong>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-400 text-[10px] block">Positiewaarde:</span>
                    <strong className="text-gray-950 font-black privacy-blur">
                      {isIncognito ? '€ ••••••' : formatCurrency(etf.actualPortfolio.currentValue)}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* WEERGAVE 2: TIJDLIJN & HISTORIE VAN CONCRETE ACTIES (ALGORITMISCH VS WERKELIJK) */}
      {activeSubTab === 'timeline' && (
        <div className="space-y-4">
          {/* Filter Bar voor Tijdlijn */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-gray-200 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Toon acties:</span>
              <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setTimelineSourceFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    timelineSourceFilter === 'ALL' ? 'bg-white text-emerald-800 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Alles ({timeline.length})
                </button>
                <button
                  onClick={() => setTimelineSourceFilter('ACTUAL')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    timelineSourceFilter === 'ACTUAL' ? 'bg-white text-blue-800 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  👤 Werkelijk Gekocht ({summary.actualTradesCount || 0})
                </button>
                <button
                  onClick={() => setTimelineSourceFilter('ALGO')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    timelineSourceFilter === 'ALGO' ? 'bg-white text-emerald-800 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  🤖 Algoritmische Signalen ({summary.simulatedTradesCount || 0})
                </button>
              </div>
            </div>

            <div className="text-xs text-gray-500 font-medium">
              Startdatum live-tracking: <strong>01 oktober 2026</strong> (€0 startpot)
            </div>
          </div>

          {/* Tijdlijn Lijst */}
          {filteredTimeline.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-gray-200 space-y-2">
              <i className="ph-bold ph-calendar-blank text-3xl text-gray-400"></i>
              <div className="text-sm font-bold text-gray-700">Geen acties gevonden voor deze selectie</div>
              <p className="text-xs text-gray-400">
                Sinds {startDateInput} groeit de pot aan. Zodra een MACD crossover plaatsvindt of er een transactie wordt geïmporteerd, verschijnt deze hier.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTimeline.map((item, idx) => {
                const isActual = item.source === 'ACTUAL_PORTFOLIO';
                const isAlgo = item.source === 'ALGORITHM';
                const isDividend = item.type === 'DIVIDEND';

                return (
                  <div
                    key={item.id || idx}
                    className={`bg-white rounded-2xl p-4 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs hover:shadow-xs ${
                      isActual 
                        ? (isDividend ? 'border-amber-200/80 bg-amber-50/20' : 'border-blue-200 bg-blue-50/15')
                        : 'border-emerald-200 bg-emerald-50/15'
                    }`}
                  >
                    {/* Linkerzijde: Datum, Badge, Ticker */}
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-bold text-center shrink-0 ${
                        isActual
                          ? (isDividend ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900')
                          : 'bg-emerald-100 text-emerald-900'
                      }`}>
                        <span className="text-[9px] uppercase tracking-wider">{new Date(item.date).toLocaleDateString('nl-BE', { month: 'short' })}</span>
                        <span className="text-sm font-black leading-none">{new Date(item.date).getDate()}</span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-black text-gray-900">{item.ticker}</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            isActual
                              ? (isDividend ? 'bg-amber-100 text-amber-900 border-amber-200' : 'bg-blue-100 text-blue-900 border-blue-200')
                              : 'bg-emerald-100 text-emerald-900 border-emerald-200'
                          }`}>
                            {item.badge}
                          </span>
                          <span className="text-xs text-gray-500 font-medium truncate max-w-[180px]">
                            {item.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          Datum: <strong>{new Date(item.date).toLocaleDateString('nl-BE')}</strong>
                          {isAlgo && item.pct && (
                            <span className="ml-2 text-emerald-700 font-bold">
                              • Allocatie: {item.pct}% van beschikbare pot
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Rechterzijde: Aantal stuks, Koers, Bedrag */}
                    <div className="flex items-center justify-between sm:justify-end gap-6 text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                      <div>
                        <span className="text-[10px] text-gray-400 font-bold uppercase block">
                          {isDividend ? 'Uitkering' : 'Aantal Stuks'}
                        </span>
                        <div className="text-sm font-black text-gray-900">
                          {isDividend ? 'Dividend' : `${item.shares || item.quantity} stuks`}
                        </div>
                        {!isDividend && item.price > 0 && (
                          <span className="text-[10px] text-gray-500">
                            à {formatCurrency(item.price)}
                          </span>
                        )}
                      </div>

                      <div className="min-w-[100px]">
                        <span className="text-[10px] text-gray-400 font-bold uppercase block">
                          {isDividend ? 'Netto Ontvangen' : 'Totaal Bedrag'}
                        </span>
                        <div className={`text-base font-black privacy-blur ${
                          isDividend ? 'text-amber-800' : (isActual ? 'text-blue-900' : 'text-emerald-700')
                        }`}>
                          {isIncognito ? '€ ••••••' : formatCurrency(item.amount || item.totalAmount)}
                        </div>
                        {isAlgo && item.remainingPot !== undefined && (
                          <span className="text-[10px] text-gray-400">
                            Rest pot: {formatCurrency(item.remainingPot)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. STRATEGIE INSTELLINGEN MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-200 space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-extrabold text-base text-gray-900 flex items-center gap-2">
                <i className="ph-fill ph-sliders text-emerald-600 text-xl"></i>
                ETF Strategie Instellingen
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Maandelijks ETF Budget (€)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">€</span>
                  <input
                    type="number"
                    value={monthlyBudgetInput}
                    onChange={(e) => setMonthlyBudgetInput(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-xl font-bold text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="450"
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Wordt verdeeld als: VGWL (70% = €{(parseFloat(monthlyBudgetInput || 0) * 0.70).toFixed(2)}), VUSA (12% = €{(parseFloat(monthlyBudgetInput || 0) * 0.12).toFixed(2)}), VGWD (10% = €{(parseFloat(monthlyBudgetInput || 0) * 0.10).toFixed(2)}), SPYM (8% = €{(parseFloat(monthlyBudgetInput || 0) * 0.08).toFixed(2)}).
                </p>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Startbedrag Pot (€ per ETF)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">€</span>
                  <input
                    type="number"
                    value={initialPotInput}
                    onChange={(e) => setInitialPotInput(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-xl font-bold text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="0"
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Standaard ingesteld op €0 per 1 oktober 2026 conform jouw spaarplan.
                </p>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Startdatum Live DCA Tracking
                </label>
                <input
                  type="date"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-bold text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-gray-200 text-[11px] text-gray-600">
                <strong>Vaste TradingView Parameters:</strong>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  <li>Fast EMA: 30</li>
                  <li>Slow EMA: 90</li>
                  <li>Signal Smoothing: 9 EMA</li>
                  <li>5-jaar Rolling window voor dip-normalisatie</li>
                  <li>Geen verkoop / winstname (100% buy & hold)</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setMonthlyBudgetInput('450');
                  setInitialPotInput('0');
                  setStartDateInput('2026-10-01');
                }}
                className="px-3 py-2 text-gray-600 hover:text-gray-900 text-xs font-semibold"
              >
                Standaard (01-10-2026 / €0)
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  fetchEtfData(true);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-md"
              >
                Toepassen
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default EtfStrategyAdvisor;

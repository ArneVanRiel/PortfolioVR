import React, { useState, useEffect, useCallback, useMemo } from 'react';
import http from '../../http-common';
import toast from 'react-hot-toast';
import { useIncognito } from '../../hooks/useIncognito';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const StrategyAdvisorTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeViewMode, setActiveViewMode] = useState('alerts'); // 'alerts' | 'charts' | 'matrix'
  const [alertFilter, setAlertFilter] = useState('ALL'); // 'ALL' | 'BUY' | 'SELL' | 'ROTATION'
  const [matrixFilter, setMatrixFilter] = useState('ALL');
  const [showTimingRules, setShowTimingRules] = useState(false);

  const isIncognito = useIncognito();
  const uid = localStorage.getItem('userID') || 1;

  const fetchAdvisorData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get(`/portfolio/strategy-advisor?userId=${uid}&currency=EUR`);
      setData(res.data);
    } catch (err) {
      console.error('Fout bij ophalen Strategie Assistent data:', err);
      toast.error('Kon strategie-advies niet laden.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    fetchAdvisorData();
  }, [fetchAdvisorData]);

  // Handmatige update trigger
  const handleTriggerUpdate = async () => {
    setIsUpdating(true);
    try {
      toast.loading('Bezig met ophalen laatste beurskoersen & SEC kwartalen...', { id: 'sync-data' });
      await http.post('/watchlist/update-data');
      toast.success('Data & koersen succesvol bijgewerkt!', { id: 'sync-data' });
      await fetchAdvisorData();
    } catch (err) {
      console.error('Fout bij updaten data:', err);
      toast.error('Update mislukt of gedeeltelijk voltooid.', { id: 'sync-data' });
    } finally {
      setIsUpdating(false);
    }
  };

  const formatCurrency = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '€ 0,00';
    return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(val);
  };

  // Kleurenpalet voor Donut grafieken
  const PALETTE = [
    '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', 
    '#06b6d4', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
    '#a855f7', '#d946ef', '#0ea5e9', '#22c55e', '#eab308'
  ];

  // Donut Chart Data: Huidige Portefeuille
  const currentChartData = useMemo(() => {
    if (!data?.holdings) return null;
    const topHoldings = [...data.holdings].sort((a, b) => b.holdingValue - a.holdingValue);
    const mainItems = topHoldings.slice(0, 9);
    const otherItems = topHoldings.slice(9);
    const otherValue = otherItems.reduce((acc, h) => acc + h.holdingValue, 0);

    const labels = mainItems.map(h => `${h.ticker} (${h.weightPct.toFixed(1)}%)`);
    const values = mainItems.map(h => h.holdingValue);
    if (otherValue > 0) {
      const otherPct = data.totalPortfolioValue > 0 ? (otherValue / data.totalPortfolioValue) * 100 : 0;
      labels.push(`Overige (${otherPct.toFixed(1)}%)`);
      values.push(otherValue);
    }

    return {
      labels,
      datasets: [{
        data: values,
        backgroundColor: PALETTE.slice(0, labels.length),
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 6
      }]
    };
  }, [data]);

  // Donut Chart Data: Ideale Portefeuille (Gewogen naar Waardeverdeling!)
  const idealChartData = useMemo(() => {
    if (!data?.idealPortfolio) return null;
    const labels = data.idealPortfolio.map(i => `${i.ticker} (${i.targetWeightPct}%)`);
    const values = data.idealPortfolio.map(i => i.targetValueEur);

    return {
      labels,
      datasets: [{
        data: values,
        backgroundColor: PALETTE.slice(0, labels.length),
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 6
      }]
    };
  }, [data]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          boxWidth: 12,
          font: { size: 11, weight: '600' },
          color: '#374151',
          padding: 10
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const val = context.raw || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
            return ` ${formatCurrency(val)} (${pct}%)`;
          }
        }
      }
    },
    cutout: '62%'
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-12 border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-gray-700 font-semibold text-lg">Strategie Assistent Berekenen...</div>
        <p className="text-gray-400 text-sm max-w-md">
          We analyseren je huidige posities, berekenen de ideale portefeuille verdeling (gewogen naar Waardeverdeling) en synchroniseren de data-gedreven meldingen.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-red-200 text-center text-red-600">
        Geen data beschikbaar om te analyseren.
      </div>
    );
  }

  const {
    totalPortfolioValue,
    alignmentPercentage,
    actionSummary,
    dataDrivenAlerts = [],
    idealPortfolio = [],
    holdings = [],
    dataFreshness
  } = data;

  const filteredAlerts = dataDrivenAlerts.filter(a => {
    const matchesSearch = a.ticker.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          a.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (alertFilter === 'ALL') return true;
    if (alertFilter === 'BUY') return a.signalType === 'Koopsignaal';
    if (alertFilter === 'SELL') return a.signalType === 'Verkoopsignaal';
    if (alertFilter === 'ROTATION') return a.fundingSource?.status === 'ROTATION_REQUIRED';
    return true;
  });

  const filteredHoldings = holdings.filter(h => {
    const matchesSearch = h.ticker.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          h.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (matrixFilter === 'ALL') return true;
    if (matrixFilter === 'BUY_MORE') return h.actionType === 'BUY_MORE';
    if (matrixFilter === 'HOLD') return h.actionType === 'HOLD' || h.actionType === 'ETF_INDEX';
    if (matrixFilter === 'TAKE_PROFIT') return h.actionType === 'TAKE_PROFIT';
    if (matrixFilter === 'TRIM') return h.actionType.startsWith('TRIM');
    if (matrixFilter === 'ETF') return h.actionType === 'ETF_INDEX';
    return true;
  });

  const buyAlertsCount = dataDrivenAlerts.filter(a => a.signalType === 'Koopsignaal').length;
  const sellAlertsCount = dataDrivenAlerts.filter(a => a.signalType === 'Verkoopsignaal').length;
  const rotationNeededCount = dataDrivenAlerts.filter(a => a.fundingSource?.status === 'ROTATION_REQUIRED').length;

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* 1. HERO BANNER: Alignment Score & Actie Overzicht */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-indigo-900/40">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-bold uppercase tracking-wider border border-indigo-500/30 flex items-center gap-1.5">
                <i className="ph-fill ph-sparkle text-amber-400"></i>
                Data-Gedreven Strategie Assistent
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${dataFreshness.isUpdatedToday ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                {dataFreshness.isUpdatedToday ? '🟢 Data Actueel' : `⚠️ Laatste update: ${dataFreshness.lastUpdatedDate}`}
              </span>
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Data-Gedreven Beslissingen & Meldingen op Datum
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-2xl leading-relaxed">
              Beslissingen direct gebaseerd op <strong>MACD crossovers op exacte datums</strong>. Bij een koopsignaal met te weinig cash berekent het systeem direct de benodigde verkooporders om de transactie te financieren.
            </p>
          </div>

          {/* Quick Actions & Alignment Meter */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 w-full lg:w-auto bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700/60 shadow-inner">
            <div className="text-center sm:text-left pr-4 border-r border-slate-700/60">
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Huidige Alignment</div>
              <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                {alignmentPercentage.toFixed(1)}%
              </div>
              <div className="text-[11px] text-slate-400">van vermogen in lijn</div>
            </div>

            <button
              onClick={handleTriggerUpdate}
              disabled={isUpdating}
              className="flex-1 sm:flex-none px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 active:scale-95 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              <i className={`ph-bold ph-arrows-clockwise text-lg ${isUpdating ? 'animate-spin' : ''}`}></i>
              {isUpdating ? 'Bezig...' : 'Data Verversen'}
            </button>
          </div>
        </div>

        {/* Status Breakdown Bar */}
        <div className="mt-8 pt-6 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/40">
            <div className="text-xs text-slate-400 font-medium">Totale Portefeuille</div>
            <div className="text-lg font-bold text-white mt-1 privacy-blur">
              {isIncognito ? '€ ••••••' : formatCurrency(totalPortfolioValue)}
            </div>
          </div>
          <div className="bg-emerald-950/30 p-3.5 rounded-xl border border-emerald-800/40">
            <div className="text-xs text-emerald-400 font-medium">🟢 MACD Koopsignalen</div>
            <div className="text-lg font-bold text-emerald-300 mt-1">
              {buyAlertsCount} meldingen
            </div>
          </div>
          <div className="bg-rose-950/30 p-3.5 rounded-xl border border-rose-800/40">
            <div className="text-xs text-rose-400 font-medium">🔴 Verkoopsignalen</div>
            <div className="text-lg font-bold text-rose-300 mt-1">
              {sellAlertsCount} meldingen
            </div>
          </div>
          <div className="bg-amber-950/30 p-3.5 rounded-xl border border-amber-800/40">
            <div className="text-xs text-amber-400 font-medium">⚠️ Verkooprotatie Nodig</div>
            <div className="text-lg font-bold text-amber-300 mt-1">
              {rotationNeededCount} orders
            </div>
          </div>
        </div>
      </div>

      {/* 2. SUB-NAVIGATIE TUSSEN WEERGAVEN */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-2xl">
          <button
            onClick={() => setActiveViewMode('alerts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeViewMode === 'alerts'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ph-fill ph-bell-ringing text-indigo-600 text-base"></i>
            Data-Meldingen op Datum ({dataDrivenAlerts.length})
          </button>
          <button
            onClick={() => setActiveViewMode('charts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeViewMode === 'charts'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ph-fill ph-chart-pie text-blue-600 text-base"></i>
            Huidig vs Ideaal Portfolio (Donut)
          </button>
          <button
            onClick={() => setActiveViewMode('matrix')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeViewMode === 'matrix'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ph-fill ph-table text-emerald-600 text-base"></i>
            Volledige Positie-Matrix ({holdings.length})
          </button>
        </div>

        <button
          onClick={() => setShowTimingRules(!showTimingRules)}
          className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200/80 transition-all flex items-center gap-1.5"
        >
          <i className="ph-fill ph-info text-indigo-600"></i>
          {showTimingRules ? 'Verberg Timing-Regels' : '📖 Data-Regels: MACD Crossover / Cash Rotatie'}
        </button>
      </div>

      {/* 3. COLLAPSIBLE TIMING & REGELS HANDLEIDING */}
      {showTimingRules && (
        <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-purple-50/80 rounded-2xl p-6 border border-indigo-200/80 space-y-4 animate-fade-in shadow-xs">
          <div className="flex items-center gap-2 text-indigo-900 font-extrabold text-sm">
            <i className="ph-fill ph-book-open-text text-xl text-indigo-600"></i>
            Data-Gedreven Beslissingsregels: Hoe werkt het systeem?
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-700">
            <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-2xs space-y-2">
              <div className="font-bold text-blue-900 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                <i className="ph-fill ph-chart-line-up text-blue-600 text-base"></i>
                1. MACD Koopsignaal op Vaste Datum
              </div>
              <p className="leading-relaxed">
                Op de exacte beursdag dat de <strong>MACD-lijn de signaallijn opwaarts kruist</strong> (onder de nullijn) en de score $\ge 4$ is, genereert het systeem een <strong>Koopmelding</strong> met het exacte aantal stuks en bedrag volgens de Waardeverdeling.
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-2xs space-y-2">
              <div className="font-bold text-amber-900 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                <i className="ph-fill ph-arrows-left-right text-amber-600 text-base"></i>
                2. Automatische Verkoop bij Te Weinig Cash
              </div>
              <p className="leading-relaxed">
                Is er op de signaaldatum <strong>onvoldoende vrije cash</strong>? Dan berekent het systeem direct op die datum welke overgewaardeerde of verzwakte posities verkocht moeten worden om de transactie te financieren.
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs space-y-2">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                <i className="ph-fill ph-file-text text-emerald-600 text-base"></i>
                3. Kwartaal & Trendbreuk Verkoopsignalen
              </div>
              <p className="leading-relaxed">
                Zodra een positie <strong>onder de 200 SMA zakt</strong> of na nieuwe SEC kwartaalcijfers fundamenteel verslechtert, verschijnt direct een gedateerd verkoopsignaal om kapitaal te beschermen.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4. WEERGAVE 1: DATA-GEDREVEN MELDINGEN FEED (BESLISSINGEN OP DATUM) */}
      {activeViewMode === 'alerts' && (
        <div className="space-y-6">
          
          {/* Filter & Zoekbalk */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setAlertFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${alertFilter === 'ALL' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Alle Signalen ({dataDrivenAlerts.length})
              </button>
              <button
                onClick={() => setAlertFilter('BUY')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${alertFilter === 'BUY' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
              >
                🟢 Koopsignalen ({buyAlertsCount})
              </button>
              <button
                onClick={() => setAlertFilter('SELL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${alertFilter === 'SELL' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
              >
                🔴 Verkoopsignalen ({sellAlertsCount})
              </button>
              <button
                onClick={() => setAlertFilter('ROTATION')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${alertFilter === 'ROTATION' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
              >
                ⚠️ Met Verkoopkoppeling ({rotationNeededCount})
              </button>
            </div>

            <div className="w-full sm:w-64 relative">
              <i className="ph-bold ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Zoek op ticker..."
                className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
              />
            </div>
          </div>

          {/* Meldingen Lijst */}
          {filteredAlerts.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-200 text-gray-500 space-y-2">
              <i className="ph-fill ph-bell-slash text-4xl text-gray-300"></i>
              <div className="font-bold text-base text-gray-700">Geen meldingen gevonden</div>
              <p className="text-xs text-gray-400">Er zijn momenteel geen signalen die voldoen aan de geselecteerde filters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAlerts.map((alert) => {
                const isBuy = alert.signalType === 'Koopsignaal';
                const hasLinkedSales = alert.linkedSales && alert.linkedSales.length > 0;

                return (
                  <div
                    key={alert.alertId}
                    className={`bg-white rounded-3xl p-5 sm:p-6 border transition-all shadow-xs hover:shadow-md ${
                      isBuy ? 'border-emerald-200/90 hover:border-emerald-300' : 'border-rose-200/90 hover:border-rose-300'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                      
                      {/* Linkerkant: Datum, Ticker & Type */}
                      <div className="flex items-start sm:items-center gap-3">
                        <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-bold text-center shrink-0 ${
                          isBuy ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          <span className="text-[10px] uppercase">{new Date(alert.date).toLocaleDateString('nl-BE', { month: 'short' })}</span>
                          <span className="text-base font-black leading-none">{new Date(alert.date).getDate()}</span>
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-black text-gray-900">{alert.ticker}</span>
                            <span className="text-xs text-gray-500 font-medium truncate max-w-[200px]">{alert.name}</span>
                            {alert.fundamentalScore && (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-black text-[11px]">
                                ★ {alert.fundamentalScore}/5
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                              isBuy ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {alert.badge}
                            </span>
                            <span className="text-xs text-gray-400">
                              Signaaldatum: <strong>{alert.date}</strong> • Koers op signaal: <strong>{formatCurrency(alert.priceAtAlert)}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Rechterkant: Transactie Bedrag & Aantal stuks */}
                      <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200/80 flex items-center justify-between sm:justify-end gap-6 text-right">
                        <div>
                          <div className="text-[10px] text-gray-400 font-bold uppercase">Transactie</div>
                          <div className={`text-sm font-black ${isBuy ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {isBuy ? `KOOP ${alert.shares} stuks` : `VERKOOP ${alert.shares} stuks`}
                          </div>
                        </div>
                        <div className="border-l border-gray-200 pl-4">
                          <div className="text-[10px] text-gray-400 font-bold uppercase">Totaal Bedrag</div>
                          <div className="text-lg font-black text-gray-900 privacy-blur">
                            {isIncognito ? '€ ••••••' : formatCurrency(alert.amountEur)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Financiering & Rotatie Logica */}
                    {isBuy && alert.fundingSource && (
                      <div className="mt-4 pt-3">
                        {alert.fundingSource.status === 'DIRECT_CASH' ? (
                          <div className="bg-emerald-50/80 text-emerald-900 p-3.5 rounded-2xl border border-emerald-200 text-xs flex items-center gap-2">
                            <i className="ph-fill ph-check-circle text-emerald-600 text-base"></i>
                            <span className="font-semibold">{alert.fundingSource.message}</span>
                          </div>
                        ) : (
                          <div className="bg-amber-50/80 rounded-2xl p-4 border border-amber-200/80 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                              <i className="ph-fill ph-warning text-amber-600 text-base"></i>
                              <span>{alert.fundingSource.message}</span>
                            </div>

                            {hasLinkedSales && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                {alert.linkedSales.map((sale) => (
                                  <div key={sale.ticker} className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs flex items-center justify-between text-xs">
                                    <div>
                                      <div className="font-black text-gray-900 flex items-center gap-1.5">
                                        <span className="text-rose-600">VERKOOP</span> {sale.ticker} ({sale.name})
                                      </div>
                                      <div className="text-[11px] text-gray-500">{sale.reason}</div>
                                    </div>
                                    <div className="text-right">
                                      <div className="font-extrabold text-amber-900">{sale.sharesToSell} stuks</div>
                                      <div className="font-bold text-xs text-gray-700 privacy-blur">
                                        {isIncognito ? '€ ••••••' : formatCurrency(sale.amountToSellEur)}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. WEERGAVE 2: DONUT GRAFIEKEN (HUIDIGE VS IDEALE PORTEFEUILLE) */}
      {activeViewMode === 'charts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Linker Donut: Huidig Portfolio */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-sm space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <i className="ph-fill ph-wallet text-blue-600"></i>
                      Huidige Portefeuille Verdeling
                    </h3>
                    <p className="text-xs text-gray-500">Actuele spreiding over {holdings.length} posities</p>
                  </div>
                  <span className="text-xs font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-full privacy-blur">
                    {isIncognito ? '€ ••••••' : formatCurrency(totalPortfolioValue)}
                  </span>
                </div>

                <div className="h-72 mt-4 relative">
                  {currentChartData && <Doughnut data={currentChartData} options={chartOptions} />}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-xs text-gray-600 flex items-center justify-between">
                <span>Alignment met Super-Kwaliteit:</span>
                <span className="font-extrabold text-indigo-700">{alignmentPercentage.toFixed(1)}%</span>
              </div>
            </div>

            {/* Rechter Donut: Ideaal Portfolio */}
            <div className="bg-gradient-to-br from-indigo-50/50 via-white to-emerald-50/50 rounded-3xl p-6 border border-indigo-200 shadow-sm space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-indigo-100">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <i className="ph-fill ph-sparkle text-amber-500"></i>
                      Ideale Portefeuille (Gewogen naar Waardeverdeling)
                    </h3>
                    <p className="text-xs text-gray-500">Top 10 Super-Kwaliteit aandelen proportioneel verdeeld</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                    100% Super-Kwaliteit
                  </span>
                </div>

                <div className="h-72 mt-4 relative">
                  {idealChartData && <Doughnut data={idealChartData} options={chartOptions} />}
                </div>
              </div>

              <div className="p-3 bg-emerald-50/80 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
                <span>Verwachte Alpha Historisch:</span>
                <span className="font-extrabold text-emerald-700">+369% Outperformance</span>
              </div>
            </div>

          </div>

          {/* Ideale Portefeuille Doeltabel met Streefbedragen en Aantal Stuks */}
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Doelverdeling & Streefbedragen per Aandeel (Conform Waardeverdeling)
                </h3>
                <p className="text-xs text-gray-500">
                  Exacte allocatie per positie op basis van relatief Waardeverdelings-gewicht.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4">Aandeel</th>
                    <th className="py-3 px-3 text-center">Score / WV</th>
                    <th className="py-3 px-3 text-right">Huidige Koers</th>
                    <th className="py-3 px-3 text-right">Intrinsieke Waarde</th>
                    <th className="py-3 px-3 text-center">Doelgewicht %</th>
                    <th className="py-3 px-3 text-right">Doelbedrag (€)</th>
                    <th className="py-3 px-3 text-right">Doel Stuks</th>
                    <th className="py-3 px-3 text-right">Huidig Bezit</th>
                    <th className="py-3 px-4 text-center">Actie Verschil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {idealPortfolio.map((item) => (
                    <tr key={item.stockId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-bold text-gray-900">
                        {item.ticker} <span className="text-gray-400 font-normal text-[11px] block">{item.name}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-black text-xs">
                          ⭐ {item.score}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-gray-900">
                        {formatCurrency(item.currentPrice)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-700">
                        {formatCurrency(item.intrinsicValue)}
                      </td>
                      <td className="py-3 px-3 text-center font-extrabold text-indigo-700">
                        {item.targetWeightPct}%
                      </td>
                      <td className="py-3 px-3 text-right font-extrabold text-gray-900 privacy-blur">
                        {isIncognito ? '€ ••••••' : formatCurrency(item.targetValueEur)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-gray-800">
                        {item.targetShares} stuks
                      </td>
                      <td className="py-3 px-3 text-right text-gray-600 privacy-blur">
                        {item.currentShares > 0 ? `${item.currentShares} stuks (${item.currentWeightPct}%)` : '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.diffValueEur > 50 ? (
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-xs">
                            + Koop {item.diffShares} stuks ({formatCurrency(item.diffValueEur)})
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full font-bold text-xs">
                            Op doelniveau
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. WEERGAVE 3: VOLLEDIGE POSITIES MATRIX */}
      {activeViewMode === 'matrix' && (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
          {/* Header & Filters */}
          <div className="p-6 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <i className="ph-fill ph-table text-indigo-600 text-xl"></i>
                Matrix: Huidige Posities & Strategie Beoordeling
              </h3>
              <p className="text-xs text-gray-500">
                Live status van al je posities met concrete exit-, winstneming- of bijkopingsadviezen.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Zoek aandeel..."
                  className="pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Filter Buttons */}
              <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl">
                {[
                  { id: 'ALL', label: `Alles (${holdings.length})` },
                  { id: 'BUY_MORE', label: `🟢 Kopen (${actionSummary.buyMoreCount})` },
                  { id: 'HOLD', label: `🟡 Houden (${actionSummary.holdCount})` },
                  { id: 'TAKE_PROFIT', label: `💰 Winst (${actionSummary.takeProfitCount})` },
                  { id: 'TRIM', label: `🔴 Afbouwen (${actionSummary.trimCount})` },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setMatrixFilter(tab.id)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                      matrixFilter === tab.id
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Aandeel</th>
                  <th className="py-3 px-3 text-right">Positie & Waarde</th>
                  <th className="py-3 px-3 text-right">Gewicht</th>
                  <th className="py-3 px-3 text-right">Huidige Koers</th>
                  <th className="py-3 px-3 text-right">Intrinsieke Waarde</th>
                  <th className="py-3 px-3 text-center">Waardering (x)</th>
                  <th className="py-3 px-3 text-center">200 SMA</th>
                  <th className="py-3 px-3 text-center">Score</th>
                  <th className="py-3 px-4 text-center">Strategie Signaal</th>
                  <th className="py-3 px-4">Toelichting & Actie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredHoldings.map((h) => (
                  <tr
                    key={h.stockId}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Ticker & Name */}
                    <td className="py-3.5 px-4 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center font-black text-indigo-700 text-xs">
                          {h.ticker.slice(0, 3)}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 flex items-center gap-1.5">
                            {h.ticker}
                            {h.assetType === 'ETF' && (
                              <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded text-[10px] font-bold">ETF</span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-400 truncate max-w-[130px]" title={h.name}>
                            {h.name}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Positie & Waarde */}
                    <td className="py-3.5 px-3 text-right">
                      <div className="font-bold text-gray-900 privacy-blur">
                        {isIncognito ? '€ ••••••' : formatCurrency(h.holdingValue)}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {h.quantity.toFixed(2)} stuks
                      </div>
                    </td>

                    {/* Gewicht */}
                    <td className="py-3.5 px-3 text-right font-bold text-gray-700">
                      {h.weightPct.toFixed(1)}%
                    </td>

                    {/* Koers */}
                    <td className="py-3.5 px-3 text-right font-bold text-gray-900">
                      {formatCurrency(h.currentPrice)}
                    </td>

                    {/* Intrinsiek */}
                    <td className="py-3.5 px-3 text-right">
                      {h.intrinsicValue ? (
                        <span className="font-bold text-emerald-700">
                          {formatCurrency(h.intrinsicValue)}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">n.v.t.</span>
                      )}
                    </td>

                    {/* Waardering x */}
                    <td className="py-3.5 px-3 text-center">
                      {h.priceToIntrinsicRatio ? (
                        <span className={`px-2 py-0.5 rounded-full font-bold text-xs ${
                          h.priceToIntrinsicRatio <= 1.0
                            ? 'bg-emerald-100 text-emerald-800'
                            : h.priceToIntrinsicRatio <= 1.3
                            ? 'bg-teal-100 text-teal-800'
                            : h.priceToIntrinsicRatio >= 2.0
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {h.priceToIntrinsicRatio.toFixed(2)}x
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* 200 SMA */}
                    <td className="py-3.5 px-3 text-center">
                      {h.sma200 ? (
                        <span className={`font-bold flex items-center justify-center gap-1 ${
                          h.isAbove200Sma ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          <i className={`ph-bold ${h.isAbove200Sma ? 'ph-arrow-up-right' : 'ph-arrow-down-right'}`}></i>
                          {h.isAbove200Sma ? 'Boven' : 'Onder'}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* Score */}
                    <td className="py-3.5 px-3 text-center">
                      {h.assetType === 'ETF' ? (
                        <span className="text-gray-400">ETF</span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded font-black text-xs ${
                          h.score === 5 ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {h.score}/5
                        </span>
                      )}
                    </td>

                    {/* Signaal Badge */}
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full font-bold text-xs whitespace-nowrap ${
                        h.actionSeverity === 'success'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : h.actionSeverity === 'warning'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : h.actionSeverity === 'danger'
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : h.actionSeverity === 'info'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {h.actionLabel}
                      </span>
                    </td>

                    {/* Toelichting */}
                    <td className="py-3.5 px-4 text-gray-600 max-w-[220px] text-[11px] leading-snug">
                      {h.actionReason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

export default StrategyAdvisorTab;

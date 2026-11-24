// c:\Arne\ArneVR\PortfolioVR\frontend\src\features\analysis\AnalysisChartTab.js
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import http from '../../http-common';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';

// Registreer de ChartJS componenten
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  zoomPlugin
);

const AnalysisChartTab = ({ selectedStock, useSharedData = false, sharedCalculations = null, sharedAlerts = null }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rawSeries, setRawSeries] = useState(null);
  const [chartDates, setChartDates] = useState([]);
  const [activeRange, setActiveRange] = useState('1Y');
  const [showSma200, setShowSma200] = useState(true);
  const [showAthLine, setShowAthLine] = useState(true);
  const [showMacdPanel, setShowMacdPanel] = useState(false);
  const [showAdminStrategyOverlay, setShowAdminStrategyOverlay] = useState(false);
  const chartRef = useRef(null);

  const isAdmin = useMemo(() => {
    const uid = Number(localStorage.getItem('userID') || 0);
    const role = localStorage.getItem('role') || 'user';
    const previewRole = localStorage.getItem('admin_preview_role');
    return (uid === 1 || role === 'admin') && !previewRole;
  }, []);

  const canViewFormulas = isAdmin;

  const fetchAnalysisChartData = useCallback(async () => {
    if (!selectedStock) return;
    if (useSharedData && (!sharedCalculations || !sharedAlerts)) {
        setLoading(true);
        return;
    }
    setLoading(true);
    setError('');
    try {
        const [priceRes, macdRes, alertsRes, calcsRes] = await Promise.all([
            http.get(`/calculations/${selectedStock.stock_id}/price-history`),
            http.get(`/calculations/${selectedStock.stock_id}/macd-history`),
            useSharedData ? Promise.resolve({ data: sharedAlerts }) : http.get(`/calculations/${selectedStock.stock_id}/macd-alerts`),
            useSharedData ? Promise.resolve({ data: sharedCalculations }) : http.get(`/calculations/${selectedStock.stock_id}`),
        ]);

        const prices = priceRes.data;
        const alerts = alertsRes.data;
        const calcs = calcsRes.data;
        const macdHistory = macdRes.data;

        // Vroegste prijsdatum bepalen (koershistorie gaat 10 jaar terug)
        const minPriceDate = (prices && prices.length > 0)
            ? new Date(prices[0].date).toISOString().split('T')[0]
            : null;

        // Filter calcs, macdHistory en alerts zodat we NOOIT data tonen vóór het begin van de koersgrafiek (-10 jaar).
        // Dit lost het vertekende beeld op van berekeningen vóór 2016 waar onvoldoende kwartalen voorhanden waren.
        const relevantCalcs = minPriceDate ? calcs.filter(c => new Date(c.period_end_date).toISOString().split('T')[0] >= minPriceDate) : calcs;
        const relevantAlerts = minPriceDate ? alerts.filter(a => new Date(a.date).toISOString().split('T')[0] >= minPriceDate) : alerts;
        const relevantMacd = minPriceDate ? macdHistory.filter(m => new Date(m.date).toISOString().split('T')[0] >= minPriceDate) : macdHistory;

        const allDates = new Set();
        prices.forEach(p => allDates.add(new Date(p.date).toISOString().split('T')[0]));
        relevantCalcs.forEach(c => allDates.add(new Date(c.period_end_date).toISOString().split('T')[0]));
        relevantMacd.forEach(m => allDates.add(new Date(m.date).toISOString().split('T')[0]));
        relevantAlerts.forEach(a => allDates.add(new Date(a.date).toISOString().split('T')[0]));

        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));
        setChartDates(sortedDates);
        setActiveRange('All');
        
        const priceMap = new Map(prices.map(p => [new Date(p.date).toISOString().split('T')[0], p.closing_price]));
        const macdMap = new Map(relevantMacd.map(m => [new Date(m.date).toISOString().split('T')[0], m]));
        const calcMap = new Map(relevantCalcs.map(c => [new Date(c.period_end_date).toISOString().split('T')[0], c.waarde_verdeling]));
        
        // Hulpfunctie om de dichtstbijzijnde koers te vinden als de exacte datum (bv. kwartaalweekend) geen beurskoers heeft
        const getPriceForDate = (targetDateStr) => {
            if (priceMap.has(targetDateStr)) return priceMap.get(targetDateStr);
            const targetTime = new Date(targetDateStr).getTime();
            let closestPrice = null;
            let minDiff = Infinity;
            for (let i = 0; i < prices.length; i++) {
                const diff = Math.abs(new Date(prices[i].date).getTime() - targetTime);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestPrice = prices[i].closing_price;
                }
            }
            return closestPrice;
        };

        const alertsMap = new Map();
        
        // 1. Voeg MACD alerts toe (Koopsignalen onder 0-lijn)
        alerts.forEach(a => {
            if (a.type_melding === 'Verkoopsignaal' && a.signal_line_value != null) return;
            const d = new Date(a.date).toISOString().split('T')[0];
            if (!alertsMap.has(d)) alertsMap.set(d, []);
            alertsMap.get(d).push(a);
        });

        // 2. Fundamentele Verkoopsignalen (Score < 5 of Daling Waardeverdeling)
        const sortedCalcs = [...calcs].sort((a, b) => new Date(a.period_end_date) - new Date(b.period_end_date));
        for (let i = 0; i < sortedCalcs.length; i++) {
            const c = sortedCalcs[i];
            const prevC = i > 0 ? sortedCalcs[i - 1] : null;
            const d = new Date(c.period_end_date).toISOString().split('T')[0];

            const score = Number(c.selectiecriteria);
            const prevScore = prevC ? Number(prevC.selectiecriteria) : null;
            const wv = c.waarde_verdeling != null ? Number(c.waarde_verdeling) : null;
            const prevWv = (prevC && prevC.waarde_verdeling != null) ? Number(prevC.waarde_verdeling) : null;

            const isScoreDrop = (score < 5 && score > 0) || (prevScore === 5 && score < 5);
            const isWvDrop = c.is_wv_dropping === true || (prevWv != null && wv != null && wv < prevWv && (prevWv - wv) >= 0.05);

            if (isScoreDrop || isWvDrop) {
                if (!alertsMap.has(d)) alertsMap.set(d, []);
                const calcPrice = getPriceForDate(d);
                alertsMap.get(d).push({
                    type_melding: 'Verkoopsignaal',
                    isMandatorySell: true,
                    reason: isScoreDrop 
                        ? `Verplichte verkoop (Score ${score}/5)`
                        : (canViewFormulas && prevWv != null && wv != null
                            ? `Verplichte deelverkoop (WV daling ${prevWv?.toFixed(1)}% ➔ ${wv?.toFixed(1)}%)`
                            : `Verplichte deelverkoop (Dalende strategie-weging)`),
                    prijs_op_moment: calcPrice
                });
            }
        }

        const priceData = [];
        const sma200Data = [];
        const athLineData = [];
        const waardeverdelingData = [];
        const signalLineData = [];
        const macdLineData = [];
        const buySignalData = [];
        const sellSignalData = [];
        const zeroLineData = [];

        let maxHistoricalPrice = 0;
        prices.forEach(p => {
            const val = Number(p.closing_price || 0);
            if (val > maxHistoricalPrice) maxHistoricalPrice = val;
        });

        const rollingPrices = [];
        sortedDates.forEach(date => {
            const pVal = priceMap.get(date) || null;
            priceData.push(pVal);
            if (pVal !== null) rollingPrices.push(pVal);
            if (rollingPrices.length >= 200) {
                const slice200 = rollingPrices.slice(-200);
                sma200Data.push(+(slice200.reduce((a, b) => a + b, 0) / 200).toFixed(2));
            } else {
                sma200Data.push(null);
            }
            athLineData.push(maxHistoricalPrice > 0 ? maxHistoricalPrice : null);
            waardeverdelingData.push(calcMap.get(date) || null);

            const m = macdMap.get(date);
            if (m) {
                signalLineData.push(m.signalLine);
                macdLineData.push(m.macdLine);
            } else {
                signalLineData.push(null);
                macdLineData.push(null);
            }
            zeroLineData.push(0);

            const daysAlerts = alertsMap.get(date);
            let buyVal = null;
            let sellVal = null;
            if (daysAlerts) {
                daysAlerts.forEach(a => {
                    if (a.type_melding === 'Koopsignaal' && (a.score_on_date == null || a.score_on_date === 5)) {
                        buyVal = a.prijs_op_moment || getPriceForDate(date);
                    } else if (a.type_melding === 'Verkoopsignaal') {
                        sellVal = a.prijs_op_moment || getPriceForDate(date);
                    }
                });
            }
            buySignalData.push(buyVal);
            sellSignalData.push(sellVal);
        });

        setRawSeries({
            sortedDates,
            priceData,
            sma200Data,
            athLineData,
            maxHistoricalPrice,
            waardeverdelingData,
            signalLineData,
            macdLineData,
            buySignalData,
            sellSignalData,
            zeroLineData
        });

    } catch (err) {
        console.error("Error fetching analysis chart data", err);
        setError("Kon grafiek data niet laden.");
    } finally {
        setLoading(false);
    }
  }, [selectedStock, useSharedData, sharedCalculations, sharedAlerts, canViewFormulas]);

  useEffect(() => {
    if (selectedStock) {
        fetchAnalysisChartData();
    }
  }, [selectedStock, fetchAnalysisChartData]);

  // Bouw Chart.js data dynamisch op basis van de toggles en gebruikersrol
  const analysisChartData = useMemo(() => {
    if (!rawSeries || !rawSeries.sortedDates || rawSeries.sortedDates.length === 0) return null;

    const datasets = [
      {
        label: 'Koers (€)',
        data: rawSeries.priceData,
        borderColor: 'rgb(37, 99, 235)',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        borderWidth: 2,
        yAxisID: 'y',
        spanGaps: true,
        pointRadius: 0,
      }
    ];

    if (showSma200) {
      datasets.push({
        label: '200-Daags Gemiddelde (SMA 200)',
        data: rawSeries.sma200Data,
        borderColor: 'rgb(245, 158, 11)',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderDash: [5, 4],
        borderWidth: 1.5,
        yAxisID: 'y',
        spanGaps: true,
        pointRadius: 0,
      });
    }

    if (showAthLine && rawSeries.maxHistoricalPrice > 0) {
      datasets.push({
        label: `Hoogste Prijs Ooit (€${rawSeries.maxHistoricalPrice.toFixed(2)})`,
        data: rawSeries.athLineData,
        borderColor: 'rgba(16, 185, 129, 0.65)',
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
        borderDash: [3, 3],
        borderWidth: 1.5,
        yAxisID: 'y',
        spanGaps: true,
        pointRadius: 0,
      });
    }

    if (showMacdPanel) {
      datasets.push(
        {
          label: 'MACD Lijn',
          data: rawSeries.macdLineData,
          borderColor: 'rgb(99, 102, 241)',
          backgroundColor: 'rgba(99, 102, 241, 0.2)',
          borderWidth: 1.5,
          yAxisID: 'y_macd',
          spanGaps: true,
          pointRadius: 0,
        },
        {
          label: 'Signaallijn (9d)',
          data: rawSeries.signalLineData,
          borderColor: 'rgb(249, 115, 22)',
          backgroundColor: 'rgba(249, 115, 22, 0.2)',
          borderWidth: 1.5,
          yAxisID: 'y_macd',
          spanGaps: true,
          pointRadius: 0,
        },
        {
          label: 'MACD 0-Lijn',
          data: rawSeries.zeroLineData,
          borderColor: 'rgba(107, 114, 128, 0.5)',
          borderDash: [4, 4],
          borderWidth: 1,
          yAxisID: 'y_macd',
          pointRadius: 0,
          fill: false,
        }
      );
    }

    // Alleen voor Beheerder (Arne) wanneer de Strategie Overlay aan staat:
    if (isAdmin && showAdminStrategyOverlay) {
      datasets.push(
        {
          label: 'Waardeverdeling (Strategie %)',
          data: rawSeries.waardeverdelingData,
          borderColor: 'rgb(220, 38, 38)',
          backgroundColor: 'rgba(220, 38, 38, 0.15)',
          yAxisID: 'y1',
          spanGaps: true,
          stepped: true,
          pointRadius: 2,
        },
        {
          label: 'Koopsignaal',
          data: rawSeries.buySignalData,
          borderColor: 'rgb(22, 163, 74)',
          backgroundColor: 'rgb(34, 197, 94)',
          yAxisID: 'y',
          pointStyle: 'triangle',
          pointRadius: 9,
          pointHoverRadius: 12,
          pointBorderWidth: 2,
          showLine: false,
        },
        {
          label: 'Verkoopsignaal',
          data: rawSeries.sellSignalData,
          borderColor: 'rgb(185, 28, 28)',
          backgroundColor: 'rgb(239, 68, 68)',
          yAxisID: 'y',
          pointStyle: 'triangle',
          rotation: 180,
          pointRadius: 9,
          pointHoverRadius: 12,
          pointBorderWidth: 2,
          showLine: false,
        }
      );
    }

    return {
      labels: rawSeries.sortedDates,
      datasets
    };
  }, [rawSeries, showSma200, showAthLine, showMacdPanel, showAdminStrategyOverlay, isAdmin]);

  const applyTimeRange = (range) => {
    setActiveRange(range);

    setTimeout(() => {
        if (!chartRef.current || !chartDates.length) return;
        const chart = chartRef.current;

        if (range === 'All') {
            chart.resetZoom();
            return;
        }

        const now = new Date();
        let cutoff = new Date();
        if (range === '1W') cutoff.setDate(now.getDate() - 7);
        else if (range === '1M') cutoff.setMonth(now.getMonth() - 1);
        else if (range === '3M') cutoff.setMonth(now.getMonth() - 3);
        else if (range === '6M') cutoff.setMonth(now.getMonth() - 6);
        else if (range === '1Y') cutoff.setFullYear(now.getFullYear() - 1);
        else if (range === '5Y') cutoff.setFullYear(now.getFullYear() - 5);

        const cutoffStr = cutoff.toISOString().split('T')[0];
        let startIndex = chartDates.findIndex(d => d >= cutoffStr);
        
        if (startIndex === -1) {
            startIndex = Math.max(0, chartDates.length - 10);
        }

        chart.zoomScale('x', { min: startIndex, max: chartDates.length - 1 }, 'none');
    }, 50);
  };

  const chartOptions = useMemo(() => ({
      animation: false,
      normalized: true,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      stacked: false,
      plugins: {
          legend: { position: 'top' },
          title: {
              display: true,
              text: `${selectedStock?.name || selectedStock?.ticker || ''} (${selectedStock?.ticker || ''}) — Koershistorie & Technische Analyse`
          },
          tooltip: {
              callbacks: {
                  label: (context) => {
                      const dsLabel = context.dataset.label;
                      const val = context.parsed.y;
                      if (val == null) return null;
                      if (dsLabel === 'Koopsignaal') {
                          return `🟢 Strategie Koopsignaal: €${val.toFixed(2)}`;
                      }
                      if (dsLabel === 'Verkoopsignaal') {
                          return `🔴 Strategie Verkoopsignaal: €${val.toFixed(2)}`;
                      }
                      if (dsLabel.startsWith('Waardeverdeling')) {
                          return `Waardeverdeling: ${val.toFixed(1)}%`;
                      }
                      if (dsLabel.startsWith('Koers') || dsLabel.startsWith('200-Daags') || dsLabel.startsWith('Hoogste Prijs')) {
                          return `${dsLabel}: €${val.toFixed(2)}`;
                      }
                      return `${dsLabel}: ${val.toFixed(2)}`;
                  }
              }
          },
          zoom: {
              pan: {
                  enabled: true,
                  mode: 'x',
                  threshold: 5,
                  onPanComplete: () => setActiveRange('Custom')
              },
              zoom: {
                  wheel: { enabled: true, speed: 0.08 },
                  pinch: { enabled: true },
                  mode: 'x',
                  onZoomComplete: () => setActiveRange('Custom')
              }
          }
      },
      scales: {
          x: { ticks: { maxTicksLimit: 18 } },
          y: {
              type: 'linear', display: true, position: 'left',
              title: { display: true, text: 'Koers (€)' },
              stack: 'main', stackWeight: 3, beginAtZero: false
          },
          ...(isAdmin && showAdminStrategyOverlay ? {
              y1: {
                  type: 'linear', display: true, position: 'right',
                  grid: { drawOnChartArea: false },
                  title: { display: true, text: 'Waardeverdeling (%)' },
                  stack: 'main', stackWeight: 3
              }
          } : {}),
          ...(showMacdPanel ? {
              y_macd: {
                  type: 'linear', display: true, position: 'left',
                  title: { display: true, text: 'MACD' },
                  stack: 'main', stackWeight: 1, offset: true,
                  grid: { drawOnChartArea: true }
              }
          } : {})
      }
  }), [selectedStock?.ticker, selectedStock?.name, isAdmin, showAdminStrategyOverlay, showMacdPanel]);

  const formatLargeNumber = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '-';
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2).replace('.', ',')} T`;
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2).replace('.', ',')} mld`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1).replace('.', ',')} mln`;
    return `${sign}${Math.round(abs).toLocaleString('nl-BE')}`;
  };

  const formatPct = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '-';
    const sign = val > 0 ? '+' : '';
    return `${sign}${Number(val).toFixed(1).replace('.', ',')}%`;
  };

  const f = selectedStock?.fundamentals || null;
  const tax = selectedStock?.taxProfile || null;
  const isAtAth = selectedStock?.drawdownFromAthPct !== null && selectedStock?.drawdownFromAthPct !== undefined && selectedStock.drawdownFromAthPct >= -0.5;

  return (
    <div className="space-y-5">
      {/* 1. Algemene Marktstatistieken & Hoogste Prijs (All-Time High Drawdown) Kaarten */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Kaart 1: Huidige Koers & Rendement */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                Laatste Slotkoers
              </span>
              {selectedStock?.lastPriceDate && (
                <span className="text-[10px] font-bold text-gray-400">
                  {selectedStock.lastPriceDate}
                </span>
              )}
            </div>
            <div className="text-2xl font-black text-gray-900 mt-1">
              {selectedStock?.currentPrice != null ? `€ ${Number(selectedStock.currentPrice).toFixed(2)}` : '-'}
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-gray-100 grid grid-cols-3 gap-1 text-[11px]">
            <div>
              <span className="text-gray-400 font-bold block text-[10px]">1 Mnd</span>
              <span className={`font-black ${selectedStock?.return1mPct > 0 ? 'text-emerald-600' : selectedStock?.return1mPct < 0 ? 'text-rose-600' : 'text-gray-600'}`}>
                {formatPct(selectedStock?.return1mPct)}
              </span>
            </div>
            <div>
              <span className="text-gray-400 font-bold block text-[10px]">1 Jaar</span>
              <span className={`font-black ${selectedStock?.return1yPct > 0 ? 'text-emerald-600' : selectedStock?.return1yPct < 0 ? 'text-rose-600' : 'text-gray-600'}`}>
                {formatPct(selectedStock?.return1yPct)}
              </span>
            </div>
            <div>
              <span className="text-gray-400 font-bold block text-[10px]">5 Jaar</span>
              <span className={`font-black ${selectedStock?.return5yPct > 0 ? 'text-emerald-600' : selectedStock?.return5yPct < 0 ? 'text-rose-600' : 'text-gray-600'}`}>
                {formatPct(selectedStock?.return5yPct)}
              </span>
            </div>
          </div>
        </div>

        {/* Kaart 2: Afstand tot Hoogste Prijs (All-Time High & Hoe Lang Geleden) */}
        <div className={`p-4 rounded-2xl border shadow-2xs flex flex-col justify-between ${
          isAtAth
            ? 'bg-emerald-50/60 border-emerald-200'
            : selectedStock?.drawdownFromAthPct <= -20
            ? 'bg-amber-50/50 border-amber-200'
            : 'bg-white border-gray-200'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                T.o.v. Hoogste Prijs (ATH)
              </span>
              {selectedStock?.athPrice != null && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gray-100 text-gray-800">
                  Piek: €{Number(selectedStock.athPrice).toFixed(2)}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-2xl font-black ${
                isAtAth
                  ? 'text-emerald-700'
                  : selectedStock?.drawdownFromAthPct <= -20
                  ? 'text-rose-600'
                  : 'text-amber-700'
              }`}>
                {selectedStock?.drawdownFromAthPct != null
                  ? isAtAth
                    ? 'Op Hoogste Prijs!'
                    : `${Number(selectedStock.drawdownFromAthPct).toFixed(1).replace('.', ',')}%`
                  : '-'}
              </span>
              {!isAtAth && selectedStock?.drawdownFromAthPct != null && (
                <span className="text-[11px] font-bold text-gray-500">lager dan piek</span>
              )}
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-gray-200/60 flex items-center justify-between text-[11px]">
            <span className="text-gray-500 font-semibold flex items-center gap-1">
              <i className="ph-fill ph-clock-counter-clockwise text-gray-400"></i>
              <span>Hoogste koers:</span>
            </span>
            <span className="font-black text-gray-800" title={selectedStock?.athDate || ''}>
              {selectedStock?.timeSinceAthLabel || selectedStock?.athDate || '-'}
            </span>
          </div>
        </div>

        {/* Kaart 3: 52-Weken Bandbreedte (Laagste - Hoogste laatste 12 maanden) */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                52-Weken Bandbreedte
              </span>
              {selectedStock?.drawdownFrom52wHighPct != null && (
                <span className="text-[10px] font-extrabold text-gray-500">
                  {Number(selectedStock.drawdownFrom52wHighPct).toFixed(1).replace('.', ',')}% van 52w top
                </span>
              )}
            </div>

            <div className="mt-3">
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 via-blue-500 to-emerald-500 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(4, selectedStock?.range52wPositionPct || 50))}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-black text-gray-800 mt-1.5">
                <span>Laag: {selectedStock?.low52w != null ? `€${Number(selectedStock.low52w).toFixed(2)}` : '-'}</span>
                <span>Hoog: {selectedStock?.high52w != null ? `€${Number(selectedStock.high52w).toFixed(2)}` : '-'}</span>
              </div>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
            <span className="text-gray-400 font-bold">200-Daags Gem. (SMA):</span>
            <span className="font-black text-gray-800">
              {selectedStock?.sma200 != null ? `€ ${Number(selectedStock.sma200).toFixed(2)}` : '-'}
            </span>
          </div>
        </div>

        {/* Kaart 4: Belgisch Belastingprofiel (TOB & Dividend / TER) */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                🇧🇪 Beurstaks (TOB) &amp; Type
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 text-blue-700">
                {selectedStock?.asset_type_name === 'ETF' ? 'ETF / Fonds' : selectedStock?.asset_type_name === 'CRYPTO' ? 'Crypto' : 'Aandeel'}
              </span>
            </div>
            <div className="text-xl font-black text-gray-900 mt-1 flex items-baseline gap-2">
              <span>{tax ? `${String(tax.tobRatePct).replace('.', ',')}% TOB` : '0,35% TOB'}</span>
              {tax?.maxTaxEur > 0 && (
                <span className="text-[11px] font-bold text-gray-400">
                  (max €{tax.maxTaxEur})
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px]">
            <span className="text-gray-500 font-semibold">
              {selectedStock?.asset_type_name === 'ETF' ? 'Dividend & TER:' : 'Roerende Voorheffing:'}
            </span>
            <span className="font-black text-gray-800">
              {selectedStock?.asset_type_name === 'ETF'
                ? `${tax?.dividendPolicy?.includes('Kapitaliserend') ? 'Kapitaliserend (0% RV)' : 'Uitkerend (30% RV)'}${tax?.terPct ? ` · TER ${String(tax.terPct).replace('.', ',')}%` : ''}`
                : '30% op dividenden'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Algemene Fundamentele Kerncijfers (Zoals op Yahoo Finance / TradingView - Zichtbaar voor iedereen bij Aandelen) */}
      {f && (
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-600">
                Algemene Fundamentele Data (Yahoo Finance / SEC Feiten)
              </span>
              <h3 className="text-sm font-black text-gray-900">
                Financiële Kerncijfers &amp; Ratio&apos;s (Laatste 12 Maanden / TTM)
              </h3>
            </div>
            {f.lastQuarterDate && (
              <span className="text-[11px] font-bold text-gray-400">
                Laatste kwartaalrapport: {f.lastQuarterDate}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
              <span className="text-[10px] font-bold text-gray-400 block">Koers / Winst (P/E)</span>
              <span className="text-sm font-black text-gray-900">
                {f.peRatio != null ? `${Number(f.peRatio).toFixed(1)}x` : '-'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
              <span className="text-[10px] font-bold text-gray-400 block">Winst / Aandeel (EPS)</span>
              <span className="text-sm font-black text-gray-900">
                {f.epsTtm != null ? `${Number(f.epsTtm).toFixed(2)}` : '-'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
              <span className="text-[10px] font-bold text-gray-400 block">Vrije Kasstroom (FCF)</span>
              <span className="text-sm font-black text-gray-900">
                {formatLargeNumber(f.fcfTtm)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
              <span className="text-[10px] font-bold text-gray-400 block">Nettowinst (TTM)</span>
              <span className="text-sm font-black text-gray-900">
                {formatLargeNumber(f.netIncomeTtm)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
              <span className="text-[10px] font-bold text-gray-400 block">Rendement Eigen Verm. (ROE)</span>
              <span className="text-sm font-black text-gray-900">
                {f.roePct != null ? `${Number(f.roePct).toFixed(1)}%` : '-'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
              <span className="text-[10px] font-bold text-gray-400 block">LT-Schuld / Eigen Verm.</span>
              <span className="text-sm font-black text-gray-900">
                {f.debtToEquity != null ? `${Number(f.debtToEquity).toFixed(2)}x` : '-'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
              <span className="text-[10px] font-bold text-gray-400 block">Eigen Vermogen</span>
              <span className="text-sm font-black text-gray-900">
                {formatLargeNumber(f.equity)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
              <span className="text-[10px] font-bold text-gray-400 block">FCF Yield</span>
              <span className="text-sm font-black text-emerald-700">
                {f.fcfYieldPct != null ? `${Number(f.fcfYieldPct).toFixed(1)}%` : '-'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Interactieve Prijsgrafiek (Met toggles voor SMA 200, ATH-lijn, MACD & optionele Admin Strategie-overlay) */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-2xs border border-gray-200">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-5 gap-3">
          <div>
            <h3 className="text-base font-black text-gray-900">
              Interactieve Koersgrafiek — {selectedStock?.name || selectedStock?.ticker}
            </h3>
            <p className="text-xs text-gray-500">
              Scroll om in te zoomen op een periode of schakel technische hulplijnen in/uit.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Technische Lijnen Toggles (Voor iedereen) */}
            <div className="flex flex-wrap items-center gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-200">
              <button
                type="button"
                onClick={() => setShowAthLine(v => !v)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  showAthLine ? 'bg-emerald-600 text-white shadow-2xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Hoogste Prijs (ATH)
              </button>
              <button
                type="button"
                onClick={() => setShowSma200(v => !v)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  showSma200 ? 'bg-amber-500 text-white shadow-2xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                SMA 200
              </button>
              <button
                type="button"
                onClick={() => setShowMacdPanel(v => !v)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  showMacdPanel ? 'bg-indigo-600 text-white shadow-2xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                MACD Indicator
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAdminStrategyOverlay(v => !v)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    showAdminStrategyOverlay ? 'bg-purple-600 text-white shadow-2xs' : 'text-purple-700 hover:bg-purple-50'
                  }`}
                  title="Enkel zichtbaar voor Beheerder: Toon eigen strategie waardeverdeling & signalen"
                >
                  🔒 Strategie Overlay
                </button>
              )}
            </div>

            {/* Tijdsperiode knoppen */}
            {analysisChartData && (
              <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl">
                {['1W', '1M', '3M', '6M', '1Y', '5Y', 'All'].map(range => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => applyTimeRange(range)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                      activeRange === range ? 'bg-white text-gray-900 shadow-2xs font-black' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {error && <p className="text-red-500 text-xs font-bold mb-3">{error}</p>}
        {loading && !analysisChartData ? (
          <div className="py-20 text-center text-gray-400 text-xs font-bold">
            Koersgrafiek en statistieken laden...
          </div>
        ) : analysisChartData ? (
          <div style={{ height: showMacdPanel ? '640px' : '480px', marginBottom: '10px' }}>
            <Line
              ref={chartRef}
              data={analysisChartData}
              options={chartOptions}
            />
          </div>
        ) : (
          <p className="text-xs text-gray-400 py-12 text-center">Geen koersdata beschikbaar voor grafiek.</p>
        )}
      </div>
    </div>
  );
};

export default AnalysisChartTab;

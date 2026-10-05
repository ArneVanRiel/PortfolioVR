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

const AnalysisChartTab = ({ selectedStock }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysisChartData, setAnalysisChartData] = useState(null);
  const [chartDates, setChartDates] = useState([]);
  const [activeRange, setActiveRange] = useState('All');
  const chartRef = useRef(null);

  const fetchAnalysisChartData = useCallback(async () => {
    if (!selectedStock) return;
    setLoading(true);
    setError('');
    try {
        const [priceRes, alertsRes, calcsRes, macdRes] = await Promise.all([
            http.get(`/calculations/${selectedStock.stock_id}/price-history`),
            http.get(`/calculations/${selectedStock.stock_id}/macd-alerts`),
            http.get(`/calculations/${selectedStock.stock_id}`),
            http.get(`/calculations/${selectedStock.stock_id}/macd-history`)
        ]);

        const prices = priceRes.data;
        const alerts = alertsRes.data;
        const calcs = calcsRes.data;
        const macdHistory = macdRes.data;

        const allDates = new Set();
        prices.forEach(p => allDates.add(new Date(p.date).toISOString().split('T')[0]));
        calcs.forEach(c => allDates.add(new Date(c.period_end_date).toISOString().split('T')[0]));
        macdHistory.forEach(m => allDates.add(new Date(m.date).toISOString().split('T')[0]));
        alerts.forEach(a => allDates.add(new Date(a.date).toISOString().split('T')[0]));

        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));
        setChartDates(sortedDates);
        setActiveRange('All');
        
        const priceMap = new Map(prices.map(p => [new Date(p.date).toISOString().split('T')[0], p.closing_price]));
        const macdMap = new Map(macdHistory.map(m => [new Date(m.date).toISOString().split('T')[0], m]));
        const calcMap = new Map(calcs.map(c => [new Date(c.period_end_date).toISOString().split('T')[0], c.waarde_verdeling]));
        
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
            const wv = Number(c.waarde_verdeling);
            const prevWv = prevC ? Number(prevC.waarde_verdeling) : null;

            const isScoreDrop = (score < 5 && score > 0) || (prevScore === 5 && score < 5);
            const isWvDrop = (prevWv != null && wv != null && wv < prevWv && (prevWv - wv) >= 0.05);

            if (isScoreDrop || isWvDrop) {
                if (!alertsMap.has(d)) alertsMap.set(d, []);
                const calcPrice = getPriceForDate(d);
                alertsMap.get(d).push({
                    type_melding: 'Verkoopsignaal',
                    isMandatorySell: true,
                    reason: isScoreDrop 
                        ? `Verplichte verkoop (Score ${score}/5)`
                        : `Verplichte deelverkoop (WV daling ${prevWv?.toFixed(1)}% ➔ ${wv?.toFixed(1)}%)`,
                    prijs_op_moment: calcPrice
                });
            }
        }

        const priceData = [];
        const waardeverdelingData = [];
        const signalLineData = [];
        const macdLineData = [];
        const buySignalData = [];
        const sellSignalData = [];
        const zeroLineData = [];

        sortedDates.forEach(date => {
            priceData.push(priceMap.get(date) || null);
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
                    // STRATEGIE KOPEN: Alleen als signal line < 0
                    if (a.type_melding === 'Koopsignaal' && a.signal_line_value < 0) {
                        buyVal = a.prijs_op_moment || getPriceForDate(date);
                    } else if (a.type_melding === 'Verkoopsignaal') {
                        // Verkoopsignaal (score daling of waardeverdeling daling)
                        sellVal = a.prijs_op_moment || getPriceForDate(date);
                    }
                });
            }
            buySignalData.push(buyVal);
            sellSignalData.push(sellVal);
        });

        setAnalysisChartData({
            labels: sortedDates.map(d => new Date(d).toLocaleDateString()),
            datasets: [
                {
                    label: 'Prijs',
                    data: priceData,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    yAxisID: 'y',
                    pointRadius: 0,
                    borderWidth: 2,
                    tension: 0.1,
                    order: 2
                },
                {
                    label: 'Waardeverdeling',
                    data: waardeverdelingData,
                    borderColor: 'rgb(153, 102, 255)',
                    backgroundColor: 'rgba(153, 102, 255, 0.5)',
                    yAxisID: 'y1',
                    spanGaps: true,
                    pointRadius: 4,
                    borderWidth: 2,
                    tension: 0.1,
                    order: 1
                },
                {
                    label: 'Signal Line',
                    data: signalLineData,
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    yAxisID: 'y_macd',
                    pointRadius: 0,
                    borderWidth: 1.5,
                    tension: 0.1,
                    order: 3
                },
                {
                    label: 'MACD Line',
                    data: macdLineData,
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    yAxisID: 'y_macd',
                    pointRadius: 0,
                    borderWidth: 1.5,
                    tension: 0.1,
                    order: 3
                },
                {
                    label: 'Zero Line',
                    data: zeroLineData,
                    borderColor: 'black',
                    borderWidth: 1,
                    pointRadius: 0,
                    borderDash: [5, 5],
                    yAxisID: 'y_macd',
                    order: 4
                },
                {
                    label: 'Koopsignaal',
                    data: buySignalData,
                    borderColor: 'green',
                    backgroundColor: 'green',
                    pointStyle: 'triangle',
                    pointRadius: 8,
                    rotation: 0,
                    showLine: false,
                    yAxisID: 'y',
                    order: 0
                },
                {
                    label: 'Verkoopsignaal',
                    data: sellSignalData,
                    borderColor: 'red',
                    backgroundColor: 'red',
                    pointStyle: 'triangle',
                    pointRadius: 8,
                    rotation: 180,
                    showLine: false,
                    yAxisID: 'y',
                    order: 0
                }
            ]
        });

    } catch (err) {
        console.error("Error fetching analysis chart data", err);
        setError("Kon grafiek data niet laden.");
    } finally {
        setLoading(false);
    }
  }, [selectedStock]);

  useEffect(() => {
    if (selectedStock) {
        fetchAnalysisChartData();
    }
  }, [selectedStock, fetchAnalysisChartData]);

  const applyTimeRange = (range) => {
    setActiveRange(range);

    // Gebruik setTimeout om React de render te laten voltooien voordat we de chart muteren, 
    // dit voorkomt dat React-Chartjs-2 de wijziging ongedaan maakt.
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

        // Gebruik de robuuste zoomScale API van de plugin (zonder animatie met 'none')
        chart.zoomScale('x', { min: startIndex, max: chartDates.length - 1 }, 'none');
    }, 50);
  };

  // Memoizeer de opties zodat React de reference behoudt en de zoom plugin zijn eigen werk kan doen.
  const chartOptions = useMemo(() => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      stacked: false,
      plugins: {
          legend: { position: 'top' },
          title: { display: true, text: `Prijs, Waardeverdeling & MACD - ${selectedStock?.ticker || ''}` },
          tooltip: {
              callbacks: {
                  label: (context) => {
                      const dsLabel = context.dataset.label;
                      const val = context.parsed.y;
                      if (val == null) return null;
                      if (dsLabel === 'Koopsignaal') {
                          return `🟢 Koopsignaal (MACD onder 0-lijn): €${val.toFixed(2)}`;
                      }
                      if (dsLabel === 'Verkoopsignaal') {
                          return `🔴 Verplicht Verkoopsignaal: €${val.toFixed(2)}`;
                      }
                      if (dsLabel === 'Waardeverdeling') {
                          return `Waardeverdeling: ${val.toFixed(1)}%`;
                      }
                      if (dsLabel === 'Prijs') {
                          return `Prijs: €${val.toFixed(2)}`;
                      }
                      return `${dsLabel}: ${val.toFixed(2)}`;
                  }
              }
          },
          zoom: {
              pan: {
                  enabled: true,
                  mode: 'x',
                  onPanComplete: () => setActiveRange('Custom')
              },
              zoom: {
                  wheel: { enabled: true },
                  pinch: { enabled: true },
                  mode: 'x',
                  onZoomComplete: () => setActiveRange('Custom')
              }
          }
      },
      scales: {
          x: { ticks: { maxTicksLimit: 20 } },
          y: {
              type: 'linear', display: true, position: 'left',
              title: { display: true, text: 'Prijs (€)' },
              stack: 'main', stackWeight: 2, beginAtZero: false
          },
          y1: {
              type: 'linear', display: true, position: 'right',
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'Waardeverdeling' },
              stack: 'main', stackWeight: 2
          },
          y_macd: {
              type: 'linear', display: true, position: 'left',
              title: { display: true, text: 'MACD' },
              stack: 'main', stackWeight: 1, offset: true,
              grid: { drawOnChartArea: true }
          }
      }
  }), [selectedStock?.ticker]);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <h3 className="text-xl font-bold text-gray-800">Grafische Analyse</h3>
            {analysisChartData && (
                <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                    {['1W', '1M', '3M', '6M', '1Y', '5Y', 'All'].map(range => (
                        <button key={range} onClick={() => applyTimeRange(range)} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                            activeRange === range ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}>
                            {range}
                        </button>
                    ))}
                </div>
            )}
        </div>
        
        {error && <p className="text-red-500">{error}</p>}
        {loading && !analysisChartData ? (
            <p>Grafiek laden...</p>
        ) : analysisChartData ? (
            <div style={{ height: '700px', marginBottom: '20px' }}>
                <Line 
                    ref={chartRef}
                    data={analysisChartData} 
                    options={chartOptions} 
                />
            </div>
        ) : <p>Geen data beschikbaar voor grafiek.</p>}
    </div>
  );
};

export default AnalysisChartTab;

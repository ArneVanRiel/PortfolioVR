// c:\Arne\ArneVR\PortfolioVR\frontend\src\features\analysis\AnalysisChartTab.js
import React, { useState, useEffect, useCallback } from 'react';
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

// Registreer de ChartJS componenten
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const AnalysisChartTab = ({ selectedStock }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysisChartData, setAnalysisChartData] = useState(null);

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
        
        const priceMap = new Map(prices.map(p => [new Date(p.date).toISOString().split('T')[0], p.closing_price]));
        const macdMap = new Map(macdHistory.map(m => [new Date(m.date).toISOString().split('T')[0], m]));
        const calcMap = new Map(calcs.map(c => [new Date(c.period_end_date).toISOString().split('T')[0], c.waarde_verdeling]));
        
        const alertsMap = new Map();
        
        // 1. Voeg bestaande DB alerts toe (voornamelijk Koopsignalen)
        alerts.forEach(a => {
            // STRATEGIE VERKOPEN: Filter oude MACD verkoopsignalen eruit
            if (a.type_melding === 'Verkoopsignaal') return;
            
            const d = new Date(a.date).toISOString().split('T')[0];
            if (!alertsMap.has(d)) alertsMap.set(d, []);
            alertsMap.get(d).push(a);
        });

        // 2. Genereer virtuele verkoopsignalen op basis van waardeverdeling daling
        const sortedCalcs = [...calcs].sort((a, b) => new Date(a.period_end_date) - new Date(b.period_end_date));
        for (let i = 1; i < sortedCalcs.length; i++) {
            const current = sortedCalcs[i];
            const prev = sortedCalcs[i-1];

            if (current.waarde_verdeling < prev.waarde_verdeling) {
                const d = new Date(current.period_end_date).toISOString().split('T')[0];
                if (!alertsMap.has(d)) alertsMap.set(d, []);
                // Voeg virtueel alert toe. Gebruik current_price indien beschikbaar, anders fallback naar priceMap later
                alertsMap.get(d).push({ 
                    type_melding: 'Verkoopsignaal', 
                    prijs_op_moment: current.current_price || 0 
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
                        buyVal = a.prijs_op_moment || priceMap.get(date); // Fallback naar dagprijs
                    } else if (a.type_melding === 'Verkoopsignaal') {
                        // Voor verkoopsignalen (kwartaaldata) is de exacte prijs op moment soms niet opgeslagen in calculations
                        // We gebruiken de slotkoers van die dag uit de priceMap als fallback
                        sellVal = a.prijs_op_moment || priceMap.get(date);
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

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-bold mb-4">Grafische Analyse</h3>
        {error && <p className="text-red-500">{error}</p>}
        {loading && !analysisChartData ? (
            <p>Grafiek laden...</p>
        ) : analysisChartData ? (
            <div style={{ height: '700px', marginBottom: '20px' }}>
                <Line 
                    data={analysisChartData} 
                    options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        stacked: false,
                        plugins: {
                            legend: { position: 'top' },
                            title: { display: true, text: `Prijs, Waardeverdeling & MACD - ${selectedStock.ticker}` },
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
                    }} 
                />
            </div>
        ) : <p>Geen data beschikbaar voor grafiek.</p>}
    </div>
  );
};

export default AnalysisChartTab;

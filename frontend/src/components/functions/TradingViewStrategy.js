import React, { useState, useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    LineElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    PointElement
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import axios from 'axios';

ChartJS.register(LineElement, CategoryScale, LinearScale, Tooltip, Legend, PointElement, zoomPlugin);

const TradingViewStrategy = () => {
    const [tickers, setTickers] = useState([]);
    const [selectedTicker, setSelectedTicker] = useState(null);
    const [dailyPrices, setDailyPrices] = useState([]);
    const [customSymbol, setCustomSymbol] = useState('');
    const [chartData, setChartData] = useState(null);
    const [buySignals, setBuySignals] = useState([]);
    const [sellSignals, setSellSignals] = useState([]);
    const chartRef = useRef();
    const [greenTransitions, setGreenTransitions] = useState([]);


    // Laad tickers uit DB
    useEffect(() => {
        axios.get('/api/SelectStockInPricedb')
            .then((response) => setTickers(response.data))
            .catch((error) => console.error("Error fetching tickers:", error));
    }, []);


      // 2) Ophalen van dailyPrices (DB of API)
    useEffect(() => {
        const fetchPrices = async () => {
        if (!selectedTicker && !customSymbol) return;

        const params = selectedTicker
            ? { ticker_id: selectedTicker }
            : { symbol: customSymbol.toUpperCase() };

        try {
            const { data } = await axios.get('/api/GetDailyPrices', { params });
            setDailyPrices(data);
        } catch (err) {
            console.error(err);
            setDailyPrices([]);
        }
        };
        fetchPrices();
    }, [selectedTicker, customSymbol]);

    useEffect(() => {
        if (!dailyPrices || dailyPrices.length === 0) return;

        const calculateEMAs = (prices, period) => {
            const k = 2 / (period + 1);
            let emaArray = [];
            let ema = prices[0];
            prices.forEach((price, index) => {
                ema = index === 0 ? price : price * k + ema * (1 - k);
                emaArray.push(ema);
            });
            return emaArray;
        };

        const closingPrices = dailyPrices.map((d) => d.closing_price);
        const dates = dailyPrices.map((d) => d.date);

        const ema19 = calculateEMAs(closingPrices, 190);
        const ema20 = calculateEMAs(closingPrices, 200);
        const emaexp = ema19.map((v, i) => ((v / ema20[i]) - 1) * 10);
        const emaexpchange = emaexp.map((v, i) => i > 0 ? (v - emaexp[i - 1]) * 1000 : 0);

        const buy = [];
        const sell = [];
        emaexp.forEach((val, i) => {
            const rising = i > 0 && val > emaexp[i - 1];
            if (rising) buy.push(i);
            else sell.push(i);
        });

        const emaColor = emaexp.map((val, i) =>
            i > 0 && val > emaexp[i - 1] ? 'green' : 'red'
        );

        const datasets = [
            {
                label: 'Closing Price',
                data: closingPrices,
                borderColor: 'black',
                borderWidth: 1,
                pointRadius: 0,
                tension: 0.1
            },
            {
                label: 'EMAexp × 10',
                data: emaexp,

                borderWidth: 1,
                pointRadius: 0,
                tension: 0.2,
                segment: {
                    borderColor: ctx => {
                        const { p0, p1 } = ctx;
                        return p1.y < p0.y ? 'green' : 'red'; // stijgend = groen, dalend = rood
                    }
                }
            },
            {
                label: 'EMAexp Change × 1000',
                data: emaexpchange,
                borderColor: 'blue',
                borderWidth: 1,
                pointRadius: 0,
                tension: 0.2
            },
            {
                label: 'Zero Line',
                data: new Array(dates.length).fill(0),
                borderColor: 'black',
                borderDash: [5, 5],
                borderWidth: 1,
                pointRadius: 0
            }
        ];
        // Zoek de datums waarop emaexp10 van rood naar groen gaat
        const greenTransitions = [];
        for (let i = 2; i < emaexp.length; i++) {
            const wasFalling = emaexp[i - 1] < emaexp[i - 2];
            const isRising = emaexp[i] > emaexp[i - 1];
            if (wasFalling && isRising) {
                greenTransitions.push({
                    date: dates[i],
                    closingPrice: closingPrices[i],
                    emaexp: emaexp[i].toFixed(5),
                    calculatedValue: (1000 * (1 + (-emaexp[i] * 15))).toFixed(2),
                    units: Math.floor(1000 * (1 + (-emaexp[i] * 15)) / closingPrices[i])
                });
                
            }
        }
        
        setChartData({ labels: dates, datasets });
        setBuySignals(buy);
        setSellSignals(sell);
        setGreenTransitions(greenTransitions);

    }, [dailyPrices]);

    const chartOptions = {
        responsive: true,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        scales: {
            x: {
                ticks: {
                    autoSkip: true,
                    maxTicksLimit: 20,
                },
            },
            y: {
                beginAtZero: false,
            },
        },
        plugins: {
            zoom: {
                pan: {
                    enabled: true,
                    mode: 'x',
                },
                zoom: {
                    wheel: { enabled: true },
                    pinch: { enabled: true },
                    mode: 'x',
                },
                limits: {
                    x: { minRange: 5 }
                }
            },
            legend: {
                display: true,
            },
        },
    };

    const resetZoom = () => {
        if (chartRef.current) {
            chartRef.current.resetZoom();
        }
    };

    return (
        <div>
            <h2>Trading Strategy Analysis</h2>

            {/* Dropdown voor bestaande tickers */}
            <select
                value={selectedTicker}
                onChange={e => {
                setSelectedTicker(e.target.value);
                setCustomSymbol('');
                }}
            >
                <option value="">– Kies een ticker –</option>
                {tickers.map(t => (
                <option key={t.aandeel_id} value={t.aandeel_id}>
                    {t.ticker_symbol} – {t.name}
                </option>
                ))}
            </select>
            
            <select onChange={(e) => setSelectedTicker(e.target.value)} value={selectedTicker || ""}>
                <option value="" disabled>Select a ticker</option>
                {tickers.map((ticker) => (
                    <option key={ticker.aandeel_id} value={ticker.aandeel_id}>
                        {ticker.ticker_symbol} - {ticker.name}
                    </option>
                ))}
            </select>


            {chartData && (
                <>
                    <Line ref={chartRef} data={chartData} options={chartOptions} />
                    <button onClick={resetZoom} style={{ marginTop: '10px' }}>Reset Zoom</button>
                </>
            )}
            {greenTransitions.length > 0 && (
                <div style={{ marginTop: '2rem' }}>
                    <h3>Overgangen van rood naar groen</h3>
                    <table border="1" cellPadding="6">
                    <thead>
                        <tr>
                            <th>Datum</th>
                            <th>Closing Price</th>
                            <th>EMAexp × 10</th>
                            <th>Waarde (€)</th> {/* Nieuwe kolom */}
                            <th>Aantal eenheden</th>
                        </tr>
                    </thead>
                    <tbody>
                        {greenTransitions.map((entry, idx) => (
                            <tr key={idx}>
                                <td>{entry.date}</td>
                                <td>{entry.closingPrice.toFixed(2)}</td>
                                <td>{entry.emaexp}</td>
                                <td>€ {entry.calculatedValue}</td> {/* Nieuwe waarde */}
                                <td>{entry.units}</td>
                            </tr>
                        ))}
                    </tbody>

                    </table>
                </div>
            )}

        </div>
    );
};

export default TradingViewStrategy;

// c:\Arne\ArneVR\PortfolioVR\frontend\src\features\analysis\CalculationsSummaryTable.js
import React, { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useIncognito } from '../../hooks/useIncognito';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const CalculationsSummaryTable = forwardRef((props, ref) => {
    const navigate = useNavigate();
    const [summaryData, setSummaryData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [baseAmount, setBaseAmount] = useState(30000); // Default fallback
    const [holdingsData, setHoldingsData] = useState([]);
    const [totalActualValue, setTotalActualValue] = useState(0);

    // --- State for sorting and filtering ---
    const [sortConfig, setSortConfig] = useState({ key: 'waarde_verdeling', direction: 'desc' });
    const [tickerFilter, setTickerFilter] = useState('');
    const [scoreFilter, setScoreFilter] = useState('5');
    const [priceToIntrinsicFilter, setPriceToIntrinsicFilter] = useState('');
    const [signalLineFilter, setSignalLineFilter] = useState('');
    const [alertTypeFilter, setAlertTypeFilter] = useState('');
    const [showHighestEver, setShowHighestEver] = useState(false);
    const [percentageFilter, setPercentageFilter] = useState('');

    // --- State for hover chart ---
    const [hoveredStockId, setHoveredStockId] = useState(null);
    const [chartData, setChartData] = useState(null);
    const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
    const [isChartLoading, setIsChartLoading] = useState(false);
    const [chartTitle, setChartTitle] = useState('');
    const isIncognito = useIncognito();

    const ALL_COLUMNS = useMemo(() => [
        { key: 'name', label: 'Aandeel', sortable: true, defaultVisible: true, type: 'string' },
        { key: 'selectiecriteria', label: 'Score', sortable: true, defaultVisible: true, type: 'number' },
        { key: 'current_price', label: 'Laatste Prijs', sortable: true, defaultVisible: true, type: 'number' },
        { key: 'waarde_verdeling', label: 'Waardeverdeling', sortable: true, defaultVisible: true, type: 'number' },
        { key: 'percentage', label: 'Percentage', sortable: true, defaultVisible: true, type: 'number' },
        { key: 'ideal_invested', label: 'Ideaal Geïnvesteerd', sortable: true, defaultVisible: true, type: 'number' },
        { key: 'intrinsieke_waarde', label: 'Intrinsieke Waarde', sortable: true, defaultVisible: true, type: 'number' },
        { key: 'price_to_intrinsic', label: 'Koopmarge', sortable: true, defaultVisible: true, type: 'number' },
        { key: 'period_end_date', label: 'Period End Date', sortable: true, defaultVisible: true, type: 'date' },
        { key: 'current_signal_line', label: 'Signal Line', sortable: true, defaultVisible: true, type: 'number' },
        { key: 'latest_alert_type', label: 'Type Melding', sortable: true, defaultVisible: true, type: 'string' },
        { key: 'latest_alert_date', label: 'Laatste Alert', sortable: true, defaultVisible: true, type: 'date' },
        { key: 'latest_trade_amount', label: 'Trade Bedrag (Alert)', sortable: true, defaultVisible: true, type: 'number' },
        { key: 'current_recommended_amount', label: 'Aanbevolen Bedrag (Huidig)', sortable: true, defaultVisible: true, type: 'number' },
    ], []);

    const [visibleColumnKeys, setVisibleColumnKeys] = useState(
        ALL_COLUMNS.filter(col => col.defaultVisible).map(col => col.key)
    );
    
    const visibleColumnDefinitions = useMemo(() => {
        return ALL_COLUMNS.filter(col => visibleColumnKeys.includes(col.key));
    }, [ALL_COLUMNS, visibleColumnKeys]);

    // Fetch available balance for calculations
    useEffect(() => {
        const fetchBalance = async () => {
            try {
                const response = await http.get('/balance/available/latest-balance');
                if (response.data.totalAmount) {
                    setBaseAmount(response.data.totalAmount);
                }
            } catch (err) {
                console.error("Error fetching balance for calculations:", err);
            }
        };
        fetchBalance();
    }, []);

    const fetchSummary = useCallback(async () => {
        try {
            setLoading(true);
            const [summaryResponse, holdingsResponse] = await Promise.all([
                http.get('/calculations/summary-by-date', {
                    params: { date: selectedDate }
                }),
                http.get('/portfolio/holdings?userId=1')
            ]);
            setSummaryData(summaryResponse.data);
            
            const holdings = holdingsResponse.data;
            setHoldingsData(holdings);
            setTotalActualValue(holdings.reduce((sum, item) => sum + (item.value || 0), 0));
            setError('');
        } catch (err) {
            setError('Kon de samenvatting van de berekeningen niet laden.');
            console.error('Error fetching calculations summary:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    useImperativeHandle(ref, () => ({
        updateStockLocal: (updatedData) => {
            setSummaryData(prevData => prevData.map(item => {
                if (item.stock_id === updatedData.aandeel_id) {
                    return {
                        ...item,
                        current_price: updatedData.current_price,
                        current_signal_line: updatedData.current_signal_line,
                        latest_alert_type: updatedData.latest_alert_type || item.latest_alert_type,
                        latest_alert_date: updatedData.latest_alert_date || item.latest_alert_date
                    };
                }
                return item;
            }));
        },
        refreshData: fetchSummary
    }));

    const totalWaardeVerdeling = useMemo(() => summaryData
        .filter(item => item.waarde_verdeling > 0 && item.selectiecriteria === 5)
        .reduce((sum, item) => sum + item.waarde_verdeling, 0), [summaryData]);

    const handleSort = (key) => {
        const column = ALL_COLUMNS.find(col => col.key === key);
        if (!column || !column.sortable) return;

        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleTickerFilterChange = (event) => {
        setTickerFilter(event.target.value);
    };

    const getSortArrow = (key) => {
        if (sortConfig.key === key) {
            return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
        }
        return '';
    };

    const filteredAndSortedData = useMemo(() => {
        let currentData = [...summaryData].map(item => {
            const priceToIntrinsic = (item.current_price && item.intrinsieke_waarde > 0)
                ? (item.current_price / item.intrinsieke_waarde) - 1
                : null;
            
            let diffPercentage = null;
            if (item.highest_previous_waarde_verdeling) {
                diffPercentage = ((item.waarde_verdeling - item.highest_previous_waarde_verdeling) / item.highest_previous_waarde_verdeling) * 100;
            }

            let prevDiffPercentage = null;
            if (item.previous_waarde_verdeling) {
                prevDiffPercentage = ((item.waarde_verdeling - item.previous_waarde_verdeling) / item.previous_waarde_verdeling) * 100;
            }

            const percentage = totalWaardeVerdeling > 0 && item.waarde_verdeling > 0 && item.selectiecriteria === 5
                ? (item.waarde_verdeling / totalWaardeVerdeling) * 100
                : 0;

            const holding = holdingsData.find(h => h.ticker === item.ticker_symbol);
            const actual_invested = holding ? (holding.value || 0) : 0;
            const actual_percentage = totalActualValue > 0 ? (actual_invested / totalActualValue) * 100 : 0;
            const ideal_invested = (percentage / 100) * totalActualValue;

            // Nieuwe Weging: ALS(Huidig=0; 2; ALS(Ideaal/Huidig>2; 2; Ideaal/Huidig))
            const weight_factor = actual_invested === 0 ? 2 : Math.min(2, ideal_invested / actual_invested);

            return { ...item, price_to_intrinsic: priceToIntrinsic, diffPercentage, prevDiffPercentage, percentage, actual_percentage, ideal_invested, actual_invested, weight_factor };
        });

        if (tickerFilter) {
            currentData = currentData.filter(item =>
                item.ticker_symbol.toLowerCase().includes(tickerFilter.toLowerCase()) ||
                item.name.toLowerCase().includes(tickerFilter.toLowerCase())
            );
        }

        if (scoreFilter) {
            currentData = currentData.filter(item => {
                if (scoreFilter === '5') return item.selectiecriteria === 5;
                if (scoreFilter === '<5') return item.selectiecriteria < 5;
                return true;
            });
        }
        
        if (priceToIntrinsicFilter === 'lt') {
            currentData = currentData.filter(item => item.price_to_intrinsic !== null && item.price_to_intrinsic < -0.25);
        } else if (priceToIntrinsicFilter === 'gt') {
            currentData = currentData.filter(item => item.price_to_intrinsic !== null && item.price_to_intrinsic >= -0.25);
        }

        if (signalLineFilter === 'lt0') {
            currentData = currentData.filter(item => item.current_signal_line !== null && item.current_signal_line < 0);
        } else if (signalLineFilter === 'gt0') {
            currentData = currentData.filter(item => item.current_signal_line !== null && item.current_signal_line >= 0);
        }

        if (alertTypeFilter) {
            currentData = currentData.filter(item => {
                // STRATEGIE VERKOPEN: Als waardeverdeling is gezakt
                // Dit wordt nu afgehandeld door de backend (latest_alert_type), maar we kunnen het hier ook checken voor de zekerheid
                // of gewoon vertrouwen op de backend.
                
                let displayAlertType = item.latest_alert_type;
                // Verberg oude MACD verkoopsignalen
                if (displayAlertType === 'Verkoopsignaal') displayAlertType = null; 
                
                // Als er een daling is, is het een verkoopsignaal
                if (item.prevDiffPercentage !== null && item.prevDiffPercentage < 0) displayAlertType = 'Verkoopsignaal';

                return displayAlertType === alertTypeFilter;
            });
        }

        if (percentageFilter === 'gt0') {
            currentData = currentData.filter(item => {
                const val = showHighestEver ? item.diffPercentage : item.prevDiffPercentage;
                return val !== null && val > 0;
            });
        } else if (percentageFilter === 'lt0') {
            currentData = currentData.filter(item => {
                const val = showHighestEver ? item.diffPercentage : item.prevDiffPercentage;
                return val !== null && val < 0;
            });
        }

        if (sortConfig.key) {
            currentData.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                const columnType = ALL_COLUMNS.find(col => col.key === sortConfig.key)?.type;

                if (columnType === 'date') {
                    aValue = aValue ? new Date(aValue).getTime() : 0;
                    bValue = bValue ? new Date(bValue).getTime() : 0;
                } else if (columnType === 'number') {
                    aValue = parseFloat(aValue) || 0;
                    bValue = parseFloat(bValue) || 0;
                }
                
                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return currentData;
    }, [summaryData, holdingsData, totalActualValue, totalWaardeVerdeling, tickerFilter, scoreFilter, priceToIntrinsicFilter, signalLineFilter, alertTypeFilter, percentageFilter, showHighestEver, sortConfig, ALL_COLUMNS]);

    const handleMouseEnterPrice = async (e, stockId) => {
        const rect = e.target.getBoundingClientRect();
        setPopupPosition({
            x: rect.right + 10, // 10px rechts van de cel
            y: rect.top + window.scrollY - 50 // Iets omhoog gecentreerd
        });
        setHoveredStockId(stockId);
        setIsChartLoading(true);
        setChartData(null);
        setChartTitle('Prijsgeschiedenis');

        try {
            const [historyResponse, alertsResponse] = await Promise.all([
                http.get(`/calculations/${stockId}/price-history`),
                http.get(`/calculations/${stockId}/macd-alerts`)
            ]);
            const history = historyResponse.data;
            const alerts = alertsResponse.data;
            
            // Beperk data punten voor performance indien nodig, hier nemen we alles
            const labels = history.map(h => new Date(h.date).toLocaleDateString());
            const prices = history.map(h => h.closing_price);

            const buyAlerts = [];
            const sellAlerts = [];

            alerts.forEach(alert => {
                const alertDate = new Date(alert.date).toLocaleDateString();
                // STRATEGIE KOPEN: Alleen als signal line < 0
                if (alert.type_melding === 'Koopsignaal') {
                    if (alert.signal_line_value < 0) {
                        buyAlerts.push({ x: alertDate, y: alert.prijs_op_moment });
                    }
                } else if (alert.type_melding === 'Verkoopsignaal') {
                    sellAlerts.push({ x: alertDate, y: alert.prijs_op_moment });
                }
            });

            setChartData({
                labels,
                datasets: [
                    {
                        label: 'Prijs',
                        data: prices,
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.5)',
                        tension: 0.1,
                        pointRadius: 0, // Verberg punten voor een schonere lijn
                        borderWidth: 2,
                        order: 1
                    },
                    {
                        label: 'Koopsignaal',
                        data: buyAlerts,
                        type: 'line',
                        showLine: false,
                        backgroundColor: 'green',
                        borderColor: 'green',
                        pointStyle: 'triangle',
                        pointRadius: 8,
                        rotation: 0, // Driehoek omhoog
                        order: 0
                    },
                    {
                        label: 'Verkoopsignaal',
                        data: sellAlerts,
                        type: 'line',
                        showLine: false,
                        backgroundColor: 'red',
                        borderColor: 'red',
                        pointStyle: 'triangle',
                        pointRadius: 8,
                        rotation: 180, // Driehoek omlaag
                        order: 0
                    }
                ]
            });
        } catch (err) {
            console.error("Failed to load price history or alerts", err);
        } finally {
            setIsChartLoading(false);
        }
    };

    const handleMouseEnterSignal = async (e, stockId) => {
        const rect = e.target.getBoundingClientRect();
        setPopupPosition({
            x: rect.right + 10,
            y: rect.top + window.scrollY - 50
        });
        setHoveredStockId(stockId);
        setIsChartLoading(true);
        setChartData(null);
        setChartTitle('MACD & Signal Line');

        try {
            const [historyResponse, alertsResponse] = await Promise.all([
                http.get(`/calculations/${stockId}/macd-history`),
                http.get(`/calculations/${stockId}/macd-alerts`)
            ]);
            const history = historyResponse.data;
            const alerts = alertsResponse.data;
            
            const labels = history.map(h => new Date(h.date).toLocaleDateString());
            const macdData = history.map(h => h.macdLine);
            const signalData = history.map(h => h.signalLine);

            const buyAlerts = [];
            const sellAlerts = [];

            alerts.forEach(alert => {
                const alertDate = new Date(alert.date).toLocaleDateString();
                // STRATEGIE KOPEN: Alleen als signal line < 0
                if (alert.type_melding === 'Koopsignaal') {
                    if (alert.signal_line_value < 0) {
                        buyAlerts.push({ x: alertDate, y: alert.signal_line_value });
                    }
                } else if (alert.type_melding === 'Verkoopsignaal') {
                    sellAlerts.push({ x: alertDate, y: alert.signal_line_value });
                }
            });

            setChartData({
                labels,
                datasets: [
                    {
                        label: 'MACD',
                        data: macdData,
                        borderColor: 'rgb(54, 162, 235)', // Blauw
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        tension: 0.1,
                        pointRadius: 0,
                        borderWidth: 2,
                        order: 2
                    },
                    {
                        label: 'Signal',
                        data: signalData,
                        borderColor: 'rgb(255, 99, 132)', // Rood
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        tension: 0.1,
                        pointRadius: 0,
                        borderWidth: 2,
                        order: 1
                    },
                    {
                        label: 'Koopsignaal',
                        data: buyAlerts,
                        type: 'line', // Gebruik line type maar verberg de lijn
                        showLine: false,
                        backgroundColor: 'green',
                        borderColor: 'green',
                        pointStyle: 'triangle',
                        pointRadius: 8,
                        rotation: 0, // Driehoek omhoog
                        order: 0 // Zorg dat deze bovenop ligt
                    },
                    {
                        label: 'Verkoopsignaal',
                        data: sellAlerts,
                        type: 'line',
                        showLine: false,
                        backgroundColor: 'red',
                        borderColor: 'red',
                        pointStyle: 'triangle',
                        pointRadius: 8,
                        rotation: 180, // Driehoek omlaag
                        order: 0
                    }
                ]
            });
        } catch (err) {
            console.error("Failed to load MACD history or alerts", err);
        } finally {
            setIsChartLoading(false);
        }
    };

    const handleMouseLeaveChart = () => {
        setHoveredStockId(null);
        setChartData(null);
        setChartTitle('');
    };

    if (loading) {
        return <p className="text-gray-500">Overzichtstabel wordt geladen...</p>;
    }

    if (error) {
        return <p className="text-red-500">{error}</p>;
    }

    const totalVisibleColumns = visibleColumnDefinitions.length + 1; // +1 for actions

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
            <div className="overflow-x-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Overzicht Berekeningen</h3>
                    <div className="flex items-center">
                        <input
                            id="showHighestEver"
                            type="checkbox"
                            checked={showHighestEver}
                            onChange={(e) => setShowHighestEver(e.target.checked)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label htmlFor="showHighestEver" className="ml-2 block text-sm text-gray-900">
                            Toon % vs Hoogste Ooit
                        </label>
                    </div>
                </div>
                <div className="mb-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
                    <div>
                        <label htmlFor="date-picker" className="block text-sm font-semibold text-gray-700 mb-1">Datum</label>
                        <input
                            type="date"
                            id="date-picker"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2"
                        />
                    </div>
                     <div>
                        <label htmlFor="tickerFilter" className="block text-sm font-semibold text-gray-700 mb-1">Aandeel</label>
                        <input
                            type="text"
                            id="tickerFilter"
                            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2"
                            placeholder="Zoek op Ticker of Naam"
                            value={tickerFilter}
                            onChange={handleTickerFilterChange}
                        />
                    </div>
                    <div>
                        <label htmlFor="scoreFilter" className="block text-sm font-semibold text-gray-700 mb-1">Score</label>
                        <select id="scoreFilter" value={scoreFilter} onChange={e => setScoreFilter(e.target.value)} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2">
                            <option value="">Alles</option>
                            <option value="5">5</option>
                            <option value="<5">&lt; 5</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="priceToIntrinsicFilter" className="block text-sm font-semibold text-gray-700 mb-1">Prijs/Intrinsiek</label>
                        <select id="priceToIntrinsicFilter" value={priceToIntrinsicFilter} onChange={e => setPriceToIntrinsicFilter(e.target.value)} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2">
                            <option value="">Alles</option>
                            <option value="lt">Lager dan -25%</option>
                            <option value="gt">Hoger dan -25%</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="signalLineFilter" className="block text-sm font-semibold text-gray-700 mb-1">Signal Line</label>
                        <select id="signalLineFilter" value={signalLineFilter} onChange={e => setSignalLineFilter(e.target.value)} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2">
                            <option value="">Alles</option>
                            <option value="lt0">Lager dan 0</option>
                            <option value="gt0">Hoger dan 0</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="alertTypeFilter" className="block text-sm font-semibold text-gray-700 mb-1">Type Melding</label>
                        <select id="alertTypeFilter" value={alertTypeFilter} onChange={e => setAlertTypeFilter(e.target.value)} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2">
                            <option value="">Alles</option>
                            <option value="Koopsignaal">Koopsignaal</option>
                            <option value="Verkoopsignaal">Verkoopsignaal</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="percentageFilter" className="block text-sm font-semibold text-gray-700 mb-1">Percentage ({showHighestEver ? 'H' : 'Q'})</label>
                        <select id="percentageFilter" value={percentageFilter} onChange={e => setPercentageFilter(e.target.value)} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2">
                            <option value="">Alles</option>
                            <option value="gt0">Boven 0%</option>
                            <option value="lt0">Onder 0%</option>
                        </select>
                    </div>
                </div>
                <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            {visibleColumnDefinitions.map(col => (
                                <th 
                                    key={col.key}
                                    className={`px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                                    onClick={() => col.sortable && handleSort(col.key)}
                                >
                                    {col.label}{col.sortable ? getSortArrow(col.key) : ''}
                                </th>
                            ))}
                            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actie</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredAndSortedData.length === 0 ? (
                            <tr>
                                <td colSpan={totalVisibleColumns} className="p-4 text-center text-gray-500">
                                    Geen data gevonden voor de geselecteerde datum of filters.
                                </td>
                            </tr>
                        ) : (
                            filteredAndSortedData.map((item) => {
                                const percentage = item.percentage;

                                const getHighlightClass = (periodEndDate, selectedDate) => {
                                    const periodDate = new Date(periodEndDate);
                                    const selectDate = new Date(selectedDate);
                                    const monthsDiff = (selectDate.getFullYear() - periodDate.getFullYear()) * 12 + (selectDate.getMonth() - periodDate.getMonth());

                                    if (monthsDiff >= 5) {
                                        return 'bg-orange-50 text-orange-800';
                                    } else if (monthsDiff >= 4) {
                                        return 'bg-yellow-50 text-yellow-800';
                                    }
                                    return '';
                                };

                                const highlightClass = getHighlightClass(item.period_end_date, selectedDate);

                                let koopmargefactor = 1;
                                if (item.current_price && item.intrinsieke_waarde && item.intrinsieke_waarde > 0) {
                                    const ratio = item.current_price / item.intrinsieke_waarde;
                                    if (item.current_price < item.intrinsieke_waarde * 0.75) {
                                        koopmargefactor = Math.abs(ratio - 1) + 1;
                                    } else {
                                        koopmargefactor = 1 / ratio;
                                    }
                                }

                                const displayAlertType = item.latest_alert_type;
                                const currentRecommendedAmount = (typeof item.current_signal_line === 'number' && item.current_price > 0)
                                    ? Math.max(0, baseAmount * (1 + (-item.current_signal_line / item.current_price) * 4)) * (percentage / 100) * (koopmargefactor / 10) * item.weight_factor
                                    : null;

                                const renderCell = (col) => {
                                    const value = item[col.key];
                                    switch (col.key) {
                                        case 'name':
                                            return <span className="privacy-blur">{isIncognito ? '••••••' : `${item.name} (${item.ticker_symbol})`}</span>;
                                        case 'selectiecriteria':
                                            return value !== null ? value : '-';
                                        case 'waarde_verdeling':
                                            const percentageToShow = showHighestEver ? item.diffPercentage : item.prevDiffPercentage;
                                            const label = showHighestEver ? 'H' : 'Q';
                                            return (
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{value?.toFixed(2)}</span>
                                                    <div className="text-xs flex flex-col mt-0.5">
                                                        {percentageToShow !== null && (
                                                            <span className={`${percentageToShow >= 0 ? 'text-green-600' : 'text-red-600'}`} title={showHighestEver ? "Vs Hoogste Ooit" : "Vs Vorige Kwartaal"}>
                                                                {label}: {percentageToShow > 0 ? '+' : ''}{percentageToShow.toFixed(2)}%
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        case 'current_price':
                                        case 'intrinsieke_waarde':
                                            if (col.key === 'current_price') {
                                                return (
                                                    <div onMouseEnter={(e) => handleMouseEnterPrice(e, item.stock_id)} onMouseLeave={handleMouseLeaveChart} className="cursor-pointer underline decoration-dotted decoration-gray-400 hover:text-blue-600 privacy-blur">
                                                        {isIncognito ? '€ ••••••' : (value != null ? `€${Number(value).toFixed(2)}` : 'N/A')}
                                                    </div>
                                                );
                                            }
                                            return <span className="privacy-blur">{isIncognito ? '€ ••••••' : (value != null ? `€${Number(value).toFixed(2)}` : 'N/A')}</span>;
                                        case 'percentage':
                                            return (
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{item.percentage.toFixed(2)}% <span className="text-gray-400 font-normal text-[10px]">(Ideaal)</span></span>
                                                    <span className="text-xs text-gray-500 mt-0.5">{item.actual_percentage.toFixed(2)}% <span className="text-gray-400 font-normal text-[10px]">(Huidig)</span></span>
                                                </div>
                                            );
                                        case 'ideal_invested':
                                            return value != null ? (
                                                <div className="flex flex-col">
                                                    <span className="font-medium privacy-blur">{isIncognito ? '€ ••••••' : `€${value.toFixed(2)}`} <span className="text-gray-400 font-normal text-[10px]">(Ideaal)</span></span>
                                                    <span className="text-xs text-gray-500 mt-0.5 privacy-blur">{isIncognito ? '€ ••••••' : `€${item.actual_invested.toFixed(2)}`} <span className="text-gray-400 font-normal text-[10px]">(Huidig)</span></span>
                                                </div>
                                            ) : 'N/A';
                                        case 'price_to_intrinsic':
                                            return value != null ? <span className="font-medium privacy-blur">{isIncognito ? '••••••' : `${(value * 100).toFixed(2)}%`}</span> : 'N/A';
                                        case 'period_end_date':
                                            return <span className={`px-2 py-1 rounded-md ${highlightClass}`}>{value ? new Date(value).toLocaleDateString() : 'N/A'}</span>;
                                        case 'current_signal_line':
                                            const signalLineClass = value != null && value < 0 ? 'text-green-600 font-semibold' : '';
                                            return (
                                                <div onMouseEnter={(e) => handleMouseEnterSignal(e, item.stock_id)} onMouseLeave={handleMouseLeaveChart} className={`cursor-pointer underline decoration-dotted decoration-gray-400 hover:text-blue-600 ${signalLineClass}`}>
                                                    {value != null ? Number(value).toFixed(4) : 'N/A'}
                                                </div>
                                            );
                                        case 'latest_alert_type':
                                            const typeClass = displayAlertType === 'Koopsignaal' ? 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800' : displayAlertType === 'Verkoopsignaal' ? 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800' : '';
                                            return <span className={typeClass}>{displayAlertType || 'N/A'}</span>;
                                        case 'latest_alert_date':
                                             return value ? new Date(value).toLocaleDateString() : 'N/A';
                                        case 'latest_trade_amount':
                                            if (displayAlertType === 'Verkoopsignaal') {
                                                // Backend geeft percentage als decimaal (bv -0.05), wij tonen %
                                                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 privacy-blur">{isIncognito ? '••••••' : `${(value * 100).toFixed(2)}%`}</span>;
                                            }
                                            return (value != null && displayAlertType === 'Koopsignaal') ? <span className="privacy-blur">{isIncognito ? '€ ••••••' : `€${(value * (percentage / 100) / 10 * item.weight_factor).toFixed(2)}`}</span> : 'N/A';
                                        case 'current_recommended_amount':
                                             return currentRecommendedAmount != null ? `€${currentRecommendedAmount.toFixed(2)}` : 'N/A';
                                        default:
                                            return value || 'N/A';
                                    }
                                };

                                const priceToIntrinsicClass = item.price_to_intrinsic != null && item.price_to_intrinsic < -0.25 ? 'bg-green-50 text-green-800' : '';
                                
                                return (
                                    <tr key={item.calculation_id} className="hover:bg-gray-50 transition-colors duration-150">
                                        {visibleColumnDefinitions.map(col => (
                                            <td key={col.key} className={`px-2 py-2 whitespace-nowrap text-xs text-gray-700 ${col.key === 'price_to_intrinsic' ? priceToIntrinsicClass : ''}`}>
                                                {renderCell(col)}
                                            </td>
                                        ))}
                                        <td className="px-2 py-2 whitespace-nowrap text-right text-xs font-medium space-x-2">
                                            {highlightClass && (
                                                <button 
                                                    onClick={() => navigate(`/analysis?ticker=${item.ticker_symbol}`)}
                                                    className="text-indigo-600 hover:text-indigo-900"
                                                >
                                                    Analyseer
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Hover Chart Popup */}
            {hoveredStockId && (
                <div 
                    style={{
                        position: 'absolute',
                        left: popupPosition.x,
                        top: popupPosition.y,
                        zIndex: 1000,
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '10px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        width: '350px',
                        height: '250px'
                    }}
                >
                    {isChartLoading ? (
                        <div className="flex items-center justify-center h-full text-sm text-gray-500">Laden...</div>
                    ) : chartData ? (
                        <Line 
                            data={chartData} 
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: { display: true },
                                    title: { display: true, text: chartTitle }
                                },
                                scales: {
                                    x: { 
                                        display: true,
                                        ticks: { maxTicksLimit: 8 } // Beperk aantal labels op x-as
                                    },
                                    y: { beginAtZero: false }
                                }
                            }} 
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-sm text-gray-500">Geen data</div>
                    )}
                </div>
            )}
        </div>
    );
});

export default CalculationsSummaryTable;

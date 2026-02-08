import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../http-common';

const CalculationsSummaryTable = () => {
    const navigate = useNavigate();
    const [summaryData, setSummaryData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    // --- State for sorting and filtering ---
    const [sortConfig, setSortConfig] = useState({ key: 'waarde_verdeling', direction: 'desc' });
    const [tickerFilter, setTickerFilter] = useState('');
    const [priceToIntrinsicFilter, setPriceToIntrinsicFilter] = useState('');
    const [signalLineFilter, setSignalLineFilter] = useState('');
    const [alertTypeFilter, setAlertTypeFilter] = useState('');

    const ALL_COLUMNS = useMemo(() => [
        { key: 'name', label: 'Aandeel', sortable: true, defaultVisible: true, type: 'string' },
        { key: 'current_price', label: 'Laatste Prijs', sortable: true, defaultVisible: true, type: 'number' },
        { key: 'waarde_verdeling', label: 'Waardeverdeling', sortable: true, defaultVisible: true, type: 'number' },
        { key: 'percentage', label: 'Percentage', sortable: false, defaultVisible: true, type: 'number' },
        { key: 'intrinsieke_waarde', label: 'Intrinsieke Waarde', sortable: true, defaultVisible: true, type: 'number' },
        { key: 'price_to_intrinsic', label: 'Prijs/Intrinsiek', sortable: true, defaultVisible: true, type: 'number' },
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


    useEffect(() => {
        const fetchSummary = async () => {
            try {
                setLoading(true);
                const response = await http.get('/calculations/summary-by-date', {
                    params: { date: selectedDate }
                });
                setSummaryData(response.data);
                setError('');
            } catch (err) {
                setError('Kon de samenvatting van de berekeningen niet laden.');
                console.error('Error fetching calculations summary:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchSummary();
    }, [selectedDate]);

    const totalWaardeVerdeling = useMemo(() => summaryData
        .filter(item => item.waarde_verdeling > 0)
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
            return { ...item, price_to_intrinsic: priceToIntrinsic };
        });

        if (tickerFilter) {
            currentData = currentData.filter(item =>
                item.ticker_symbol.toLowerCase().includes(tickerFilter.toLowerCase()) ||
                item.name.toLowerCase().includes(tickerFilter.toLowerCase())
            );
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
            currentData = currentData.filter(item => item.latest_alert_type === alertTypeFilter);
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
    }, [summaryData, tickerFilter, priceToIntrinsicFilter, signalLineFilter, alertTypeFilter, sortConfig, ALL_COLUMNS]);


    if (loading) {
        return <p className="text-gray-500">Overzichtstabel wordt geladen...</p>;
    }

    if (error) {
        return <p className="text-red-500">{error}</p>;
    }

    const totalVisibleColumns = visibleColumnDefinitions.length + 1; // +1 for actions

    return (
        <div className="bg-white bg-white border border-gray-200 rounded-xl shadow-sm p-3 mb-4">
            <div className="overflow-x-auto">
                <h3 className="text-lg font-semibold text-gray-800">Overzicht Berekeningen</h3>
                <div className="my-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
                    <div>
                        <label htmlFor="date-picker" className="block text-sm font-medium text-gray-700">Selecteer een datum</label>
                        <input
                            type="date"
                            id="date-picker"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        />
                    </div>
                     <div>
                        <label htmlFor="tickerFilter" className="block text-sm font-medium text-gray-600 mb-1">Filter Aandeel:</label>
                        <input
                            type="text"
                            id="tickerFilter"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            placeholder="Zoek op Ticker of Naam"
                            value={tickerFilter}
                            onChange={handleTickerFilterChange}
                        />
                    </div>
                    <div>
                        <label htmlFor="priceToIntrinsicFilter" className="block text-sm font-medium text-gray-600 mb-1">Filter Prijs/Intrinsiek:</label>
                        <select id="priceToIntrinsicFilter" value={priceToIntrinsicFilter} onChange={e => setPriceToIntrinsicFilter(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                            <option value="">Alles</option>
                            <option value="lt">Lager dan -25%</option>
                            <option value="gt">Hoger dan -25%</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="signalLineFilter" className="block text-sm font-medium text-gray-600 mb-1">Filter Signal Line:</label>
                        <select id="signalLineFilter" value={signalLineFilter} onChange={e => setSignalLineFilter(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                            <option value="">Alles</option>
                            <option value="lt0">Lager dan 0</option>
                            <option value="gt0">Hoger dan 0</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="alertTypeFilter" className="block text-sm font-medium text-gray-600 mb-1">Filter Type Melding:</label>
                        <select id="alertTypeFilter" value={alertTypeFilter} onChange={e => setAlertTypeFilter(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                            <option value="">Alles</option>
                            <option value="Koopsignaal">Koopsignaal</option>
                            <option value="Verkoopsignaal">Verkoopsignaal</option>
                        </select>
                    </div>
                </div>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            {visibleColumnDefinitions.map(col => (
                                <th 
                                    key={col.key}
                                    className={`p-2 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider ${col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                                    onClick={() => col.sortable && handleSort(col.key)}
                                >
                                    {col.label}{col.sortable ? getSortArrow(col.key) : ''}
                                </th>
                            ))}
                            <th className="p-2 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Actie</th>
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
                                const percentage = totalWaardeVerdeling > 0 && item.waarde_verdeling > 0
                                    ? (item.waarde_verdeling / totalWaardeVerdeling) * 100
                                    : 0;

                                let diffPercentage = null;
                                if (item.highest_previous_waarde_verdeling) {
                                    diffPercentage = ((item.waarde_verdeling - item.highest_previous_waarde_verdeling) / item.highest_previous_waarde_verdeling) * 100;
                                }

                                const getHighlightClass = (periodEndDate, selectedDate) => {
                                    const periodDate = new Date(periodEndDate);
                                    const selectDate = new Date(selectedDate);
                                    const monthsDiff = (selectDate.getFullYear() - periodDate.getFullYear()) * 12 + (selectDate.getMonth() - periodDate.getMonth());

                                    if (monthsDiff >= 5) {
                                        return 'bg-orange-200';
                                    } else if (monthsDiff >= 4) {
                                        return 'bg-yellow-200';
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

                                const currentRecommendedAmount = (typeof item.current_signal_line === 'number' && item.current_price > 0)
                                    ? Math.max(0, 30000 * (1 + (-item.current_signal_line / item.current_price) * 4)) * (percentage / 100) * (koopmargefactor / 10)
                                    : null;

                                const renderCell = (col) => {
                                    const value = item[col.key];
                                    switch (col.key) {
                                        case 'name':
                                            return `${item.name} (${item.ticker_symbol})`;
                                        case 'waarde_verdeling':
                                            return (
                                                <>
                                                    {value?.toFixed(2)}
                                                    {diffPercentage !== null && (
                                                        <span className={`ml-2 ${diffPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            ({diffPercentage > 0 ? '+' : ''}{diffPercentage.toFixed(2)}%)
                                                        </span>
                                                    )}
                                                </>
                                            );
                                        case 'current_price':
                                        case 'intrinsieke_waarde':
                                            return value != null ? `€${Number(value).toFixed(2)}` : 'N/A';
                                        case 'percentage':
                                            return `${percentage.toFixed(2)}%`;
                                        case 'price_to_intrinsic':
                                            return value != null ? `${(value * 100).toFixed(2)}%` : 'N/A';
                                        case 'period_end_date':
                                            return <span className={highlightClass}>{value ? new Date(value).toLocaleDateString() : 'N/A'}</span>;
                                        case 'current_signal_line':
                                            const signalLineClass = value != null && value < 0 ? 'text-green-600 font-bold' : '';
                                            return <span className={signalLineClass}>{value != null ? Number(value).toFixed(4) : 'N/A'}</span>;
                                        case 'latest_alert_date':
                                             return value ? new Date(value).toLocaleDateString() : 'N/A';
                                        case 'latest_trade_amount':
                                            return value != null ? `€${(value * (percentage / 100) / 10).toFixed(2)}` : 'N/A';
                                        case 'current_recommended_amount':
                                             return currentRecommendedAmount != null ? `€${currentRecommendedAmount.toFixed(2)}` : 'N/A';
                                        default:
                                            return value || 'N/A';
                                    }
                                };

                                const priceToIntrinsicClass = item.price_to_intrinsic != null && item.price_to_intrinsic < -0.25 ? 'bg-green-200' : '';
                                
                                return (
                                    <tr key={item.calculation_id}>
                                        {visibleColumnDefinitions.map(col => (
                                            <td key={col.key} className={`p-2 whitespace-nowrap text-sm text-gray-700 ${col.key === 'price_to_intrinsic' ? priceToIntrinsicClass : ''}`}>
                                                {renderCell(col)}
                                            </td>
                                        ))}
                                        <td className="p-2 whitespace-nowrap text-right text-sm font-medium space-x-2">
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
        </div>
    );
};

export default CalculationsSummaryTable;
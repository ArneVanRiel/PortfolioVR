// c:\Arne\ArneVR\PortfolioVR\frontend\src\features\analysis\AnalysisAlertsTab.js
import React, { useState, useEffect, useMemo } from 'react';
import http from '../../http-common';

const AnalysisAlertsTab = ({ selectedStock }) => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // Context data voor berekeningen en filters
    const [stockContext, setStockContext] = useState({
        percentage: 0,
        weight_factor: 1,
    });

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Sorting state
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    // Filters
    const [alertTypeFilter, setAlertTypeFilter] = useState('');
    const [percentageFilter, setPercentageFilter] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            if (!selectedStock) return;
            
            setLoading(true);
            try {
                // 1. Haal Alerts op (Koop én Verkoop staan nu correct in DB)
                const alertsResponse = await http.get(`/calculations/${selectedStock.stock_id}/macd-alerts`);
                setAlerts(alertsResponse.data || []);

                // 2. Haal Calculation Context op (voor percentage weging en Q-diff)
                const today = new Date().toISOString().split('T')[0];
                const [contextResponse, holdingsResponse] = await Promise.all([
                    http.get('/calculations/summary-by-date', { params: { date: today } }),
                    http.get('/portfolio/holdings?userId=1')
                ]);
                const summaryData = contextResponse.data;
                const holdings = holdingsResponse.data;
                const totalActualValue = holdings.reduce((sum, h) => sum + (h.value || 0), 0);

                // Bereken totaal voor weging
                const totalWaardeVerdeling = summaryData
                    .filter(item => item.waarde_verdeling > 0 && item.selectiecriteria === 5)
                    .reduce((sum, item) => sum + item.waarde_verdeling, 0);

                // Zoek het geselecteerde aandeel in de samenvatting
                // Zorg voor type safety bij vergelijking (stock_id kan string of number zijn)
                const stockId = parseInt(selectedStock.stock_id || selectedStock.aandeel_id);
                const stockItem = summaryData.find(item => item.stock_id === stockId);
                
                let percentage = 0;
                let weight_factor = 1;
                let diffPercentage = null;

                if (stockItem) {
                    // Bereken percentage weging
                    if (totalWaardeVerdeling > 0 && stockItem.waarde_verdeling > 0 && stockItem.selectiecriteria === 5) {
                        percentage = (stockItem.waarde_verdeling / totalWaardeVerdeling) * 100;
                    }
                    
                    const ideal_invested = (percentage / 100) * totalActualValue;
                    const holding = holdings.find(h => h.ticker === stockItem.ticker_symbol);
                    const actual_invested = holding ? (holding.value || 0) : 0;
                    weight_factor = actual_invested === 0 ? 2 : Math.min(2, ideal_invested / actual_invested);
                }

                setStockContext({ percentage, weight_factor });
                setError('');
            } catch (err) {
                console.error("Error fetching data:", err);
                setError("Kon data niet laden.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedStock]);

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredAlerts = useMemo(() => {
        return alerts.filter(alert => {
            // STRATEGIE KOPEN: Verberg Koopsignalen als de signal line >= 0 is
            if (alert.type_melding === 'Koopsignaal' && alert.signal_line_value >= 0) return false;

            // STRATEGIE VERKOPEN: Filter oude signalen (die nog een signal_line_value hebben)
            if (alert.type_melding === 'Verkoopsignaal' && alert.signal_line_value != null) return false;

            // Filter 2: Type Melding
            if (alertTypeFilter && alert.type_melding !== alertTypeFilter) return false;

            // Filter 3: Percentage (Q)
            if (percentageFilter === 'gt0') {
                if (alert.diff_percentage === null || alert.diff_percentage === undefined || alert.diff_percentage <= 0) return false;
            } else if (percentageFilter === 'lt0') {
                if (alert.diff_percentage === null || alert.diff_percentage === undefined || alert.diff_percentage >= 0) return false;
            }

            return true;
        });
    }, [alerts, alertTypeFilter, percentageFilter, stockContext]);

    const sortedAlerts = useMemo(() => {
        let sorted = [...filteredAlerts];
        if (sortConfig.key) {
            sorted.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];

                if (sortConfig.key === 'date') {
                    aValue = new Date(aValue).getTime();
                    bValue = new Date(bValue).getTime();
                } else if (sortConfig.key === 'trade_amount') {
                     // Sorteer op berekend bedrag of percentage
                     const getVal = (item) => {
                        if (item.type_melding === 'Verkoopsignaal') return item.trade_amount;
                        return item.trade_amount != null ? item.trade_amount * (stockContext.percentage / 100) / 10 * stockContext.weight_factor : 0;
                     };
                     const valA = getVal(a);
                     const valB = getVal(b);
                     aValue = valA;
                     bValue = valB;
                } else if (typeof aValue === 'string') {
                    aValue = aValue.toLowerCase();
                    bValue = bValue.toLowerCase();
                } else if (typeof aValue === 'number' && typeof bValue === 'number') {
                    // Standaard nummer vergelijking
                }

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sorted;
    }, [filteredAlerts, sortConfig, stockContext]);

    const paginatedAlerts = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return sortedAlerts.slice(startIndex, startIndex + itemsPerPage);
    }, [sortedAlerts, currentPage]);

    const totalPages = Math.ceil(sortedAlerts.length / itemsPerPage);

    if (loading) return <p className="text-gray-500">Meldingen laden...</p>;
    if (error) return <p className="text-red-500">{error}</p>;

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mt-6">
            <h3 className="text-xl font-bold text-gray-800 mb-6">Meldingen Historiek - {selectedStock.name}</h3>
            
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                    <label htmlFor="alertTypeFilter" className="block text-sm font-semibold text-gray-700 mb-1">Filter Type Melding:</label>
                    <select id="alertTypeFilter" value={alertTypeFilter} onChange={e => setAlertTypeFilter(e.target.value)} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2">
                        <option value="">Alles</option>
                        <option value="Koopsignaal">Koopsignaal</option>
                        <option value="Verkoopsignaal">Verkoopsignaal</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="percentageFilter" className="block text-sm font-semibold text-gray-700 mb-1">Filter Percentage (Q):</label>
                    <select id="percentageFilter" value={percentageFilter} onChange={e => setPercentageFilter(e.target.value)} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2">
                        <option value="">Alles</option>
                        <option value="gt0">Boven 0%</option>
                        <option value="lt0">Onder 0%</option>
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 bg-white">
                    <thead className="bg-gray-50">
                        <tr>
                            <th 
                                className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                onClick={() => handleSort('date')}
                            >
                                Datum {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                            <th 
                                className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                onClick={() => handleSort('type_melding')}
                            >
                                Type {sortConfig.key === 'type_melding' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                            <th 
                                className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                onClick={() => handleSort('prijs_op_moment')}
                            >
                                Prijs {sortConfig.key === 'prijs_op_moment' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                            <th 
                                className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                onClick={() => handleSort('signal_line_value')}
                            >
                                Signal Line {sortConfig.key === 'signal_line_value' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                            <th 
                                className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                onClick={() => handleSort('trade_amount')}
                            >
                                Aanbevolen Bedrag {sortConfig.key === 'trade_amount' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedAlerts.length > 0 ? (
                            paginatedAlerts.map((alert) => {
                                let displayAmount = 'N/A';
                                
                                if (alert.type_melding === 'Verkoopsignaal') {
                                    // Het is een verkoopsignaal, toon percentage
                                    const pct = alert.trade_amount * 100;
                                    displayAmount = <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{pct.toFixed(2)}%</span>;
                                } else {
                                    // Het is een koopsignaal, toon bedrag
                                    const adjustedAmount = alert.trade_amount != null ? alert.trade_amount * (stockContext.percentage / 100) / 10 * stockContext.weight_factor : null;
                                    displayAmount = adjustedAmount != null ? `€${Number(adjustedAmount).toFixed(2)}` : 'N/A';
                                }
                                
                                return (
                                    <tr key={alert.alert_id || `${alert.date}-${alert.type_melding}`} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900">
                                            {new Date(alert.date).toLocaleDateString()}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${alert.type_melding === 'Koopsignaal' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {alert.type_melding}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">
                                            €{Number(alert.prijs_op_moment).toFixed(2)}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">
                                            {Number(alert.signal_line_value).toFixed(4)}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">
                                            {displayAmount}
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                                    Geen meldingen gevonden voor dit aandeel met de huidige filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4">
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                        Vorige
                    </button>
                    <span className="text-sm font-medium text-gray-700">
                        Pagina {currentPage} van {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                        Volgende
                    </button>
                </div>
            )}
        </div>
    );
};

export default AnalysisAlertsTab;

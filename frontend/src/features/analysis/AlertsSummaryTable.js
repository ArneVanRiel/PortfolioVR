// c:\Arne\ArneVR\PortfolioVR\frontend\src\features\analysis\AlertsSummaryTable.js
import React, { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import http from '../../http-common';
import { useDebounce } from 'use-debounce';

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
    const handlePrevious = () => {
        if (currentPage > 1) {
            onPageChange(currentPage - 1);
        }
    };

    const handleNext = () => {
        if (currentPage < totalPages) {
            onPageChange(currentPage + 1);
        }
    };

    return (
        <div className="flex justify-between items-center mt-4">
            <button
                onClick={handlePrevious}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors duration-200"
            >
                Vorige
            </button>
            <span className="text-sm font-medium text-gray-700">
                Pagina {currentPage} van {totalPages}
            </span>
            <button
                onClick={handleNext}
                disabled={currentPage === totalPages}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors duration-200"
            >
                Volgende
            </button>
        </div>
    );
};


const AlertsSummaryTable = forwardRef((props, ref) => {
    const [allAlerts, setAllAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [calculationData, setCalculationData] = useState({}); // Store percentages per stock
    const [score5Stocks, setScore5Stocks] = useState(new Set());
    const [isContextLoaded, setIsContextLoaded] = useState(false);
    const [percentageFilter, setPercentageFilter] = useState('');
    
    // --- State for pagination ---
    const [currentPage, setCurrentPage] = useState(1);

    // --- State for sorting and filtering ---
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [tickerFilter, setTickerFilter] = useState('');
    const [debouncedTickerFilter] = useDebounce(tickerFilter, 500);
    const [alertTypeFilter, setAlertTypeFilter] = useState('');

    const ALL_COLUMNS = useMemo(() => [
        { key: 'name', label: 'Aandeel', sortable: true, type: 'string' },
        { key: 'date', label: 'Datum', sortable: true, type: 'date' },
        { key: 'type_melding', label: 'Type Melding', sortable: true, type: 'string' },
        { key: 'prijs_op_moment', label: 'Prijs', sortable: true, type: 'number' },
        { key: 'signal_line_value', label: 'Signal Line', sortable: true, type: 'number' },
        { key: 'trade_amount', label: 'Aanbevolen Bedrag', sortable: true, type: 'number' },
    ], []);

    const fetchAlerts = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                page: 1,
                limit: 2000 // Haal voldoende alerts op voor client-side filtering
            };
            if (debouncedTickerFilter) {
                params.ticker = debouncedTickerFilter;
            }
            if (alertTypeFilter) {
                params.type = alertTypeFilter;
            }

            const response = await http.get('/alerts', { params });

            if (response.data && Array.isArray(response.data.alerts)) {
                setAllAlerts(response.data.alerts);
            } else {
                setAllAlerts([]);
            }
            setError('');
        } catch (err) {
            setError('Kon de meldingen niet laden.');
            console.error('Error fetching alerts:', err);
        } finally {
            setLoading(false);
        }
    }, [debouncedTickerFilter, alertTypeFilter]);

    // Fetch calculation summary to compute percentages (weighting)
    const fetchCalculationContext = useCallback(async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const response = await http.get('/calculations/summary-by-date', {
                params: { date: today }
            });
            const data = response.data;
            
            const totalWaardeVerdeling = data
                .filter(item => item.waarde_verdeling > 0 && item.selectiecriteria === 5)
                .reduce((sum, item) => sum + item.waarde_verdeling, 0);

            const mapping = {};
            const score5Ids = new Set();

            data.forEach(item => {
                const percentage = totalWaardeVerdeling > 0 && item.waarde_verdeling > 0 && item.selectiecriteria === 5
                    ? (item.waarde_verdeling / totalWaardeVerdeling) * 100
                    : 0;
                mapping[item.stock_id] = percentage;
                
                if (item.selectiecriteria === 5) {
                    score5Ids.add(item.stock_id);
                }
            });
            setCalculationData(mapping);
            setScore5Stocks(score5Ids);
            setIsContextLoaded(true);
        } catch (err) {
            console.error("Error fetching calculation context for alerts", err);
        }
    }, []);

    useEffect(() => {
        fetchAlerts(); 
        fetchCalculationContext();
    }, [fetchAlerts, fetchCalculationContext]);

    useImperativeHandle(ref, () => ({
        refreshData: () => fetchAlerts()
    }));

    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
    };

    const handleSort = (key) => {
        const column = ALL_COLUMNS.find(col => col.key === key);
        if (!column || !column.sortable) return;

        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortArrow = (key) => {
        if (sortConfig.key === key) {
            return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
        }
        return '';
    };

    const filteredAndSortedData = useMemo(() => {
        // Filter: Toon alleen alerts van aandelen met score 5
        let currentData = allAlerts.filter(item => {
            // Check of aandeel score 5 heeft
            if (!score5Stocks.has(item.aandeel_id)) return false;
            
            // STRATEGIE KOPEN: Verberg Koopsignalen als de signal line >= 0 is
            if (item.type_melding === 'Koopsignaal' && item.signal_line_value >= 0) return false;

            // STRATEGIE VERKOPEN: Verkoopsignalen komen nu uit DB (via calculationController)
            // We filteren eventuele oude signalen die nog een signal_line_value hebben (de nieuwe hebben NULL)
            if (item.type_melding === 'Verkoopsignaal' && item.signal_line_value != null) return false;

            // Filter: Percentage (Q)
            if (percentageFilter === 'gt0') {
                const val = item.diff_percentage;
                if (val === null || val === undefined || val <= 0) return false;
            } else if (percentageFilter === 'lt0') {
                const val = item.diff_percentage;
                if (val === null || val === undefined || val >= 0) return false;
            }

            return true;
        });

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
    }, [allAlerts, score5Stocks, sortConfig, ALL_COLUMNS, percentageFilter]);

    const itemsPerPage = 10;
    const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage);
    const paginatedData = filteredAndSortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if (error) {
        return <p className="text-red-500">{error}</p>;
    }

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
            <div className="overflow-x-auto">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Overzicht Meldingen</h3>
                <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                     <div>
                        <label htmlFor="tickerFilter" className="block text-sm font-semibold text-gray-700 mb-1">Filter Aandeel:</label>
                        <input
                            type="text"
                            id="tickerFilter"
                            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2"
                            placeholder="Zoek op Ticker"
                            value={tickerFilter}
                            onChange={(e) => setTickerFilter(e.target.value)}
                        />
                    </div>
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

                {loading || !isContextLoaded ? (
                     <p className="text-gray-500">Meldingen worden geladen...</p>
                ) : (
                <>
                    <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                {ALL_COLUMNS.map(col => (
                                    <th 
                                        key={col.key}
                                        className={`px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                                        onClick={() => col.sortable && handleSort(col.key)}
                                    >
                                        {col.label}{col.sortable ? getSortArrow(col.key) : ''}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {paginatedData.length === 0 ? (
                                <tr>
                                    <td colSpan={ALL_COLUMNS.length} className="p-4 text-center text-gray-500">
                                        Geen meldingen gevonden voor de geselecteerde filters (Score 5).
                                    </td>
                                </tr>
                            ) : (
                                paginatedData.map((item) => {
                                    const renderCell = (col) => {
                                        const value = item[col.key];
                                        switch (col.key) {
                                            case 'name':
                                                return `${item.name} (${item.ticker_symbol})`;
                                            case 'prijs_op_moment':
                                                return value != null ? `€${Number(value).toFixed(2)}` : 'N/A';
                                            case 'trade_amount':
                                                if (item.type_melding === 'Verkoopsignaal') {
                                                    const pct = value * 100;
                                                    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{pct.toFixed(2)}%</span>;
                                                }
                                                // Apply weighting logic consistent with CalculationsSummaryTable
                                                const percentage = calculationData[item.aandeel_id] || 0;
                                                const adjustedValue = value != null ? value * (percentage / 100) / 10 : null;
                                                return adjustedValue != null ? `€${Number(adjustedValue).toFixed(2)}` : 'N/A';
                                            case 'date':
                                                return value ? new Date(value).toLocaleDateString() : 'N/A';
                                            case 'signal_line_value':
                                                return value != null ? Number(value).toFixed(4) : 'N/A';
                                            case 'type_melding':
                                                const typeClass = value === 'Koopsignaal' ? 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800' : value === 'Verkoopsignaal' ? 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800' : '';
                                                return <span className={typeClass}>{value}</span>;
                                            default:
                                                return value || 'N/A';
                                        }
                                    };
                                    
                                    return (
                                        <tr key={item.alert_id} className="hover:bg-gray-50 transition-colors duration-150">
                                            {ALL_COLUMNS.map(col => (
                                                <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                    {renderCell(col)}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                    <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
                </>
                )}
            </div>
        </div>
    );
});

export default AlertsSummaryTable;

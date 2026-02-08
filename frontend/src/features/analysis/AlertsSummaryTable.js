import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
                Vorige
            </button>
            <span className="text-sm text-gray-700">
                Pagina {currentPage} van {totalPages}
            </span>
            <button
                onClick={handleNext}
                disabled={currentPage === totalPages}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
                Volgende
            </button>
        </div>
    );
};


const AlertsSummaryTable = () => {
    const [alertsData, setAlertsData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // --- State for pagination ---
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);

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

    const fetchAlerts = useCallback(async (page) => {
        try {
            setLoading(true);
            const params = {
                page: page,
                limit: 10
            };
            if (debouncedTickerFilter) {
                params.ticker = debouncedTickerFilter;
            }
            if (alertTypeFilter) {
                params.type = alertTypeFilter;
            }

            const response = await http.get('/alerts', { params });

            if (response.data && Array.isArray(response.data.alerts)) {
                setAlertsData(response.data.alerts);
                setTotalPages(response.data.totalPages || 0);
                setCurrentPage(response.data.currentPage || 1);
            } else {
                setAlertsData([]);
                setTotalPages(0);
                setCurrentPage(1);
            }
            setError('');
        } catch (err) {
            setError('Kon de meldingen niet laden.');
            setAlertsData([]);
            setTotalPages(0);
            console.error('Error fetching alerts:', err);
        } finally {
            setLoading(false);
        }
    }, [debouncedTickerFilter, alertTypeFilter]);

    useEffect(() => {
        fetchAlerts(1); // Fetch page 1 when filters change
    }, [fetchAlerts]);

    const handlePageChange = (newPage) => {
        fetchAlerts(newPage);
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

    const sortedData = useMemo(() => {
        let currentData = [...alertsData];

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
    }, [alertsData, sortConfig, ALL_COLUMNS]);

    if (error) {
        return <p className="text-red-500">{error}</p>;
    }

    return (
        <div className="bg-white bg-white border border-gray-200 rounded-xl shadow-sm p-3 mb-4">
            <div className="overflow-x-auto">
                <h3 className="text-lg font-semibold text-gray-800">Overzicht Meldingen</h3>
                <div className="my-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                     <div>
                        <label htmlFor="tickerFilter" className="block text-sm font-medium text-gray-600 mb-1">Filter Aandeel:</label>
                        <input
                            type="text"
                            id="tickerFilter"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            placeholder="Zoek op Ticker"
                            value={tickerFilter}
                            onChange={(e) => setTickerFilter(e.target.value)}
                        />
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

                {loading ? (
                     <p className="text-gray-500">Meldingen worden geladen...</p>
                ) : (
                <>
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                {ALL_COLUMNS.map(col => (
                                    <th 
                                        key={col.key}
                                        className={`p-2 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider ${col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                                        onClick={() => col.sortable && handleSort(col.key)}
                                    >
                                        {col.label}{col.sortable ? getSortArrow(col.key) : ''}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {sortedData.length === 0 ? (
                                <tr>
                                    <td colSpan={ALL_COLUMNS.length} className="p-4 text-center text-gray-500">
                                        Geen meldingen gevonden voor de geselecteerde filters.
                                    </td>
                                </tr>
                            ) : (
                                sortedData.map((item) => {
                                    const renderCell = (col) => {
                                        const value = item[col.key];
                                        switch (col.key) {
                                            case 'name':
                                                return `${item.name} (${item.ticker_symbol})`;
                                            case 'prijs_op_moment':
                                            case 'trade_amount':
                                                return value != null ? `€${Number(value).toFixed(2)}` : 'N/A';
                                            case 'date':
                                                return value ? new Date(value).toLocaleDateString() : 'N/A';
                                            case 'signal_line_value':
                                                return value != null ? Number(value).toFixed(4) : 'N/A';
                                            case 'type_melding':
                                                const typeClass = value === 'Koopsignaal' ? 'text-green-600 font-bold' : value === 'Verkoopsignaal' ? 'text-red-600 font-bold' : '';
                                                return <span className={typeClass}>{value}</span>;
                                            default:
                                                return value || 'N/A';
                                        }
                                    };
                                    
                                    return (
                                        <tr key={item.alert_id}>
                                            {ALL_COLUMNS.map(col => (
                                                <td key={col.key} className="p-2 whitespace-nowrap text-sm text-gray-700">
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
};

export default AlertsSummaryTable;

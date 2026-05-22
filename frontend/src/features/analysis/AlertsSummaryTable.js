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
    const { isCompact = false } = props;
    const [allAlerts, setAllAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [calculationData, setCalculationData] = useState({}); // Store percentages per stock
    const [score5Stocks, setScore5Stocks] = useState(new Set());
    const [isContextLoaded, setIsContextLoaded] = useState(false);
    const [percentageFilter, setPercentageFilter] = useState('gt0');
    
    // --- State for pagination ---
    const [currentPage, setCurrentPage] = useState(1);

    // --- State for sorting and filtering ---
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [tickerFilter, setTickerFilter] = useState('');
    const [debouncedTickerFilter] = useDebounce(tickerFilter, 500);
    const [alertTypeFilter, setAlertTypeFilter] = useState('');

    // --- State for hover popup ---
    const [hoveredAlert, setHoveredAlert] = useState(null);
    const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });

    const ALL_COLUMNS = useMemo(() => [
        { key: 'name', label: 'Aandeel', sortable: true, type: 'string' },
        { key: 'date', label: 'Datum', sortable: true, type: 'date' },
        { key: 'type_melding', label: 'Type Melding', sortable: true, type: 'string' },
        { key: 'prijs_op_moment', label: 'Prijs', sortable: true, type: 'number' },
        { key: 'signal_line_value', label: 'Signal Line', sortable: true, type: 'number' },
        { key: 'trade_amount', label: 'Aanb. Bedrag', sortable: true, type: 'number' },
    ], []);

    const visibleColumns = useMemo(() => {
        if (isCompact) {
            return ALL_COLUMNS.filter(col => ['name', 'date', 'type_melding', 'trade_amount'].includes(col.key));
        }
        return ALL_COLUMNS;
    }, [isCompact, ALL_COLUMNS]);

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
            const [response, holdingsResponse] = await Promise.all([
                http.get('/calculations/summary-by-date', {
                    params: { date: today }
                }),
                http.get('/portfolio/holdings?userId=1')
            ]);
            const data = response.data;
            const holdings = holdingsResponse.data;
            const totalActualValue = holdings.reduce((sum, item) => sum + (item.value || 0), 0);
            
            const totalWaardeVerdeling = data
                .filter(item => item.waarde_verdeling > 0 && item.selectiecriteria === 5)
                .reduce((sum, item) => sum + item.waarde_verdeling, 0);

            const mapping = {};
            const score5Ids = new Set();

            data.forEach(item => {
                const percentage = totalWaardeVerdeling > 0 && item.waarde_verdeling > 0 && item.selectiecriteria === 5
                    ? (item.waarde_verdeling / totalWaardeVerdeling) * 100
                    : 0;
                
                const ideal_invested = (percentage / 100) * totalActualValue;
                const holding = holdings.find(h => h.ticker === item.ticker_symbol);
                const actual_invested = holding ? (holding.value || 0) : 0;
                const weight_factor = actual_invested === 0 ? 2 : Math.min(2, ideal_invested / actual_invested);
                mapping[item.stock_id] = { percentage, weight_factor };
                
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

    const handleMouseEnterAmount = (e, item) => {
        const rect = e.target.getBoundingClientRect();
        const popupWidth = 320;
        const windowWidth = window.innerWidth;

        // Centreer de popup horizontaal ten opzichte van het element
        let xPos = rect.left + (rect.width / 2) - (popupWidth / 2);

        // Zorg dat de popup binnen het scherm blijft
        if (xPos + popupWidth > windowWidth - 10) {
            xPos = windowWidth - popupWidth - 10;
        }
        if (xPos < 10) xPos = 10;

        setPopupPosition({
            x: xPos,
            y: rect.top + window.scrollY - 50
        });
        setHoveredAlert(item);
    };

    const handleMouseLeaveAmount = () => {
        setHoveredAlert(null);
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
            // Verkoopsignalen altijd tonen (negeer deze filter)
            if (item.type_melding !== 'Verkoopsignaal') {
                if (percentageFilter === 'gt0') {
                    const val = item.diff_percentage;
                    if (val === null || val === undefined || val <= 0) return false;
                } else if (percentageFilter === 'lt0') {
                    const val = item.diff_percentage;
                    if (val === null || val === undefined || val >= 0) return false;
                }
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
        <div className={isCompact ? "h-full flex flex-col" : "bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6"}>
            <div className="overflow-x-auto flex-grow">
                {!isCompact && <h3 className="text-xl font-bold text-gray-800 mb-4">Overzicht Meldingen</h3>}
                {!isCompact && (
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
                )}

                {loading || !isContextLoaded ? (
                     <p className="text-gray-500">Meldingen worden geladen...</p>
                ) : (
                <>
                    <table className={`min-w-full divide-y divide-gray-200 ${!isCompact ? 'border border-gray-200 rounded-lg overflow-hidden' : ''}`}>
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                {visibleColumns.map(col => (
                                    <th 
                                        key={col.key}
                                        className={`${isCompact ? 'px-1 py-1 text-[10px]' : 'px-3 py-2 text-xs'} text-left font-semibold text-gray-500 uppercase tracking-wider ${col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''}`}
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
                                    <td colSpan={visibleColumns.length} className="p-4 text-center text-gray-500">
                                        Geen meldingen gevonden voor de geselecteerde filters (Score 5).
                                    </td>
                                </tr>
                            ) : (
                                paginatedData.map((item) => {
                                    const renderCell = (col) => {
                                        const value = item[col.key];
                                        const badgeBase = isCompact 
                                            ? 'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium' 
                                            : 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';

                                        switch (col.key) {
                                            case 'name':
                                                return isCompact ? item.ticker_symbol : `${item.name} (${item.ticker_symbol})`;
                                            case 'prijs_op_moment':
                                                return value != null ? `€${Number(value).toFixed(2)}` : 'N/A';
                                            case 'trade_amount':
                                                if (item.type_melding === 'Verkoopsignaal') {
                                                    const pct = value * 100;
                                                    return <span className={`${badgeBase} bg-red-100 text-red-800`}>{pct.toFixed(2)}%</span>;
                                                }
                                                // Apply weighting logic consistent with CalculationsSummaryTable
                                                const calcContext = calculationData[item.aandeel_id] || { percentage: 0, weight_factor: 1 };
                                                const adjustedValue = value != null ? value * (calcContext.percentage / 100) / 10 * calcContext.weight_factor : null;
                                                return (
                                                    <div 
                                                        className="cursor-help underline decoration-dotted decoration-gray-400"
                                                        onMouseEnter={(e) => handleMouseEnterAmount(e, item)}
                                                        onMouseLeave={handleMouseLeaveAmount}
                                                    >
                                                        {adjustedValue != null ? `€${Number(adjustedValue).toFixed(2)}` : 'N/A'}
                                                    </div>
                                                );
                                            case 'date':
                                                return value ? new Date(value).toLocaleDateString() : 'N/A';
                                            case 'signal_line_value':
                                                return value != null ? Number(value).toFixed(4) : 'N/A';
                                            case 'type_melding':
                                                const typeClass = value === 'Koopsignaal' ? `${badgeBase} bg-green-100 text-green-800` : value === 'Verkoopsignaal' ? `${badgeBase} bg-red-100 text-red-800` : '';
                                                return <span className={typeClass}>{value}</span>;
                                            default:
                                                return value || 'N/A';
                                        }
                                    };
                                    
                                    return (
                                        <tr key={item.alert_id} className="hover:bg-gray-50 transition-colors duration-150">
                                            {visibleColumns.map(col => (
                                                <td key={col.key} className={`${isCompact ? 'px-1 py-1 text-[10px]' : 'px-3 py-2 text-xs'} whitespace-nowrap text-gray-700`}>
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
            {hoveredAlert && (
                <div 
                    style={{
                        position: 'absolute',
                        left: popupPosition.x,
                        top: popupPosition.y,
                        zIndex: 1000,
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '12px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        width: '320px',
                        pointerEvents: 'none'
                    }}
                >
                    <h4 className="font-bold text-gray-800 mb-2 border-b pb-1">Berekening Aanbevolen Bedrag</h4>
                    
                    {hoveredAlert.type_melding === 'Koopsignaal' && (
                        <div className="mb-3 pb-2 border-b border-gray-100">
                            <h5 className="font-semibold text-gray-700 text-xs mb-1">1. Basis Bedrag (Backend)</h5>
                            <div className="text-xs text-gray-600 space-y-1">
                                <div className="flex justify-between">
                                    <span>Signaal Lijn:</span>
                                    <span className="font-mono">{Number(hoveredAlert.signal_line_value).toFixed(4)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Prijs:</span>
                                    <span className="font-mono">€{Number(hoveredAlert.prijs_op_moment).toFixed(2)}</span>
                                </div>
                                <div className="mt-1 text-[10px] text-gray-400 italic">
                                    Formule: Saldo * (1 + (-Signal / Prijs) * 4)
                                </div>
                                <div className="flex justify-between font-semibold text-gray-700 mt-1">
                                    <span>Basis Resultaat:</span>
                                    <span className="font-mono">€{Number(hoveredAlert.trade_amount).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <h5 className="font-semibold text-gray-700 text-xs mb-1">
                            {hoveredAlert.type_melding === 'Koopsignaal' ? '2. Weging & Eindresultaat' : 'Berekening'}
                        </h5>
                        <div className="text-xs text-gray-600 space-y-1">
                            <div className="flex justify-between">
                                <span>Basis Bedrag:</span>
                                <span className="font-mono">€{Number(hoveredAlert.trade_amount).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Weging (Score 5):</span>
                                <span className="font-mono">{(calculationData[hoveredAlert.aandeel_id]?.percentage || 0).toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Extra Weging (Ideaal/Huidig):</span>
                                <span className="font-mono">x{(calculationData[hoveredAlert.aandeel_id]?.weight_factor || 1).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between border-t pt-1 mt-1 font-semibold text-gray-800">
                                <span>Eindresultaat:</span>
                                <span className="font-mono">
                                    €{Number(hoveredAlert.trade_amount * ((calculationData[hoveredAlert.aandeel_id]?.percentage || 0) / 100) / 10 * (calculationData[hoveredAlert.aandeel_id]?.weight_factor || 1)).toFixed(2)}
                                </span>
                            </div>
                            <div className="mt-2 text-[10px] text-gray-400 italic">
                                Formule: Basis * (Weging / 100) / 10 * Extra Weging
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default AlertsSummaryTable;

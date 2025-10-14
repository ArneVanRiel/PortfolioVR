import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../http-common';

const CalculationsSummaryTable = () => {
    const navigate = useNavigate();
    const [summaryData, setSummaryData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        const fetchSummary = async () => {
            try {
                setLoading(true);
                const response = await http.get('/calculations/summary-by-date', {
                    params: { date: selectedDate }
                });
                const sortedData = response.data.sort((a, b) => b.waarde_verdeling - a.waarde_verdeling);
                setSummaryData(sortedData);
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

    const totalWaardeVerdeling = summaryData
        .filter(item => item.waarde_verdeling > 0)
        .reduce((sum, item) => sum + item.waarde_verdeling, 0);

    if (loading) {
        return <p className="text-gray-500">Overzichtstabel wordt geladen...</p>;
    }

    if (error) {
        return <p className="text-red-500">{error}</p>;
    }

    return (
        <div className="bg-white bg-white border border-gray-200 rounded-xl shadow-sm p-3 mb-4">
            <div className="overflow-x-auto">
                <h3 className="text-lg font-semibold text-gray-800">Overzicht Berekeningen</h3>
                <div className="mb-4">
                    <label htmlFor="date-picker" className="block text-sm font-medium text-gray-700">Selecteer een datum</label>
                    <input
                        type="date"
                        id="date-picker"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    />
                </div>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="p-2 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Aandeel</th>
                            <th className="p-2 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Waardeverdeling</th>
                            <th className="p-2 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Percentage</th>
                            <th className="p-2 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Intrinsieke Waarde</th>
                            <th className="p-2 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Period End Date</th>
                            <th className="p-2 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Actie</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {summaryData.map((item) => {
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
                                    return 'bg-orange-100';
                                } else if (monthsDiff >= 4) {
                                    return 'bg-yellow-100';
                                }
                                return '';
                            };

                            const highlightClass = getHighlightClass(item.period_end_date, selectedDate);

                            return (
                                <tr key={item.calculation_id} >
                                    <td className="p-2 whitespace-nowrap text-sm font-medium text-gray-900">{item.name} ({item.ticker_symbol})</td>
                                    <td className="p-2 whitespace-nowrap text-sm text-gray-500">{item.waarde_verdeling?.toFixed(2)}
                                        {diffPercentage !== null && (
                                            <span className={diffPercentage >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                {diffPercentage > 0 ? '+' : ''}{diffPercentage.toFixed(2)}%
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-2 whitespace-nowrap text-sm text-gray-500">{percentage.toFixed(2)}%</td>
                                    <td className="p-2 whitespace-nowrap text-sm text-gray-500">{item.intrinsieke_waarde?.toFixed(2)}</td>
                                    <td className={highlightClass}>{new Date(item.period_end_date).toLocaleDateString()}</td>
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
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default CalculationsSummaryTable;
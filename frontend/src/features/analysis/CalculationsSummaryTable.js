import React, { useState, useEffect } from 'react';
import http from '../../http-common';

const CalculationsSummaryTable = () => {
    const [summaryData, setSummaryData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchSummary = async () => {
            try {
                setLoading(true);
                const response = await http.get('/calculations/latest-summary');
                // Sorteer de data van hoogste naar laagste waardeverdeling
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
    }, []);

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
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Overzicht Laatste Berekeningen</h3>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aandeel</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waardeverdeling</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Verschil Max</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Percentage</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Intrinsieke Waarde</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Berekeningsdatum</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {summaryData.map((item) => {
                            const percentage = totalWaardeVerdeling > 0 && item.waarde_verdeling > 0
                                ? (item.waarde_verdeling / totalWaardeVerdeling) * 100
                                : 0;

                            let diffPercentage = null;
                            if (item.num_calculations > 1 && item.max_waarde_verdeling) {
                                diffPercentage = (item.waarde_verdeling / item.max_waarde_verdeling - 1) * 100;
                            }

                            return (
                                <tr key={item.ticker_symbol}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name} ({item.ticker_symbol})</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.waarde_verdeling?.toFixed(2)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {diffPercentage !== null && (
                                            <span className={`${diffPercentage >= -0.001 ? 'text-green-600' : 'text-red-600'}`}>
                                                {diffPercentage >= -0.001 ? '+' : ''}{diffPercentage.toFixed(2)}%
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{percentage.toFixed(2)}%</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.intrinsieke_waarde?.toFixed(2)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(item.calculation_date).toLocaleDateString()}</td>
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
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../http-common';

const IncompleteDataWidget = () => {
    const [incompleteStocks, setIncompleteStocks] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchCompleteness = async () => {
            try {
                // Definieer de vereiste periodes zoals in Analysis.js
                const dataPeriods = {
                    StockholdersEquity: 44 * 3,
                    NetCashProvidedByUsedInOperatingActivities: 44 * 3,
                    PurchasesOfPropertyAndEquipment: 44 * 3,
                    LiabilitiesCurrent: 8 * 3,
                    Liabilities: 8 * 3,
                    NetIncomeLoss: 44 * 3,
                    WeightedAverageNumberOfDilutedSharesOutstanding: 8 * 3,
                };
                const MAX_LOOKBACK_MONTHS = Math.max(...Object.values(dataPeriods));
                const today = new Date().toISOString().split('T')[0];

                const response = await http.post('/fundamental-data/ticker-overview', {
                    dataPeriods,
                    selectedDate: today,
                    maxLookbackMonths: MAX_LOOKBACK_MONTHS
                });

                // Filter aandelen die niet 100% compleet zijn
                const incomplete = response.data.filter(stock => stock.overallCompletenessPercentage < 100);
                // Sorteer van laagste compleetheid naar hoogste
                incomplete.sort((a, b) => a.overallCompletenessPercentage - b.overallCompletenessPercentage);
                
                setIncompleteStocks(incomplete);
            } catch (error) {
                console.error("Fout bij ophalen completeness data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchCompleteness();
    }, []);

    if (loading) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Ontbrekende Data</h3>
                <div className="flex justify-center p-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-800">Data Updaten Nodig</h3>
                <span className={`${incompleteStocks.length > 0 ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'} text-xs font-bold px-2.5 py-1 rounded-full`}>{incompleteStocks.length} aandelen</span>
            </div>
            
            {incompleteStocks.length === 0 ? (
                <div className="bg-green-50 text-green-700 p-4 rounded-lg flex items-center">
                    <i className="ph-fill ph-check-circle text-xl mr-2"></i>
                    <span className="text-sm font-medium">Alle aandelen in je watchlist en portfolio zijn 100% up-to-date!</span>
                </div>
            ) : (
                <p className="text-sm text-gray-500 mb-4">De volgende aandelen hebben geen volledige 10-jaar historie. Klik op een aandeel om het aan te vullen.</p>
            )}

            <div className="overflow-y-auto flex-grow pr-2 space-y-2 max-h-80 hide-scrollbar">
                {incompleteStocks.map(stock => (
                    <div key={stock.ticker_symbol} onClick={() => navigate(`/analysis?ticker=${stock.ticker_symbol}`)} className="flex justify-between items-center p-3 border border-gray-100 rounded-lg hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors group">
                        <div className="flex flex-col"><span className="font-bold text-gray-900 group-hover:text-blue-700">{stock.ticker_symbol}</span><span className="text-xs text-gray-500 truncate max-w-[150px]">{stock.name}</span></div>
                        <div className="flex flex-col items-end"><span className="font-bold text-orange-600">{stock.overallCompletenessPercentage.toFixed(0)}%</span>{stock.missingRecentQuarters?.length > 0 && (<span className="text-[10px] text-gray-400">Mist recente Q's</span>)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};
export default IncompleteDataWidget;
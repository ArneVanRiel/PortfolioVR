import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import http from '../../http-common';

// Zorg dat deze bestandsnamen exact kloppen (hoofdlettergevoelig)
import StockList from './StockList';
import AnalysisDataTab from './AnalysisDataTab';
import AnalysisCalculationsTab from './AnalysisCalculationsTab';
import AnalysisChartTab from './AnalysisChartTab';
import AnalysisAlertsTab from './AnalysisAlertsTab'; // NIEUW: Importeer de alerts tab
import AnalysisCalculationsChart from './AnalysisCalculationsChart'; // NIEUW: Importeer de calculaties grafiek
import SearchSecFields from './searchSecFields';

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

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const Analysis = () => {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('data');

  // State for all stocks analysis (used in StockList)
  const [allAnalyses, setAllAnalyses] = useState({});
  const [isAllAnalysesLoading, setIsAllAnalysesLoading] = useState(false);
  const [latestCalculationsMap, setLatestCalculationsMap] = useState({});

  const { stockId: urlStockId, tab: urlTab } = useParams();

  useEffect(() => {
    if (urlStockId && stocks.length > 0) {
      const stockToSelect = stocks.find(s => s.stock_id === parseInt(urlStockId));
      if (stockToSelect) {
        setSelectedStock(stockToSelect);
      }
    }
    if (urlTab) {
      setActiveTab(urlTab);
    }
  }, [urlStockId, urlTab, stocks]);

  const fetchStocks = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await http.get(`/stocks`);
      setStocks(response.data);
    } catch (err) {
      setError('Could not load stocks.');
      console.error('Error fetching stocks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLatestCalculations = useCallback(async () => {
    try {
      const response = await http.get('/calculations/latest-summary');
      const map = {};
      response.data.forEach(calc => {
        map[calc.stock_id] = calc;
      });
      setLatestCalculationsMap(map);
    } catch (err) {
      console.error('Error fetching latest calculations:', err);
    }
  }, []);

  const fetchAllStocksAnalysis = useCallback(async (stocksToAnalyze) => {
    if (stocksToAnalyze.length === 0) return;
    setIsAllAnalysesLoading(true);
    try {
      const analysisPromises = stocksToAnalyze.map(stock =>
        http.post(`/fundamental-data/single-stock-analysis/${stock.stock_id}`, {
          dataPeriods: dataPeriods,
          selectedDate: formatDate(new Date()),
          maxLookbackMonths: MAX_LOOKBACK_MONTHS
        }).then(response => ({
          stock_id: stock.stock_id,
          data: response.data
        })).catch(error => ({
          stock_id: stock.stock_id,
          error: true
        }))
      );
      const results = await Promise.all(analysisPromises);
      const newAnalyses = results.reduce((acc, result) => {
        if (!result.error) {
          acc[result.stock_id] = result.data;
        }
        return acc;
      }, {});
      setAllAnalyses(newAnalyses);
    } catch (err) {
      console.error('An unexpected error occurred during fetchAllStocksAnalysis:', err);
    } finally {
      setIsAllAnalysesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStocks();
    fetchLatestCalculations();
  }, [fetchStocks, fetchLatestCalculations]);

  useEffect(() => {
    if (stocks.length > 0) {
      fetchAllStocksAnalysis(stocks);
    }
  }, [stocks, fetchAllStocksAnalysis]);

  const handleStockChange = (stock) => {
    setSelectedStock(stock);
  };

  const handleDataUpdate = () => {
      if (selectedStock) {
          http.post(`/fundamental-data/single-stock-analysis/${selectedStock.stock_id}`, {
            dataPeriods: dataPeriods,
            selectedDate: formatDate(new Date()),
            maxLookbackMonths: MAX_LOOKBACK_MONTHS
          }).then(response => {
              setAllAnalyses(prev => ({...prev, [selectedStock.stock_id]: response.data}));
          });
      }
  };

  const handleCalculationsUpdate = () => {
      fetchLatestCalculations();
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-gray-50/50">
      <StockList
        stocks={stocks}
        selectedStock={selectedStock}
        handleStockChange={handleStockChange}
        allAnalyses={allAnalyses}
        isAllAnalysesLoading={isAllAnalysesLoading}
        loading={loading}
        latestCalculationsMap={latestCalculationsMap}
      />

      <div className="flex-1 p-8 space-y-6 overflow-y-auto">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800">
            {selectedStock ? `${selectedStock.name} (${selectedStock.ticker})` : 'Analysis'}
          </h1>
        </div>
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">{error}</div>}

        {selectedStock ? (
          <>
            <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-200 inline-flex">
              <nav className="flex space-x-1" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('data')}
                  className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'data'
                      ? 'bg-blue-50 text-blue-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  Data Toevoegen
                </button>
                <button
                  onClick={() => setActiveTab('calculations')}
                  className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'calculations'
                      ? 'bg-blue-50 text-blue-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  Berekeningen
                </button>
                <button
                  onClick={() => setActiveTab('Analyse')}
                  className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'Analyse'
                      ? 'bg-blue-50 text-blue-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  Analyse
                </button>
                <button
                  onClick={() => setActiveTab('SecFields')}
                  className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'SecFields'
                      ? 'bg-blue-50 text-blue-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  Zoek Sec velden
                </button>
              </nav>
            </div>

            <div className="mt-6">
              {activeTab === 'data' && (
                <AnalysisDataTab 
                    selectedStock={selectedStock} 
                    onDataUpdate={handleDataUpdate} 
                />
              )}
              {activeTab === 'calculations' && (
                <AnalysisCalculationsTab 
                    selectedStock={selectedStock} 
                    onCalculationsUpdate={handleCalculationsUpdate}
                />
              )}
              {activeTab === 'Analyse' && (
                <div className="space-y-6">
                    <AnalysisChartTab selectedStock={selectedStock} />
                    <AnalysisCalculationsChart selectedStock={selectedStock} />
                    <AnalysisAlertsTab selectedStock={selectedStock} />
                </div>
              )}
              {activeTab === 'SecFields' && (
                <div className="mt-6">
                  <SearchSecFields />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
            <p className="text-lg font-medium">Selecteer een aandeel uit de lijst om de analyse te starten.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Analysis;

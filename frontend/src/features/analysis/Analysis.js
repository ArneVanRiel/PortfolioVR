import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import http from '../../http-common';

// Zorg dat deze bestandsnamen exact kloppen (hoofdlettergevoelig)
import StockList from './StockList';
import AnalysisDataTab from './AnalysisDataTab';
import AnalysisCalculationsTab from './AnalysisCalculationsTab';
import AnalysisChartTab from './AnalysisChartTab';
import AnalysisAlertsTab from './AnalysisAlertsTab'; // NIEUW: Importeer de alerts tab
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
    <div className="flex h-full">
      <StockList
        stocks={stocks}
        selectedStock={selectedStock}
        handleStockChange={handleStockChange}
        allAnalyses={allAnalyses}
        isAllAnalysesLoading={isAllAnalysesLoading}
        loading={loading}
        latestCalculationsMap={latestCalculationsMap}
      />

      <div className="w-3/4 p-8 space-y-8 overflow-y-auto">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800">
            {selectedStock ? `${selectedStock.name} (${selectedStock.ticker})` : 'Analysis'}
          </h1>
        </div>
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">{error}</div>}

        {selectedStock ? (
          <>
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('data')}
                  className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'data'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  Data Toevoegen
                </button>
                <button
                  onClick={() => setActiveTab('calculations')}
                  className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'calculations'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  Berekeningen
                </button>
                <button
                  onClick={() => setActiveTab('Analyse')}
                  className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'Analyse'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  Analyse
                </button>
                <button
                  onClick={() => setActiveTab('SecFields')}
                  className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'SecFields'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  Zoek Sec velden
                </button>
              </nav>
            </div>

            <div className="mt-8">
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
          <div className="text-center text-gray-500">Select a stock to see the analysis.</div>
        )}
      </div>
    </div>
  );
};

export default Analysis;

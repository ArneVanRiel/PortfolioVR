import React, { useState, useEffect } from 'react';
import http from '../../http-common';
import Modal from '../../components/ui/modal';
import SecImporter from './SecImporter';
import FundamentalDataForm from './FundamentalDataForm';

const Analysis = () => {
  const [stocks, setStocks] = useState([]);
  const [isLoadingStocks, setIsLoadingStocks] = useState(true);
  const [selectedStock, setSelectedStock] = useState(null);
  const [fundamentalData, setFundamentalData] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataCompleteness, setDataCompleteness] = useState(null);
  const [isCheckingCompleteness, setIsCheckingCompleteness] = useState(false);
  const [isSecImporterOpen, setIsSecImporterOpen] = useState(false);
  const [isFundamentalDataFormOpen, setIsFundamentalDataFormOpen] = useState(false);

  useEffect(() => {
    const fetchStocks = async () => {
      setIsLoadingStocks(true);
      try {
        const response = await http.get('/stocks');
        setStocks(response.data);
      } catch (error) {
        console.error("Error fetching stocks:", error);
        setStocks([]);
      }
      setIsLoadingStocks(false);
    };

    fetchStocks();
  }, []);

  useEffect(() => {
    setDataCompleteness(null);
    const fetchFundamentalData = async () => {
      if (selectedStock) {
        setIsLoadingData(true);
        try {
          const response = await http.get(`/fundamental-data/stock/${selectedStock.stock_id}/all-periods`);
          setFundamentalData(response.data);
        } catch (error) {
          console.error("Error fetching fundamental data:", error);
          setFundamentalData([]);
        }
        setIsLoadingData(false);
      }
    };

    fetchFundamentalData();
  }, [selectedStock]);

  const handleCheckCompleteness = async () => {
    if (!selectedStock) return;
    setIsCheckingCompleteness(true);
    try {
      const response = await http.get(`/fundamental-data/sufficiency-check/${selectedStock.stock_id}`);
      setDataCompleteness(response.data);
    } catch (error) {
      console.error("Error checking data completeness:", error);
      setDataCompleteness(null);
    }
    setIsCheckingCompleteness(false);
  };

  const renderCompletenessSection = () => {
    if (isCheckingCompleteness) {
      return <div className="text-center text-gray-500 mt-4">Checking completeness...</div>;
    }

    if (!dataCompleteness) {
      return null;
    }

    return (
      <div className="bg-white p-6 rounded-lg shadow-md mt-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Data Completeness</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(dataCompleteness).map(([key, value]) => (
            <div key={key} className={`p-4 rounded-lg ${value.sufficient ? 'bg-green-100' : 'bg-red-100'}`}>
              <p className="font-semibold text-gray-700">{key}</p>
              <p className="text-sm text-gray-600">Found: {value.count} quarters</p>
              <p className={`text-sm font-bold ${value.sufficient ? 'text-green-700' : 'text-red-700'}`}>
                {value.sufficient ? 'Sufficient' : 'Insufficient'}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMainContent = () => {
    if (!selectedStock) {
      return <div className="text-center text-gray-500">Select a stock to see the analysis.</div>;
    }

    if (isLoadingData) {
      return <div className="text-center text-gray-500">Loading data...</div>;
    }

    return (
      <>
        {fundamentalData.length > 0 ? (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Fundamental Data</h3>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period End Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {fundamentalData.map((data, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{data.data_type}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(data.period_end_date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{data.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center text-gray-500">No fundamental data found for this stock.</div>
        )}
        {renderCompletenessSection()}
      </>
    );
  };

  return (
    <div className="flex h-full">
      {/* Sidebar for Ticker List */}
      <div className="w-1/4 bg-white border-r border-gray-200 p-4">
        <div className="flex items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Securities</h2>
          <button className="ml-auto bg-blue-600 text-white p-1 rounded-full shadow hover:bg-blue-700 transition-colors">
            Search
          </button>
        </div>
        <div className="space-y-2">
          {isLoadingStocks ? (
            <p className="text-gray-500">Loading stocks...</p>
          ) : stocks.length > 0 ? (
            <ul>
              {stocks.map((stock) => (
                <li 
                  key={stock.ticker}
                  className={`p-2 rounded-lg cursor-pointer ${selectedStock && selectedStock.ticker === stock.ticker ? 'bg-blue-100 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
                  onClick={() => setSelectedStock(stock)}
                >
                  {stock.ticker}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No stocks found.</p>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-3/4 p-8 space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800">
            {selectedStock ? `${selectedStock.name} (${selectedStock.ticker})` : 'Analysis'}
          </h1>
          {selectedStock && (
            <div className="flex space-x-2">
              <button 
                onClick={handleCheckCompleteness} 
                className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition-colors"
              >
                Check Data Completeness
              </button>
              <button 
                onClick={() => setIsSecImporterOpen(true)} 
                className="bg-purple-600 text-white px-4 py-2 rounded-lg shadow hover:bg-purple-700 transition-colors"
              >
                Import from SEC
              </button>
              <button 
                onClick={() => setIsFundamentalDataFormOpen(true)} 
                className="bg-yellow-600 text-white px-4 py-2 rounded-lg shadow hover:bg-yellow-700 transition-colors"
              >
                Add Manual Data
              </button>
              <button className="bg-green-600 text-white px-4 py-2 rounded-lg shadow hover:bg-green-700 transition-colors">
                Save Analysis
              </button>
            </div>
          )}
        </div>
        {renderMainContent()}
      </div>

      <Modal isOpen={isSecImporterOpen} onClose={() => setIsSecImporterOpen(false)}>
        <SecImporter />
      </Modal>

      {selectedStock && (
        <Modal isOpen={isFundamentalDataFormOpen} onClose={() => setIsFundamentalDataFormOpen(false)}>
          <FundamentalDataForm stock={selectedStock} onClose={() => setIsFundamentalDataFormOpen(false)} />
        </Modal>
      )}
    </div>
  );
};

export default Analysis;

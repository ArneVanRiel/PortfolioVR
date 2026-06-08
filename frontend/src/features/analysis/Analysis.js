import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import http from '../../http-common';

// Zorg dat deze bestandsnamen exact kloppen (hoofdlettergevoelig)
import AnalysisDataTab from './AnalysisDataTab';
import AnalysisCalculationsTab from './AnalysisCalculationsTab';
import AnalysisChartTab from './AnalysisChartTab';
import AnalysisAlertsTab from './AnalysisAlertsTab';
import AnalysisCalculationsChart from './AnalysisCalculationsChart';
import AnalysisPortfolioTab from './AnalysisPortfolioTab';
import SearchSecFields from './searchSecFields';

const Analysis = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tickerParam = searchParams.get('ticker');
  
  const [stocks, setStocks] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('Analyse'); // Standaard tab

  const userRole = localStorage.getItem('role') || 'user';
  const isDemo = userRole === 'demo';

  useEffect(() => {
    const fetchStocks = async () => {
      try {
        setLoading(true);
        const response = await http.get(`/stocks`);
        setStocks(response.data);
      } catch (err) {
        setError('Kon aandelen niet laden.');
        console.error('Error fetching stocks:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStocks();
  }, []);

  // Selecteer aandeel automatisch op basis van URL parameter (bijv: ?ticker=AAPL)
  useEffect(() => {
    if (stocks.length > 0 && tickerParam) {
      const stock = stocks.find(s => s.ticker === tickerParam || s.ticker_symbol === tickerParam);
      if (stock) {
        setSelectedStock(stock);
      }
    }
  }, [stocks, tickerParam]);

  const handleStockChange = (stock) => {
    setSelectedStock(stock);
    if (stock) {
      // Update the URL zodat de historie werkt en je de link kan kopiëren
      navigate(`/analysis?ticker=${stock.ticker || stock.ticker_symbol}`);
    } else {
      navigate(`/analysis`);
    }
  };

  const TABS = [
    { id: 'Analyse', label: 'Overzicht & Grafieken', icon: 'ph-chart-line-up' },
    { id: 'portfolio', label: 'Portfolio', icon: 'ph-briefcase' },
    // Voeg Data Beheer enkel toe als het geen demo account is
    ...(!isDemo ? [{ id: 'data', label: 'Data Beheer', icon: 'ph-database' }] : []),
    { id: 'calculations', label: 'Berekeningen', icon: 'ph-calculator' },
    { id: 'SecFields', label: 'SEC Velden Zoeken', icon: 'ph-magnifying-glass' }
  ];

  return (
    <div className="space-y-8 font-sans text-gray-900 bg-gray-50/50 min-h-screen pb-10">
      {/* Top Card: Hero Header + Tabs (Snowball Stijl) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 pb-0">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-6">
            <div>
              <h1 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Aandeel Analyse</h1>
              <div className="flex items-center gap-4">
                <span className="text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tighter">
                  {selectedStock ? (selectedStock.ticker || selectedStock.ticker_symbol) : 'Selecteer Aandeel'}
                </span>
                {selectedStock && (
                  <span className="text-xl font-bold text-gray-400 tracking-tight">
                    {selectedStock.name}
                  </span>
                )}
              </div>
            </div>

            {/* Zoek/Selecteer Dropdown */}
            <div className="w-full md:w-80">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Zoek een aandeel
              </label>
              <div className="relative">
                <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                <select
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all appearance-none cursor-pointer shadow-sm"
                  value={selectedStock?.stock_id || selectedStock?.aandeel_id || ''}
                  onChange={(e) => {
                    const stockId = parseInt(e.target.value);
                    const stock = stocks.find(s => s.stock_id === stockId || s.aandeel_id === stockId);
                    handleStockChange(stock);
                  }}
                >
                  <option value="">-- Typ of selecteer een aandeel --</option>
                  {stocks.sort((a,b) => (a.ticker || a.ticker_symbol).localeCompare(b.ticker || b.ticker_symbol)).map(s => (
                    <option key={s.stock_id || s.aandeel_id} value={s.stock_id || s.aandeel_id}>
                      {s.ticker || s.ticker_symbol} - {s.name}
                    </option>
                  ))}
                </select>
                <i className="ph-fill ph-caret-down absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
              </div>
            </div>
          </div>

          {/* Tab Navigatie */}
          <nav className="flex space-x-6 overflow-x-auto hide-scrollbar" aria-label="Tabs">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                  activeTab === tab.id 
                    ? 'border-blue-600 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className={`ph-fill ${tab.icon} text-lg`}></i>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mx-6 shadow-sm" role="alert">{error}</div>}

      {/* Tab Content */}
      <div className="px-6">
        {selectedStock ? (
          <div className="animate-fade-in">
            {activeTab === 'data' && (
              <AnalysisDataTab selectedStock={selectedStock} />
            )}
            {activeTab === 'calculations' && (
              <AnalysisCalculationsTab selectedStock={selectedStock} />
            )}
            {activeTab === 'Analyse' && (
              <div className="space-y-6">
                  <AnalysisChartTab selectedStock={selectedStock} />
                  <AnalysisCalculationsChart selectedStock={selectedStock} />
                  <AnalysisAlertsTab selectedStock={selectedStock} />
              </div>
            )}
            {activeTab === 'portfolio' && (
              <AnalysisPortfolioTab selectedStock={selectedStock} />
            )}
            {activeTab === 'SecFields' && (
              <SearchSecFields />
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-16 flex flex-col items-center justify-center text-center">
            <i className="ph-fill ph-chart-polar text-6xl text-gray-200 mb-4"></i>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">Geen Aandeel Geselecteerd</h3>
            <p className="text-gray-500 max-w-md">Kies bovenaan een aandeel uit de lijst of gebruik de zoekfunctie in het dashboard om de fundamentele analyse en grafieken te bekijken.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Analysis;

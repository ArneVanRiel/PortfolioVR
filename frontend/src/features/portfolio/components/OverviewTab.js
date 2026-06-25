import React from 'react';
import { Line } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';

const OverviewTab = ({
  history,
  lineData,
  lineOptions,
  processedHoldings,
  holdingsSort,
  handleHoldingsSort,
  getSortIcon,
  formatCurrency,
  formatPercentage,
  isIncognito,
  chartView,
  showTransOnChart,
  setShowTransOnChart,
  holdingsSearch,
  setHoldingsSearch,
  loading
}) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Performance Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[500px]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold text-gray-900">Portfolio Performance</h3>
          <div className="flex items-center space-x-3">
            <label className="flex items-center cursor-pointer text-xs font-bold text-gray-500 uppercase tracking-wide bg-gray-50 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <input 
                type="checkbox" 
                className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                checked={showTransOnChart}
                onChange={(e) => setShowTransOnChart(e.target.checked)}
              />
              Toon Transacties
            </label>
          </div>
        </div>
        <div className={`flex-grow relative min-h-0 ${chartView === 'value' ? 'incognito-hide' : ''}`}>
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : history.length > 0 ? (
            <Line data={lineData} options={lineOptions} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
              <i className="ph-fill ph-chart-line-up text-4xl mb-2 opacity-30"></i>
              Bereken eerst je portfolio waarden
            </div>
          )}
        </div>
        {chartView === 'value' && (
          <div className="incognito-show flex-col items-center justify-center h-full text-gray-400 text-sm">
            <i className="ph-fill ph-eye-slash text-4xl mb-2 opacity-30"></i>
            Waardegrafiek verborgen in privacymodus
          </div>
        )}
      </div>

      {/* Holdings Tabel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between items-center p-6 border-b border-gray-100">
          <div className="flex items-center gap-4 mb-4 sm:mb-0">
            <h3 className="text-lg font-bold text-gray-900">Holdings</h3>
            <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full">{processedHoldings.length} Assets</span>
          </div>
          <div className="relative">
            <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input 
              type="text" 
              placeholder="Zoek in holdings..." 
              value={holdingsSearch} 
              onChange={(e) => setHoldingsSearch(e.target.value)} 
              className="pl-9 pr-4 py-2 bg-gray-50 border-none rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64 transition-all"
            />
          </div>
        </div>
      
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" onClick={() => handleHoldingsSort('ticker')}>Asset{getSortIcon(holdingsSort, 'ticker')}</th>
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('price')}>Prijs{getSortIcon(holdingsSort, 'price')}</th>
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('quantity')}>Holdings{getSortIcon(holdingsSort, 'quantity')}</th>
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('total_invested')}>Cost Basis{getSortIcon(holdingsSort, 'total_invested')}</th>
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('gainLoss')}>Winst / Verlies{getSortIcon(holdingsSort, 'gainLoss')}</th>
                </tr>
              </thead>
              <tbody>
                {processedHoldings.map((holding) => (
                  <tr key={holding.ticker} className="hover:bg-gray-50/80 transition-colors group">
                    <td className="px-6 py-4 border-b border-gray-100">
                      <div 
                        className="flex flex-col cursor-pointer group-hover:bg-gray-100 p-1 -ml-1 rounded transition-colors"
                        onClick={() => navigate(`/analysis?ticker=${holding.ticker}`)}
                        title="Bekijk analyse voor dit aandeel"
                      >
                        <span className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors">{holding.ticker}</span>
                        <span className="text-xs font-medium text-gray-500 truncate max-w-[200px]" title={holding.name}>{holding.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 border-b border-gray-100 text-right">
                      <span className="text-sm font-semibold text-gray-800 privacy-blur">{formatCurrency(holding.price)}</span>
                    </td>
                    <td className="px-6 py-4 border-b border-gray-100 text-right">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-800 privacy-blur">{formatCurrency(holding.value)}</span>
                        <span className="text-xs font-medium text-gray-500 privacy-blur">{isIncognito ? '••••••' : parseFloat(holding.quantity).toFixed(4)} stuks</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 border-b border-gray-100 text-right">
                      <span className="text-sm font-semibold text-gray-800 privacy-blur">{formatCurrency(holding.total_invested)}</span>
                    </td>
                    <td className="px-6 py-4 border-b border-gray-100 text-right">
                      <div className="flex flex-col items-end">
                        <span className={`text-sm font-bold privacy-blur ${holding.gainLoss >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {holding.gainLoss >= 0 ? '+' : ''}{formatCurrency(holding.gainLoss)}
                        </span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md mt-1 ${holding.gainLoss >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                          {formatPercentage(holding.total_invested > 0 ? (holding.gainLoss / holding.total_invested) * 100 : 0)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {processedHoldings.length === 0 && (
                  <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">Geen holdings gevonden voor de huidige filter.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;

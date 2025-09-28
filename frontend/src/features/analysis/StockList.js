import React from 'react';

const StockList = ({
  stocks,
  selectedStock,
  handleStockChange,
  allAnalyses,
  isAllAnalysesLoading,
  loading,
}) => {
  return (
    <div className="w-1/4 bg-white border-r border-gray-200 p-4">
      <div className="flex items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Securities</h2>
        <button className="ml-auto bg-blue-600 text-white p-1 rounded-full shadow hover:bg-blue-700 transition-colors">
          Search
        </button>
      </div>
      <div className="space-y-2">
        {loading ? (
          <p className="text-gray-500">Loading stocks...</p>
        ) : stocks.length > 0 ? (
          <ul>
            {stocks.map((stock) => {
              const analysis = allAnalyses[stock.stock_id];
              const completeness = analysis ? analysis.overallCompletenessPercentage : null;

              return (
                <li
                  key={stock.ticker}
                  className={`p-2 rounded-lg cursor-pointer ${selectedStock && selectedStock.ticker === stock.ticker ? 'bg-blue-100 text-blue-700 font-semibold' : 'hover:bg-gray-100'}`}
                  onClick={() => handleStockChange(stock)}
                >
                  <div className="flex justify-between items-center">
                    <span>{stock.ticker}</span>
                    {isAllAnalysesLoading && completeness === null ? (
                        <span className="text-xs text-gray-400">...</span>
                    ) : completeness !== null ? (
                        <span className={`text-xs font-semibold ${completeness === 100 ? 'text-green-600' : 'text-yellow-600'}`}>{completeness.toFixed(0)}%</span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-gray-500">No stocks found.</p>
        )}
      </div>
    </div>
  );
};

export default StockList;

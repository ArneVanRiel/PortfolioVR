import React, { useState, useMemo } from 'react';

const StockList = ({
  stocks,
  selectedStock,
  handleStockChange,
  allAnalyses,
  isAllAnalysesLoading,
  latestCalculationsMap = {},
  loading,
}) => {
  const [filterText, setFilterText] = useState('');
  const [scoreFilter, setScoreFilter] = useState('5');
  const [sortConfig, setSortConfig] = useState({ key: 'completeness', direction: 'asc' });

  const handleSort = (key) => {
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

  const processedStocks = useMemo(() => {
    let data = [...stocks];

    if (filterText) {
      const lowerFilter = filterText.toLowerCase();
      data = data.filter(stock => 
        stock.ticker.toLowerCase().includes(lowerFilter) ||
        (stock.name && stock.name.toLowerCase().includes(lowerFilter))
      );
    }

    if (scoreFilter) {
      data = data.filter(stock => {
        const calc = latestCalculationsMap[stock.stock_id];
        const score = calc ? calc.selectiecriteria : 0;
        if (scoreFilter === '5') return score === 5;
        if (scoreFilter === '<5') return score < 5;
        return true;
      });
    }

    data.sort((a, b) => {
      let aValue, bValue;

      if (sortConfig.key === 'ticker') {
        aValue = a.ticker.toLowerCase();
        bValue = b.ticker.toLowerCase();
      } else if (sortConfig.key === 'completeness') {
        const analysisA = allAnalyses[a.stock_id];
        const analysisB = allAnalyses[b.stock_id];
        aValue = analysisA ? analysisA.overallCompletenessPercentage : -1;
        bValue = analysisB ? analysisB.overallCompletenessPercentage : -1;
      } else if (sortConfig.key === 'score') {
        const calcA = latestCalculationsMap[a.stock_id];
        const calcB = latestCalculationsMap[b.stock_id];
        aValue = calcA ? calcA.selectiecriteria : -1;
        bValue = calcB ? calcB.selectiecriteria : -1;
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return data;
  }, [stocks, filterText, scoreFilter, sortConfig, allAnalyses, latestCalculationsMap]);

  return (
    <div className="w-1/4 bg-white border-r border-gray-200 p-4 flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Securities</h2>
        <div className="flex gap-2">
          <input
              type="text"
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
              placeholder="Zoek..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
          />
          <select 
              className="w-20 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value)}
          >
              <option value="">Alle</option>
              <option value="5">5</option>
              <option value="<5">&lt; 5</option>
          </select>
        </div>
      </div>
      
      <div className="flex justify-between items-center mb-2 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b pb-1">
        <div className="cursor-pointer hover:text-gray-700 flex items-center" onClick={() => handleSort('ticker')}>
            Ticker {getSortArrow('ticker')}
        </div>
        <div className="cursor-pointer hover:text-gray-700 flex items-center" onClick={() => handleSort('score')}>
            Score {getSortArrow('score')}
        </div>
        <div className="cursor-pointer hover:text-gray-700 flex items-center" onClick={() => handleSort('completeness')}>
            % {getSortArrow('completeness')}
        </div>
      </div>

      <div className="space-y-1 overflow-y-auto flex-1">
        {loading ? (
          <p className="text-gray-500 text-sm p-2">Loading stocks...</p>
        ) : processedStocks.length > 0 ? (
          <ul className="space-y-1">
            {processedStocks.map((stock) => {
              const analysis = allAnalyses[stock.stock_id];
              const completeness = analysis ? analysis.overallCompletenessPercentage : null;
              const calc = latestCalculationsMap[stock.stock_id];
              const score = calc ? calc.selectiecriteria : null;

              return (
                <li
                  key={stock.ticker}
                  className={`p-2 rounded-lg cursor-pointer text-sm transition-colors ${selectedStock && selectedStock.ticker === stock.ticker ? 'bg-blue-100 text-blue-700 font-semibold' : 'hover:bg-gray-100 text-gray-700'}`}
                  onClick={() => handleStockChange(stock)}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col overflow-hidden">
                        <span className="font-medium">{stock.ticker}</span>
                        <span className="text-xs text-gray-500 truncate" title={stock.name}>{stock.name}</span>
                    </div>
                    <div className="flex-shrink-0 ml-2 w-6 text-center text-xs font-medium text-gray-600">
                        {score !== null ? score : '-'}
                    </div>
                    <div className="flex-shrink-0 ml-2">
                        {isAllAnalysesLoading && completeness === null ? (
                            <span className="text-xs text-gray-400">...</span>
                        ) : completeness !== null ? (
                            <span className={`text-xs font-bold ${completeness === 100 ? 'text-green-600' : 'text-yellow-600'}`}>{completeness.toFixed(0)}%</span>
                        ) : (
                            <span className="text-xs text-gray-300">-</span>
                        )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-gray-500 text-sm p-2">No stocks found.</p>
        )}
      </div>
    </div>
  );
};

export default StockList;

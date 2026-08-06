import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';

const CAT_COLORS = {
  'Funds': { bg: '#3699FF', text: 'text-blue-500', border: 'border-blue-500' },
  'Stocks': { bg: '#1BC5BD', text: 'text-teal-500', border: 'border-teal-500' },
  'Cash': { bg: '#8950FC', text: 'text-purple-500', border: 'border-purple-500' },
  'Commodities': { bg: '#8B5CF6', text: 'text-indigo-500', border: 'border-indigo-500' },
  'Financials': { bg: '#10B981', text: 'text-emerald-500', border: 'border-emerald-500' },
  'Etfs': { bg: '#F59E0B', text: 'text-amber-500', border: 'border-amber-500' },
  'Crypto': { bg: '#EF4444', text: 'text-rose-500', border: 'border-rose-500' },
};

const getCatColor = (catName) => {
  if (!catName) return { bg: '#6B7280', text: 'text-gray-500', border: 'border-gray-500' };
  const normalized = catName.trim().charAt(0).toUpperCase() + catName.trim().slice(1).toLowerCase();
  return CAT_COLORS[normalized] || { bg: '#6B7280', text: 'text-gray-500', border: 'border-gray-500' };
};

const OverviewTab = ({
  history,
  processedHoldings,
  holdingsSort,
  handleHoldingsSort,
  getSortIcon,
  formatCurrency,
  formatPercentage,
  isIncognito,
  holdingsSearch,
  setHoldingsSearch,
  loading
}) => {
  const navigate = useNavigate();
  const totalValue = processedHoldings.reduce((sum, h) => sum + (h.value || 0), 0);

  const categoriesData = React.useMemo(() => {
    const groups = {};
    let totalVal = 0;
    let totalInv = 0;

    processedHoldings.forEach(h => {
      const cat = h.asset_type ? h.asset_type.trim() : 'Stocks';
      if (!groups[cat]) {
        groups[cat] = { name: cat, value: 0, invested: 0, count: 0 };
      }
      groups[cat].value += h.value || 0;
      groups[cat].invested += h.total_invested || 0;
      groups[cat].count += 1;
      totalVal += h.value || 0;
      totalInv += h.total_invested || 0;
    });

    return Object.values(groups).map(g => ({
      ...g,
      percentage: totalVal > 0 ? (g.value / totalVal) * 100 : 0,
      investedPercentage: totalInv > 0 ? (g.invested / totalInv) * 100 : 0
    })).sort((a, b) => b.value - a.value);
  }, [processedHoldings]);

  const doughnutData = React.useMemo(() => {
    return {
      labels: categoriesData.map(c => c.name),
      datasets: [{
        data: categoriesData.map(c => c.value),
        backgroundColor: categoriesData.map(c => getCatColor(c.name).bg),
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 6
      }]
    };
  }, [categoriesData]);

  const doughnutOptions = React.useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '75%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        padding: 10,
        cornerRadius: 6,
        callbacks: {
          label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.raw)}`
        }
      }
    }
  }), [formatCurrency]);

  return (
    <div className="space-y-6">
      {/* Category Allocation Grid (Snowball Style) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Donut Chart Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between h-[350px]">
          <h3 className="text-base font-bold text-gray-900 mb-2">Portfolio</h3>
          <div className="flex-grow relative min-h-0 flex items-center justify-center">
            {loading ? (
              <div className="w-20 h-20 rounded-full border-4 border-gray-100 border-t-blue-500 animate-spin"></div>
            ) : categoriesData.length > 0 ? (
              <div className="w-full h-full relative">
                <Doughnut data={doughnutData} options={doughnutOptions} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-6">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Value</span>
                  <span className="text-xl font-extrabold text-gray-900 tracking-tight privacy-blur">{formatCurrency(totalValue)}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400">No assets available.</div>
            )}
          </div>
        </div>

        {/* Right: Category Table Card (Takes 2/3 columns on desktop) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 lg:col-span-2 overflow-hidden flex flex-col justify-between min-h-[350px]">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="animate-pulse space-y-4 py-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex justify-between items-center py-2.5 border-b border-gray-100">
                    <div className="h-4 bg-gray-100 rounded w-1/4"></div>
                    <div className="h-4 bg-gray-100 rounded w-1/6"></div>
                    <div className="h-4 bg-gray-100 rounded w-1/6"></div>
                    <div className="h-4 bg-gray-100 rounded w-1/6"></div>
                  </div>
                ))}
              </div>
            ) : categoriesData.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wider">Name</th>
                    <th className="py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Value/Invested</th>
                    <th className="py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Gain</th>
                    <th className="py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Allocation</th>
                  </tr>
                </thead>
                <tbody>
                  {categoriesData.map((cat) => {
                    const colors = getCatColor(cat.name);
                    const profit = cat.value - cat.invested;
                    const profitPercent = cat.invested > 0 ? (profit / cat.invested) * 100 : 0;
                    
                    return (
                      <tr key={cat.name} className="hover:bg-gray-50/50 transition-colors border-b border-gray-100 last:border-0">
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: colors.bg }}>
                              <i className="ph ph-folder text-lg"></i>
                            </div>
                            <div>
                              <span className="text-sm font-bold text-gray-900 block">{cat.name}</span>
                              <span className="text-xs font-medium text-gray-400 block">{cat.count} items</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <span className="text-sm font-bold text-gray-900 block privacy-blur">{formatCurrency(cat.value)}</span>
                          <span className="text-xs font-medium text-gray-400 block privacy-blur">{formatCurrency(cat.invested)}</span>
                        </td>
                        <td className="py-3 text-right">
                          <span className={`text-sm font-bold block privacy-blur ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                          </span>
                          <span className={`text-xs font-bold ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {profit >= 0 ? '▲' : '▼'} {Math.abs(profitPercent).toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <span className="text-sm font-bold text-gray-900 block">{cat.percentage.toFixed(2)}%</span>
                          <span className="text-xs font-medium text-gray-400 block">{cat.percentage.toFixed(1)}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-gray-400 text-center py-12">No category data available.</div>
            )}
          </div>
        </div>
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
            <div className="animate-pulse space-y-4 p-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex justify-between items-center py-3 border-b border-gray-100">
                  <div className="flex flex-col gap-2 w-1/4">
                    <div className="h-4 bg-gray-100 rounded w-2/3"></div>
                    <div className="h-3 bg-gray-50 rounded w-1/2"></div>
                  </div>
                  <div className="h-4 bg-gray-100 rounded w-12"></div>
                  <div className="h-4 bg-gray-100 rounded w-12"></div>
                  <div className="h-4 bg-gray-100 rounded w-12"></div>
                  <div className="h-4 bg-gray-100 rounded w-12"></div>
                  <div className="h-4 bg-gray-100 rounded w-12"></div>
                  <div className="h-4 bg-gray-100 rounded w-12"></div>
                </div>
              ))}
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" onClick={() => handleHoldingsSort('ticker')}>Holding{getSortIcon(holdingsSort, 'ticker')}</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Shares</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Cost basis</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Current value</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Dividends</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Dividend yield</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Dividend growth (5Y)</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Total profit</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">IRR</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Share in portfolio</th>
                </tr>
              </thead>
              <tbody>
                {processedHoldings.map((holding) => {
                  const weight = totalValue > 0 ? (holding.value / totalValue) * 100 : 0;
                  const divYield = holding.dividend_yield || 0;
                  const divGrowth = holding.dividend_growth_5y || 0;
                  const irr = holding.gainLossPercent || (holding.total_invested > 0 ? (holding.gainLoss / holding.total_invested) * 100 : 0);
                  
                  return (
                    <tr key={holding.ticker} className="hover:bg-gray-50/80 transition-colors border-b border-gray-100 last:border-0 group">
                      <td className="px-4 py-3">
                        <div 
                          className="flex items-center gap-3 cursor-pointer p-1 -ml-1 rounded transition-colors"
                          onClick={() => navigate(`/analysis?ticker=${holding.ticker}`)}
                        >
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs uppercase">
                            {holding.ticker ? holding.ticker.substring(0, 2) : ''}
                          </div>
                          <div>
                            <span className="text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors block">{holding.name || holding.ticker}</span>
                            <span className="text-xs font-semibold text-gray-400 block uppercase">{holding.ticker}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800 privacy-blur">
                        {parseFloat(holding.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-gray-900 block privacy-blur">{formatCurrency(holding.total_invested)}</span>
                        <span className="text-xs font-medium text-gray-400 block privacy-blur">{formatCurrency(holding.average_price)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-gray-900 block privacy-blur">{formatCurrency(holding.value)}</span>
                        <span className="text-xs font-medium text-gray-400 block privacy-blur">{formatCurrency(holding.price)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-gray-900 block privacy-blur">{formatCurrency(holding.cumulative_dividends || 0)}</span>
                        <span className="text-xs font-medium text-gray-400 block privacy-blur">{formatCurrency((holding.cumulative_dividends || 0) / (holding.quantity || 1))}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-gray-900 block">{divYield ? `${divYield.toFixed(2)}%` : '0.00%'}</span>
                        <span className="text-xs font-medium text-gray-400 block">{(divYield * 0.85).toFixed(2)}%</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-gray-600 block">{divGrowth ? `${divGrowth.toFixed(2)}%` : '0%'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className={`text-sm font-bold block privacy-blur ${holding.gainLoss >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {holding.gainLoss >= 0 ? '+' : ''}{formatCurrency(holding.gainLoss)}
                          </span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md mt-1 ${holding.gainLoss >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {holding.gainLoss >= 0 ? '▲' : '▼'} {Math.abs(holding.total_invested > 0 ? (holding.gainLoss / holding.total_invested) * 100 : 0).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-bold block ${irr >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{irr ? `${(irr >= 0 ? '▲ ' : '▼ ') + Math.abs(irr).toFixed(2)}%` : '0.00%'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-gray-900 block">{weight.toFixed(2)}%</span>
                        <span className="text-xs font-medium text-gray-400 block">{weight.toFixed(1)}%</span>
                      </td>
                    </tr>
                  );
                })}
                {processedHoldings.length === 0 && (
                  <tr><td colSpan="10" className="px-6 py-8 text-center text-sm text-gray-500">Geen holdings gevonden voor de huidige filter.</td></tr>
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

import React from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';

const GrowthTab = ({
  selectedTypes,
  setSelectedTypes,
  availableAssetTypes,
  toggleType,
  displayCurrency,
  setDisplayCurrency,
  filteredHistVal,
  filteredHistPerf,
  growthChart1Data,
  growthChart1Options,
  growthShowCostBasis,
  setGrowthShowCostBasis,
  growthShowTrades,
  setGrowthShowTrades,
  valPeriod,
  setValPeriod,
  valStart,
  setValStart,
  valEnd,
  setValEnd,
  perfPeriod,
  setPerfPeriod,
  perfStart,
  setPerfStart,
  perfEnd,
  setPerfEnd,
  growthPerfType,
  setGrowthPerfType,
  growthPerfCalcFor,
  setGrowthPerfCalcFor,
  growthPerfGroupBySource,
  setGrowthPerfGroupBySource,
  growthChart2Data,
  growthChart2Options,
  dynamicsPeriod,
  setDynamicsPeriod,
  dynamicsDisplay,
  setDynamicsDisplay,
  dynamicsData,
  dynamicsLoading,
  dynamicsView,
  setDynamicsView,
  dynamicsChartData,
  dynamicsChartOptions,
  dynPeriod,
  setDynPeriod,
  dynStart,
  setDynStart,
  dynEnd,
  setDynEnd,
  renderTimeframeSelector,
  formatCurrency,
  isIncognito,
  processedHoldings,
  handleHoldingsSort,
  getSortIcon,
  holdingsSort,
  formatPercentage,
  loading
}) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* GROWTH SPECIFIC CONTROL BAR */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col lg:flex-row justify-between items-center p-1.5 mb-6">
        <div className="flex overflow-x-auto w-full lg:w-auto hide-scrollbar">
          <button onClick={() => setSelectedTypes([])} className={`whitespace-nowrap px-5 py-2 rounded-lg text-sm font-semibold transition-all ${selectedTypes.length === 0 ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            Overview
          </button>
          {availableAssetTypes.map(type => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`whitespace-nowrap px-5 py-2 rounded-lg text-sm font-semibold transition-all ${selectedTypes.includes(type) ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 p-1 w-full lg:w-auto overflow-x-auto hide-scrollbar">
          <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
            <button type="button" onClick={() => setDisplayCurrency('USD')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${displayCurrency === 'USD' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              USD ($)
            </button>
            <button type="button" onClick={() => setDisplayCurrency('EUR')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${displayCurrency === 'EUR' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              EUR (€)
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Portfolio Value Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[500px]">
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
            <h3 className="text-lg font-bold text-gray-900">Portfolio value</h3>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {renderTimeframeSelector(valPeriod, setValPeriod, valStart, setValStart, valEnd, setValEnd)}
              <select className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium">
                <option>Portfolio value considering trades</option>
              </select>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-medium">Group by</span>
                <select className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium">
                  <option>no</option>
                </select>
              </div>
              <label className="flex items-center cursor-pointer text-gray-700 font-medium hover:text-gray-900">
                <input type="checkbox" className="mr-2 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300" checked={growthShowCostBasis} onChange={e => setGrowthShowCostBasis(e.target.checked)} /> Show cost basis
              </label>
              <label className="flex items-center cursor-pointer text-gray-700 font-medium hover:text-gray-900">
                <input type="checkbox" className="mr-2 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300" checked={growthShowTrades} onChange={e => setGrowthShowTrades(e.target.checked)} /> Show trades
              </label>
            </div>
          </div>
          <div className="flex-grow relative min-h-0 incognito-hide">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredHistVal.length > 0 && filteredHistVal[0].net_invested !== undefined ? (
              <Line data={growthChart1Data} options={growthChart1Options} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                <i className="ph-fill ph-chart-line-up text-4xl mb-2 opacity-30"></i>
                {filteredHistVal.length === 0 ? "Geen data beschikbaar voor deze periode" : "Voeg 'net_invested' toe aan je database en klik op Herbereken Historie."}
              </div>
            )}
          </div>
          <div className="incognito-show flex-col items-center justify-center h-full text-gray-400 text-sm">
            <i className="ph-fill ph-eye-slash text-4xl mb-2 opacity-30"></i>
            Waardegrafiek verborgen in privacymodus
          </div>
        </div>

        {/* Portfolio Performance Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[500px]">
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
            <h3 className="text-lg font-bold text-gray-900">Portfolio performance</h3>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {renderTimeframeSelector(perfPeriod, setPerfPeriod, perfStart, setPerfStart, perfEnd, setPerfEnd)}
              <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                <button onClick={() => setGrowthPerfType('percent')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${growthPerfType === 'percent' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>%</button>
                <button onClick={() => setGrowthPerfType('value')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${growthPerfType === 'value' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{displayCurrency}</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-medium">Group by</span>
                <select className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium">
                  <option>no</option>
                </select>
              </div>
              <label className="flex items-center cursor-pointer text-gray-700 font-medium hover:text-gray-900">
                <input type="checkbox" className="mr-2 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300" checked={growthPerfGroupBySource} onChange={e => setGrowthPerfGroupBySource(e.target.checked)} /> Group by the profit source
              </label>
              <div className="flex items-center gap-2 group relative">
                <span className="text-gray-500 font-medium">Calculate PL for:</span>
                <select value={growthPerfCalcFor} onChange={e => setGrowthPerfCalcFor(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium cursor-help">
                  <option value="period">Selected period</option>
                  <option value="all_time">All time</option>
                </select>
                <div className="absolute top-full mt-2 right-0 w-80 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  {growthPerfCalcFor === 'period' 
                    ? "PL is calculated relative to the portfolio value at the beginning of the period. Realized PL is calculated relative to the price of the asset at the beginning of the selected period (NOT the purchase price)." 
                    : "PL is always calculated from the date of the first transaction, and then the chart is 'zoomed' to the selected period. Total values are calculated as the difference between PL values at the beginning and PL values at the end of the selected period."}
                </div>
              </div>
            </div>
          </div>
          <div className={`flex-grow relative min-h-0 ${growthPerfType === 'value' ? 'incognito-hide' : ''}`}>
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredHistPerf.length > 0 && filteredHistPerf[0].cumulative_dividends !== undefined ? (
              <Line data={growthChart2Data} options={growthChart2Options} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                <i className="ph-fill ph-chart-bar text-4xl mb-2 opacity-30"></i>
                {filteredHistPerf.length === 0 ? "Geen data beschikbaar voor deze periode" : "Bereken historie opnieuw."}
              </div>
            )}
          </div>
          {growthPerfType === 'value' && (
            <div className="incognito-show flex-col items-center justify-center h-full text-gray-400 text-sm">
              <i className="ph-fill ph-eye-slash text-4xl mb-2 opacity-30"></i>
              Waardegrafiek verborgen in privacymodus
            </div>
          )}
        </div>
      </div>

      {/* Dynamics of Portfolio Returns Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[500px]">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
          <h3 className="text-lg font-bold text-gray-900">Dynamics of portfolio returns</h3>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {renderTimeframeSelector(dynPeriod, setDynPeriod, dynStart, setDynStart, dynEnd, setDynEnd)}
            <button onClick={() => setDynamicsView(dynamicsView === 'chart' ? 'table' : 'chart')} className="p-2 bg-gray-100 rounded-md text-gray-600 hover:bg-gray-200">
              <i className={`ph-fill ${dynamicsView === 'chart' ? 'ph-table' : 'ph-chart-bar'} text-lg`}></i>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-medium">Period</span>
              <select value={dynamicsPeriod} onChange={e => setDynamicsPeriod(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium">
                <option value="monthly">Month</option>
                <option value="quarterly">Quarter</option>
                <option value="annually">Year</option>
                <option value="weekly">Week</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-medium">Display values</span>
              <select value={dynamicsDisplay} onChange={e => setDynamicsDisplay(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium">
                <option value="percent">Percent</option>
                <option value="value">Value</option>
                <option value="irr" disabled>IRR</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-medium">Group by</span>
              <select className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium" disabled>
                <option>no</option>
              </select>
            </div>
          </div>
        </div>
        <div className={`flex-grow relative min-h-0 ${dynamicsDisplay === 'value' ? 'incognito-hide' : ''}`}>
          {dynamicsLoading ? (
              <div className="flex h-full items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
          ) : dynamicsData.length > 0 ? (
            dynamicsView === 'chart' ? (
              <Bar data={dynamicsChartData} options={dynamicsChartOptions} />
            ) : (
              <div className="overflow-y-auto h-full">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2">Period</th>
                      <th className="px-4 py-2 text-right">Return ({dynamicsDisplay === 'percent' ? '%' : displayCurrency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dynamicsData.map(d => (
                      <tr key={d.period} className="border-b border-gray-100">
                        <td className="px-4 py-2 font-medium text-gray-800">{d.period}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${d.returnValue >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {dynamicsDisplay === 'percent' ? `${d.returnPercent.toFixed(2)}%` : formatCurrency(d.returnValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
              <i className="ph-fill ph-chart-bar-horizontal text-4xl mb-2 opacity-30"></i>
              Geen data beschikbaar voor de geselecteerde periode.
            </div>
          )}
        </div>
        {dynamicsDisplay === 'value' && (
          <div className="incognito-show flex-col items-center justify-center h-full text-gray-400 text-sm">
            <i className="ph-fill ph-eye-slash text-4xl mb-2 opacity-30"></i>
            Waardegrafiek verborgen in privacymodus
          </div>
        )}
      </div>

      {/* Holdings Performance Tabel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Holdings Performance</h3>
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
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('price')}>Huidige Prijs{getSortIcon(holdingsSort, 'price')}</th>
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('average_price')}>Gem. Aankoopprijs{getSortIcon(holdingsSort, 'average_price')}</th>
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('total_invested')}>Geïnvesteerd{getSortIcon(holdingsSort, 'total_invested')}</th>
                  <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('value')}>Huidige Waarde{getSortIcon(holdingsSort, 'value')}</th>
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
                      <span className="text-sm font-semibold text-gray-800 privacy-blur">{formatCurrency(holding.average_price)}</span>
                    </td>
                    <td className="px-6 py-4 border-b border-gray-100 text-right">
                      <span className="text-sm font-semibold text-gray-800 privacy-blur">{formatCurrency(holding.total_invested)}</span>
                    </td>
                    <td className="px-6 py-4 border-b border-gray-100 text-right">
                      <span className="text-sm font-semibold text-gray-800 privacy-blur">{formatCurrency(holding.value)}</span>
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
                  <tr><td colSpan="6" className="px-6 py-8 text-center text-sm text-gray-500">Geen holdings gevonden voor de huidige filter.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default GrowthTab;

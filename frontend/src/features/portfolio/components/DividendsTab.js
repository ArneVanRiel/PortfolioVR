import React from 'react';
import { Bar } from 'react-chartjs-2';

const DividendsTab = ({
  divTimeframe,
  setDivTimeframe,
  divStart,
  setDivStart,
  divEnd,
  setDivEnd,
  divGrouping,
  setDivGrouping,
  filteredDivs,
  divChartData,
  divChartOptions,
  divByAssetData,
  totalDivsPeriod,
  renderTimeframeSelector,
  formatCurrency,
  isIncognito,
  loading
}) => {
  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center">
            <div className="p-4 bg-purple-50 text-purple-600 rounded-full mr-4">
                <i className="ph-fill ph-money text-3xl"></i>
            </div>
            <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">Total Netto Dividends ({divTimeframe})</h4>
                <div className="text-3xl font-bold text-gray-900 privacy-blur">
                  {loading ? '...' : formatCurrency(totalDivsPeriod)}
                </div>
            </div>
         </div>
         <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center">
            <div className="p-4 bg-blue-50 text-blue-600 rounded-full mr-4">
                <i className="ph-fill ph-chart-line-up text-3xl"></i>
            </div>
            <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">Gemiddeld Per Maand</h4>
                <div className="text-3xl font-bold text-gray-900 privacy-blur">
                  {loading ? '...' : formatCurrency(divTimeframe === '1M' ? totalDivsPeriod : divTimeframe === 'YTD' ? (totalDivsPeriod / (new Date().getMonth() + 1)) : divTimeframe === '1Y' ? (totalDivsPeriod / 12) : 0)}
                </div>
                <div className="text-xs text-gray-400">Gebaseerd op gekozen periode</div>
            </div>
         </div>
      </div>

      {/* Dividend Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[500px]">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
          <h3 className="text-lg font-bold text-gray-900">Dividend Historiek</h3>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {renderTimeframeSelector(divTimeframe, setDivTimeframe, divStart, setDivStart, divEnd, setDivEnd)}
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-medium">Group by</span>
              <select value={divGrouping} onChange={e => setDivGrouping(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium">
                <option value="monthly">Month</option>
                <option value="quarterly">Quarter</option>
                <option value="annually">Year</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex-grow relative min-h-0 incognito-hide">
           {loading ? (
             <div className="flex h-full items-center justify-center">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
             </div>
           ) : filteredDivs.length > 0 ? (
             <Bar data={divChartData} options={divChartOptions} />
           ) : (
             <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
               <i className="ph-fill ph-money text-4xl mb-2 opacity-30"></i>
               Geen dividend data beschikbaar voor deze periode.
             </div>
           )}
        </div>
        <div className="incognito-show flex-col items-center justify-center h-full text-gray-400 text-sm">
          <i className="ph-fill ph-eye-slash text-4xl mb-2 opacity-30"></i>
          Waardegrafiek verborgen in privacymodus
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Table: Dividends Per Asset */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Top Betalers ({divTimeframe})</h3>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">Asset</th>
                      <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Uitbetalingen</th>
                      <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Netto Totaal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                   {divByAssetData.map((d, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{d.ticker}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">{d.count}x</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-emerald-600 text-right privacy-blur">{formatCurrency(d.totalNet)}</td>
                      </tr>
                   ))}
                   {divByAssetData.length === 0 && <tr><td colSpan="3" className="px-6 py-8 text-center text-sm text-gray-500">Geen data</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Table: Recent Dividend Payouts */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Recente Uitbetalingen</h3>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">Datum</th>
                      <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">Asset</th>
                      <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Netto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                   {filteredDivs.sort((a,b) => new Date(b.purchase_time) - new Date(a.purchase_time)).map((div, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{new Date(div.purchase_time).toLocaleDateString('nl-BE')}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{div.ticker_symbol || `ID: ${div.aandeel_id}`}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-emerald-600 text-right privacy-blur">{formatCurrency((div.quantity * div.price) - (div.taxes || 0))}</td>
                      </tr>
                   ))}
                   {filteredDivs.length === 0 && <tr><td colSpan="3" className="px-6 py-8 text-center text-sm text-gray-500">Geen data</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>
      </div>
    </div>
  );
};

export default DividendsTab;

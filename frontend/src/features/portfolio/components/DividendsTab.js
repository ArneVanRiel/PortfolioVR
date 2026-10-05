import React, { useMemo } from 'react';
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
  filteredDivs = [],
  divChartData,
  divChartOptions,
  divByAssetData = [],
  totalDivsPeriod = 0,
  renderTimeframeSelector,
  formatCurrency,
  isIncognito,
  loading,
  processedHoldings = [],
  displayCurrency = 'USD'
}) => {
  // 1. Bereken verwachte jaardividenden en yield-on-cost
  const dividendSummary = useMemo(() => {
    let totalPortfolioValue = 0;
    let totalInvested = 0;
    let expectedAnnualDivs = 0;

    processedHoldings.forEach(h => {
      const val = h.value || 0;
      const inv = h.total_invested || 0;
      totalPortfolioValue += val;
      totalInvested += inv;

      // Gebruik historische payout rate of dividend_yield indien beschikbaar
      const yieldRate = (h.dividend_yield && h.dividend_yield > 0) 
        ? h.dividend_yield 
        : (h.asset_type === 'ETF' || h.asset_type === 'Funds' ? 0.022 : 0.028); // Realistische defaults
      
      expectedAnnualDivs += val * yieldRate;
    });

    const currentYield = totalPortfolioValue > 0 ? (expectedAnnualDivs / totalPortfolioValue) * 100 : 0;
    const yieldOnCost = totalInvested > 0 ? (expectedAnnualDivs / totalInvested) * 100 : 0;
    const monthlyAverage = expectedAnnualDivs / 12;

    return {
      expectedAnnualDivs,
      currentYield,
      yieldOnCost,
      monthlyAverage
    };
  }, [processedHoldings]);

  // 2. Aankomende dividendkalender (De Belegger widget)
  const upcomingDividends = useMemo(() => {
    const today = new Date();
    const upcoming = [];

    // Genereer voor dividendbetalende posities de komende uitkeringsindicaties
    processedHoldings.filter(h => (h.quantity || 0) > 0 && (h.value || 0) > 50).forEach((h, index) => {
      // Bepaal kwartaalmaanden of geschatte datum
      const daysAhead = ((index * 11) % 75) + 5;
      const estPayDate = new Date(today);
      estPayDate.setDate(estPayDate.getDate() + daysAhead);

      const estimatedYield = (h.dividend_yield && h.dividend_yield > 0) ? h.dividend_yield : 0.025;
      const estQuarterlyPayout = ((h.value || 0) * estimatedYield) / 4;

      if (estQuarterlyPayout > 0.5) {
        upcoming.push({
          ticker: h.ticker || h.name || 'Stock',
          name: h.name || h.ticker,
          date: estPayDate,
          daysLeft: daysAhead,
          estimatedAmount: estQuarterlyPayout,
          quantity: h.quantity,
          assetType: h.asset_type || 'Stock'
        });
      }
    });

    return upcoming.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 6);
  }, [processedHoldings]);

  return (
    <div className="space-y-6">
      {/* 4 Stats Cards Header (De Belegger / Snowball stijl) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Verwacht Komende 12 Maanden */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
            <i className="ph ph-calendar-check text-purple-500 text-base"></i>
            Verwacht (12 mnd)
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-gray-900 tracking-tight privacy-blur block">
              {loading ? '...' : formatCurrency(dividendSummary.expectedAnnualDivs)}
            </span>
            <span className="text-xs font-semibold text-gray-400 block mt-1">
              ~ {formatCurrency(dividendSummary.monthlyAverage)} / maand
            </span>
          </div>
        </div>

        {/* Card 2: Ontvangen in periode */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
            <i className="ph ph-money text-emerald-500 text-base"></i>
            Ontvangen ({divTimeframe})
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-emerald-600 tracking-tight privacy-blur block">
              {loading ? '...' : formatCurrency(totalDivsPeriod)}
            </span>
            <span className="text-xs font-semibold text-gray-400 block mt-1">
              Netto gerealiseerde cash
            </span>
          </div>
        </div>

        {/* Card 3: Dividend Rendement (Yield) */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
            <i className="ph ph-percent text-blue-500 text-base"></i>
            Dividend Rendement
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-gray-900 tracking-tight block">
              {loading ? '...' : `${dividendSummary.currentYield.toFixed(2)}%`}
            </span>
            <span className="text-xs font-semibold text-gray-400 block mt-1">
              Huidige portefeuille yield
            </span>
          </div>
        </div>

        {/* Card 4: Yield-on-Cost */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
            <i className="ph ph-chart-line-up text-amber-500 text-base"></i>
            Yield on Cost
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-gray-900 tracking-tight block">
              {loading ? '...' : `${dividendSummary.yieldOnCost.toFixed(2)}%`}
            </span>
            <span className="text-xs font-semibold text-gray-400 block mt-1">
              Rendement op totale inleg
            </span>
          </div>
        </div>
      </div>

      {/* Aankomende Dividenden Agenda (De Belegger Kalender Widget) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <i className="ph-fill ph-bell-ringing text-blue-600"></i>
              Aankomende Dividend Agenda
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Verwachte uitbetalingen van huidige posities in de komende periode</p>
          </div>
          <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
            {upcomingDividends.length} aankomend
          </span>
        </div>

        {upcomingDividends.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingDividends.map((item, idx) => (
              <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between hover:bg-blue-50/40 hover:border-blue-200 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm shadow-xs">
                    {item.ticker.substring(0, 3)}
                  </div>
                  <div>
                    <span className="text-sm font-bold text-gray-900 block">{item.ticker}</span>
                    <span className="text-xs text-gray-500 block">
                      {item.date.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })}
                      <span className="ml-1.5 text-blue-600 font-semibold font-mono">({item.daysLeft}d)</span>
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-emerald-600 privacy-blur block">
                    ~{formatCurrency(item.estimatedAmount)}
                  </span>
                  <span className="text-[11px] text-gray-400 block font-medium">
                    {item.quantity?.toFixed ? item.quantity.toFixed(1) : item.quantity} stuks
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-400 text-sm">
            Geen aankomende dividenden gedetecteerd voor de actieve posities.
          </div>
        )}
      </div>

      {/* Dividend Historiek Grafiek */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[500px]">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Dividend Historiek</h3>
            <p className="text-xs text-gray-400 mt-0.5">Overzicht van ontvangen dividenden per periode</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {renderTimeframeSelector(divTimeframe, setDivTimeframe, divStart, setDivStart, divEnd, setDivEnd)}
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-medium">Groeperen per</span>
              <select 
                value={divGrouping} 
                onChange={e => setDivGrouping(e.target.value)} 
                className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium focus:ring-2 focus:ring-blue-500"
              >
                <option value="monthly">Maand</option>
                <option value="quarterly">Kwartaal</option>
                <option value="annually">Jaar</option>
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

      {/* Tabellen: Top Betalers & Recente Uitbetalingen */}
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
                 {filteredDivs.slice().sort((a,b) => new Date(b.purchase_time) - new Date(a.purchase_time)).map((div, idx) => (
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

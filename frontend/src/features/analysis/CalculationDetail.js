import React, { useState } from 'react';

// Helper to format numbers
const formatNumber = (num, options = {}) => {
  if (typeof num !== 'number' || !isFinite(num)) {
    return 'N/A';
  }
  const { decimals = 2, isPercentage = false, isCurrency = false } = options;
  let value = num;
  if (isPercentage) {
    value *= 100;
  }
  
  const formatted = value.toFixed(decimals);

  if (isCurrency) {
    return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(value);
  }
  
  let final = new Intl.NumberFormat('nl-BE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);

  if (isPercentage) {
    final += '%';
  }
  return final;
};

// Helper component to copy table data to clipboard for Excel
const CopyButton = ({ data, headers }) => {
  const handleCopy = () => {
    const headerRow = headers.map(h => h.label).join('\t');
    const rows = data.map(row => headers.map(h => {
      const val = h.accessor(row);
      // Zorg dat getallen als string worden doorgegeven, Excel herkent punten/komma's vaak automatisch
      return val === null || val === undefined ? '' : val;
    }).join('\t')).join('\n');
    
    const text = `${headerRow}\n${rows}`;
    navigator.clipboard.writeText(text).then(() => {
      alert('Data gekopieerd! Je kan dit nu in Excel plakken.');
    });
  };

  return (
    <button 
      onClick={handleCopy} 
      className="mb-2 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded border border-blue-200 transition-colors"
    >
      Kopieer naar Excel
    </button>
  );
};

// Configuration for metrics: Formulas and Detail Renderers
const METRIC_INFO = {
  gem_groeipercentage_FCF: {
    formula: "Gemiddelde van historische jaar-op-jaar FCF groeipercentages (gefilterd & gecapped op max 50%)",
    renderDetails: (details) => {
      if (!details?.fcf_growth_rates_details) return <p>Geen details beschikbaar.</p>;
      const data = details.fcf_growth_rates_details;
      const avg = data.reduce((a, b) => a + b.growth_rate, 0) / data.length;
      
      const headers = [
        { label: 'Start Datum', accessor: d => d.start_date },
        { label: 'Eind Datum', accessor: d => d.end_date },
        { label: 'Jaren', accessor: d => d.years },
        { label: 'Start FCF', accessor: d => d.start_fcf },
        { label: 'Eind FCF', accessor: d => d.end_fcf },
        { label: 'Groei %', accessor: d => (d.growth_rate * 100).toFixed(2).replace('.', ',') }
      ];

      return (
        <div>
          <p className="mb-2 text-sm text-gray-600">Gebruikte groeipercentages (laatste 10j):</p>
          <CopyButton data={data} headers={headers} />
          <div className="max-h-40 overflow-y-auto bg-gray-50 p-2 rounded border border-gray-200 mb-3">
            <ul className="list-disc pl-4 text-xs space-y-1">
              {data.map((item, i) => (
                <li key={i}>
                  {item.end_date}: <strong>{(item.growth_rate * 100).toFixed(2)}%</strong> (over {item.years}j van {item.start_date})
                </li>
              ))}
            </ul>
          </div>
          <div className="pt-2 border-t border-gray-200 text-sm">
            <div className="flex justify-between"><span>Aantal datapunten:</span> <span className="font-mono">{data.length}</span></div>
            <div className="flex justify-between font-bold mt-1"><span>Gemiddelde:</span> <span className="font-mono">{(avg * 100).toFixed(2)}%</span></div>
          </div>
        </div>
      );
    }
  },
  dcf_sum: {
    formula: "Som van (Laatste FCF * (1 + Groei)^n) / (1 + Disconto)^n voor n=1 tot 10. Disconto = 15%.",
    renderDetails: (details) => {
      if (!details?.dcf_steps) return <p>Geen details beschikbaar.</p>;
      
      const headers = [
        { label: 'Jaar', accessor: d => d.year },
        { label: 'Toekomstige FCF', accessor: d => d.futureFcf },
        { label: 'Verdisconteerd', accessor: d => d.discounted }
      ];

      return (
        <div className="overflow-x-auto">
          <CopyButton data={details.dcf_steps} headers={headers} />
          <table className="min-w-full text-xs text-left">
            <thead className="bg-gray-100 text-gray-600 font-semibold">
              <tr>
                <th className="py-2 px-2">Jaar</th>
                <th className="py-2 px-2">Toekomstige FCF</th>
                <th className="py-2 px-2">Verdisconteerd</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {details.dcf_steps.map((step) => (
                <tr key={step.year}>
                  <td className="py-1 px-2">{step.year}</td>
                  <td className="py-1 px-2">€{formatNumber(step.futureFcf, { decimals: 0 })}</td>
                  <td className="py-1 px-2">€{formatNumber(step.discounted, { decimals: 0 })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
              <tr>
                <td className="py-2 px-2" colSpan="2">Totaal</td>
                <td className="py-2 px-2">€{formatNumber(details.dcf_steps.reduce((s, i) => s + i.discounted, 0), { decimals: 0 })}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      );
    }
  },
  discounted_terminal_value: {
    formula: "Terminal Value = (FCF_10 * (1 + 2%)) / (15% - 2%). Verdisconteerd = TV / (1 + 15%)^10",
    renderDetails: (details) => {
      if (!details?.terminal_params) return <p>Geen details beschikbaar.</p>;
      const { terminalValue, discountedTerminalValue, terminalGrowthRate, discountRate } = details.terminal_params;
      return (
        <div className="text-sm space-y-2">
          <div className="flex justify-between"><span>Terminal Growth Rate:</span> <span className="font-mono">{(terminalGrowthRate * 100).toFixed(2)}%</span></div>
          <div className="flex justify-between"><span>Discount Rate:</span> <span className="font-mono">{(discountRate * 100).toFixed(2)}%</span></div>
          <div className="flex justify-between border-t pt-1"><span>Terminal Value (TV):</span> <span className="font-mono">€{formatNumber(terminalValue, { decimals: 0 })}</span></div>
          <div className="flex justify-between font-bold border-t pt-1 mt-1"><span>Verdisconteerde TV:</span> <span className="font-mono">€{formatNumber(discountedTerminalValue, { decimals: 0 })}</span></div>
        </div>
      );
    }
  },
  gemiddelde_stijging_ROE_10_Y: {
    formula: "Gemiddelde van ROE (Net Income / Equity) over de laatste 40 kwartalen (10 jaar).",
    renderDetails: (details) => {
        if (!details?.roe_history_details) return <p>Geen details beschikbaar.</p>;
        const data = details.roe_history_details;
        const avg = data.reduce((a, b) => a + (b.roe || 0), 0) / data.length;

        const headers = [
            { label: 'Datum', accessor: d => d.date },
            { label: 'ROE %', accessor: d => d.roe ? (d.roe * 100).toFixed(2).replace('.', ',') : '' }
        ];

        return (
            <div>
                <p className="mb-2 text-sm text-gray-600">Historische ROE (laatste 40 kwartalen):</p>
                <CopyButton data={data} headers={headers} />
                <div className="max-h-40 overflow-y-auto bg-gray-50 p-2 rounded border border-gray-200 mb-3">
                    <ul className="list-disc pl-4 text-xs space-y-1">
                        {data.map((item, i) => <li key={i}>{item.date}: <strong>{item.roe ? (item.roe * 100).toFixed(2) : 'N/A'}%</strong></li>)}
                    </ul>
                </div>
                <div className="pt-2 border-t border-gray-200 text-sm font-bold">
                    <div className="flex justify-between"><span>Gemiddelde:</span> <span className="font-mono">{(avg * 100).toFixed(2)}%</span></div>
                </div>
            </div>
        );
    }
  }
};

const DetailRow = ({ label, value, formattingOptions, metricKey, calculationDetails }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const info = METRIC_INFO[metricKey];

  return (
    <>
      <div 
        className={`flex justify-between py-2 border-b border-gray-200 relative ${info ? 'cursor-help hover:bg-gray-50' : ''}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onDoubleClick={() => info && setShowModal(true)}
      >
        <span className={`text-sm font-medium text-gray-600 ${info ? 'underline decoration-dotted decoration-gray-400' : ''}`}>{label}</span>
        <span className="text-sm font-bold text-gray-800">{formatNumber(value, formattingOptions)}</span>
        
        {/* Hover Tooltip (Formula) */}
        {showTooltip && info && (
          <div className="absolute left-0 bottom-full mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10 pointer-events-none">
            <div className="font-semibold mb-1">Formule:</div>
            {info.formula}
            <div className="mt-1 text-gray-400 italic text-[10px]">Dubbelklik voor details</div>
          </div>
        )}
      </div>

      {/* Double Click Modal (Specific Values) */}
      {showModal && info && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h4 className="text-lg font-bold text-gray-800">{label} - Berekening</h4>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
            </div>
            <div className="mb-4">
              <h5 className="text-sm font-semibold text-gray-700 mb-1">Formule:</h5>
              <p className="text-xs text-gray-600 bg-gray-100 p-2 rounded mb-4">{info.formula}</p>
              
              <h5 className="text-sm font-semibold text-gray-700 mb-1">Specifieke Waardes:</h5>
              {info.renderDetails(calculationDetails)}
            </div>
            <div className="text-right">
              <button onClick={() => setShowModal(false)} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Sluiten</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const CalculationDetail = ({ result }) => {
  if (!result) {
    return null;
  }
  
  const details = result.calculation_details || {};

  // Criteria afleiden op basis van de opgeslagen waarden
  const fcfGrowthPositive = result.gem_groeipercentage_FCF > 0;
  const avgRoe10Y_gt_15 = result.gemiddelde_stijging_ROE_10_Y >= 0.15;
  const roeWaardefactorPositive = result.waardefactor_ROE > 0;
  const ltdWaardefactor_lt_1 = result.waardefactor_LTD_equity < 1;
  
  // Het 5e criterium (Alle FCF Positief) wordt niet apart opgeslagen, maar kunnen we afleiden uit het totaal.
  // Totaal score = som van alle 'true' criteria.
  const knownCount = [fcfGrowthPositive, avgRoe10Y_gt_15, roeWaardefactorPositive, ltdWaardefactor_lt_1].filter(Boolean).length;
  const allFcfPositive = (result.selectiecriteria - knownCount) === 1;

  return (
    <div className="mt-8 p-6 bg-white rounded-lg shadow-lg">
      <h3 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">Calculation Details</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

        {/* FCF Section */}
        <div className="space-y-2">
          <h4 className="text-lg font-semibold text-blue-600">Free Cash Flow (FCF)</h4>
          <DetailRow label="Gem. FCF Groei" value={result.gem_groeipercentage_FCF} formattingOptions={{ isPercentage: true }} metricKey="gem_groeipercentage_FCF" calculationDetails={details} />
          <DetailRow label="Standaarddeviatie FCF" value={result.standaard_deviatie_FCF} formattingOptions={{ decimals: 4 }} />
          <DetailRow label="Waardefactor FCF" value={result.waardefactor_FCF} formattingOptions={{ decimals: 4 }} />
          <DetailRow label="Laatste Jaarlijkse FCF (TTM)" value={result.latest_fcf_yearly_ttm} formattingOptions={{ isCurrency: true, decimals: 0 }} />
        </div>

        {/* ROE Section */}
        <div className="space-y-2">
          <h4 className="text-lg font-semibold text-green-600">Return on Equity (ROE)</h4>
          <DetailRow label="Gem. ROE (10j)" value={result.gemiddelde_stijging_ROE_10_Y} formattingOptions={{ isPercentage: true }} metricKey="gemiddelde_stijging_ROE_10_Y" calculationDetails={details} />
          <DetailRow label="Standaarddeviatie ROE" value={result.standaard_deviatie_ROE} formattingOptions={{ decimals: 4 }} />
          <DetailRow label="Waardefactor ROE" value={result.waardefactor_ROE} formattingOptions={{ decimals: 4 }} />
        </div>

        {/* LTD/Equity Section */}
        <div className="space-y-2">
          <h4 className="text-lg font-semibold text-purple-600">Long-Term Debt / Equity</h4>
          <DetailRow label="Gem. LTD/Equity" value={result.ltd_equity_mean} formattingOptions={{ decimals: 4 }} />
          <DetailRow label="Waardefactor LTD/Equity" value={result.waardefactor_LTD_equity} formattingOptions={{ decimals: 4 }} />
        </div>

        {/* Intrinsic Value Section */}
        <div className="space-y-2 col-span-1 md:col-span-2 lg:col-span-3">
          <h4 className="text-lg font-semibold text-red-600">Intrinsieke Waarde (DCF)</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div>
              <DetailRow label="Som van verdisconteerde FCFs (10j)" value={result.dcf_sum} formattingOptions={{ isCurrency: true, decimals: 0 }} metricKey="dcf_sum" calculationDetails={details} />
              <DetailRow label="Verdisconteerde Terminal Value" value={result.discounted_terminal_value} formattingOptions={{ isCurrency: true, decimals: 0 }} metricKey="discounted_terminal_value" calculationDetails={details} />
              <DetailRow label="Totale Waarde Onderneming" value={result.total_value} formattingOptions={{ isCurrency: true, decimals: 0 }} />
            </div>
            <div>
              <DetailRow label="Aantal uitstaande aandelen" value={result.latest_shares_outstanding} formattingOptions={{ decimals: 0 }} />
              <DetailRow label="Intrinsieke Waarde per aandeel" value={result.intrinsieke_waarde} formattingOptions={{ isCurrency: true, decimals: 2 }} />
              <DetailRow label="Koopmarge" value={result.koopmarge} formattingOptions={{ isPercentage: true }} />
            </div>
          </div>
        </div>

        {/* Final Score Section */}
        <div className="space-y-2 col-span-1 md:col-span-2 lg:col-span-3">
            <h4 className="text-lg font-semibold text-yellow-600">Eindresultaat</h4>
            <DetailRow label="Selectiecriteria (op 5)" value={result.selectiecriteria} formattingOptions={{ decimals: 0 }} />
            
            <div className="mt-3 p-4 bg-gray-50 rounded-md border border-gray-200">
              <h5 className="text-sm font-bold text-gray-700 mb-2">Criteria Analyse:</h5>
              <ul className="space-y-1 text-sm">
                <li className="flex items-center">
                  <span className={`mr-2 font-bold ${allFcfPositive ? 'text-green-600' : 'text-red-600'}`}>{allFcfPositive ? '✓' : '✗'}</span>
                  <span className={allFcfPositive ? 'text-gray-800' : 'text-gray-500'}>Alle FCF Positief (10j)</span>
                </li>
                <li className="flex items-center">
                  <span className={`mr-2 font-bold ${fcfGrowthPositive ? 'text-green-600' : 'text-red-600'}`}>{fcfGrowthPositive ? '✓' : '✗'}</span>
                  <span className={fcfGrowthPositive ? 'text-gray-800' : 'text-gray-500'}>FCF Groei &gt; 0%</span>
                </li>
                <li className="flex items-center">
                  <span className={`mr-2 font-bold ${avgRoe10Y_gt_15 ? 'text-green-600' : 'text-red-600'}`}>{avgRoe10Y_gt_15 ? '✓' : '✗'}</span>
                  <span className={avgRoe10Y_gt_15 ? 'text-gray-800' : 'text-gray-500'}>Gem. ROE (10j) &ge; 15%</span>
                </li>
                <li className="flex items-center">
                  <span className={`mr-2 font-bold ${roeWaardefactorPositive ? 'text-green-600' : 'text-red-600'}`}>{roeWaardefactorPositive ? '✓' : '✗'}</span>
                  <span className={roeWaardefactorPositive ? 'text-gray-800' : 'text-gray-500'}>Waardefactor ROE &gt; 0</span>
                </li>
                <li className="flex items-center">
                  <span className={`mr-2 font-bold ${ltdWaardefactor_lt_1 ? 'text-green-600' : 'text-red-600'}`}>{ltdWaardefactor_lt_1 ? '✓' : '✗'}</span>
                  <span className={ltdWaardefactor_lt_1 ? 'text-gray-800' : 'text-gray-500'}>Waardefactor LTD/Equity &lt; 1</span>
                </li>
              </ul>
            </div>

            <DetailRow label="Waardeverdeling Score" value={result.waarde_verdeling} formattingOptions={{ decimals: 4 }} />
        </div>

      </div>
    </div>
  );
};

export default CalculationDetail;

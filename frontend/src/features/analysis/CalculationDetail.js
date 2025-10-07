import React from 'react';

const CalculationDetail = ({ result }) => {
  if (!result) return null;

  const formatNumber = (num, decimals = 2) => (num !== null && num !== undefined) ? num.toLocaleString('nl-BE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : 'N/A';
  const formatPercent = (num) => (num !== null && num !== undefined) ? `${formatNumber(num * 100, 2)}%` : 'N/A';

  return (
    <div className="bg-white shadow-md rounded-lg p-6 mt-8">
      <h3 className="text-xl font-bold mb-4">Gedetailleerde Berekening</h3>
      
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-700 border-b pb-2 mb-2">Intrinsieke Waarde Componenten</h4>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="font-semibold">1. Vrije Kasstroom (Laatste 12m)</dt>
          <dd>€ {formatNumber(result.latest_fcf_yearly_ttm, 0)}</dd>
          
          <dt className="font-semibold">2. Gemiddelde FCF Groei</dt>
          <dd>{formatPercent(result.gem_groeipercentage_FCF)}</dd>
          
          <dt className="font-semibold">3. Som van Verdisconteerde FCF (10j)</dt>
          <dd>€ {formatNumber(result.dcf_sum, 0)}</dd>
          
          <dt className="font-semibold">4. Verdisconteerde Terminal Value</dt>
          <dd>€ {formatNumber(result.discounted_terminal_value, 0)}</dd>
          
          <dt className="font-semibold">5. Totale Bedrijfswaarde (3 + 4)</dt>
          <dd>€ {formatNumber(result.total_value, 0)}</dd>
          
          <dt className="font-semibold">6. Aantal Aandelen</dt>
          <dd>{formatNumber(result.latest_shares_outstanding, 0)}</dd>

          <dt className="font-bold text-base mt-2">Eindresultaat (5 / 6)</dt>
          <dd className="font-bold text-base mt-2">€ {formatNumber(result.intrinsieke_waarde, 2)}</dd>
        </dl>
      </div>

      <div>
        <h4 className="text-lg font-semibold text-gray-700 border-b pb-2 mb-2">Waarde Verdeling Componenten</h4>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="font-semibold">1. Waardefactor FCF</dt>
          <dd>{formatNumber(result.waardefactor_FCF, 4)}</dd>

          <dt className="font-semibold">2. Waardefactor ROE</dt>
          <dd>{formatNumber(result.waardefactor_ROE, 4)}</dd>

          <dt className="font-semibold">3. Waardefactor LTD/Equity</dt>
          <dd>{formatNumber(result.waardefactor_LTD_equity, 4)}</dd>

          <dt className="font-bold text-base mt-2">Eindresultaat (1 * (1 + 2) * (-2 * 3 + 2))</dt>
          <dd className="font-bold text-base mt-2">{formatNumber(result.waarde_verdeling, 4)}</dd>
        </dl>
      </div>
    </div>
  );
};

export default CalculationDetail;
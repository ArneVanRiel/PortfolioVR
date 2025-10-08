import React from 'react';

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

const DetailRow = ({ label, value, formattingOptions }) => (
  <div className="flex justify-between py-2 border-b border-gray-200">
    <span className="text-sm font-medium text-gray-600">{label}</span>
    <span className="text-sm font-bold text-gray-800">{formatNumber(value, formattingOptions)}</span>
  </div>
);

const CalculationDetail = ({ result }) => {
  if (!result) {
    return null;
  }

  return (
    <div className="mt-8 p-6 bg-white rounded-lg shadow-lg">
      <h3 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">Calculation Details</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

        {/* FCF Section */}
        <div className="space-y-2">
          <h4 className="text-lg font-semibold text-blue-600">Free Cash Flow (FCF)</h4>
          <DetailRow label="Gem. FCF Groei" value={result.gem_groeipercentage_FCF} formattingOptions={{ isPercentage: true }} />
          <DetailRow label="Standaarddeviatie FCF" value={result.standaard_deviatie_FCF} formattingOptions={{ decimals: 4 }} />
          <DetailRow label="Waardefactor FCF" value={result.waardefactor_FCF} formattingOptions={{ decimals: 4 }} />
          <DetailRow label="Laatste Jaarlijkse FCF (TTM)" value={result.latest_fcf_yearly_ttm} formattingOptions={{ isCurrency: true, decimals: 0 }} />
        </div>

        {/* ROE Section */}
        <div className="space-y-2">
          <h4 className="text-lg font-semibold text-green-600">Return on Equity (ROE)</h4>
          <DetailRow label="Gem. ROE (10j)" value={result.gemiddelde_stijging_ROE_10_Y} formattingOptions={{ isPercentage: true }} />
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
              <DetailRow label="Som van verdisconteerde FCFs (10j)" value={result.dcf_sum} formattingOptions={{ isCurrency: true, decimals: 0 }} />
              <DetailRow label="Verdisconteerde Terminal Value" value={result.discounted_terminal_value} formattingOptions={{ isCurrency: true, decimals: 0 }} />
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
            <DetailRow label="Waardeverdeling Score" value={result.waarde_verdeling} formattingOptions={{ decimals: 4 }} />
        </div>

      </div>
    </div>
  );
};

export default CalculationDetail;

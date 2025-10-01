import React from 'react';

const CalculationFormulas = () => {
  return (
    <div className="bg-gray-100 p-6 rounded-lg shadow-inner mt-8">
      <h3 className="text-xl font-bold mb-4">Calculation Formulas</h3>
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold">Free Cash Flow (FCF)</h4>
          <p className="text-sm text-gray-600">FCF (Quarterly) = Net Cash from Operating Activities - Purchases of Property and Equipment</p>
          <p className="text-sm text-gray-600">FCF (TTM) = Sum of the last 4 quarters of FCF</p>
        </div>
        <div>
          <h4 className="font-semibold">Net Income (TTM)</h4>
          <p className="text-sm text-gray-600">Net Income (TTM) = Sum of the last 4 quarters of Net Income</p>
        </div>
        <div>
          <h4 className="font-semibold">Return on Equity (ROE)</h4>
          <p className="text-sm text-gray-600">ROE (TTM) = Net Income (TTM) / Stockholders Equity</p>
        </div>
        <div>
          <h4 className="font-semibold">Long-Term Debt to Equity</h4>
          <p className="text-sm text-gray-600">Non-Current Liabilities = Total Liabilities - Current Liabilities</p>
          <p className="text-sm text-gray-600">LTD/Equity = Non-Current Liabilities / Stockholders Equity</p>
        </div>
        <div>
          <h4 className="font-semibold">FCF Growth Rate</h4>
          <p className="text-sm text-gray-600">Calculated as the mean of the year-over-year FCF growth rates for the available history.</p>
        </div>
        <div>
          <h4 className="font-semibold">Intrinsic Value (DCF)</h4>
          <p className="text-sm text-gray-600">The intrinsic value is calculated using a 10-year Discounted Cash Flow model. Future FCFs are projected based on the FCF growth rate, then discounted to their present value. A terminal value is also calculated and discounted.</p>
        </div>
        <div>
          <h4 className="font-semibold">Waardeverdeling (Value Distribution)</h4>
          <p className="text-sm text-gray-600">This is a custom metric. The formula is:</p>
          <p className="text-sm font-mono bg-gray-200 p-2 rounded">waardefactor_FCF * (1 + waardefactor_ROE) * (-2 * waardefactor_LTD_equity + 2)</p>
        </div>
      </div>
    </div>
  );
};

export default CalculationFormulas;

import React from 'react';

const PortfolioManager = () => {
  // Placeholder data
  const portfolioSummary = {
    totalValue: '$125,680.50',
    todayChange: '+$542.30',
    todayChangePercentage: '0.43%',
    overallGainLoss: '+$25,680.50',
    overallGainLossPercentage: '25.68%',
  };

  const holdings = [
    { ticker: 'AAPL', name: 'Apple Inc.', quantity: 100, price: 175.50, value: 17550, todayChange: 2.50, gainLoss: 5050 },
    { ticker: 'GOOGL', name: 'Alphabet Inc.', quantity: 50, price: 140.20, value: 7010, todayChange: -1.10, gainLoss: 1010 },
    { ticker: 'MSFT', name: 'Microsoft Corp.', quantity: 75, price: 340.80, value: 25560, todayChange: 3.20, gainLoss: 8060 },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">My Portfolio</h1>
        <div className="flex space-x-4">
          <button className="flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition-colors">
            Add Transaction
          </button>
          <button className="flex items-center bg-gray-200 text-gray-800 px-4 py-2 rounded-lg shadow hover:bg-gray-300 transition-colors">
            Refresh
          </button>
        </div>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <p className="text-sm font-medium text-gray-500">Total Value</p>
          <p className="text-2xl font-semibold text-gray-800">{portfolioSummary.totalValue}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <p className="text-sm font-medium text-gray-500">Today's Change</p>
          <p className={`text-2xl font-semibold ${portfolioSummary.todayChange.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
            {portfolioSummary.todayChange} ({portfolioSummary.todayChangePercentage})
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <p className="text-sm font-medium text-gray-500">Overall Gain/Loss</p>
          <p className={`text-2xl font-semibold ${portfolioSummary.overallGainLoss.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
            {portfolioSummary.overallGainLoss} ({portfolioSummary.overallGainLossPercentage})
          </p>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Holdings</h3>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticker</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Market Value</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Today's Change</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Gain/Loss</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {holdings.map((holding) => (
              <tr key={holding.ticker}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{holding.ticker}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{holding.quantity}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${holding.price.toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${holding.value.toFixed(2)}</td>
                <td className={`px-6 py-4 whitespace-nowrap text-sm ${holding.todayChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${Math.abs(holding.todayChange).toFixed(2)}
                </td>
                <td className={`px-6 py-4 whitespace-nowrap text-sm ${holding.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${holding.gainLoss.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PortfolioManager;
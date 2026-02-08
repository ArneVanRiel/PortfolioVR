import React, { useState, useRef } from 'react';
import CalculationsSummaryTable from '../analysis/CalculationsSummaryTable';
import AlertsSummaryTable from '../analysis/AlertsSummaryTable';
import WatchlistPortfolioTable from './WatchlistPortfolioTable'

// Placeholder components for stats and charts
const StatCard = ({ title, value }) => (
  <div className="bg-white p-6 rounded-lg shadow-md flex items-center space-x-4">
    <div>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-2xl font-semibold text-gray-800">{value}</p>
    </div>
  </div>
);

const ChartCard = ({ title, children }) => (
  <div className="bg-white p-6 rounded-lg shadow-md">
    <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
    <div className="h-64">{children}</div>
  </div>
);

const Dashboard = () => {
  const [viewType, setViewType] = useState('idealePortfolio');
  const watchlistTableRef = useRef(null);

  const handleAddStock = () => {
    if (watchlistTableRef.current) {
      watchlistTableRef.current.openAddStockModal();
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
        <div className="flex space-x-4">
          <button
            onClick={handleAddStock}
            className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Voeg Aandelen Toe aan {viewType === 'watchlist' ? 'Watchlist' : 'Ideale Portfolio'}
          </button>
          <button className="bg-gray-500 text-white px-4 py-2 rounded-lg shadow hover:bg-gray-600 transition-colors">
            Generate Report
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Portfolio Value" value="$125,680.50" />
        <StatCard title="Available Cash" value="$15,230.00" />
        <StatCard title="Today's Gain/Loss" value="+$542.30" />
        <StatCard title="Asset Allocation" value="60% Stocks / 40% Bonds" />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Portfolio Performance">
          {/* Placeholder for Line Chart */}
          <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
            <p className="text-gray-500">Portfolio Performance Chart</p>
          </div>
        </ChartCard>
        <ChartCard title="Asset Allocation">
          {/* Placeholder for Pie Chart */}
          <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
            <p className="text-gray-500">Asset Allocation Donut Chart</p>
          </div>
        </ChartCard>
      </div>

      {/* Calculations Summary Table */}
      <AlertsSummaryTable />
      <CalculationsSummaryTable />
      <WatchlistPortfolioTable ref={watchlistTableRef} onViewTypeChange={setViewType} />

      {/* Recent Activity Table */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Activity</h3>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Placeholder rows */}
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">BUY</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">AAPL</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$5,000</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">2025-09-21</td>
            </tr>
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">SELL</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">GOOGL</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$3,500</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">2025-09-20</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;
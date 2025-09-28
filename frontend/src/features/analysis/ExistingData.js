import React from 'react';

const FUNDAMENTAL_DATA_TYPES = [
    { key: 'NetCashProvidedByUsedInOperatingActivities', label: 'Net Cash Provided by/Used in Operating Activities' },
    { key: 'PurchasesOfPropertyAndEquipment', label: 'Purchases of Property and Equipment' },
    { key: 'StockholdersEquity', label: 'Stockholders Equity' },
    { key: 'NetIncomeLoss', label: 'Net Income/Loss' },
    { key: 'Liabilities', label: 'Liabilities' },
    { key: 'LiabilitiesCurrent', label: 'Current Liabilities' },
    { key: 'WeightedAverageNumberOfDilutedSharesOutstanding', label: 'Weighted Average Number of Diluted Shares Outstanding' },
];

const ExistingData = ({
  existingFundamentalData,
  selectedStock,
  loading,
  handleDeleteClick,
  filterStartDate,
  setFilterStartDate,
  filterEndDate,
  setFilterEndDate,
  filterDataType,
  setFilterDataType,
}) => {

  const getFilteredFundamentalData = () => {
    let filteredData = existingFundamentalData;

    if (filterStartDate) {
      filteredData = filteredData.filter(item => {
        const itemEndDate = new Date(item.period_end_date);
        const filterStart = new Date(filterStartDate);
        return itemEndDate >= filterStart;
      });
    }

    if (filterEndDate) {
      filteredData = filteredData.filter(item => {
        const itemEndDate = new Date(item.period_end_date);
        const filterEnd = new Date(filterEndDate);
        return itemEndDate <= filterEnd;
      });
    }

    if (filterDataType) {
      filteredData = filteredData.filter(item => item.data_type === filterDataType);
    }

    return filteredData;
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h5 className="text-lg font-semibold text-gray-800 mb-4">Bestaande Fundamentele Data voor {selectedStock.ticker}</h5>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label htmlFor="filterStartDate" className="block text-sm font-medium text-gray-700">Filter Start Datum:</label>
          <input
            type="date"
            id="filterStartDate"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="filterEndDate" className="block text-sm font-medium text-gray-700">Filter Eind Datum:</label>
          <input
            type="date"
            id="filterEndDate"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="filterDataType" className="block text-sm font-medium text-gray-700">Filter Datatype:</label>
          <select
            id="filterDataType"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={filterDataType}
            onChange={(e) => setFilterDataType(e.target.value)}
          >
            <option value="">Alle Datatypes</option>
            {FUNDAMENTAL_DATA_TYPES.map(type => (
              <option key={type.key} value={type.key}>{type.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div>Bestaande data laden...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Periode Eind Datum</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Periode Start Datum</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">FY</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">FP_ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Formulier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Datatype</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waarde</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hoe Toegevoegd</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acties</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {getFilteredFundamentalData().length > 0 ? (
                getFilteredFundamentalData().map(data => (
                  <tr key={data.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(data.period_end_date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{data.period_start_date ? new Date(data.period_start_date).toLocaleDateString() : 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{data.fy}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{data.fp_id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{data.form_id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{data.data_type}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{data.value !== null ? data.value.toFixed(2) : 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{data.how_added}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        className="text-red-600 hover:text-red-900"
                        onClick={() => handleDeleteClick(data)}
                      >
                        Verwijder
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="text-center py-4">Geen fundamentele data gevonden voor dit aandeel of met de huidige filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExistingData;

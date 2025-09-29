import React from 'react';
import { useNavigate } from 'react-router-dom';

const FUNDAMENTAL_DATA_TYPES = [
    { key: 'NetCashProvidedByUsedInOperatingActivities', label: 'Net Cash Provided by/Used in Operating Activities' },
    { key: 'PurchasesOfPropertyAndEquipment', label: 'Purchases of Property and Equipment' },
    { key: 'StockholdersEquity', label: 'Stockholders Equity' },
    { key: 'NetIncomeLoss', label: 'Net Income/Loss' },
    { key: 'Liabilities', label: 'Liabilities' },
    { key: 'LiabilitiesCurrent', label: 'Current Liabilities' },
    { key: 'WeightedAverageNumberOfDilutedSharesOutstanding', label: 'Weighted Average Number of Diluted Shares Outstanding' },
];

const DataCompleteness = ({
  singleStockAnalysisResult,
  selectedStock,
  selectedAnalysisDate,
  setSelectedAnalysisDate,
  loading,
  handleGoToMissingQuarter,
  handleOpenMultiDateModal,
}) => {
  const navigate = useNavigate();

  if (!singleStockAnalysisResult) {
    return null; // Don't render if there's no analysis result
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mb-8">
      <h5 className="text-lg font-semibold text-gray-800 mb-4">Data Completeness Analyse voor {selectedStock.ticker} op {selectedAnalysisDate}</h5>
      <div className="mb-3">
        <label htmlFor="analysisDate" className="block text-sm font-medium text-gray-700">Analysedatum:</label>
        <input
          type="date"
          id="analysisDate"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          value={selectedAnalysisDate}
          onChange={(e) => setSelectedAnalysisDate(e.target.value)}
        />
      </div>

      {loading ? (
        <div>Analysedata laden...</div>
      ) : (
        <>
          <p className="font-bold">Algemene Compleetheid: {singleStockAnalysisResult.overallCompletenessPercentage.toFixed(2)}%</p>
          <h6 className="mt-3 font-semibold">Compleetheid per Datatype:</h6>
          <ul className="space-y-2 mb-3">
            {FUNDAMENTAL_DATA_TYPES.map(type => {
              const analysis = singleStockAnalysisResult.dataTypeCompleteness[type.key];
              return (
                <li key={type.key} className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
                  <span>{type.label} ({analysis?.earliestExpectedDate || 'N/A'} tot {selectedAnalysisDate}):</span>
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${analysis?.percentage === 100 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {analysis?.percentage?.toFixed(2) || 'N/A'}% ({analysis?.foundCount || 0}/{analysis?.expectedCount || 0} kwartalen)
                  </span>
                </li>
              );
            })}
          </ul>

          {singleStockAnalysisResult.multipleDatesPerQuarter.length > 0 && (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mt-3">
              <h6 className="font-bold">Meerdere Periodes per Kwartaal Gevonden:</h6>
              <ul className="list-disc list-inside">
                {singleStockAnalysisResult.multipleDatesPerQuarter.map((anomaly, index) => (
                  <li key={index}>
                    <span className="font-bold">{anomaly.dataType}</span> voor FY {anomaly.fy} Q{anomaly.fp_id}: {(anomaly.conflictingData || []).map(d => (d.period_end_date || '').split('T')[0]).join(', ')}
                    <button onClick={() => handleOpenMultiDateModal(anomaly)} className="ml-4 bg-orange-500 text-white px-2 py-1 rounded text-xs">Oplossen</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {singleStockAnalysisResult.quarterSequenceBroken && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mt-3">
              <h6 className="font-bold">Gebroken Kwartaalvolgorde Gedetecteerd:</h6>
              <ul className="list-disc list-inside">
                {singleStockAnalysisResult.brokenQuarterSequenceDetails.map((detail, index) => (
                  <li key={index}>
                    <span className="font-bold">{detail.dataType}</span>: Van {detail.prevDate} (Q{detail.prevFpId} FY{detail.prevFy}) naar {detail.currentDate} (Q{detail.currentFpId} FY{detail.currentFy}). Reden: {detail.reason}. Dagen verschil: {detail.daysDifference}.
                    <button className="ml-4 bg-red-500 text-white px-2 py-1 rounded text-xs">Oplossen</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {singleStockAnalysisResult.missingRecentQuarters.length > 0 && (
            <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mt-3">
              <h6 className="font-bold">Ontbrekende Recente/Historische Kwartalen:</h6>
              <ul className="list-disc list-inside">
                {singleStockAnalysisResult.missingRecentQuarters.map((missing, index) => (
                  <li key={index}>
                    <span className="font-bold">{missing.dataType}</span>: Verwachte datum {missing.expectedDate}. Reden: {missing.reason}.
                    <button
                        className="ml-4 bg-blue-500 text-white px-2 py-1 rounded text-xs"
                        onClick={() => handleGoToMissingQuarter(missing.expectedDate)}
                    >
                        Voeg data toe
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {singleStockAnalysisResult.allData100PercentComplete && (
            <div className="mt-3 text-center">
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
                onClick={() => navigate('/updateData', {
                  state: {
                    ticker: singleStockAnalysisResult.ticker_symbol,
                    periodEndDate: singleStockAnalysisResult.selected_date
                  }
                })}
              >
                Ga naar Berekeningen
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DataCompleteness;
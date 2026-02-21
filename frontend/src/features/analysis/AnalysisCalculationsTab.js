import React, { useState, useEffect, useCallback } from 'react';
import http from '../../http-common';
import Modal from '../../components/ui/modal';
import CalculationFormulas from './CalculationFormulas';
import CalculationDataModal from './CalculationDataModal';
import CalculationDetail from './CalculationDetail';

const dataPeriods = {
  StockholdersEquity: 44 * 3,
  NetCashProvidedByUsedInOperatingActivities: 44 * 3,
  PurchasesOfPropertyAndEquipment: 44 * 3,
  LiabilitiesCurrent: 8 * 3,
  Liabilities: 8 * 3,
  NetIncomeLoss: 44 * 3,
  WeightedAverageNumberOfDilutedSharesOutstanding: 8 * 3,
};
const MAX_LOOKBACK_MONTHS = Math.max(...Object.values(dataPeriods));

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const AnalysisCalculationsTab = ({ selectedStock, onCalculationsUpdate }) => {
  const [calculationAnalysisDate, setCalculationAnalysisDate] = useState(formatDate(new Date()));
  const [calculationAnalysisResult, setCalculationAnalysisResult] = useState(null);
  const [isCalculatingAnalysis, setIsCalculatingAnalysis] = useState(false);
  const [calculationError, setCalculationError] = useState('');
  
  const [existingCalculations, setExistingCalculations] = useState([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showFormulas, setShowFormulas] = useState(false);
  
  const [selectedCalculationDetail, setSelectedCalculationDetail] = useState(null);
  
  // Data Modal
  const [showDataModal, setShowDataModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [modalError, setModalError] = useState('');

  // Delete Modal
  const [showDeleteCalcConfirmModal, setShowDeleteCalcConfirmModal] = useState(false);
  const [calcToDelete, setCalcToDelete] = useState(null);

  const fetchExistingCalculations = useCallback(async () => {
    if (!selectedStock) return;
    try {
      const response = await http.get(`/calculations/${selectedStock.stock_id}`);
      setExistingCalculations(response.data);
    } catch (err) {
      console.error('Error fetching existing calculations:', err);
    }
  }, [selectedStock]);

  const fetchAnalysisForCalculations = useCallback(async () => {
    if (!selectedStock) return;
    setIsCalculatingAnalysis(true);
    setCalculationError('');
    try {
      const response = await http.post(`/fundamental-data/single-stock-analysis/${selectedStock.stock_id}`, {
        dataPeriods: dataPeriods,
        selectedDate: calculationAnalysisDate,
        maxLookbackMonths: MAX_LOOKBACK_MONTHS
      });
      setCalculationAnalysisResult(response.data);
    } catch (err) {
      setCalculationError(`Error fetching analysis: ${err.message}`);
    } finally {
      setIsCalculatingAnalysis(false);
    }
  }, [selectedStock, calculationAnalysisDate]);

  useEffect(() => {
    if (selectedStock) {
      fetchExistingCalculations();
      fetchAnalysisForCalculations();
    }
  }, [selectedStock, fetchExistingCalculations, fetchAnalysisForCalculations]);

  const handleRunCalculation = async (periodEndDate = null) => {
    if (!selectedStock) return;
    setIsCalculating(true);
    setCalculationError('');
    try {
      const response = await http.post(`/calculations/${selectedStock.stock_id}`, { period_end_date: periodEndDate });
      setSelectedCalculationDetail(response.data.data);
      fetchExistingCalculations();
      if (onCalculationsUpdate) onCalculationsUpdate();
    } catch (err) {
      setCalculationError(`Error running calculation: ${err.message}`);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleDeleteCalculationClick = (calc) => {
    setCalcToDelete(calc);
    setShowDeleteCalcConfirmModal(true);
  };

  const handleConfirmDeleteCalculation = async () => {
    if (!calcToDelete) return;
    try {
      await http.delete(`/calculations/${calcToDelete.id}`);
      setShowDeleteCalcConfirmModal(false);
      setCalcToDelete(null);
      fetchExistingCalculations();
      if (selectedCalculationDetail?.id === calcToDelete.id) setSelectedCalculationDetail(null);
      if (onCalculationsUpdate) onCalculationsUpdate();
    } catch (err) {
      setCalculationError(`Delete failed: ${err.message}`);
    }
  };

  return (
    <div>
      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <h5 className="text-lg font-semibold text-gray-800 mb-4">Analyse voor Berekening</h5>
        <div className="mb-3">
            <label htmlFor="calculationAnalysisDate" className="block text-sm font-medium text-gray-700">Analysedatum:</label>
            <input
                type="date"
                id="calculationAnalysisDate"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                value={calculationAnalysisDate}
                onChange={(e) => setCalculationAnalysisDate(e.target.value)}
            />
        </div>
        {isCalculatingAnalysis ? (
            <div>Analyse voor berekening wordt geladen...</div>
        ) : calculationAnalysisResult ? (
            <p className="font-bold">Data Compleetheid: {calculationAnalysisResult.overallCompletenessPercentage.toFixed(2)}%</p>
        ) : (
            <p>Selecteer een datum om de compleetheid te analyseren.</p>
        )}
      </div>

      <div className="flex justify-center mb-4">
        <button
          onClick={() => handleRunCalculation(calculationAnalysisResult?.latest_period_end_date)}
          disabled={
            isCalculating ||
            !calculationAnalysisResult ||
            calculationAnalysisResult?.overallCompletenessPercentage < 100 ||
            (calculationAnalysisResult?.latest_period_end_date && existingCalculations.some(calc =>
              calc.period_end_date &&
              new Date(calc.period_end_date).toISOString().split('T')[0] === new Date(calculationAnalysisResult.latest_period_end_date).toISOString().split('T')[0]
            ))
          }
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-400"
        >
          {isCalculating ? 'Berekenen...' : 'Start Nieuwe Berekening'}
        </button>
      </div>
      {calculationError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">{calculationError}</div>}

      <div className="mt-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-bold">Bestaande Berekeningen</h3>
          <button onClick={() => setShowFormulas(!showFormulas)} className="text-sm text-blue-600 hover:underline">
            {showFormulas ? 'Verberg' : 'Toon'} Formules
          </button>
        </div>
        {showFormulas && <CalculationFormulas />}
        
        {existingCalculations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period End</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Intrinsic Value</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waardeverdeling</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Criteria</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {existingCalculations.map((calc) => (
                  <tr key={calc.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{new Date(calc.period_end_date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{calc.intrinsieke_waarde?.toFixed(2) || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{calc.waarde_verdeling?.toFixed(4) || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{calc.selectiecriteria} / 5</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button onClick={() => handleRunCalculation(calc.period_end_date)} className="text-indigo-600 hover:text-indigo-900">Herberekenen</button>
                      <button onClick={() => setSelectedCalculationDetail(calc)} className="text-green-600 hover:text-green-900">Details</button>
                      <button onClick={() => handleDeleteCalculationClick(calc)} className="text-red-600 hover:text-red-900">Verwijderen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p>Geen berekeningen gevonden.</p>}
      </div>

      {selectedCalculationDetail && <CalculationDetail result={selectedCalculationDetail} />}

      {showDeleteCalcConfirmModal && (
        <Modal isOpen={showDeleteCalcConfirmModal} onClose={() => setShowDeleteCalcConfirmModal(false)}>
          <div className="p-6">
            <h5 className="text-lg font-bold text-red-600">Bevestig Verwijdering</h5>
            <p>Weet je zeker dat je deze berekening wilt verwijderen?</p>
            <div className="mt-6 flex justify-end space-x-4">
              <button onClick={() => setShowDeleteCalcConfirmModal(false)} className="bg-gray-200 px-4 py-2 rounded">Annuleren</button>
              <button onClick={handleConfirmDeleteCalculation} className="bg-red-500 text-white px-4 py-2 rounded">Verwijderen</button>
            </div>
          </div>
        </Modal>
      )}
      
      <CalculationDataModal isOpen={showDataModal} onClose={() => setShowDataModal(false)} data={modalData} error={modalError} />
    </div>
  );
};

export default AnalysisCalculationsTab;

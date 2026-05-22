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

  const handleDetailsClick = async (calc) => {
    // Toon eerst de basisdata die we al hebben
    setSelectedCalculationDetail(calc);
    
    try {
        // Haal de volledige details op (herberekening op server)
        const response = await http.get(`/calculations/${selectedStock.stock_id}/details`, {
            params: { period_end_date: calc.period_end_date }
        });
        setSelectedCalculationDetail(response.data);
    } catch (err) {
        console.error("Error fetching calculation details:", err);
        // We laten de basisdata staan, maar loggen de fout
    }
  };

  return (
    <div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
        <h5 className="text-xl font-bold text-gray-800 mb-4">Analyse voor Berekening</h5>
        <div className="mb-3">
            <label htmlFor="calculationAnalysisDate" className="block text-sm font-semibold text-gray-700 mb-1">Analysedatum:</label>
            <input
                type="date"
                id="calculationAnalysisDate"
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2"
                value={calculationAnalysisDate}
                onChange={(e) => setCalculationAnalysisDate(e.target.value)}
            />
        </div>
        {isCalculatingAnalysis ? (
            <div>Analyse voor berekening wordt geladen...</div>
        ) : calculationAnalysisResult ? (
            <p className="font-medium text-gray-700 mt-2">Data Compleetheid: <span className={`font-bold ${calculationAnalysisResult.overallCompletenessPercentage === 100 ? 'text-green-600' : 'text-yellow-600'}`}>{calculationAnalysisResult.overallCompletenessPercentage.toFixed(2)}%</span></p>
        ) : (
            <p className="text-gray-500 mt-2">Selecteer een datum om de compleetheid te analyseren.</p>
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
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-lg shadow-sm transition-all duration-200 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isCalculating ? 'Berekenen...' : 'Start Nieuwe Berekening'}
        </button>
      </div>
      {calculationError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">{calculationError}</div>}

      <div className="mt-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-800">Bestaande Berekeningen</h3>
          <button onClick={() => setShowFormulas(!showFormulas)} className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
            {showFormulas ? 'Verberg' : 'Toon'} Formules
          </button>
        </div>
        {showFormulas && <CalculationFormulas />}
        
        {existingCalculations.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 bg-white">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Period End</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Intrinsic Value</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Waardeverdeling</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Criteria</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {existingCalculations.map((calc) => (
                  <tr key={calc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{new Date(calc.period_end_date).toLocaleDateString()}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{calc.intrinsieke_waarde?.toFixed(2) || 'N/A'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{calc.waarde_verdeling?.toFixed(4) || 'N/A'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{calc.selectiecriteria} / 5</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs space-x-2">
                      <button onClick={() => handleRunCalculation(calc.period_end_date)} className="text-blue-600 hover:text-blue-800 font-medium">Herberekenen</button>
                      <button onClick={() => handleDetailsClick(calc)} className="text-emerald-600 hover:text-emerald-800 font-medium">Details</button>
                      <button onClick={() => handleDeleteCalculationClick(calc)} className="text-red-600 hover:text-red-800 font-medium">Verwijderen</button>
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
          <div className="p-8">
            <h5 className="text-lg font-bold text-red-600">Bevestig Verwijdering</h5>
            <p className="text-gray-600 mt-2">Weet je zeker dat je deze berekening wilt verwijderen? Dit kan niet ongedaan worden gemaakt.</p>
            <div className="mt-6 flex justify-end space-x-4">
              <button onClick={() => setShowDeleteCalcConfirmModal(false)} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">Annuleren</button>
              <button onClick={handleConfirmDeleteCalculation} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 shadow-sm transition-colors">Verwijderen</button>
            </div>
          </div>
        </Modal>
      )}
      
      <CalculationDataModal isOpen={showDataModal} onClose={() => setShowDataModal(false)} data={modalData} error={modalError} />
    </div>
  );
};

export default AnalysisCalculationsTab;

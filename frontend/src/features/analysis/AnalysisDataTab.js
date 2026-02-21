import React, { useState, useEffect, useCallback } from 'react';
import http from '../../http-common';
import Modal from '../../components/ui/modal';
import AddData from './AddData';
import DataCompleteness from './DataCompleteness';
import ExistingData from './ExistingData';

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

const AnalysisDataTab = ({ selectedStock, onDataUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inputMethod, setInputMethod] = useState('manual');
  
  // Data states
  const [existingFundamentalData, setExistingFundamentalData] = useState([]);
  const [singleStockAnalysisResult, setSingleStockAnalysisResult] = useState(null);
  const [selectedAnalysisDate, setSelectedAnalysisDate] = useState(formatDate(new Date()));

  // Manual Input States
  const [manualPeriodEndDate, setManualPeriodEndDate] = useState('');
  const [manualPeriodStartDate, setManualPeriodStartDate] = useState('');
  const [manualFY, setManualFY] = useState('');
  const [manualFPId, setManualFPId] = useState('');
  const [manualFormId, setManualFormId] = useState('');
  const [manualDataValues, setManualDataValues] = useState(
    Object.keys(dataPeriods).reduce((acc, key) => ({ ...acc, [key]: '' }), {})
  );
  const [isDateConfirmed, setIsDateConfirmed] = useState(false);
  const [nearbyDateSuggestion, setNearbyDateSuggestion] = useState(null);
  const [canEditMetaData, setCanEditMetaData] = useState(true);

  // Dropdown data
  const [fiscalPeriods, setFiscalPeriods] = useState([]);
  const [formTypes, setFormTypes] = useState([]);
  const [periodEndDates, setPeriodEndDates] = useState([]);

  // Filtering
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterDataType, setFilterDataType] = useState('');

  // Modals
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [stockToDelete, setStockToDelete] = useState(null);
  const [deleteConfirmEndDate, setDeleteConfirmEndDate] = useState('');
  const [deleteError, setDeleteError] = useState('');
  
  const [showMultiDateModal, setShowMultiDateModal] = useState(false);
  const [multiDateAnomaly, setMultiDateAnomaly] = useState(null);
  const [editedData, setEditedData] = useState([]);

  // External APIs
  const [secPeriodOption, setSecPeriodOption] = useState('all');
  const [isImporting, setIsImporting] = useState(false);
  const [importLog, setImportLog] = useState([]);
  const [importProgress, setImportProgress] = useState(0);

  const [alphaVantageFunction, setAlphaVantageFunction] = useState('');
  const [alphaVantageFetchYear, setAlphaVantageFetchYear] = useState('');
  const [alphaVantageFetchedData, setAlphaVantageFetchedData] = useState(null);
  const [isAlphaVantageFetching, setIsAlphaVantageFetching] = useState(false);

  // Initial Data Fetching
  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const [fpRes, formRes] = await Promise.all([
          http.get(`/fundamental-data/fiscal-periods`),
          http.get(`/fundamental-data/forms`)
        ]);
        setFiscalPeriods(fpRes.data);
        setFormTypes(formRes.data);
      } catch (err) {
        console.error('Error fetching dropdowns:', err);
      }
    };
    fetchDropdowns();
  }, []);

  const fetchExistingFundamentalData = useCallback(async () => {
    if (!selectedStock) return;
    try {
      setError('');
      const response = await http.get(`/fundamental-data/stock/${selectedStock.stock_id}/all-periods`);
      setExistingFundamentalData(response.data);
    } catch (err) {
      setError('Could not fetch existing fundamental data.');
    }
  }, [selectedStock]);

  const fetchSingleStockAnalysis = useCallback(async () => {
    if (!selectedStock) return;
    setLoading(true);
    try {
      const response = await http.post(`/fundamental-data/single-stock-analysis/${selectedStock.stock_id}`, {
        dataPeriods: dataPeriods,
        selectedDate: selectedAnalysisDate,
        maxLookbackMonths: MAX_LOOKBACK_MONTHS
      });
      setSingleStockAnalysisResult(response.data);
    } catch (err) {
      setError(`Error fetching analysis: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedStock, selectedAnalysisDate]);

  useEffect(() => {
    if (selectedStock) {
      fetchExistingFundamentalData();
      fetchSingleStockAnalysis();
    }
  }, [selectedStock, fetchExistingFundamentalData, fetchSingleStockAnalysis]);

  useEffect(() => {
    if (existingFundamentalData.length > 0) {
      const uniqueDates = [...new Set(existingFundamentalData.map(item => item.period_end_date))]
        .sort((a, b) => new Date(b) - new Date(a))
        .map(date => new Date(date).toISOString().split('T')[0]);
      setPeriodEndDates(uniqueDates);
    } else {
      setPeriodEndDates([]);
    }
  }, [existingFundamentalData]);

  // Handlers
  const checkDate = useCallback(async (date) => {
    if (!selectedStock || !date) {
      setError('Please select a stock and enter a Period End Date.');
      return;
    }
    setLoading(true);
    setError('');
    setIsDateConfirmed(false);
    setNearbyDateSuggestion(null);
    setCanEditMetaData(true);
    setManualPeriodStartDate('');
    try {
      const response = await http.get(`/fundamental-data/check-date-data/${selectedStock.stock_id}/${date}`);
      const { foundDate, dataForDate, nearbyDate, fy, fp_id, form_id, suggestedPeriodStartDate, period_start_date: existingPeriodStartDate, message } = response.data;
      if (foundDate) {
        setManualPeriodEndDate(foundDate);
        setIsDateConfirmed(true);
        setManualFY(fy || '');
        setManualFPId(fp_id || '');
        setManualFormId(form_id || '');
        setManualPeriodStartDate(existingPeriodStartDate || '');
        setCanEditMetaData(true);
        const newManualDataValues = Object.keys(dataPeriods).reduce((acc, key) => {
          const foundDataItem = dataForDate.find(item => item.data_type === key);
          return { ...acc, [key]: foundDataItem ? foundDataItem.value : '' };
        }, {});
        setManualDataValues(newManualDataValues);
      } else if (nearbyDate) {
        setNearbyDateSuggestion(nearbyDate);
        setError(`No exact data for ${date}. ${message}`);
      } else {
        setError(message);
        setIsDateConfirmed(true);
        setManualFY('');
        setManualFPId('');
        setManualFormId('');
        setManualDataValues(Object.keys(dataPeriods).reduce((acc, key) => ({ ...acc, [key]: '' }), {}));
        setManualPeriodStartDate(suggestedPeriodStartDate || '');
      }
    } catch (err) {
      setError(`Error checking date: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedStock]);

  const handleAddManualData = async () => {
    // Validation logic...
    if (!manualPeriodEndDate || !manualPeriodStartDate || manualFY === '' || manualFPId === '' || !isDateConfirmed) {
        setError('Please fill in all required fields and confirm the date.');
        return;
    }

    const filteredData = Object.keys(dataPeriods)
      .filter(key => manualDataValues[key] !== '' && !isNaN(parseFloat(manualDataValues[key])))
      .map(key => ({ data_type: key, value: parseFloat(manualDataValues[key]) }));

    if (filteredData.length === 0) {
      alert('Please enter at least one data point.');
      return;
    }

    const dataToSend = {
      stock_id: parseInt(selectedStock.stock_id),
      period_end_date: manualPeriodEndDate,
      period_start_date: manualPeriodStartDate,
      fy: parseInt(manualFY),
      fp_id: parseInt(manualFPId),
      form_id: manualFormId ? parseInt(manualFormId) : null,
      how_added: 'Manually Entered',
      data: filteredData,
    };

    try {
      setLoading(true);
      const response = await http.post(`/fundamental-data/manual`, dataToSend);
      alert(response.data.message);
      // Reset form
      setManualPeriodEndDate('');
      setManualPeriodStartDate('');
      setManualFY('');
      setManualFPId('');
      setManualFormId('');
      setManualDataValues(Object.keys(dataPeriods).reduce((acc, key) => ({ ...acc, [key]: '' }), {}));
      setIsDateConfirmed(false);
      setNearbyDateSuggestion(null);
      
      fetchExistingFundamentalData();
      fetchSingleStockAnalysis();
      if(onDataUpdate) onDataUpdate();
    } catch (err) {
      setError(`Error adding data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportSecData = async () => {
    if (!selectedStock) return;
    setIsImporting(true);
    setImportLog([`Starting import for ${selectedStock.ticker}...`]);
    setImportProgress(0);
    
    try {
        const response = await fetch(`http://localhost:5000/api/sec/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: selectedStock.ticker, periodOption: secPeriodOption }),
        });
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let totalItems = 0;
        let processedItems = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            
            setImportLog(prev => [...prev, ...lines]);
            
            lines.forEach(line => {
                if (line.startsWith('TOTAL_ITEMS:')) totalItems = parseInt(line.split(':')[1], 10);
                else if (totalItems > 0 && (line.startsWith('✅') || line.startsWith('🔄'))) {
                    processedItems++;
                    setImportProgress(Math.round((processedItems / totalItems) * 100));
                }
            });
        }
        setIsImporting(false);
        fetchExistingFundamentalData();
        fetchSingleStockAnalysis();
        if(onDataUpdate) onDataUpdate();
    } catch (err) {
        setError(`Import failed: ${err.message}`);
        setIsImporting(false);
    }
  };

  const fetchAlphaVantageData = async () => {
      if (!selectedStock || !alphaVantageFunction || !alphaVantageFetchYear) return;
      setIsAlphaVantageFetching(true);
      try {
          const response = await http.post(`/fundamental-data/fetch-alphavantage`, {
              stock_id: selectedStock.stock_id,
              ticker: selectedStock.ticker,
              function: alphaVantageFunction,
              year: parseInt(alphaVantageFetchYear)
          });
          setAlphaVantageFetchedData(response.data.data);
      } catch (err) {
          setError(`Alpha Vantage Error: ${err.message}`);
      } finally {
          setIsAlphaVantageFetching(false);
      }
  };

  const handleSaveAlphaVantageData = async () => {
      if (!alphaVantageFetchedData) return;
      setLoading(true);
      try {
          await http.post(`/fundamental-data/save-alphavantage-fetched`, {
              stock_id: selectedStock.stock_id,
              data: alphaVantageFetchedData
          });
          alert('Data saved.');
          setAlphaVantageFetchedData(null);
          fetchExistingFundamentalData();
          fetchSingleStockAnalysis();
          if(onDataUpdate) onDataUpdate();
      } catch (err) {
          setError(`Save Error: ${err.message}`);
      } finally {
          setLoading(false);
      }
  };

  const handleDeleteClick = (dataItem) => {
    setStockToDelete(dataItem);
    setShowDeleteConfirmModal(true);
  };

  const handleConfirmDelete = async () => {
      if (!stockToDelete) return;
      // Date validation logic here...
      try {
          await http.delete(`/fundamental-data/delete-data/${stockToDelete.id}`);
          setShowDeleteConfirmModal(false);
          setStockToDelete(null);
          fetchExistingFundamentalData();
          fetchSingleStockAnalysis();
          if(onDataUpdate) onDataUpdate();
      } catch (err) {
          setDeleteError(`Delete failed: ${err.message}`);
      }
  };

  const handleOpenMultiDateModal = (anomaly) => {
      setMultiDateAnomaly(anomaly);
      setEditedData(anomaly.conflictingData || []);
      setShowMultiDateModal(true);
  };

  const handleUpdateDataPoint = async (id, index) => {
      const item = editedData[index];
      try {
          await http.put(`/fundamental-data/data-point/${id}`, { fp_id: parseInt(item.fp_id) });
          alert('Updated');
          fetchExistingFundamentalData();
          fetchSingleStockAnalysis();
          setShowMultiDateModal(false);
      } catch (err) {
          alert(`Update failed: ${err.message}`);
      }
  };

  const getFiscalYearOptions = () => {
      if (!manualPeriodEndDate) return [];
      const y = new Date(manualPeriodEndDate).getFullYear();
      return [y-3, y-2, y-1, y, y+1].sort((a,b) => b-a);
  };

  return (
    <div className="space-y-8">
      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">{error}</div>}
      
      <AddData
        selectedStock={selectedStock}
        inputMethod={inputMethod}
        setInputMethod={setInputMethod}
        manualPeriodEndDate={manualPeriodEndDate}
        setManualPeriodEndDate={setManualPeriodEndDate}
        manualPeriodStartDate={manualPeriodStartDate}
        setManualPeriodStartDate={setManualPeriodStartDate}
        manualFY={manualFY}
        setManualFY={setManualFY}
        manualFPId={manualFPId}
        setManualFPId={setManualFPId}
        manualFormId={manualFormId}
        setManualFormId={setManualFormId}
        manualDataValues={manualDataValues}
        isDateConfirmed={isDateConfirmed}
        setIsDateConfirmed={setIsDateConfirmed}
        nearbyDateSuggestion={nearbyDateSuggestion}
        canEditMetaData={canEditMetaData}
        checkDate={checkDate}
        handleCheckDateClick={() => checkDate(manualPeriodEndDate)}
        handleUseSuggestedDate={() => { setManualPeriodEndDate(nearbyDateSuggestion); checkDate(nearbyDateSuggestion); }}
        periodEndDates={periodEndDates}
        fiscalPeriods={fiscalPeriods}
        formTypes={formTypes}
        getFiscalYearOptions={getFiscalYearOptions}
        handleAddManualData={handleAddManualData}
        loading={loading}
        secPeriodOption={secPeriodOption}
        setSecPeriodOption={setSecPeriodOption}
        handleImportSecData={handleImportSecData}
        isImporting={isImporting}
        importProgress={importProgress}
        importLog={importLog}
        alphaVantageFunction={alphaVantageFunction}
        setAlphaVantageFunction={setAlphaVantageFunction}
        alphaVantageFetchYear={alphaVantageFetchYear}
        setAlphaVantageFetchYear={setAlphaVantageFetchYear}
        fetchAlphaVantageData={fetchAlphaVantageData}
        isAlphaVantageFetching={isAlphaVantageFetching}
        alphaVantageFetchedData={alphaVantageFetchedData}
        handleSaveAlphaVantageData={handleSaveAlphaVantageData}
      />

      <DataCompleteness
        singleStockAnalysisResult={singleStockAnalysisResult}
        selectedStock={selectedStock}
        selectedAnalysisDate={selectedAnalysisDate}
        setSelectedAnalysisDate={setSelectedAnalysisDate}
        loading={loading}
        handleGoToMissingQuarter={(date) => { setManualPeriodEndDate(date); window.scrollTo({top:0, behavior:'smooth'}); checkDate(date); }}
        handleOpenMultiDateModal={handleOpenMultiDateModal}
      />

      <ExistingData
        existingFundamentalData={existingFundamentalData}
        selectedStock={selectedStock}
        loading={loading}
        handleDeleteClick={handleDeleteClick}
        filterStartDate={filterStartDate}
        setFilterStartDate={setFilterStartDate}
        filterEndDate={filterEndDate}
        setFilterEndDate={setFilterEndDate}
        filterDataType={filterDataType}
        setFilterDataType={setFilterDataType}
      />

      {showDeleteConfirmModal && (
          <Modal isOpen={showDeleteConfirmModal} onClose={() => setShowDeleteConfirmModal(false)}>
              <div className="p-6">
                  <h5 className="text-lg font-bold text-red-600">Bevestig Verwijdering</h5>
                  <p>Weet je zeker dat je deze data wilt verwijderen?</p>
                  {deleteError && <p className="text-red-500">{deleteError}</p>}
                  <input type="date" className="border p-2 mt-2 w-full" value={deleteConfirmEndDate} onChange={e => setDeleteConfirmEndDate(e.target.value)} />
                  <div className="mt-4 flex justify-end space-x-2">
                      <button onClick={() => setShowDeleteConfirmModal(false)} className="bg-gray-300 px-4 py-2 rounded">Annuleren</button>
                      <button onClick={handleConfirmDelete} className="bg-red-500 text-white px-4 py-2 rounded">Verwijderen</button>
                  </div>
              </div>
          </Modal>
      )}

      {showMultiDateModal && multiDateAnomaly && (
        <Modal isOpen={showMultiDateModal} onClose={() => setShowMultiDateModal(false)} size="large">
             <div className="p-6">
                <h5 className="text-lg font-bold">Corrigeer Anomalie</h5>
                <table className="min-w-full mt-4">
                    <thead><tr><th className="text-left">Datum</th><th className="text-left">Waarde</th><th className="text-left">FP</th><th className="text-left">Actie</th></tr></thead>
                    <tbody>
                        {editedData.map((item, idx) => (
                            <tr key={idx}>
                                <td>{formatDate(new Date(item.period_end_date))}</td>
                                <td>{item.value}</td>
                                <td>
                                    <select value={item.fp_id} onChange={(e) => {
                                        const newData = [...editedData];
                                        newData[idx].fp_id = e.target.value;
                                        setEditedData(newData);
                                    }} className="border p-1">
                                        {fiscalPeriods.map(fp => <option key={fp.fp_id} value={fp.fp_id}>{fp.fp}</option>)}
                                    </select>
                                </td>
                                <td><button onClick={() => handleUpdateDataPoint(item.id, idx)} className="bg-blue-500 text-white px-2 py-1 rounded">Opslaan</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <button onClick={() => setShowMultiDateModal(false)} className="mt-4 bg-gray-300 px-4 py-2 rounded">Sluiten</button>
             </div>
        </Modal>
      )}
    </div>
  );
};

export default AnalysisDataTab;

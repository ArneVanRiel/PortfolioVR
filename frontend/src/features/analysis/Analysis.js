import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../http-common';
import Modal from '../../components/ui/modal';

// Import the new components
import StockList from './StockList';
import AddData from './AddData';
import DataCompleteness from './DataCompleteness';
import ExistingData from './ExistingData';
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

const Analysis = () => {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [inputMethod, setInputMethod] = useState('manual');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [existingFundamentalData, setExistingFundamentalData] = useState([]);
  const [singleStockAnalysisResult, setSingleStockAnalysisResult] = useState(null);
  const [selectedAnalysisDate, setSelectedAnalysisDate] = useState(formatDate(new Date()));
  const [activeTab, setActiveTab] = useState('data'); // 'data' or 'calculations'

  // NEW: States for the calculations tab analysis
  const [calculationAnalysisDate, setCalculationAnalysisDate] = useState(formatDate(new Date()));
  const [calculationAnalysisResult, setCalculationAnalysisResult] = useState(null);
  const [isCalculatingAnalysis, setIsCalculatingAnalysis] = useState(false);

  // States for manual input
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

  // States for dropdown options
  const [fiscalPeriods, setFiscalPeriods] = useState([]);
  const [formTypes, setFormTypes] = useState([]);
  const [periodEndDates, setPeriodEndDates] = useState([]);

  // States for table filtering
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterDataType, setFilterDataType] = useState('');

  // States for deletion confirmation modal
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [stockToDelete, setStockToDelete] = useState(null);
  const [deleteConfirmEndDate, setDeleteConfirmEndDate] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // State for Multi-Date Anomaly Modal
  const [showMultiDateModal, setShowMultiDateModal] = useState(false);
  const [multiDateAnomaly, setMultiDateAnomaly] = useState(null);
  const [editedData, setEditedData] = useState([]); // Changed to array

  // States for SEC API input
  const [cik, setCik] = useState('');
  const [secFetchYear, setSecFetchYear] = useState('');
  const [secFetchedData, setSecFetchedData] = useState(null);
  const [isSecFetching, setIsSecFetching] = useState(false);

  // States for Alpha Vantage API input
  const [alphaVantageFunction, setAlphaVantageFunction] = useState('');
  const [alphaVantageFetchYear, setAlphaVantageFetchYear] = useState('');
  const [alphaVantageFetchedData, setAlphaVantageFetchedData] = useState(null);
  const [isAlphaVantageFetching, setIsAlphaVantageFetching] = useState(false);

  // State for all stocks analysis
  const [allAnalyses, setAllAnalyses] = useState({});
  const [isAllAnalysesLoading, setIsAllAnalysesLoading] = useState(false);

  // States for calculations
  const [calculationResult, setCalculationResult] = useState(null);
  const [existingCalculations, setExistingCalculations] = useState([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState('');
  const [showFormulas, setShowFormulas] = useState(false);
  const [showDataModal, setShowDataModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [modalError, setModalError] = useState('');
  const [selectedCalculationDetail, setSelectedCalculationDetail] = useState(null);
  const [showDeleteCalcConfirmModal, setShowDeleteCalcConfirmModal] = useState(false);
  const [calcToDelete, setCalcToDelete] = useState(null);

  const handleDeleteCalculationClick = (calculation) => {
    setCalcToDelete(calculation);
    setShowDeleteCalcConfirmModal(true);
  };

  const handleCancelDeleteCalculation = () => {
    setShowDeleteCalcConfirmModal(false);
    setCalcToDelete(null);
  };

  const handleConfirmDeleteCalculation = async () => {
    if (!calcToDelete) return;
    try {
      setLoading(true);
      await http.delete(`/calculations/${calcToDelete.id}`);
      alert('Calculation deleted successfully.');
      setShowDeleteCalcConfirmModal(false);
      setCalcToDelete(null);
      fetchExistingCalculations();
      if (selectedCalculationDetail && selectedCalculationDetail.id === calcToDelete.id) {
        setSelectedCalculationDetail(null);
      }
    } catch (err) {
      setError(`Error deleting calculation: ${err.response?.data?.message || err.message}`);
      console.error('Error deleting calculation:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStocks = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await http.get(`/stocks`);
      setStocks(response.data);
    } catch (err) {
      setError('Could not load stocks.');
      console.error('Error fetching stocks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchExistingFundamentalData = useCallback(async () => {
    if (!selectedStock) {
      setExistingFundamentalData([]);
      return;
    }
    try {
      setError('');
      const response = await http.get(`/fundamental-data/stock/${selectedStock.stock_id}/all-periods`);
      setExistingFundamentalData(response.data);
    } catch (err) {
      setError('Could not fetch existing fundamental data.');
      console.error('Error fetching existing fundamental data:', err);
      setExistingFundamentalData([]);
    }
  }, [selectedStock]);

  const fetchExistingCalculations = useCallback(async () => {
    if (!selectedStock) {
      setExistingCalculations([]);
      return;
    }
    try {
      const response = await http.get(`/calculations/${selectedStock.stock_id}`);
      setExistingCalculations(response.data);
    } catch (err) {
      console.error('Error fetching existing calculations:', err);
    }
  }, [selectedStock]);

  const fetchSingleStockAnalysis = useCallback(async () => {
    if (!selectedStock) {
      setSingleStockAnalysisResult(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await http.post(`/fundamental-data/single-stock-analysis/${selectedStock.stock_id}`, {
        dataPeriods: dataPeriods,
        selectedDate: selectedAnalysisDate,
        maxLookbackMonths: MAX_LOOKBACK_MONTHS
      });
      setSingleStockAnalysisResult(response.data);
    } catch (err) {
      setError(`Error fetching single stock analysis: ${err.response?.data?.message || err.message}`);
      console.error('Error fetching single stock analysis:', err);
      setSingleStockAnalysisResult(null);
    } finally {
      setLoading(false);
    }
  }, [selectedStock, selectedAnalysisDate]);

  // NEW: Analysis function for the calculations tab
  const fetchAnalysisForCalculations = useCallback(async () => {
    if (!selectedStock) {
      setCalculationAnalysisResult(null);
      return;
    }
    setIsCalculatingAnalysis(true);
    setCalculationError(''); // Clear previous errors
    try {
      const response = await http.post(`/fundamental-data/single-stock-analysis/${selectedStock.stock_id}`, {
        dataPeriods: dataPeriods,
        selectedDate: calculationAnalysisDate,
        maxLookbackMonths: MAX_LOOKBACK_MONTHS
      });
      setCalculationAnalysisResult(response.data);
    } catch (err) {
      setCalculationError(`Error fetching analysis for calculations: ${err.response?.data?.message || err.message}`);
      setCalculationAnalysisResult(null);
    } finally {
      setIsCalculatingAnalysis(false);
    }
  }, [selectedStock, calculationAnalysisDate]);

  const fetchFiscalPeriods = useCallback(async () => {
    try {
      const response = await http.get(`/fundamental-data/fiscal-periods`);
      setFiscalPeriods(response.data);
    } catch (err) {
      console.error('Error fetching fiscal periods:', err);
      setError('Could not load fiscal periods.');
    }
  }, []);

  const fetchFormTypes = useCallback(async () => {
    try {
      const response = await http.get(`/fundamental-data/forms`);
      setFormTypes(response.data);
    } catch (err) {
      console.error('Error fetching form types:', err);
      setError('Could not load form types.');
    }
  }, []);

  const fetchAllStocksAnalysis = useCallback(async (stocksToAnalyze) => {
    if (stocksToAnalyze.length === 0) return;
    setIsAllAnalysesLoading(true);
    try {
      const analysisPromises = stocksToAnalyze.map(stock =>
        http.post(`/fundamental-data/single-stock-analysis/${stock.stock_id}`, {
          dataPeriods: dataPeriods,
          selectedDate: formatDate(new Date()),
          maxLookbackMonths: MAX_LOOKBACK_MONTHS
        }).then(response => ({
          stock_id: stock.stock_id,
          data: response.data
        })).catch(error => ({
          stock_id: stock.stock_id,
          error: true
        }))
      );
      const results = await Promise.all(analysisPromises);
      const newAnalyses = results.reduce((acc, result) => {
        if (!result.error) {
          acc[result.stock_id] = result.data;
        }
        return acc;
      }, {});
      setAllAnalyses(newAnalyses);
    } catch (err) {
      console.error('An unexpected error occurred during fetchAllStocksAnalysis:', err);
    } finally {
      setIsAllAnalysesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStocks();
    fetchFiscalPeriods();
    fetchFormTypes();
  }, [fetchStocks, fetchFiscalPeriods, fetchFormTypes]);

  useEffect(() => {
    if (stocks.length > 0) {
      fetchAllStocksAnalysis(stocks);
    }
  }, [stocks, fetchAllStocksAnalysis]);

  useEffect(() => {
    if (selectedStock) {
        fetchExistingFundamentalData();
        fetchSingleStockAnalysis();
        fetchExistingCalculations();
    }
  }, [selectedStock, selectedAnalysisDate, fetchExistingFundamentalData, fetchSingleStockAnalysis, fetchExistingCalculations]);

  // NEW: useEffect for the calculations tab analysis
  useEffect(() => {
    if (selectedStock && activeTab === 'calculations') {
      fetchAnalysisForCalculations();
    }
  }, [selectedStock, calculationAnalysisDate, activeTab, fetchAnalysisForCalculations]);

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

  const handleStockChange = (stock) => {
    setSelectedStock(stock);
    setManualPeriodEndDate('');
    setManualPeriodStartDate('');
    setManualFY('');
    setManualFPId('');
    setManualFormId('');
    setManualDataValues(Object.keys(dataPeriods).reduce((acc, key) => ({ ...acc, [key]: '' }), {}));
    setIsDateConfirmed(false);
    setNearbyDateSuggestion(null);
    setCanEditMetaData(true);
    setSecFetchedData(null);
    setAlphaVantageFetchedData(null);
    setSingleStockAnalysisResult(null);
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterDataType('');
    setCalculationResult(null);
    setCalculationError('');
    // Reset calculation tab states as well
    setCalculationAnalysisResult(null);
    setSelectedCalculationDetail(null);
  };

  const handleManualValueChange = (key, value) => {
    setManualDataValues(prev => ({ ...prev, [key]: value }));
  };

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
        setIsDateConfirmed(false);
      } else {
        setError(message);
        setIsDateConfirmed(true);
        setManualFY('');
        setManualFPId('');
        setManualFormId('');
        setManualDataValues(Object.keys(dataPeriods).reduce((acc, key) => ({ ...acc, [key]: '' }), {}));
        setCanEditMetaData(true);
        setManualPeriodStartDate(suggestedPeriodStartDate || '');
      }
    } catch (err) {
      setError(`Error checking date: ${err.response?.data?.message || err.message}`);
      console.error('Error checking date:', err);
      setIsDateConfirmed(false);
      setCanEditMetaData(true);
    } finally {
      setLoading(false);
    }
  }, [selectedStock]);

  const handleCheckDateClick = () => {
    checkDate(manualPeriodEndDate);
  };

  const handleUseSuggestedDate = () => {
    const suggestedDate = nearbyDateSuggestion;
    if (suggestedDate) {
      setManualPeriodEndDate(suggestedDate);
      setNearbyDateSuggestion(null);
      checkDate(suggestedDate);
    }
  };

  const handleGoToMissingQuarter = (date) => {
    setManualPeriodEndDate(date);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    checkDate(date);
  };

  const validatePeriodDates = useCallback(() => {
    if (!manualPeriodStartDate || !manualPeriodEndDate) {
      setError('');
      return true;
    }
    const startDate = new Date(manualPeriodStartDate);
    const endDate = new Date(manualPeriodEndDate);
    if (startDate >= endDate) {
      setError('Period Start Date must be before Period End Date.');
      return false;
    }
    const oneYearBeforeEndDate = new Date(endDate);
    oneYearBeforeEndDate.setFullYear(endDate.getFullYear() - 1);
    if (startDate < oneYearBeforeEndDate) {
      setError('Period Start Date cannot be more than 1 year before Period End Date.');
      return false;
    }
    setError('');
    return true;
  }, [manualPeriodStartDate, manualPeriodEndDate]);

  useEffect(() => {
    validatePeriodDates();
  }, [validatePeriodDates]);

  const handleShowDataModal = async (calculationId) => {
    setShowDataModal(true);
    setModalError('');
    setModalData(null);
    try {
      const response = await http.get(`/calculations/${calculationId}/fundamental-data`);
      setModalData(response.data);
    } catch (err) {
      setModalError('Could not load data for this calculation.');
      console.error('Error fetching calculation data:', err);
    }
  };

  const handleRunCalculation = async (periodEndDate = null) => {
    if (!selectedStock) {
      setCalculationError('Please select a stock first.');
      return;
    }
    setIsCalculating(true);
    setCalculationError('');
    setCalculationResult(null);
    setSelectedCalculationDetail(null);
    try {
      const response = await http.post(`/calculations/${selectedStock.stock_id}`, { period_end_date: periodEndDate });
      setCalculationResult(response.data.data);
      setSelectedCalculationDetail(response.data.data);
      fetchExistingCalculations(); 
    } catch (err) {
      setCalculationError(`Error running calculation: ${err.response?.data?.message || err.message}`);
      console.error('Error running calculation:', err);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleAddManualData = async () => {
    const errorMessages = [];
    if (!selectedStock) errorMessages.push('No stock selected.');
    if (!manualPeriodEndDate) errorMessages.push('Period End Date is missing.');
    if (!manualPeriodStartDate) errorMessages.push('Period Start Date is missing.');
    if (manualFY === '') errorMessages.push('Fiscal Year (FY) is missing.');
    if (manualFPId === '') errorMessages.push('Fiscal Period (FP_ID) is missing.');
    if (!isDateConfirmed) errorMessages.push('Date is not confirmed. Please click "Controleer Datum".');

    if (errorMessages.length > 0) {
      const message = 'Please fix the following issues:\n- ' + errorMessages.join('\n- ');
      setError(message);
      alert(message);
      return;
    }

    if (!validatePeriodDates()) {
      alert('Date validation failed. Please check the error message on the screen.');
      return;
    }

    const filteredData = Object.keys(dataPeriods)
      .filter(key => manualDataValues[key] !== '' && !isNaN(parseFloat(manualDataValues[key])))
      .map(key => ({ data_type: key, value: parseFloat(manualDataValues[key]) }));

    if (filteredData.length === 0) {
      const message = 'Please enter at least one data point to save.';
      setError(message);
      alert(message);
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
      setError('');
      console.log('Data being sent to backend:', dataToSend);
      const response = await http.post(`/fundamental-data/manual`, dataToSend);
      alert(response.data.message);
      setManualPeriodEndDate('');
      setManualPeriodStartDate('');
      setManualFY('');
      setManualFPId('');
      setManualFormId('');
      setManualDataValues(Object.keys(dataPeriods).reduce((acc, key) => ({ ...acc, [key]: '' }), {}));
      setIsDateConfirmed(false);
      setNearbyDateSuggestion(null);
      setCanEditMetaData(true);
      fetchExistingFundamentalData();
      fetchSingleStockAnalysis();
    } catch (err) {
      setError(`Error adding manual data: ${err.response?.data?.message || err.message}`);
      console.error('Error in manual data input:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSecData = async () => {
    if (!selectedStock || !cik || !secFetchYear) {
      setError('Please select a stock, enter CIK and year.');
      return;
    }
    setIsSecFetching(true);
    setError('');
    setSecFetchedData(null);
    setAlphaVantageFetchedData(null);
    try {
      const response = await http.post(`/fundamental-data/fetch-sec`, {
        stock_id: parseInt(selectedStock.stock_id),
        ticker: selectedStock.ticker,
        cik: cik,
        year: parseInt(secFetchYear)
      });
      setSecFetchedData(response.data.data);
      alert('SEC data successfully fetched. Review and save.');
    } catch (err) {
      setError(`Error fetching SEC data: ${err.response?.data?.message || err.message}`);
      console.error('Error in SEC data fetch:', err);
    } finally {
      setIsSecFetching(false);
    }
  };

  const handleSaveSecData = async () => {
    if (!secFetchedData || !selectedStock) {
      setError('No SEC data to save or no stock selected.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const response = await http.post(`/fundamental-data/save-sec-fetched`, {
        stock_id: parseInt(selectedStock.stock_id),
        data: secFetchedData
      });
      alert(response.data.message);
      setSecFetchedData(null);
      fetchExistingFundamentalData();
      fetchSingleStockAnalysis();
    } catch (err) {
      setError(`Error saving SEC data: ${err.response?.data?.message || err.message}`);
      console.error('Error saving SEC fetched data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAlphaVantageData = async () => {
    if (!selectedStock || !selectedStock.ticker || !alphaVantageFunction || !alphaVantageFetchYear) {
      setError('Please select a stock, a function and a year for Alpha Vantage.');
      return;
    }
    setIsAlphaVantageFetching(true);
    setError('');
    setAlphaVantageFetchedData(null);
    setSecFetchedData(null);
    try {
      const response = await http.post(`/fundamental-data/fetch-alphavantage`, {
        stock_id: parseInt(selectedStock.stock_id),
        ticker: selectedStock.ticker,
        function: alphaVantageFunction,
        year: parseInt(alphaVantageFetchYear)
      });
      setAlphaVantageFetchedData(response.data.data);
      alert('Alpha Vantage data successfully fetched. Review and save.');
    } catch (err) {
      setError(`Error fetching Alpha Vantage data: ${err.response?.data?.message || err.message}`);
      console.error('Error in Alpha Vantage data fetch:', err);
    } finally {
      setIsAlphaVantageFetching(false);
    }
  };

  const handleSaveAlphaVantageData = async () => {
    if (!alphaVantageFetchedData || !selectedStock) {
      setError('No Alpha Vantage data to save or no stock selected.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const response = await http.post(`/fundamental-data/save-alphavantage-fetched`, {
        stock_id: parseInt(selectedStock.stock_id),
        data: alphaVantageFetchedData
      });
      alert(response.data.message);
      setAlphaVantageFetchedData(null);
      fetchExistingFundamentalData();
      fetchSingleStockAnalysis();
    } catch (err) {
      setError(`Error saving Alpha Vantage data: ${err.response?.data?.message || err.message}`);
      console.error('Error saving Alpha Vantage fetched data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getFiscalYearOptions = () => {
    if (!manualPeriodEndDate) return [];
    const date = new Date(manualPeriodEndDate);
    const currentYear = date.getFullYear();
    const years = [];
    for (let i = -3; i <= 1; i++) {
      years.push(currentYear + i);
    }
    return years.sort((a, b) => b - a);
  };

  const handleDeleteClick = (dataItem) => {
    setStockToDelete(dataItem);
    setDeleteConfirmEndDate('');
    setDeleteError('');
    setShowDeleteConfirmModal(true);
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirmModal(false);
    setStockToDelete(null);
    setDeleteConfirmEndDate('');
    setDeleteError('');
  };

  const handleConfirmDelete = async () => {
    if (!stockToDelete) return;
    const formattedConfirmEndDate = new Date(deleteConfirmEndDate).toISOString().split('T')[0];
    const storedFormattedEndDate = new Date(stockToDelete.period_end_date).toISOString().split('T')[0];
    if (formattedConfirmEndDate !== storedFormattedEndDate) {
      setDeleteError('De ingevoerde einddatum komt niet overeen met de opgeslagen einddatum.');
      return;
    }
    try {
      setLoading(true);
      setDeleteError('');
      await http.delete(`/fundamental-data/delete-data/${stockToDelete.id}`);
      alert('Data succesvol verwijderd.');
      setShowDeleteConfirmModal(false);
      setStockToDelete(null);
      setDeleteConfirmEndDate('');
      fetchExistingFundamentalData();
      fetchSingleStockAnalysis();
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      setDeleteError(`Fout bij verwijderen: ${errorMessage}`);
      console.error('Error deleting data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenMultiDateModal = (anomaly) => {
    console.log("1. handleOpenMultiDateModal START");
    console.log("Received anomaly with conflictingData from backend:", anomaly);

    const conflictingData = anomaly.conflictingData || [];

    if (conflictingData.length === 0) {
        console.error("Modal opened, but the anomaly object from the backend did not contain conflictingData.");
        setError("Could not resolve anomaly: conflicting data was not provided by the server.");
        return;
    }

    setEditedData(conflictingData);
    console.log("2. setEditedData called.");

    setMultiDateAnomaly(anomaly);
    console.log("3. setMultiDateAnomaly called.");

    setShowMultiDateModal(true);
    console.log("4. setShowMultiDateModal called. Modal should now be visible.");
  };

  const handleCloseMultiDateModal = () => {
    setShowMultiDateModal(false);
    setMultiDateAnomaly(null);
    setEditedData([]);
  };

  const handleModalFieldChange = (index, field, value) => {
    setEditedData(prev => {
      const newData = [...prev];
      newData[index] = {
        ...newData[index],
        [field]: value
      };
      return newData;
    });
  };

  const handleUpdateDataPoint = async (id, index) => {
    const itemToUpdate = editedData[index];
    const { fp_id } = itemToUpdate;
    
    if (!fp_id) {
      alert('Fiscal Period is required.');
      return;
    }
    try {
      setLoading(true);
      await http.put(`/fundamental-data/data-point/${id}`, { fp_id: parseInt(fp_id) });
      alert('Data point updated successfully!');
      await fetchExistingFundamentalData();
      await fetchSingleStockAnalysis();
      handleCloseMultiDateModal();
    } catch (err) {
      alert(`Error updating data point: ${err.response?.data?.message || err.message}`);
      console.error('Error updating data point:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full">
      <StockList
        stocks={stocks}
        selectedStock={selectedStock}
        handleStockChange={handleStockChange}
        allAnalyses={allAnalyses}
        isAllAnalysesLoading={isAllAnalysesLoading}
        loading={loading}
      />

      <div className="w-3/4 p-8 space-y-8 overflow-y-auto">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800">
            {selectedStock ? `${selectedStock.name} (${selectedStock.ticker})` : 'Analysis'}
          </h1>
        </div>
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">{error}</div>}
        {deleteError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">{deleteError}</div>}

        {selectedStock ? (
          <>
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('data')}
                  className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'data'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  Data Toevoegen
                </button>
                <button
                  onClick={() => setActiveTab('calculations')}
                  className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'calculations'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  Berekeningen
                </button>
              </nav>
            </div>

            <div className="mt-8">
              {activeTab === 'data' && (
                <>
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
                    handleManualValueChange={handleManualValueChange}
                    isDateConfirmed={isDateConfirmed}
                    setIsDateConfirmed={setIsDateConfirmed}
                    nearbyDateSuggestion={nearbyDateSuggestion}
                    canEditMetaData={canEditMetaData}
                    checkDate={checkDate}
                    handleCheckDateClick={handleCheckDateClick}
                    handleUseSuggestedDate={handleUseSuggestedDate}
                    periodEndDates={periodEndDates}
                    fiscalPeriods={fiscalPeriods}
                    formTypes={formTypes}
                    getFiscalYearOptions={getFiscalYearOptions}
                    handleAddManualData={handleAddManualData}
                    loading={loading}
                    cik={cik}
                    setCik={setCik}
                    secFetchYear={secFetchYear}
                    setSecFetchYear={setSecFetchYear}
                    fetchSecData={fetchSecData}
                    isSecFetching={isSecFetching}
                    secFetchedData={secFetchedData}
                    handleSaveSecData={handleSaveSecData}
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
                    handleGoToMissingQuarter={handleGoToMissingQuarter}
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
                </>
              )}
              {activeTab === 'calculations' && (
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
                      title={
                        !calculationAnalysisResult || calculationAnalysisResult?.overallCompletenessPercentage < 100
                          ? "Nieuwe berekening is pas mogelijk als de datacompleetheid 100% is."
                          : (calculationAnalysisResult?.latest_period_end_date && existingCalculations.some(calc =>
                            calc.period_end_date &&
                            new Date(calc.period_end_date).toISOString().split('T')[0] === new Date(calculationAnalysisResult.latest_period_end_date).toISOString().split('T')[0]
                          ))
                            ? "Er is al een berekening voor de meest recente periode."
                            : "Start een nieuwe berekening voor de meest recente periode."
                      }
                    >
                      {isCalculating ? 'Berekenen...' : 'Start Nieuwe Berekening'}
                    </button>
                  </div>
                  {calculationError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">{calculationError}</div>}
                  
                  <div className="mt-8">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-2xl font-bold">Bestaande Berekeningen</h3>
                      <button 
                        onClick={() => setShowFormulas(!showFormulas)}
                        className="text-sm text-blue-600 hover:underline"
                      >
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
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">FCF Groei</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">WF FCF</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">WF ROE</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">WF LTD/E</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Criteria</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {existingCalculations.map((calc) => (
                              <tr key={calc.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{new Date(calc.period_end_date).toLocaleDateString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{typeof calc.intrinsieke_waarde === 'number' ? calc.intrinsieke_waarde.toFixed(2) : 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{typeof calc.waarde_verdeling === 'number' ? calc.waarde_verdeling.toFixed(4) : 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{typeof calc.gem_groeipercentage_FCF === 'number' ? (calc.gem_groeipercentage_FCF * 100).toFixed(2) + '%' : 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{typeof calc.waardefactor_FCF === 'number' ? calc.waardefactor_FCF.toFixed(4) : 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{typeof calc.waardefactor_ROE === 'number' ? calc.waardefactor_ROE.toFixed(4) : 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{typeof calc.waardefactor_LTD_equity === 'number' ? calc.waardefactor_LTD_equity.toFixed(4) : 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{calc.selectiecriteria} / 5</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                  <button
                                    onClick={() => handleRunCalculation(calc.period_end_date)}
                                    className="text-indigo-600 hover:text-indigo-900"
                                    title="Herberekenen voor deze periode"
                                  >
                                    Herberekenen
                                  </button>
                                  <button
                                    onClick={() => setSelectedCalculationDetail(calc)}
                                    className="text-green-600 hover:text-green-900 ml-4"
                                  >
                                    Details
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCalculationClick(calc)}
                                    className="text-red-600 hover:text-red-900 ml-4"
                                    title="Verwijder deze berekening"
                                  >
                                    Verwijderen
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p>Geen bestaande berekeningen gevonden voor dit aandeel.</p>
                    )}
                  </div>

                  {selectedCalculationDetail && <CalculationDetail result={selectedCalculationDetail} />}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center text-gray-500">Select a stock to see the analysis.</div>
        )}
      </div>

      {showDeleteConfirmModal && stockToDelete && (
        <Modal isOpen={showDeleteConfirmModal} onClose={handleCancelDelete}>
          {/* ... delete modal content ... */}
        </Modal>
      )}

      {showMultiDateModal && multiDateAnomaly && (
        <Modal isOpen={showMultiDateModal} onClose={handleCloseMultiDateModal} size="large">
          <div className="p-6">
            <h5 className="text-lg font-bold text-yellow-600">Corrigeer Anomalie</h5>
            <p className="mt-2">
              Voor <strong>{multiDateAnomaly.dataType}</strong> zijn meerdere datapunten gevonden met dezelfde periode (FY: {multiDateAnomaly.fy}, FP: {multiDateAnomaly.fp_id}). Pas de FY of FP aan om de data in het juiste kwartaal te plaatsen.
            </p>
            <table className="min-w-full divide-y divide-gray-200 mt-4 text-sm">
              <thead className="bg-gray-50"><tr>
                <th className="px-4 py-2 text-left">Datum</th>
                <th className="px-4 py-2 text-left">Waarde</th>
                <th className="px-4 py-2 text-left">FY</th>
                <th className="px-4 py-2 text-left">FP</th>
                <th className="px-4 py-2 text-left">Actie</th>
              </tr></thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {editedData.map((item, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2">{formatDate(new Date(item.period_end_date))}</td>
                    <td className="px-4 py-2">{item.value}</td>
                    <td className="px-4 py-2">
                      <input 
                        type="number" 
                        value={item.fy || ''}
                        readOnly
                        className="w-20 p-1 border rounded bg-gray-100"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select 
                        value={item.fp_id || ''} 
                        onChange={(e) => handleModalFieldChange(index, 'fp_id', e.target.value)}
                        className="p-1 border rounded"
                      >
                        <option value="">Kies FP</option>
                        {fiscalPeriods.map(fp => <option key={fp.fp_id} value={fp.fp_id}>{fp.fp}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <button onClick={() => handleUpdateDataPoint(item.id, index)} className="bg-blue-500 text-white px-2 py-1 rounded text-xs">Opslaan</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-6 flex justify-end">
              <button type="button" className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded" onClick={handleCloseMultiDateModal}>Sluiten</button>
            </div>
          </div>
        </Modal>
      )}

      <CalculationDataModal
        isOpen={showDataModal}
        onClose={() => setShowDataModal(false)}
        data={modalData}
        error={modalError}
      />

      {showDeleteCalcConfirmModal && calcToDelete && (
        <Modal isOpen={showDeleteCalcConfirmModal} onClose={handleCancelDeleteCalculation}>
          <div className="p-6">
            <h5 className="text-lg font-bold text-red-600">Bevestig Verwijdering</h5>
            <p className="mt-2">
              Weet je zeker dat je de berekening voor de periode eindigend op {new Date(calcToDelete.period_end_date).toLocaleDateString()} wilt verwijderen?
            </p>
            <div className="mt-6 flex justify-end space-x-4">
              <button type="button" className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded" onClick={handleCancelDeleteCalculation}>
                Annuleren
              </button>
              <button type="button" className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded" onClick={handleConfirmDeleteCalculation}>
                Verwijderen
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Analysis;
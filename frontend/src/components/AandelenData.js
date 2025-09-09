// components/AandelenData.js
import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom'; // Importeer useNavigate
import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api/fundamental-data'; // Endpoint for fundamental data
const WATCHLIST_API_BASE_URL = 'http://localhost:5000/api/watchlist'; // For fetching stocks

// Define the fundamental data types you want to add/analyze
const FUNDAMENTAL_DATA_TYPES = [
  { key: 'NetCashProvidedByUsedInOperatingActivities', label: 'Net Cash Provided by/Used in Operating Activities' },
  { key: 'PurchasesOfPropertyAndEquipment', label: 'Purchases of Property and Equipment' },
  { key: 'StockholdersEquity', label: 'Stockholders Equity' },
  { key: 'NetIncomeLoss', label: 'Net Income/Loss' },
  { key: 'Liabilities', label: 'Liabilities' },
  { key: 'LiabilitiesCurrent', label: 'Current Liabilities' },
  { key: 'WeightedAverageNumberOfDilutedSharesOutstanding', label: 'Weighted Average Number of Diluted Shares Outstanding' },
];

const ALPHA_VANTAGE_REPORT_TYPES = [
  { key: 'INCOME_STATEMENT', label: 'Income Statement' },
  { key: 'BALANCE_SHEET', label: 'Balance Sheet' },
  { key: 'CASH_FLOW', label: 'Cash Flow Statement' },
];

// Defines the number of months of data expected for each financial data type.
// This is used to calculate the 'completeness' percentage.
const dataPeriods = {
  StockholdersEquity: 44 * 3, // 45 quarters (approx. 11.25 years)
  NetCashProvidedByUsedInOperatingActivities: 44 * 3, // 44 quarters (approx. 11 years)
  PurchasesOfPropertyAndEquipment: 44 * 3, // 44 quarters (approx. 11 years)
  LiabilitiesCurrent: 8 * 3, // 8 quarters (2 years)
  Liabilities: 8 * 3, // 8 quarters (2 years)
  NetIncomeLoss: 44 * 3, // 44 quarters (approx. 11 years)
  WeightedAverageNumberOfDilutedSharesOutstanding: 8 * 3, // 44 quarters (approx. 11 years)
};

// Determine the maximum lookback period in months from dataPeriods for global filtering
const MAX_LOOKBACK_MONTHS = Math.max(...Object.values(dataPeriods)); // Should be 135 (45 * 3)

// Helper function to format a Date object to "YYYY-MM-DD" string.
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const AandelenData = () => {
  const location = useLocation();
  const navigate = useNavigate(); // Initialiseer useNavigate
  const [stocks, setStocks] = useState([]);
  const [selectedStockId, setSelectedStockId] = useState('');
  const [selectedStockTicker, setSelectedStockTicker] = useState('');
  const [inputMethod, setInputMethod] = useState('manual'); // 'manual', 'sec_api', 'alpha_vantage'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [existingFundamentalData, setExistingFundamentalData] = useState([]); // Existing data for the selected ticker
  const [singleStockAnalysisResult, setSingleStockAnalysisResult] = useState(null); // NEW: State for single stock analysis result
  const [selectedAnalysisDate, setSelectedAnalysisDate] = useState(formatDate(new Date())); // NEW: Date for analysis

  // States for manual input
  const [manualPeriodEndDate, setManualPeriodEndDate] = useState('');
  const [manualPeriodStartDate, setManualPeriodStartDate] = useState(''); // NEW state for start date
  const [manualFY, setManualFY] = useState('');
  const [manualFPId, setManualFPId] = useState('');
  const [manualFormId, setManualFormId] = useState('');
  const [manualDataValues, setManualDataValues] = useState(
    FUNDAMENTAL_DATA_TYPES.reduce((acc, type) => ({ ...acc, [type.key]: '' }), {})
  );
  const [isDateConfirmed, setIsDateConfirmed] = useState(false); // State to indicate if date is confirmed
  const [nearbyDateSuggestion, setNearbyDateSuggestion] = useState(null); // Suggestion for nearby end date
  const [canEditMetaData, setCanEditMetaData] = useState(true); // State to control if FY, FP_ID, Form_ID can be edited

  // States for dropdown options
  const [fiscalPeriods, setFiscalPeriods] = useState([]);
  const [formTypes, setFormTypes] = useState([]);

  // NEW: States for table filtering
  const [filterStartDate, setFilterStartDate] = useState(''); // Start date for range filter
  const [filterEndDate, setFilterEndDate] = useState('');   // End date for range filter
  const [filterDataType, setFilterDataType] = useState('');

  // NEW: States for deletion confirmation modal
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [stockToDelete, setStockToDelete] = useState(null); // Stores the full data item to be deleted
  const [deleteConfirmEndDate, setDeleteConfirmEndDate] = useState(''); // User entered date for confirmation
  const [deleteError, setDeleteError] = useState('');


  // States for SEC API input
  const [cik, setCik] = useState(''); // CIK (Central Index Key) for SEC API
  const [secFetchYear, setSecFetchYear] = useState(''); // Year for SEC API fetch
  const [secFetchedData, setSecFetchedData] = useState(null); // Data fetched from SEC API, for preview
  const [isSecFetching, setIsSecFetching] = useState(false);

  // States for Alpha Vantage API input
  const [alphaVantageFunction, setAlphaVantageFunction] = useState(''); // INCOME_STATEMENT, BALANCE_SHEET, CASH_FLOW
  const [alphaVantageFetchYear, setAlphaVantageFetchYear] = useState(''); // Year for Alpha Vantage fetch
  const [alphaVantageFetchedData, setAlphaVantageFetchedData] = useState(null); // Data fetched from Alpha Vantage, for preview
  const [isAlphaVantageFetching, setIsAlphaVantageFetching] = useState(false);


  // Fetch stocks on component load
  const fetchStocks = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await axios.get(`${WATCHLIST_API_BASE_URL}/available-stocks`);
      setStocks(response.data);

      // Check if a ticker was passed via navigation state
      if (location.state && location.state.ticker) {
        const preselectedTicker = location.state.ticker;
        const stock = response.data.find(s => s.ticker_symbol === preselectedTicker); // Changed to ticker_symbol
        if (stock) {
          setSelectedStockId(stock.aandeel_id);
          setSelectedStockTicker(stock.ticker_symbol);
        }
      }
    } catch (err) {
      setError('Could not load stocks.');
      console.error('Error fetching stocks:', err);
    } finally {
      setLoading(false);
    }
  }, [location.state]);

  // Fetch existing fundamental data for the selected stock
  const fetchExistingFundamentalData = useCallback(async () => {
    if (!selectedStockId) {
      setExistingFundamentalData([]);
      return;
    }
    try {
      setError('');
      setSuccessMessage('');
      const response = await axios.get(`${API_BASE_URL}/stock/${selectedStockId}/all-periods`);
      setExistingFundamentalData(response.data);
    } catch (err) {
      setError('Could not fetch existing fundamental data.');
      console.error('Error fetching existing fundamental data:', err);
      setExistingFundamentalData([]);
    }
  }, [selectedStockId]);

  // NEW: Fetch single stock analysis data
  const fetchSingleStockAnalysis = useCallback(async () => {
    if (!selectedStockId) {
      setSingleStockAnalysisResult(null);
      return;
    }
    setLoading(true); // Set loading for analysis
    setError('');
    setSuccessMessage('');
    try {
      const response = await axios.post(`${API_BASE_URL}/single-stock-analysis/${selectedStockId}`, {
        dataPeriods: dataPeriods, // Pass dataPeriods from frontend constants
        selectedDate: selectedAnalysisDate, // Use the selected analysis date
        maxLookbackMonths: MAX_LOOKBACK_MONTHS // Pass max lookback
      });
      setSingleStockAnalysisResult(response.data);
    } catch (err) {
      setError(`Error fetching single stock analysis: ${err.response?.data?.message || err.message}`);
      console.error('Error fetching single stock analysis:', err);
      setSingleStockAnalysisResult(null);
    } finally {
      setLoading(false); // End loading for analysis
    }
  }, [selectedStockId, selectedAnalysisDate]); // Dependency on selectedStockId and selectedAnalysisDate

  // Fetch fiscal periods from the backend
  const fetchFiscalPeriods = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/fiscal-periods`);
      setFiscalPeriods(response.data);
    } catch (err) {
      console.error('Error fetching fiscal periods:', err);
      setError('Could not load fiscal periods.');
    }
  }, []);

  // Fetch form types from the backend
  const fetchFormTypes = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/forms`);
      setFormTypes(response.data);
    } catch (err) {
      console.error('Error fetching form types:', err);
      setError('Could not load form types.');
    }
  }, []);


  useEffect(() => {
    fetchStocks();
    fetchFiscalPeriods(); // Fetch on component mount
    fetchFormTypes(); // Fetch on component mount
  }, [fetchStocks, fetchFiscalPeriods, fetchFormTypes]);

  useEffect(() => {
    fetchExistingFundamentalData();
    fetchSingleStockAnalysis(); // NEW: Trigger analysis when stock changes or analysis date changes
  }, [selectedStockId, selectedAnalysisDate, fetchExistingFundamentalData, fetchSingleStockAnalysis]);


  const handleStockChange = (e) => {
    const id = e.target.value;
    setSelectedStockId(id);
    const stock = stocks.find(s => s.aandeel_id === parseInt(id));
    setSelectedStockTicker(stock ? stock.ticker_symbol : '');
    // Reset all input fields and API data on stock change
    setManualPeriodEndDate('');
    setManualPeriodStartDate(''); // Reset
    setManualFY('');
    setManualFPId('');
    setManualFormId('');
    setManualDataValues(FUNDAMENTAL_DATA_TYPES.reduce((acc, type) => ({ ...acc, [type.key]: '' }), {}));
    setIsDateConfirmed(false); // Reset date confirmation
    setNearbyDateSuggestion(null); // Reset nearby date suggestion
    setCanEditMetaData(true); // Reset metadata editability

    setSecFetchedData(null);
    setAlphaVantageFetchedData(null);
    setSingleStockAnalysisResult(null); // NEW: Reset analysis result
    setFilterStartDate(''); // Reset filters
    setFilterEndDate('');   // Reset filters
    setFilterDataType(''); // Reset filters
  };

  const handleManualValueChange = (key, value) => {
    setManualDataValues(prev => ({ ...prev, [key]: value })); // Corrected: Use spread operator for immutability
  };

  // Function to check the entered date and fetch data
  const handleCheckDate = async () => {
    if (!selectedStockId || !manualPeriodEndDate) {
      setError('Please select a stock and enter a Period End Date.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccessMessage('');
    setIsDateConfirmed(false); // Reset confirmation state
    setNearbyDateSuggestion(null); // Reset suggestion
    setCanEditMetaData(true); // Assume editable until proven otherwise
    setManualPeriodStartDate(''); // Clear previous start date suggestion

    try {
      const response = await axios.get(`${API_BASE_URL}/check-date-data/${selectedStockId}/${manualPeriodEndDate}`);
      const { foundDate, dataForDate, nearbyDate, fy, fp_id, form_id, suggestedPeriodStartDate, period_start_date: existingPeriodStartDate, message } = response.data;

      setSuccessMessage(message); // Display the message from the backend

      if (foundDate) {
        // Exact date found or closest date within 30 days
        setManualPeriodEndDate(foundDate); // Update to the actual found date (if it was a suggestion)
        setIsDateConfirmed(true);

        // Pre-fill FY, FP_ID, Form_ID from backend response if available
        setManualFY(fy || '');
        setManualFPId(fp_id || '');
        setManualFormId(form_id || '');
        // Pre-fill period_start_date from backend response (for existing data)
        setManualPeriodStartDate(existingPeriodStartDate || '');

        // Determine if FY, FP_ID, Form_ID should be editable based on if they were pre-filled
        setCanEditMetaData(!(fy || fp_id || form_id));


        // Pre-fill specific data type values
        const newManualDataValues = FUNDAMENTAL_DATA_TYPES.reduce((acc, type) => {
            const foundDataItem = dataForDate.find(item => item.data_type === type.key);
            return { ...acc, [type.key]: foundDataItem ? foundDataItem.value : '' };
        }, {});
        setManualDataValues(newManualDataValues);

      } else if (nearbyDate) {
        setNearbyDateSuggestion(nearbyDate);
        setError(`No exact data for ${manualPeriodEndDate}. ${message}`); // Combine with backend message
        setIsDateConfirmed(false); // Keep fields disabled until user confirms
        // If nearby date, no data is pre-filled automatically for start date, FY, FP_ID, Form_ID
        // User must confirm using the suggested end date, which then re-runs checkDate.
      } else {
        // No exact or nearby date found (beyond 30 days or truly new)
        setError(message); // Display message that no existing data was found
        setIsDateConfirmed(true); // Allow manual entry of all fields
        setManualFY(''); // Ensure these are clear for new input
        setManualFPId('');
        setManualFormId('');
        setManualDataValues(FUNDAMENTAL_DATA_TYPES.reduce((acc, type) => ({ ...acc, [type.key]: '' }), {}));
        setCanEditMetaData(true); // Allow editing of metadata for new entry
        // Use suggested period start date for new entries
        setManualPeriodStartDate(suggestedPeriodStartDate || '');
      }
    } catch (err) {
      setError(`Error checking date: ${err.response?.data?.message || err.message}`);
      console.error('Error checking date:', err);
      setIsDateConfirmed(false); // If error, date is not confirmed
      setCanEditMetaData(true); // Allow editing in case of error
    } finally {
      setLoading(false);
    }
  };

  // Function to use the suggested end date (re-runs checkDate)
  const handleUseSuggestedDate = () => {
      setManualPeriodEndDate(nearbyDateSuggestion);
      setNearbyDateSuggestion(null); // Clear suggestion
      handleCheckDate(); // Re-run check with the suggested end date to pre-fill all fields
  };

  // Validation for period_start_date to be before period_end_date and within 1 year
  const validatePeriodDates = useCallback(() => {
    if (!manualPeriodStartDate || !manualPeriodEndDate) return true; // Let backend validate for emptiness

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

    setError(''); // Clear error if validation passes
    return true;
  }, [manualPeriodStartDate, manualPeriodEndDate]);

  useEffect(() => {
    // Run date validation whenever start or end date changes
    validatePeriodDates();
  }, [manualPeriodStartDate, manualPeriodEndDate, validatePeriodDates]);


  const handleAddManualData = async () => {
    if (!selectedStockId || !manualPeriodEndDate || !manualPeriodStartDate || manualFY === '' || manualFPId === '' || !isDateConfirmed) {
      setError('Please fill in Period End Date, Period Start Date, Fiscal Year, Fiscal Period ID and confirm the date.');
      return;
    }
    if (!validatePeriodDates()) {
      return; // Stop if date validation fails
    }

    // Filter out empty or non-numeric values before sending to backend
    const filteredData = FUNDAMENTAL_DATA_TYPES
      .filter(type => manualDataValues[type.key] !== '' && !isNaN(parseFloat(manualDataValues[type.key])))
      .map(type => ({
        data_type: type.key,
        value: parseFloat(manualDataValues[type.key])
      }));

    if (filteredData.length === 0) {
      setError('Please enter at least one data point to save.');
      return;
    }

    const dataToSend = {
      stock_id: parseInt(selectedStockId),
      period_end_date: manualPeriodEndDate,
      period_start_date: manualPeriodStartDate, // Include start date
      fy: parseInt(manualFY),
      fp_id: parseInt(manualFPId), // Ensure FP_ID is parsed as an integer
      form_id: manualFormId ? parseInt(manualFormId) : null, // Optional, parsed as integer
      how_added: 'Manually Entered',
      data: filteredData, // Use the filtered data
    };

    try {
      setLoading(true);
      setError('');
      setSuccessMessage('');
      const response = await axios.post(`${API_BASE_URL}/manual`, dataToSend);
      setSuccessMessage(response.data.message);
      // Reset manual input fields (except ticker and stock_id)
      setManualPeriodEndDate('');
      setManualPeriodStartDate(''); // Reset
      setManualFY('');
      setManualFPId('');
      setManualFormId('');
      setManualDataValues(FUNDAMENTAL_DATA_TYPES.reduce((acc, type) => ({ ...acc, [type.key]: '' }), {}));
      setIsDateConfirmed(false); // Reset date confirmation
      setNearbyDateSuggestion(null); // Reset suggestion
      setCanEditMetaData(true); // Reset metadata editability for next entry
      fetchExistingFundamentalData(); // Reload existing data
      fetchSingleStockAnalysis(); // Re-check data sufficiency
    } catch (err) {
      setError(`Error adding manual data: ${err.response?.data?.message || err.message}`);
      console.error('Error in manual data input:', err);
      // Log full error response for debugging network issues
      if (err.response) {
        console.error('Backend Error Response:', err.response.data);
        console.error('Backend Error Status:', err.response.status);
        console.error('Backend Error Headers:', err.response.headers);
      } else if (err.request) {
        console.error('No response received:', err.request);
      } else {
        console.error('Error setting up request:', err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Function to fetch SEC data
  const fetchSecData = async () => {
    if (!selectedStockId || !cik || !secFetchYear) {
      setError('Please select a stock, enter CIK and year.');
      return;
    }
    setIsSecFetching(true);
    setError('');
    setSuccessMessage('');
    setSecFetchedData(null);
    setAlphaVantageFetchedData(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/fetch-sec`, {
        stock_id: parseInt(selectedStockId),
        ticker: selectedStockTicker,
        cik: cik,
        year: parseInt(secFetchYear)
      });
      setSecFetchedData(response.data.data);
      setSuccessMessage('SEC data successfully fetched. Review and save.');
    } catch (err) {
      setError(`Error fetching SEC data: ${err.response?.data?.message || err.message}`);
      console.error('Error in SEC data fetch:', err);
    } finally {
      setIsSecFetching(false);
    }
  };

  // Function to save fetched SEC data
  const handleSaveSecData = async () => {
    if (!secFetchedData || !selectedStockId) {
      setError('No SEC data to save or no stock selected.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      setSuccessMessage('');
      const response = await axios.post(`${API_BASE_URL}/save-sec-fetched`, {
        stock_id: parseInt(selectedStockId),
        data: secFetchedData
      });
      setSuccessMessage(response.data.message);
      setSecFetchedData(null);
      fetchExistingFundamentalData();
      fetchSingleStockAnalysis(); // Re-check data sufficiency
    } catch (err) {
      setError(`Error saving SEC data: ${err.response?.data?.message || err.message}`);
      console.error('Error saving SEC fetched data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Function to fetch Alpha Vantage data
  const fetchAlphaVantageData = async () => {
    if (!selectedStockId || !selectedStockTicker || !alphaVantageFunction || !alphaVantageFetchYear) {
      setError('Please select a stock, a function and a year for Alpha Vantage.');
      return;
    }
    setIsAlphaVantageFetching(true);
    setError('');
    setSuccessMessage('');
    setAlphaVantageFetchedData(null);
    setSecFetchedData(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/fetch-alphavantage`, {
        stock_id: parseInt(selectedStockId),
        ticker: selectedStockTicker,
        function: alphaVantageFunction,
        year: parseInt(alphaVantageFetchYear)
      });
      setAlphaVantageFetchedData(response.data.data);
      setSuccessMessage('Alpha Vantage data successfully fetched. Review and save.');
    } catch (err) {
      setError(`Error fetching Alpha Vantage data: ${err.response?.data?.message || err.message}`);
      console.error('Error in Alpha Vantage data fetch:', err);
    } finally {
      setIsAlphaVantageFetching(false);
    }
  };

  // Function to save fetched Alpha Vantage data
  const handleSaveAlphaVantageData = async () => {
    if (!alphaVantageFetchedData || !selectedStockId) {
      setError('No Alpha Vantage data to save or no stock selected.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      setSuccessMessage('');
      const response = await axios.post(`${API_BASE_URL}/save-alphavantage-fetched`, {
        stock_id: parseInt(selectedStockId),
        data: alphaVantageFetchedData
      });
      setSuccessMessage(response.data.message);
      setAlphaVantageFetchedData(null);
      fetchExistingFundamentalData();
      fetchSingleStockAnalysis(); // Re-check data sufficiency
    } catch (err) {
      setError(`Error saving Alpha Vantage data: ${err.response?.data?.message || err.message}`);
      console.error('Error saving Alpha Vantage fetched data:', err);
    } finally {
      setLoading(false);
    }
  };


  // Generate FY options based on selected manualPeriodEndDate
  const getFiscalYearOptions = () => {
    if (!manualPeriodEndDate) return [];
    const date = new Date(manualPeriodEndDate);
    const currentYear = date.getFullYear();
    const years = [];
    for (let i = -3; i <= 1; i++) { // 3 years back, current year, 1 year forward
      years.push(currentYear + i);
    }
    return years.sort((a, b) => b - a); // Sort descending
  };

  // Function to apply filters to existing fundamental data
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

  // Handlers for delete modal
  const handleDeleteClick = (dataItem) => {
    setStockToDelete(dataItem); // Store the entire data item, including its unique 'id'
    setDeleteConfirmEndDate(''); // Clear previous input
    setDeleteError(''); // Clear previous error
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

    // Format the date to match the stored format (YYYY-MM-DD)
    const formattedConfirmEndDate = new Date(deleteConfirmEndDate).toISOString().split('T')[0];
    const storedFormattedEndDate = new Date(stockToDelete.period_end_date).toISOString().split('T')[0];

    // Only allow deletion if the entered date matches the stored date for verification
    if (formattedConfirmEndDate !== storedFormattedEndDate) {
      setDeleteError('De ingevoerde einddatum komt niet overeen met de opgeslagen einddatum.');
      return;
    }

    try {
      setLoading(true);
      setDeleteError('');
      setSuccessMessage('');
      // Send DELETE request to backend using the unique 'id'
      await axios.delete(`${API_BASE_URL}/delete-data/${stockToDelete.id}`); // Pass the unique ID
      setSuccessMessage('Data succesvol verwijderd.');
      setShowDeleteConfirmModal(false);
      setStockToDelete(null);
      setDeleteConfirmEndDate('');
      // Re-fetch data to update the table
      fetchExistingFundamentalData();
      fetchSingleStockAnalysis(); // Re-trigger analysis after deletion
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      setDeleteError(`Fout bij verwijderen: ${errorMessage}`);
      console.error('Error deleting data:', err);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="container mt-4 mb-5">
      <h1 className="mb-4">Fundamenteel Gegevensbeheer</h1>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {successMessage && <div className="alert alert-success" role="alert">{successMessage}</div>}
      {deleteError && <div className="alert alert-danger" role="alert">{deleteError}</div>} {/* Display delete specific errors */}


      <div className="card shadow-sm p-4 mb-4">
        <h5 className="card-title mb-3">Selecteer Aandeel</h5>
        {loading && !selectedStockId ? ( // Only show "Aandelen laden..." if no stock is selected yet
          <div>Aandelen laden...</div>
        ) : (
          <div className="mb-3">
            <label htmlFor="stockSelect" className="form-label">Aandeel:</label>
            <select
              id="stockSelect"
              className="form-select"
              value={selectedStockId}
              onChange={handleStockChange}
            >
              <option value="">-- Selecteer een aandeel --</option>
              {stocks.map(stock => (
                <option key={stock.aandeel_id} value={stock.aandeel_id}>
                  {stock.name} ({stock.ticker_symbol})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {selectedStockId && (
        <>
          {/* Data Adding section */}
          <div className="card shadow-sm p-4 mb-4">
            <h5 className="card-title mb-3">Voeg Data Toe voor {selectedStockTicker}</h5>

            <div className="mb-3">
              <label className="form-label">Kies Invoermethode:</label>
              <div>
                <div className="form-check form-check-inline">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="inputMethod"
                    id="manualInput"
                    value="manual"
                    checked={inputMethod === 'manual'}
                    onChange={() => setInputMethod('manual')}
                  />
                  <label className="form-check-label" htmlFor="manualInput">Handmatig</label>
                </div>
                <div className="form-check form-check-inline">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="inputMethod"
                    id="secApiInput"
                    value="sec_api"
                    checked={inputMethod === 'sec_api'}
                    onChange={() => setInputMethod('sec_api')}
                  />
                  <label className="form-check-label" htmlFor="secApiInput">Via SEC API</label>
                </div>
                <div className="form-check form-check-inline">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="inputMethod"
                    id="alphaVantageApiInput"
                    value="alpha_vantage"
                    checked={inputMethod === 'alpha_vantage'}
                    onChange={() => setInputMethod('alpha_vantage')}
                  />
                  <label className="form-check-label" htmlFor="alphaVantageApiInput">Via Alpha Vantage API</label>
                </div>
              </div>
            </div>

            {inputMethod === 'manual' ? (
              // Manual input
              <div>
                <div className="row mb-3 align-items-end">
                  <div className="col-md-4">
                    <label htmlFor="manualPeriodEndDate" className="form-label">Periode Eind Datum (JJJJ-MM-DD):</label>
                    <input
                      type="date"
                      id="manualPeriodEndDate"
                      className="form-control"
                      value={manualPeriodEndDate}
                      onChange={(e) => {
                        setManualPeriodEndDate(e.target.value);
                        setIsDateConfirmed(false); // Reset confirmation if date changes
                        setNearbyDateSuggestion(null); // Clear suggestion
                        setCanEditMetaData(true); // Allow editing of metadata when date changes
                        // Clear pre-filled fields when date changes manually
                        setManualPeriodStartDate(''); // Clear start date
                        setManualFY('');
                        setManualFPId('');
                        setManualFormId('');
                        setManualDataValues(FUNDAMENTAL_DATA_TYPES.reduce((acc, type) => ({ ...acc, [type.key]: '' }), {}));
                      }}
                    />
                    {nearbyDateSuggestion && (
                        <div className="alert alert-info small mt-2 py-1">
                            Suggestie: Data beschikbaar voor <span className="fw-bold">{nearbyDateSuggestion}</span>.
                            <button className="btn btn-link btn-sm p-0 ms-2" onClick={handleUseSuggestedDate}>Gebruik deze datum</button>
                        </div>
                    )}
                  </div>
                  <div className="col-md-auto">
                    <button
                        className="btn btn-secondary"
                        onClick={handleCheckDate}
                        disabled={!selectedStockId || !manualPeriodEndDate || loading}
                    >
                        Controleer Datum
                    </button>
                  </div>
                </div>

                {isDateConfirmed && ( // Only show these fields if date is confirmed
                    <>
                        <div className="row mb-3">
                            <div className="col-md-4">
                                <label htmlFor="manualPeriodStartDate" className="form-label">Periode Start Datum (JJJJ-MM-DD):</label>
                                <input
                                type="date"
                                id="manualPeriodStartDate"
                                className="form-control"
                                value={manualPeriodStartDate}
                                onChange={(e) => setManualPeriodStartDate(e.target.value)}
                                disabled={!canEditMetaData} // NEW: Disable if metadata is pre-filled from existing data
                                />
                            </div>
                            <div className="col-md-4">
                                <label htmlFor="manualFY" className="form-label">Fiscaal Jaar (FY):</label>
                                <select
                                    id="manualFY"
                                    className="form-select"
                                    value={manualFY}
                                    onChange={(e) => setManualFY(e.target.value)}
                                    disabled={!canEditMetaData} // NEW: Disable if metadata is pre-filled from existing data
                                >
                                    <option value="">Selecteer FY</option>
                                    {getFiscalYearOptions().map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="col-md-4">
                                <label htmlFor="manualFPId" className="form-label">Fiscale Periode (FP_ID):</label>
                                <select
                                    id="manualFPId"
                                    className="form-select"
                                    value={manualFPId}
                                    onChange={(e) => setManualFPId(e.target.value)}
                                    disabled={!canEditMetaData} // NEW: Disable if metadata is pre-filled from existing data
                                >
                                    <option value="">Selecteer FP</option>
                                    {fiscalPeriods.map(fp => (
                                        <option key={fp.fp_id} value={fp.fp_id}>{fp.fp}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="mb-3">
                            <label htmlFor="manualFormId" className="form-label">Formulier Type (Form_ID):</label>
                            <select
                                id="manualFormId"
                                className="form-select"
                                value={manualFormId}
                                onChange={(e) => setManualFormId(e.target.value)}
                                disabled={!canEditMetaData} // NEW: Disable if metadata is pre-filled from existing data
                            >
                                <option value="">Selecteer Formulier</option>
                                {formTypes.map(form => (
                                    <option key={form.id} value={form.id}>{form.name}</option>
                                ))}
                            </select>
                        </div>

                        {FUNDAMENTAL_DATA_TYPES.map(type => (
                            <div className="mb-3" key={type.key}>
                                <label htmlFor={type.key} className="form-label">{type.label}:</label>
                                <input
                                    type="number"
                                    id={type.key}
                                    className="form-control"
                                    value={manualDataValues[type.key]}
                                    onChange={(e) => handleManualValueChange(type.key, e.target.value)}
                                    step="0.01"
                                />
                            </div>
                        ))}
                        <button
                            className="btn btn-primary"
                            onClick={handleAddManualData}
                            disabled={loading || !isDateConfirmed || !validatePeriodDates()}
                        >
                            Opslaan Handmatige Data
                        </button>
                    </>
                )}
              </div>
            ) : inputMethod === 'sec_api' ? (
              // SEC API input
              <div>
                <div className="mb-3">
                  <label htmlFor="cik" className="form-label">CIK (Central Index Key):</label>
                  <input
                    type="text"
                    id="cik"
                    className="form-control"
                    value={cik}
                    onChange={(e) => setCik(e.target.value)}
                    placeholder="Voer CIK in"
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="secFetchYear" className="form-label">Jaar:</label>
                  <input
                    type="number"
                    id="secFetchYear"
                    className="form-control"
                    value={secFetchYear}
                    onChange={(e) => setSecFetchYear(e.target.value)}
                    placeholder="Voer jaar in (bijv. 2023)"
                  />
                </div>
                <button
                  className="btn btn-primary me-2"
                  onClick={fetchSecData}
                  disabled={isSecFetching || !selectedStockId || !cik || !secFetchYear}
                >
                  {isSecFetching ? 'Bezig met ophalen...' : 'Haal SEC Data Op'}
                </button>
                {secFetchedData && (
                  <button
                    className="btn btn-success"
                    onClick={handleSaveSecData}
                    disabled={loading}
                  >
                    Sla SEC Data Op
                  </button>
                )}
                {secFetchedData && (
                  <div className="mt-3 p-3 border rounded bg-light">
                    <h6>Opgehaalde SEC Data Voorbeeld:</h6>
                    <pre className="small text-muted">{JSON.stringify(secFetchedData, null, 2)}</pre>
                  </div>
                )}
              </div>
            ) : (
              // Alpha Vantage API input
              <div>
                <div className="mb-3">
                  <label htmlFor="alphaVantageFunction" className="form-label">Alpha Vantage Functie:</label>
                  <select
                    id="alphaVantageFunction"
                    className="form-select"
                    value={alphaVantageFunction}
                    onChange={(e) => setAlphaVantageFunction(e.target.value)}
                  >
                    <option value="">Selecteer Functie</option>
                    {ALPHA_VANTAGE_REPORT_TYPES.map(type => (
                      <option key={type.key} value={type.key}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label htmlFor="alphaVantageFetchYear" className="form-label">Jaar:</label>
                  <input
                    type="number"
                    id="alphaVantageFetchYear"
                    className="form-control"
                    value={alphaVantageFetchYear}
                    onChange={(e) => setAlphaVantageFetchYear(e.target.value)}
                    placeholder="Voer jaar in (bijv. 2023)"
                  />
                </div>
                <button
                  className="btn btn-primary me-2"
                  onClick={fetchAlphaVantageData}
                  disabled={isAlphaVantageFetching || !selectedStockId || !selectedStockTicker || !alphaVantageFunction || !alphaVantageFetchYear}
                >
                  {isAlphaVantageFetching ? 'Bezig met ophalen...' : 'Haal Alpha Vantage Data Op'}
                </button>
                {alphaVantageFetchedData && (
                  <button
                    className="btn btn-success"
                    onClick={handleSaveAlphaVantageData}
                    disabled={loading}
                  >
                    Sla Alpha Vantage Data Op
                  </button>
                )}
                {alphaVantageFetchedData && (
                  <div className="mt-3 p-3 border rounded bg-light">
                    <h6>Opgehaalde Alpha Vantage Data Voorbeeld:</h6>
                    <pre className="small text-muted">{JSON.stringify(alphaVantageFetchedData, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Data Sufficiency Analysis section */}
          {singleStockAnalysisResult && (
            <div className="card shadow-sm p-4 mb-4">
              <h5 className="card-title mb-3">Data Completeness Analyse voor {selectedStockTicker} op {selectedAnalysisDate}</h5>
              <div className="mb-3">
                <label htmlFor="analysisDate" className="form-label">Analysedatum:</label>
                <input
                  type="date"
                  id="analysisDate"
                  className="form-control"
                  value={selectedAnalysisDate}
                  onChange={(e) => setSelectedAnalysisDate(e.target.value)}
                />
              </div>

              {loading ? (
                <div>Analysedata laden...</div>
              ) : (
                <>
                  <p className="fw-bold">Algemene Compleetheid: {singleStockAnalysisResult.overallCompletenessPercentage.toFixed(2)}%</p>
                  <h6 className="mt-3">Compleetheid per Datatype:</h6>
                  <ul className="list-group mb-3">
                    {FUNDAMENTAL_DATA_TYPES.map(type => {
                      const analysis = singleStockAnalysisResult.dataTypeCompleteness[type.key];
                      return (
                        <li key={type.key} className="list-group-item d-flex justify-content-between align-items-center">
                          {type.label} ({analysis?.earliestExpectedDate || 'N/A'} tot {selectedAnalysisDate}):
                          <span className={`badge ${analysis?.percentage === 100 ? 'bg-success' : 'bg-warning text-dark'} rounded-pill`}>
                            {analysis?.percentage?.toFixed(2) || 'N/A'}% ({analysis?.foundCount || 0}/{analysis?.expectedCount || 0} kwartalen)
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {singleStockAnalysisResult.multipleDatesPerQuarter.length > 0 && (
                    <div className="alert alert-warning small mt-3">
                      <h6 className="alert-heading">Meerdere Periodes per Kwartaal Gevonden:</h6>
                      <ul className="mb-0">
                        {singleStockAnalysisResult.multipleDatesPerQuarter.map((anomaly, index) => (
                          <li key={index}>
                            <span className="fw-bold">{anomaly.dataType}</span> voor FY {anomaly.fy} Q{anomaly.fp_id}: {anomaly.dates.join(', ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {singleStockAnalysisResult.quarterSequenceBroken && (
                    <div className="alert alert-danger small mt-3">
                      <h6 className="alert-heading">Gebroken Kwartaalvolgorde Gedetecteerd:</h6>
                      <ul className="mb-0">
                        {singleStockAnalysisResult.brokenQuarterSequenceDetails.map((detail, index) => (
                          <li key={index}>
                            <span className="fw-bold">{detail.dataType}</span>: Van {detail.prevDate} (Q{detail.prevFpId} FY{detail.prevFy}) naar {detail.currentDate} (Q{detail.currentFpId} FY{detail.currentFy}). Reden: {detail.reason}. Dagen verschil: {detail.daysDifference}.
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {singleStockAnalysisResult.missingRecentQuarters.length > 0 && (
                    <div className="alert alert-info small mt-3">
                      <h6 className="alert-heading">Ontbrekende Recente/Historische Kwartalen:</h6>
                      <ul className="mb-0">
                        {singleStockAnalysisResult.missingRecentQuarters.map((missing, index) => (
                          <li key={index}>
                            <span className="fw-bold">{missing.dataType}</span>: Verwachte datum {missing.expectedDate}. Reden: {missing.reason}.
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* NIEUW: Knop voor navigatie naar berekeningen */}
                  {singleStockAnalysisResult.allData100PercentComplete && (
                    <div className="mt-3 text-center">
                      <button
                        className="btn btn-primary btn-lg"
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
          )}

          {/* Existing Data Table section */}
          <div className="card shadow-sm p-4">
            <h5 className="card-title mb-3">Bestaande Fundamentele Data voor {selectedStockTicker}</h5>

            <div className="row mb-3">
              <div className="col-md-4">
                <label htmlFor="filterStartDate" className="form-label">Filter Start Datum:</label>
                <input
                  type="date"
                  id="filterStartDate"
                  className="form-control"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label htmlFor="filterEndDate" className="form-label">Filter Eind Datum:</label>
                <input
                  type="date"
                  id="filterEndDate"
                  className="form-control"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label htmlFor="filterDataType" className="form-label">Filter Datatype:</label>
                <select
                  id="filterDataType"
                  className="form-select"
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
              <div className="table-responsive">
                <table className="table table-striped table-hover">
                  <thead>
                    <tr>
                      <th>Periode Eind Datum</th>
                      <th>Periode Start Datum</th>
                      <th>FY</th>
                      <th>FP_ID</th>
                      <th>Formulier</th>
                      <th>Datatype</th>
                      <th>Waarde</th>
                      <th>Hoe Toegevoegd</th>
                      <th>Acties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredFundamentalData().length > 0 ? (
                      getFilteredFundamentalData().map(data => (
                        <tr key={data.id}> {/* Gebruik de unieke 'id' van de database */}
                          <td>{new Date(data.period_end_date).toLocaleDateString()}</td>
                          <td>{data.period_start_date ? new Date(data.period_start_date).toLocaleDateString() : 'N/A'}</td>
                          <td>{data.fy}</td>
                          <td>{data.fp_id}</td>
                          <td>{data.form_id}</td>
                          <td>{data.data_type}</td>
                          <td>{data.value !== null ? data.value.toFixed(2) : 'N/A'}</td>
                          <td>{data.how_added}</td>
                          <td>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDeleteClick(data)} // Pass the entire data item
                            >
                              Verwijder
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="9" className="text-center">Geen fundamentele data gevonden voor dit aandeel of met de huidige filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmModal && stockToDelete && (
        <div className="modal fade show d-block" tabIndex="-1" role="dialog" style={{backgroundColor: 'rgba(0,0,0,0.5)'}}>
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title text-danger">Bevestig Verwijdering</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={handleCancelDelete}></button>
              </div>
              <div className="modal-body">
                {deleteError && <div className="alert alert-danger" role="alert">{deleteError}</div>}
                <p>Weet u zeker dat u de volgende gegevens wilt verwijderen?</p>
                <p><strong>Aandeel:</strong> {selectedStockTicker}</p>
                <p><strong>Periode Eind Datum:</strong> {new Date(stockToDelete.period_end_date).toLocaleDateString()}</p>
                <p><strong>Datatype:</strong> {stockToDelete.data_type}</p>
                <p><strong>Waarde:</strong> {stockToDelete.value !== null ? stockToDelete.value.toFixed(2) : 'N/A'}</p>
                <div className="mb-3">
                  <label htmlFor="confirmDeleteDate" className="form-label">Voer de Periode Eind Datum in ter bevestiging (JJJJ-MM-DD):</label>
                  <input
                    type="date"
                    id="confirmDeleteDate"
                    className="form-control"
                    value={deleteConfirmEndDate}
                    onChange={(e) => setDeleteConfirmEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCancelDelete}>Annuleren</button>
                <button type="button" className="btn btn-danger" onClick={handleConfirmDelete}>Verwijder</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AandelenData;

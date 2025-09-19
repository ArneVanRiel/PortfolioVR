import React, { useState, useEffect } from "react";
import axios from "axios";

// Defines the number of months of data expected for each financial data type.
// This is used to calculate the 'completeness' percentage.
const dataPeriods = {
  StockholdersEquity: 45 * 3, // 45 quarters (approx. 11.25 years)
  NetCashProvidedByUsedInOperatingActivities: 44 * 3, // 44 quarters (approx. 11 years)
  PurchasesOfPropertyAndEquipment: 44 * 3, // 44 quarters (approx. 11 years)
  LiabilitiesCurrent: 8 * 3, // 8 quarters (2 years)
  Liabilities: 8 * 3, // 8 quarters (2 years)
  NetIncomeLoss: 44 * 3, // 44 quarters (approx. 11 years)
  /*period_end_date: 52 * 3,*/ // Example for a specific date type, currently commented out
};

// Determine the maximum lookback period in months from dataPeriods for global filtering
const MAX_LOOKBACK_MONTHS = Math.max(...Object.values(dataPeriods)); // Should be 135 (45 * 3)

/**
 * Formats a Date object to a "YYYY-MM-DD" string.
 * @param {Date} date - The date object to format.
 * @returns {string} The formatted date string.
 */
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * TickerOverview Component
 * Displays an overview of financial data for various tickers, including data completeness,
 * quick checks, and new data anomaly detection (missing/excessive period end dates).
 * Users can click on a ticker to see detailed financial data and anomaly reports.
 */
function TickerOverview() {
  // State variables for managing component data and UI state
  const [tickers, setTickers] = useState([]); // Stores the raw list of tickers with their overview data
  const [loading, setLoading] = useState(true); // Indicates if data is currently being fetched
  const [error, setError] = useState(null); // Stores any error message during data fetching
  const [sortedTickers, setSortedTickers] = useState([]); // Stores the sorted list of tickers for display
  const [selectedTicker, setSelectedTicker] = useState(null); // Stores the ticker symbol of the currently selected (expanded) row
  const [tickerData, setTickerData] = useState([]); // Stores raw detailed financial data for the selected ticker (used for anomaly analysis)
  const [groupedTickerData, setGroupedTickerData] = useState([]); // Stores grouped and transformed detailed financial data for display
  const [uniqueHeaders, setUniqueHeaders] = useState([]); // Stores unique data type headers for the detailed table
  const [visibleRowCount, setVisibleRowCount] = useState(10); // Number of rows currently visible in the detailed table
  const [openIndex, setOpenIndex] = useState(null); // Stores the array index of the currently open (expanded) row
  const [sortConfig, setSortConfig] = useState({ key: "ticker", direction: "asc" }); // Configuration for table sorting
  const [anomalyDetails, setAnomalyDetails] = useState(null); // Stores detailed anomaly report for the selected ticker
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date())); // State for the date picker

  // useEffect hook to fetch tickers when the component mounts or selectedDate changes
  useEffect(() => {
    fetchTickers();
  }, [selectedDate]); // Re-fetch data when selectedDate changes

  /**
   * Fetches the list of tickers and their overview data from the backend.
   * Updates the `tickers` and `sortedTickers` state.
   */
  const fetchTickers = async () => {
    setLoading(true); // Set loading to true before fetching
    setError(null); // Clear previous errors
    try {
      // Send a POST request to the backend with the dataPeriods configuration and selectedDate
      const response = await axios.post("http://localhost:5000/api/tickers", {
        dataPeriods,
        selectedDate, // Pass the selected date to the backend
        maxLookbackMonths: MAX_LOOKBACK_MONTHS, // Pass the max lookback period
      });
      setTickers(response.data);
      setSortedTickers(response.data); // Initialize sorted list with fetched data
    } catch (error) {
      setError("Fout bij ophalen van tickers"); // Set user-friendly error message
      console.error("Fout bij ophalen van tickers:", error); // Log detailed error for debugging
    } finally {
      setLoading(false); // Set loading to false regardless of success or failure
    }
  };

  /**
   * Fetches detailed financial data for a specific ticker when its row is clicked.
   * Also analyzes the period end dates for anomalies and updates the `anomalyDetails` state.
   * Toggles the expanded state of the row.
   * @param {string} ticker - The ticker symbol of the selected stock.
   * @param {number} index - The index of the selected row in the `sortedTickers` array.
   */
  const fetchTickerData = async (ticker, index) => {
    // If the clicked ticker is already selected, close the expanded row
    if (selectedTicker === ticker) {
      setSelectedTicker(null);
      setOpenIndex(null);
      setAnomalyDetails(null); // Clear anomaly details when closing
      setGroupedTickerData([]); // Clear grouped data
      setUniqueHeaders([]); // Clear headers
      setVisibleRowCount(10); // Reset pagination
      return;
    }
    try {
      // Fetch detailed data for the specific ticker, passing selectedDate and maxLookbackMonths as query parameters
      const response = await axios.get(`http://localhost:5000/api/ticker-data/${ticker}?selectedDate=${selectedDate}&maxLookbackMonths=${MAX_LOOKBACK_MONTHS}`);
      const fetchedData = response.data;
      setTickerData(fetchedData); // Store the raw detailed data for anomaly analysis

      // --- Data Grouping and Transformation for Detailed Table ---
      const groupedByPeriod = new Map();
      const collectedUniqueDataTypes = new Set();

      fetchedData.forEach(item => {
        const dateKey = item.period_end_date.split("T")[0]; // "YYYY-MM-DD" for grouping
        collectedUniqueDataTypes.add(item.data_type); // Collect all data types for dynamic headers

        if (!groupedByPeriod.has(dateKey)) {
          // Initialize the grouped entry for this period_end_date
          groupedByPeriod.set(dateKey, {
            period_end_date: dateKey,
            form_id: item.form_id, // Assuming form_id is consistent per period_end_date
            fp_id: item.fp_id, // Assuming fp_id is consistent per period_end_date
            // Other data types will be added as properties dynamically
          });
        }
        // Add the data type and its value as a property to the grouped object
        groupedByPeriod.get(dateKey)[item.data_type] = item.value;
      });

      // Convert the Map values to an array and sort by period_end_date descending (most recent first)
      const allGroupedData = Array.from(groupedByPeriod.values())
        .sort((a, b) => new Date(b.period_end_date).getTime() - new Date(a.period_end_date).getTime());

      // Sort unique data types alphabetically for consistent column order in the table
      const sortedUniqueDataTypes = Array.from(collectedUniqueDataTypes).sort();

      setGroupedTickerData(allGroupedData); // Update state with the grouped data
      setUniqueHeaders(sortedUniqueDataTypes); // Update state with the dynamic headers
      setVisibleRowCount(10); // Reset visible rows to 10 for the new ticker

      // --- End Data Grouping and Transformation ---

      setSelectedTicker(ticker); // Set the selected ticker
      setOpenIndex(index); // Set the index of the open row
      // Analyze the fetched raw data for period end date anomalies and store the report
      setAnomalyDetails(analyzePeriodEndDates(fetchedData, new Date(selectedDate), dataPeriods, MAX_LOOKBACK_MONTHS)); // Pass selectedDate, dataPeriods, and MAX_LOOKBACK_MONTHS as reference
    } catch (error) {
      console.error("Fout bij ophalen van ticker data:", error);
    }
  };

  /**
   * Handles loading more rows in the detailed financial data table.
   * Increases `visibleRowCount` by 10.
   */
  const handleLoadMore = () => {
    setVisibleRowCount(prevCount => prevCount + 10);
  };

  /**
   * Analyzes the `period_end_date` values from the detailed ticker data for anomalies.
   * Detects missing data, and excessive data points within specific timeframes.
   * @param {Array<Object>} data - The detailed financial data for a single ticker.
   * @param {Date} referenceDate - The date to use as the "current" date for calculations.
   * @param {Object} dataPeriodsConfig - The configuration object for expected data periods.
   * @param {number} maxLookbackMonths - The maximum global lookback period in months.
   * @returns {Object} An object containing boolean flags and lists of problematic dates for each anomaly type.
   */
  const analyzePeriodEndDates = (data, referenceDate, dataPeriodsConfig, maxLookbackMonths) => {
    // Calculate the earliest allowed date based on the max lookback period
    const earliestAllowedDate = new Date(referenceDate);
    earliestAllowedDate.setMonth(earliestAllowedDate.getMonth() - maxLookbackMonths);

    // Extract unique period_end_dates, fp_id, and form_id, then convert them to Date objects,
    // and filter to only include data within the allowed lookback period.
    const periodInfo = Array.from(new Set(data
      .filter(item => {
        const itemDate = new Date(item.period_end_date);
        return itemDate >= earliestAllowedDate && itemDate <= referenceDate; // Filter by global lookback
      })
      .map(item => JSON.stringify({ period_end_date: item.period_end_date, fp_id: item.fp_id, form_id: item.form_id }))
    ))
    .map(jsonString => {
      const parsed = JSON.parse(jsonString);
      return {
        period_end_date: new Date(parsed.period_end_date),
        fp_id: parsed.fp_id,
        form_id: parsed.form_id
      };
    })
    .sort((a, b) => b.period_end_date.getTime() - a.period_end_date.getTime()); // Sort descending (most recent first) for existing checks

    // For existing checks (missing/excessive), extract just the dates
    const periodDates = periodInfo.map(p => p.period_end_date);

    const anomalies = {
      missing90Days: false,
      excessive60Days: [], // List of dates that are part of an excessive 60-day cluster
      excessive1Year: [], // List of dates if more than 4 in 1 year
      excessive10Years: [], // List of dates if more than 40 in 10 years
      quarterSequenceBroken: false, // New flag for quarter sequence anomaly
      brokenQuarterSequenceDetails: [], // Details for quarter sequence anomaly
      missingDataTypes: [], // New: List of specific data types missing within their periods
    };

    // 1. Check for missing data (no period_end_date in 90 days relative to referenceDate)
    if (periodDates.length === 0) {
      anomalies.missing90Days = true; // No data at all means it's missing within the filtered range
    } else {
      const latestDate = periodDates[0]; // The most recent date within the filtered range
      const diffTime = Math.abs(referenceDate.getTime() - latestDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Difference in days
      if (diffDays > 90) {
        anomalies.missing90Days = true;
      }
    }

    // 2. Check for excessive data (multiple period_end_dates within 60 days relative to referenceDate)
    const excessive60DaysSet = new Set(); // Use a Set to store unique problematic dates
    for (let i = 0; i < periodDates.length; i++) {
      const currentDate = periodDates[i];
      for (let j = i + 1; j < periodDates.length; j++) { // Compare with subsequent dates
        const nextDate = periodDates[j];
        const diffDays = Math.abs(currentDate.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays <= 60) {
          // If two dates are within 60 days, add both to the set of problematic dates
          excessive60DaysSet.add(currentDate.toISOString().split('T')[0]);
          excessive60DaysSet.add(nextDate.toISOString().split('T')[0]);
        }
      }
    }
    anomalies.excessive60Days = Array.from(excessive60DaysSet).sort(); // Convert set to array and sort

    // 3. Check for excessive data (more than 4 period_end_dates in 1 year relative to referenceDate)
    const datesInLast1Year = periodDates.filter(date => {
      const diffDays = Math.ceil(Math.abs(referenceDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 365; // Within the last year
    });
    if (datesInLast1Year.length > 4) {
      anomalies.excessive1Year = datesInLast1Year.map(date => date.toISOString().split('T')[0]).sort();
    }

    // 4. Check for excessive data (more than 40 period_end_dates in 10 years relative to referenceDate)
    const datesInLast10Years = periodDates.filter(date => {
      const diffDays = Math.ceil(Math.abs(referenceDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 365 * 10; // Within the last 10 years
    });
    if (datesInLast10Years.length > 40) {
      anomalies.excessive10Years = datesInLast10Years.map(date => date.toISOString().split('T')[0]).sort();
    }

    // New check: fp_id sequence (1, 2, 3, 4, 1, ...) for consecutive quarterly periods
    // Sort periodInfo ascending for this sequence check
    const sortedPeriodInfoAsc = [...periodInfo].sort((a, b) => a.period_end_date.getTime() - b.period_end_date.getTime());

    // Filter for fp_id values that are typically quarters (1 to 4)
    const quarterlyPeriods = sortedPeriodInfoAsc.filter(p => p.fp_id >= 1 && p.fp_id <= 4);

    for (let i = 1; i < quarterlyPeriods.length; i++) {
        const prevPeriod = quarterlyPeriods[i - 1];
        const currentPeriod = quarterlyPeriods[i];

        // Calculate expected next fp_id in the sequence (1, 2, 3, 4, 1, 2, ...)
        const expectedNextFpId = (prevPeriod.fp_id % 4) + 1;
        // Calculate difference in days between consecutive period end dates
        const diffDays = Math.ceil(Math.abs(currentPeriod.period_end_date.getTime() - prevPeriod.period_end_date.getTime()) / (1000 * 60 * 60 * 24));

        // Check if fp_id sequence is broken OR if the time difference is not roughly a quarter
        // A quarter is approx 90-92 days. Allow a range of 75 to 105 days (2.5 to 3.5 months)
        const isFpIdSequenceCorrect = (currentPeriod.fp_id === expectedNextFpId);
        const isTimeGapCorrect = (diffDays >= 75 && diffDays <= 105);

        if (!isFpIdSequenceCorrect || !isTimeGapCorrect) {
            anomalies.quarterSequenceBroken = true; // Set the overall flag
            const reason = [];
            if (!isFpIdSequenceCorrect) reason.push("FP ID sequence incorrect");
            if (!isTimeGapCorrect) reason.push("Time gap not typical for a quarter");

            anomalies.brokenQuarterSequenceDetails.push({
                prevDate: prevPeriod.period_end_date.toISOString().split('T')[0],
                prevFpId: prevPeriod.fp_id,
                currentDate: currentPeriod.period_end_date.toISOString().split('T')[0],
                currentFpId: currentPeriod.fp_id,
                expectedFpId: expectedNextFpId,
                daysDifference: diffDays,
                reason: reason.join(" & ") // Combine reasons if both conditions fail
            });
        }
    }

    // New: Check for missing specific data types within their expected periods with leeway
    // First, find the latest actual period_end_date that is <= referenceDate
    let latestActualPeriodEndDate = null;
    for (const info of periodInfo) {
        if (info.period_end_date <= referenceDate) {
            latestActualPeriodEndDate = info.period_end_date;
            break; // Since periodInfo is sorted descending, the first one found is the latest
        }
    }

    if (latestActualPeriodEndDate) {
        for (const [dataType, monthsExpected] of Object.entries(dataPeriodsConfig)) {
            const expectedStartDateForType = new Date(referenceDate);
            expectedStartDateForType.setMonth(expectedStartDateForType.getMonth() - monthsExpected);

            let currentExpectedDate = new Date(latestActualPeriodEndDate);
            let countFoundForType = 0;

            // Iterate backwards from the latest actual period end date
            while (currentExpectedDate >= expectedStartDateForType && currentExpectedDate >= earliestAllowedDate) {
                const lowerBound = new Date(currentExpectedDate);
                lowerBound.setDate(lowerBound.getDate() - 30); // 30 days leeway before

                const upperBound = new Date(currentExpectedDate);
                upperBound.setDate(upperBound.getDate() + 30); // 30 days leeway after

                const found = data.some(item => {
                    const itemDate = new Date(item.period_end_date);
                    return item.data_type === dataType && itemDate >= lowerBound && itemDate <= upperBound;
                });

                if (found) {
                    countFoundForType++;
                } else {
                    anomalies.missingDataTypes.push({
                        dataType: dataType,
                        period_end_date: formatDate(currentExpectedDate), // The center of the expected window
                        expectedFrom: formatDate(lowerBound),
                        expectedTo: formatDate(upperBound)
                    });
                }

                // Move to the previous quarter
                currentExpectedDate.setMonth(currentExpectedDate.getMonth() - 3);
            }
        }
    } else {
        // If no relevant period end dates are found at all within the max lookback,
        // then all data types for the entire period are considered missing.
        for (const [dataType, monthsExpected] of Object.entries(dataPeriodsConfig)) {
            const expectedStartDateForType = new Date(referenceDate);
            expectedStartDateForType.setMonth(expectedStartDateForType.getMonth() - monthsExpected);
            anomalies.missingDataTypes.push({
                dataType: dataType,
                period_end_date: 'N/A (no data found)', // Indicate no specific date
                expectedFrom: formatDate(expectedStartDateForType),
                expectedTo: formatDate(referenceDate)
            });
        }
    }

    return anomalies;
  };

  /**
   * Determines the color for the battery completeness indicator based on the percentage.
   * @param {number} percentage - The completeness percentage.
   * @returns {string} The CSS color name.
   */
  const getBatteryColor = (percentage) => {
    if (percentage >= 75) return "green";
    if (percentage >= 50) return "yellow";
    if (percentage >= 25) return "orange";
    return "red";
  };

  /**
   * Sorts the ticker data based on the specified key and direction.
   * Updates the `sortedTickers` and `sortConfig` state.
   * @param {string} key - The key to sort by (e.g., "ticker", "percentage", "dataMissing90Days").
   */
  const sortData = (key) => {
    let direction = "asc";
    // If already sorting by this key, toggle direction
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    // Create a copy of the tickers array and sort it
    const sorted = [...tickers].sort((a, b) => {
      if (key === "ticker") {
        return direction === "asc" ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker);
      }
      if (key === "percentage") {
        // Sort by count for percentage, as percentage is derived from count
        return direction === "asc" ? a.count - b.count : b.count - a.count;
      }
      // Sorting for new anomaly columns (boolean values)
      // False (✔️) comes before True (❌) for 'asc'
      if (key === "dataMissing90Days" || key === "dataExcessive60Days" || key === "dataExcessive1Year" || key === "dataExcessive10Years" || key === "quarterSequenceBroken") {
        const valA = a[key];
        const valB = b[key];
        if (valA === valB) return 0; // If both are same, no change
        if (direction === "asc") {
          return valA ? 1 : -1; // If A is true (❌), it comes after false (✔️)
        } else {
          return valA ? -1 : 1; // If A is true (❌), it comes before false (✔️)
        }
      }
      return 0; // Default no sort
    });

    setSortedTickers(sorted);
    setSortConfig({ key, direction });
  };

  // Display loading message while data is being fetched
  if (loading) return <p>Data laden...</p>;
  // Display error message if an error occurred
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div className="p-4 font-sans bg-gray-50 min-h-screen">
      <h2 className="text-3xl font-extrabold mb-6 text-gray-800 text-center">Ticker Overzicht</h2>

      <SecImporter />

      {/* Date Picker */}
      <div className="mb-6 flex items-center justify-center">
        <label htmlFor="selectedDate" className="mr-3 text-lg font-medium text-gray-700">Referentie Datum:</label>
        <input
          type="date"
          id="selectedDate"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="overflow-x-auto shadow-xl rounded-lg">
        <table className="min-w-full bg-white border border-gray-200 rounded-lg">
          <thead>
            <tr className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider cursor-pointer rounded-tl-lg" onClick={() => sortData("ticker")}>
                Ticker {sortConfig.key === "ticker" ? (sortConfig.direction === "asc" ? "🔼" : "🔽") : ""}
              </th>
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider">Aantal records</th>
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider cursor-pointer" onClick={() => sortData("percentage")}>
                Completeness {sortConfig.key === "percentage" ? (sortConfig.direction === "asc" ? "🔼" : "🔽") : ""}
              </th>
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider">Fast Check 1 (FCF)</th>
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider">Fast Check 2 (LTD)</th>
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider cursor-pointer" onClick={() => sortData("dataMissing90Days")}>
                Data Missing (90d) {sortConfig.key === "dataMissing90Days" ? (sortConfig.direction === "asc" ? "🔼" : "🔽") : ""}
              </th>
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider cursor-pointer" onClick={() => sortData("dataExcessive60Days")}>
                Data Excessive (60d) {sortConfig.key === "dataExcessive60Days" ? (sortConfig.direction === "asc" ? "🔼" : "🔽") : ""}
              </th>
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider cursor-pointer" onClick={() => sortData("dataExcessive1Year")}>
                Data Excessive (1Y) {sortConfig.key === "dataExcessive1Year" ? (sortConfig.direction === "asc" ? "🔼" : "🔽") : ""}
              </th>
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider cursor-pointer" onClick={() => sortData("dataExcessive10Years")}>
                Data Excessive (10Y) {sortConfig.key === "dataExcessive10Years" ? (sortConfig.direction === "asc" ? "🔼" : "🔽") : ""}
              </th>
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider cursor-pointer" onClick={() => sortData("quarterSequenceBroken")}>
                Quarter Sequence {sortConfig.key === "quarterSequenceBroken" ? (sortConfig.direction === "asc" ? "🔼" : "🔽") : ""}
              </th>
              {/* Placeholder columns for criteria - these are not yet implemented in the backend data */}
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider">Criteria 1</th>
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider">Criteria 2</th>
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider">Criteria 3</th>
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider">Criteria 4</th>
              <th className="py-3 px-4 text-left text-sm font-semibold uppercase tracking-wider rounded-tr-lg">Criteria 5</th>
            </tr>
          </thead>
          <tbody>
            {sortedTickers.map(({ ticker, count, fastCheck1, lastNegativeDate, fastCheck2, fastCheck2Value, dataMissing90Days, dataExcessive60Days, dataExcessive1Year, dataExcessive10Years, quarterSequenceBroken }, index) => {
              const maxCount = 193; // Adjusted max records as per original code
              const percentage = ((count / maxCount) * 100).toFixed(1);
              const batteryColor = getBatteryColor(percentage);

              return (
                <React.Fragment key={ticker}>
                  <tr
                    onClick={() => fetchTickerData(ticker, index)}
                    className={`cursor-pointer transition-colors duration-200 border-b border-gray-200 ${openIndex === index ? "bg-blue-100" : "hover:bg-gray-100"}`}
                  >
                    <td className="py-3 px-4 text-sm text-gray-800 font-medium rounded-bl-lg">{ticker}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{count} / {maxCount}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">
                      <div className="flex items-center">
                        <div
                          className="w-12 h-5 border-2 border-gray-400 rounded-sm relative overflow-hidden mr-2"
                          style={{ background: "#ccc" }}
                        >
                          <div
                            className="h-full"
                            style={{
                              width: `${percentage}%`,
                              background: batteryColor,
                            }}
                          />
                        </div>
                        {percentage}%
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700">
                      {fastCheck1 === "✔️" ? (
                        <span className="text-green-600">✔️</span>
                      ) : (
                        <span className="text-red-600">❌ {lastNegativeDate !== "N/A" ? `(${lastNegativeDate})` : ""}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700">
                      {fastCheck2 === "Niet beschikbaar" ? (
                        <span className="text-gray-500">N/A</span>
                      ) : fastCheck2 === "✔️" ? (
                        <span className="text-green-600">✔️ {fastCheck2Value !== "N/A" ? `(${fastCheck2Value})` : ""}</span>
                      ) : (
                        <span className="text-red-600">❌ {fastCheck2Value !== "N/A" ? `(${fastCheck2Value})` : ""}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700">{dataMissing90Days ? <span className="text-red-600">❌</span> : <span className="text-green-600">✔️</span>}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{dataExcessive60Days ? <span className="text-red-600">❌</span> : <span className="text-green-600">✔️</span>}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{dataExcessive1Year ? <span className="text-red-600">❌</span> : <span className="text-green-600">✔️</span>}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{dataExcessive10Years ? <span className="text-red-600">❌</span> : <span className="text-green-600">✔️</span>}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{quarterSequenceBroken ? <span className="text-red-600">❌</span> : <span className="text-green-600">✔️</span>}</td>
                    {/* Placeholder for criteria columns */}
                    <td className="py-3 px-4 text-sm text-gray-700">N/A</td>
                    <td className="py-3 px-4 text-sm text-gray-700">N/A</td>
                    <td className="py-3 px-4 text-sm text-gray-700">N/A</td>
                    <td className="py-3 px-4 text-sm text-gray-700">N/A</td>
                    <td className="py-3 px-4 text-sm text-gray-700">N/A</td>
                  </tr>
                  {/* Expanded row to show detailed data and anomaly report */}
                  {openIndex === index && anomalyDetails && (
                    <tr>
                      <td colSpan="15" className="p-4 bg-gray-50 border-t border-gray-200"> {/* Adjusted colspan */}
                        <h4 className="text-xl font-bold mb-3 text-gray-800">Details voor {selectedTicker}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Data Anomaly Report */}
                          <div className="p-4 bg-red-50 border border-red-200 rounded-lg shadow-md">
                            <h5 className="text-lg font-semibold text-red-700 mb-3">Data Anomalie Rapport:</h5>
                            {anomalyDetails.missing90Days && (
                              <p className="text-red-800 mb-2 flex items-center">
                                Geen 'period end date' gevonden in de laatste 90 dagen.
                              </p>
                            )}
                            {anomalyDetails.excessive60Days.length > 0 && (
                              <div className="mb-2">
                                <p className="text-red-800 flex items-center">
                                  Meerdere 'period end dates' binnen 60 dagen:
                                </p>
                                <ul className="list-disc list-inside ml-7 text-sm text-red-700">
                                  {anomalyDetails.excessive60Days.map((date, idx) => (
                                    <li key={idx}>{date}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {anomalyDetails.excessive1Year.length > 0 && (
                              <div className="mb-2">
                                <p className="text-red-800 flex items-center">
                                  Meer dan 4 'period end dates' binnen 1 jaar ({anomalyDetails.excessive1Year.length} gevonden):
                                </p>
                                <ul className="list-disc list-inside ml-7 text-sm text-red-700">
                                  {anomalyDetails.excessive1Year.map((date, idx) => (
                                    <li key={idx}>{date}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {anomalyDetails.excessive10Years.length > 0 && (
                              <div className="mb-2">
                                <p className="text-red-800 flex items-center">
                                  Meer dan 40 'period end dates' binnen 10 jaar ({anomalyDetails.excessive10Years.length} gevonden):
                                </p>
                                <ul className="list-disc list-inside ml-7 text-sm text-red-700">
                                  {anomalyDetails.excessive10Years.map((date, idx) => (
                                    <li key={idx}>{date}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {/* New anomaly: Quarter Sequence Broken */}
                            {anomalyDetails.quarterSequenceBroken && (
                                <div className="mb-2">
                                    <p className="text-red-800 flex items-center">
                                        Kwartaalvolgorde onderbroken of onregelmatige tijdsintervallen:
                                    </p>
                                    <ul className="list-disc list-inside ml-7 text-sm text-red-700">
                                        {anomalyDetails.brokenQuarterSequenceDetails.map((detail, idx) => (
                                            <li key={idx}>
                                                Van {detail.prevDate} (FP ID: {detail.prevFpId}) naar {detail.currentDate} (FP ID: {detail.currentFpId}). Verwacht FP ID: {detail.expectedFpId}. Dagen verschil: {detail.daysDifference}. Reden: {detail.reason}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {/* New: Missing Data Types */}
                            {anomalyDetails.missingDataTypes.length > 0 && (
                                <div className="mb-2">
                                    <p className="text-red-800 flex items-center">
                                        Ontbrekende datatypes in verwachte periode:
                                    </p>
                                    <ul className="list-disc list-inside ml-7 text-sm text-red-700">
                                        {anomalyDetails.missingDataTypes.map((detail, idx) => (
                                            <li key={idx}>
                                                {detail.dataType} ontbreekt op {detail.period_end_date} (Verwacht van {detail.expectedFrom} tot {detail.expectedTo})
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Message if no anomalies are found */}
                            {(!anomalyDetails.missing90Days && anomalyDetails.excessive60Days.length === 0 && anomalyDetails.excessive1Year.length === 0 && anomalyDetails.excessive10Years.length === 0 && !anomalyDetails.quarterSequenceBroken && anomalyDetails.missingDataTypes.length === 0) && (
                              <p className="text-green-700 flex items-center">
                                Geen significante data-anomalieën gevonden voor 'period end date'.
                              </p>
                            )}
                          </div>
                          {/* Detailed financial data table - Now grouped by period_end_date */}
                          <div>
                            <h5 className="text-lg font-semibold mb-2 text-gray-700">Financiële Data (Per Kwartaal)</h5>
                            <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                              <thead>
                                <tr className="bg-gray-100 border-b border-gray-200">
                                  <th className="py-2 px-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider rounded-tl-lg">Period End Date</th>
                                  <th className="py-2 px-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Quarter</th>
                                  <th className="py-2 px-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">FP ID</th>
                                  {uniqueHeaders.map(header => (
                                    <th key={header} className="py-2 px-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                                      {header}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {groupedTickerData.slice(0, visibleRowCount).map((data, i) => {
                                  // Check if this row (period_end_date) has any missing data types
                                  const isRowMissingData = anomalyDetails.missingDataTypes.some(
                                    missing => missing.period_end_date === data.period_end_date
                                  );

                                  return (
                                    <tr
                                      key={data.period_end_date}
                                      className={`border-b border-gray-100 last:border-b-0 hover:bg-gray-50 ${isRowMissingData ? 'bg-red-50' : ''}`}
                                    >
                                      <td className="py-2 px-3 text-sm text-gray-700">{data.period_end_date}</td>
                                      <td className="py-2 px-3 text-sm text-gray-700">Q{data.form_id}</td>
                                      <td className="py-2 px-3 text-sm text-gray-700">{data.fp_id}</td>
                                      {uniqueHeaders.map(header => {
                                        // Check if this specific cell (datatype for this period_end_date) is missing
                                        const isCellMissing = anomalyDetails.missingDataTypes.some(
                                          missing =>
                                            missing.period_end_date === data.period_end_date &&
                                            missing.dataType === header
                                        );
                                        return (
                                          <td
                                            key={header}
                                            className={`py-2 px-3 text-sm text-gray-700 ${isCellMissing ? 'border-2 border-red-600 font-bold' : ''}`}
                                          >
                                            {data[header] !== undefined && data[header] !== null ? data[header].toLocaleString() : "N/A"}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {/* "Load More" button */}
                            {visibleRowCount < groupedTickerData.length && (
                              <div className="text-center mt-4">
                                <button
                                  onClick={handleLoadMore}
                                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out"
                                >
                                  Toon 10 extra rijen
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TickerOverview;
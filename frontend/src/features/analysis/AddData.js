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

const ALPHA_VANTAGE_REPORT_TYPES = [
  { key: 'INCOME_STATEMENT', label: 'Income Statement' },
  { key: 'BALANCE_SHEET', label: 'Balance Sheet' },
  { key: 'CASH_FLOW', label: 'Cash Flow Statement' },
];


const AddData = ({
    selectedStock,
    inputMethod,
    setInputMethod,
    manualPeriodEndDate,
    setManualPeriodEndDate,
    manualPeriodStartDate,
    setManualPeriodStartDate,
    manualFY,
    setManualFY,
    manualFPId,
    setManualFPId,
    manualFormId,
    setManualFormId,
    manualDataValues,
    handleManualValueChange,
    isDateConfirmed,
    setIsDateConfirmed,
    nearbyDateSuggestion,
    canEditMetaData,
    checkDate,
    handleCheckDateClick,
    handleUseSuggestedDate,
    periodEndDates,
    fiscalPeriods,
    formTypes,
    getFiscalYearOptions,
    handleAddManualData,
    loading,
    // SEC Props
    secPeriodOption,
    setSecPeriodOption,
    handleImportSecData,
    isImporting,
    importProgress,
    importLog,
    // Alpha Vantage Props
    alphaVantageFunction,
    setAlphaVantageFunction,
    alphaVantageFetchYear,
    setAlphaVantageFetchYear,
    fetchAlphaVantageData,
    isAlphaVantageFetching,
    alphaVantageFetchedData,
    handleSaveAlphaVantageData,
}) => {
    if (!selectedStock) {
        return null;
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
            <h5 className="text-lg font-semibold text-gray-800 mb-4">Voeg Data Toe voor {selectedStock.ticker}</h5>

            <div className="mb-3">
              <label className="font-semibold text-gray-700">Kies Invoermethode:</label>
              <div className="flex space-x-4 mt-2">
                <div className="flex items-center">
                  <input
                    className="form-radio h-4 w-4 text-blue-600"
                    type="radio"
                    name="inputMethod"
                    id="manualInput"
                    value="manual"
                    checked={inputMethod === 'manual'}
                    onChange={() => setInputMethod('manual')}
                  />
                  <label className="ml-2 text-gray-700" htmlFor="manualInput">Handmatig</label>
                </div>
                <div className="flex items-center">
                  <input
                    className="form-radio h-4 w-4 text-blue-600"
                    type="radio"
                    name="inputMethod"
                    id="secApiInput"
                    value="sec_api"
                    checked={inputMethod === 'sec_api'}
                    onChange={() => setInputMethod('sec_api')}
                  />
                  <label className="ml-2 text-gray-700" htmlFor="secApiInput">Via SEC API</label>
                </div>
                <div className="flex items-center">
                  <input
                    className="form-radio h-4 w-4 text-blue-600"
                    type="radio"
                    name="inputMethod"
                    id="alphaVantageApiInput"
                    value="alpha_vantage"
                    checked={inputMethod === 'alpha_vantage'}
                    onChange={() => setInputMethod('alpha_vantage')}
                  />
                  <label className="ml-2 text-gray-700" htmlFor="alphaVantageApiInput">Via Alpha Vantage API</label>
                </div>
                <div className="flex items-center">
                  <input
                    className="form-radio h-4 w-4 text-blue-600"
                    type="radio"
                    name="inputMethod"
                    id="pythonScriptInput"
                    value="python_script"
                    checked={inputMethod === 'python_script'}
                    onChange={() => setInputMethod('python_script')}
                  />
                  <label className="ml-2 text-gray-700" htmlFor="pythonScriptInput">Via Python Script</label>
                </div>
              </div>
            </div>

            {inputMethod === 'manual' ? (
              // Manual input
              <div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
                  <div>
                    <label htmlFor="manualPeriodEndDate" className="block text-sm font-medium text-gray-700">Periode Eind Datum (JJJJ-MM-DD):</label>
                    <input
                      type="date"
                      id="manualPeriodEndDate"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      value={manualPeriodEndDate}
                      onChange={(e) => {
                        setManualPeriodEndDate(e.target.value);
                        setIsDateConfirmed(false); // Reset confirmation if date changes
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="previousDatesDropdown" className="block text-sm font-medium text-gray-700">Of kies een bestaande datum:</label>
                    <select
                        id="previousDatesDropdown"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        value={manualPeriodEndDate} // Bind to the same state
                        onChange={(e) => {
                            const newDate = e.target.value;
                            if (newDate) {
                                setManualPeriodEndDate(newDate);
                                checkDate(newDate);
                            }
                        }}
                    >
                        <option value="">Selecteer een datum</option>
                        {periodEndDates.map(date => (
                            <option key={date} value={date}>{date}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <button
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded"
                        onClick={handleCheckDateClick}
                        disabled={!selectedStock || !manualPeriodEndDate || loading}
                    >
                        Controleer Datum
                    </button>
                  </div>
                </div>
                {nearbyDateSuggestion && (
                    <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-2 mt-2 text-sm">
                        Suggestie: Data beschikbaar voor <span className="font-bold">{nearbyDateSuggestion}</span>.
                        <button className="text-blue-500 hover:text-blue-700 font-semibold ml-2" onClick={handleUseSuggestedDate}>Gebruik deze datum</button>
                    </div>
                )}

                {isDateConfirmed && ( // Only show these fields if date is confirmed
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label htmlFor="manualPeriodStartDate" className="block text-sm font-medium text-gray-700">Periode Start Datum (JJJJ-MM-DD):</label>
                                <input
                                type="date"
                                id="manualPeriodStartDate"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                value={manualPeriodStartDate}
                                onChange={(e) => setManualPeriodStartDate(e.target.value)}
                                disabled={!canEditMetaData}
                                />
                            </div>
                            <div>
                                <label htmlFor="manualFY" className="block text-sm font-medium text-gray-700">Fiscaal Jaar (FY):</label>
                                <select
                                    id="manualFY"
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                    value={manualFY}
                                    onChange={(e) => setManualFY(e.target.value)}
                                    disabled={!canEditMetaData}
                                >
                                    <option value="">Selecteer FY</option>
                                    {getFiscalYearOptions().map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="manualFPId" className="block text-sm font-medium text-gray-700">Fiscale Periode (FP_ID):</label>
                                <select
                                    id="manualFPId"
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                    value={manualFPId}
                                    onChange={(e) => setManualFPId(e.target.value)}
                                    disabled={!canEditMetaData}
                                >
                                    <option value="">Selecteer FP</option>
                                    {fiscalPeriods.map(fp => (
                                        <option key={fp.fp_id} value={fp.fp_id}>{fp.fp}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="mb-4">
                            <label htmlFor="manualFormId" className="block text-sm font-medium text-gray-700">Formulier Type (Form_ID):</label>
                            <select
                                id="manualFormId"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                value={manualFormId}
                                onChange={(e) => setManualFormId(e.target.value)}
                                disabled={!canEditMetaData}
                            >
                                <option value="">Selecteer Formulier</option>
                                {formTypes.map(form => (
                                    <option key={form.id} value={form.id}>{form.name}</option>
                                ))}
                            </select>
                        </div>

                        {FUNDAMENTAL_DATA_TYPES.map(type => (
                            <div className="mb-3" key={type.key}>
                                <label htmlFor={type.key} className="block text-sm font-medium text-gray-700">{type.label}:</label>
                                <input
                                    type="number"
                                    id={type.key}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                    value={manualDataValues[type.key]}
                                    onChange={(e) => handleManualValueChange(type.key, e.target.value)}
                                    step="0.01"
                                />
                            </div>
                        ))}
                        <button
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition-colors"
                            onClick={handleAddManualData}
                            disabled={loading || !isDateConfirmed}
                        >
                            Opslaan Handmatige Data
                        </button>
                    </>
                )}
              </div>
            ) : inputMethod === 'sec_api' ? (
              // SEC API input - NEW IMPLEMENTATION
              <div>
                <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700">Periode Selectie:</label>
                    <div className="flex space-x-4 mt-2">
                        <div className="flex items-center">
                        <input
                            className="form-radio h-4 w-4 text-blue-600"
                            type="radio"
                            name="secPeriodOption"
                            id="secAllData"
                            value="all"
                            checked={secPeriodOption === 'all'}
                            onChange={() => setSecPeriodOption('all')}
                            disabled={isImporting}
                        />
                        <label className="ml-2 text-gray-700" htmlFor="secAllData">Alle data</label>
                        </div>
                        <div className="flex items-center">
                        <input
                            className="form-radio h-4 w-4 text-blue-600"
                            type="radio"
                            name="secPeriodOption"
                            id="secLastPeriod"
                            value="last"
                            checked={secPeriodOption === 'last'}
                            onChange={() => setSecPeriodOption('last')}
                            disabled={isImporting}
                        />
                        <label className="ml-2 text-gray-700" htmlFor="secLastPeriod">Laatste periode</label>
                        </div>
                        <div className="flex items-center">
                        <input
                            className="form-radio h-4 w-4 text-blue-600"
                            type="radio"
                            name="secPeriodOption"
                            id="secLastYear"
                            value="lastYear"
                            checked={secPeriodOption === 'lastYear'}
                            onChange={() => setSecPeriodOption('lastYear')}
                            disabled={isImporting}
                        />
                        <label className="ml-2 text-gray-700" htmlFor="secLastYear">Laatste jaar</label>
                        </div>
                    </div>
                </div>

                <button
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition-colors mr-2"
                  onClick={handleImportSecData}
                  disabled={isImporting || !selectedStock}
                >
                  {isImporting ? 'Bezig met importeren...' : 'Importeer van SEC'}
                </button>

                {isImporting && (
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mt-3">
                        <div
                            className="bg-blue-600 h-2.5 rounded-full"
                            style={{ width: `${importProgress}%` }}
                        ></div>
                    </div>
                )}

                {importLog && importLog.length > 0 && (
                  <div className="mt-3 p-3 border rounded bg-gray-50 h-64 overflow-y-auto">
                    <h6 className="text-sm font-semibold text-gray-700">Import Log:</h6>
                    <pre className="text-xs text-gray-500 whitespace-pre-wrap">
                        {importLog.join('\n')}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              // Alpha Vantage API input
              <div>
                <div className="mb-3">
                  <label htmlFor="alphaVantageFunction" className="block text-sm font-medium text-gray-700">Alpha Vantage Functie:</label>
                  <select
                    id="alphaVantageFunction"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
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
                  <label htmlFor="alphaVantageFetchYear" className="block text-sm font-medium text-gray-700">Jaar:</label>
                  <input
                    type="number"
                    id="alphaVantageFetchYear"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={alphaVantageFetchYear}
                    onChange={(e) => setAlphaVantageFetchYear(e.target.value)}
                    placeholder="Voer jaar in (bijv. 2023)"
                  />
                </div>
                <button
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition-colors mr-2"
                  onClick={fetchAlphaVantageData}
                  disabled={isAlphaVantageFetching || !selectedStock || !selectedStock.ticker || !alphaVantageFunction || !alphaVantageFetchYear}
                >
                  {isAlphaVantageFetching ? 'Bezig met ophalen...' : 'Haal Alpha Vantage Data Op'}
                </button>
                {alphaVantageFetchedData && (
                  <button
                    className="bg-green-600 text-white px-4 py-2 rounded-lg shadow hover:bg-green-700 transition-colors"
                    onClick={handleSaveAlphaVantageData}
                    disabled={loading}
                  >
                    Sla Alpha Vantage Data Op
                  </button>
                )}
                {alphaVantageFetchedData && (
                  <div className="mt-3 p-3 border rounded bg-gray-50">
                    <h6 className="text-sm font-semibold text-gray-700">Opgehaalde Alpha Vantage Data Voorbeeld:</h6>
                    <pre className="text-xs text-gray-500">{JSON.stringify(alphaVantageFetchedData, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
        </div>
    );
};

export default AddData;

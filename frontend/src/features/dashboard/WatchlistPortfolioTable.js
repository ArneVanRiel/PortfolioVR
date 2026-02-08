import React, { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default forwardRef(function WatchlistPortfolioTable({ onViewTypeChange = () => {} }, ref) {
  const [viewType, setViewType] = useState('idealePortfolio');
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [isUpdatingData, setIsUpdatingData] = useState(false);
  const [isDailyUpdateDone, setIsDailyUpdateDone] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [availableStocks, setAvailableStocks] = useState([]);
  const [selectedStockToAdd, setSelectedStockToAdd] = useState('');
  const [assetTypes, setAssetTypes] = useState([]);
  const [selectedAssetType, setSelectedAssetType] = useState('');
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
  const [stockToDelete, setStockToDelete] = useState(null);
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false); // State for column dropdown
  const MAX_STOCKS = 99;

  const navigate = useNavigate();

  // NIEUW: State voor sorteren
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  // NIEUW: State voor filteren
  const [tickerFilter, setTickerFilter] = useState('');
  const [alertTypeFilter, setAlertTypeFilter] = useState(''); // 'Koopsignaal', 'Verkoopsignaal', '' (alles)

  const dropdownRef = useRef(null); // Ref for column dropdown

  // NIEUW: Definieer alle mogelijke kolommen en hun eigenschappen
  const ALL_COLUMNS = useMemo(() => [
    { key: 'name', label: 'Naam', sortable: false, defaultVisible: true, type: 'string' },
    { key: 'ticker_symbol', label: 'Ticker', sortable: true, defaultVisible: true, type: 'string' },
    { key: 'asset_type_name', label: 'Type', sortable: false, defaultVisible: true, type: 'string' },
    { key: 'current_price', label: 'Laatste Prijs', sortable: true, defaultVisible: true, type: 'number' },
    { key: 'latest_fundamental_data_period_end_date', label: 'Laatste Data Datum', sortable: true, defaultVisible: true, type: 'date' },
    { key: 'current_signal_line', label: 'Huidige Signaal Lijn', sortable: true, defaultVisible: true, type: 'number' },
    { key: 'latest_alert_date', label: 'Laatste Melding', sortable: true, defaultVisible: true, type: 'date' },
    { key: 'latest_alert_type', label: 'Type Melding', sortable: true, defaultVisible: true, type: 'string' },
    { key: 'latest_trade_amount', label: 'Aanbevolen Bedrag (Alert)', sortable: true, defaultVisible: true, type: 'number' },
    { key: 'current_recommended_amount', label: 'Aanbevolen Bedrag (Huidig)', sortable: true, defaultVisible: true, type: 'number', isSummable: true },
    // 'Acties' kolom wordt apart afgehandeld en is altijd zichtbaar
  ], []);

  // NIEUW: State om zichtbare kolommen bij te houden (alleen de keys)
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(
    ALL_COLUMNS.filter(col => col.defaultVisible).map(col => col.key)
  );

  // Filter ALL_COLUMNS om alleen de momenteel zichtbare kolomdefinities te krijgen
  const visibleColumnDefinitions = useMemo(() => {
    return ALL_COLUMNS.filter(col => visibleColumnKeys.includes(col.key));
  }, [ALL_COLUMNS, visibleColumnKeys]);

  // NIEUW: Functie om kolomzichtbaarheid te togglen
  const handleColumnToggle = (columnKey) => {
    setVisibleColumnKeys(prev => {
      if (prev.includes(columnKey)) {
        return prev.filter(key => key !== columnKey);
      } else {
        // Voeg de nieuwe sleutel toe terwijl de originele volgorde behouden blijft
        const newKeys = [...prev, columnKey];
        return ALL_COLUMNS.filter(col => newKeys.includes(col.key)).map(col => col.key);
      }
    });
  };

  // Functie om de watchlist/ideale portfolio en meldingen op te halen van de backend
  const fetchStocksAndAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const stocksResponse = await fetch(`http://localhost:5000/api/watchlist/watchlist?view=${viewType}`);
      if (!stocksResponse.ok) {
        throw new Error(`HTTP error! status: ${stocksResponse.status}`);
      }
      const stocksData = await stocksResponse.json();
      setStocks(stocksData);

      const todayFormatted = new Date().toISOString().split('T')[0];
      const currentDayAlerts = stocksData.filter(stock =>
        stock.latest_alert_type && new Date(stock.latest_alert_date).toISOString().split('T')[0] === todayFormatted
      ).map(s => ({
        aandeel_id: s.aandeel_id,
        symbol: s.ticker_symbol,
        name: s.name,
        alert_type: s.latest_alert_type,
        price_at_alert: s.current_price,
        trade_amount: s.latest_trade_amount,
        signal_line_value: s.latest_alert_signal_line_value
      }));
      setAlerts(currentDayAlerts);

    } catch (err) {
      setError(`Kon data niet laden: ${err.message}`);
      console.error('Fout bij laden van aandelen/meldingen:', err);
    } finally {
      setLoading(false);
    }
  }, [viewType]);

  // Functie om alle beschikbare stocks op te halen uit de database
  const fetchAvailableStocks = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:5000/api/watchlist/available-stocks');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setAvailableStocks(data);
    } catch (err) {
      console.error('Fout bij ophalen beschikbare stocks:', err.message);
    }
  }, []);

  // Functie om alle beschikbare asset types op te halen
  const fetchAssetTypes = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:5000/api/watchlist/asset-types');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setAssetTypes(data);
      const defaultStockType = data.find(type => type.type_name === 'STOCK');
      if (defaultStockType) {
        setSelectedAssetType(defaultStockType.asset_type_id);
      }
    } catch (err) {
      console.error('Fout bij ophalen asset types:', err.message);
    }
  }, []);

  // Controleer de status van de dagelijkse update
  const checkDailyUpdateStatus = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:5000/api/watchlist/update-status');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setIsDailyUpdateDone(data.isUpdatedToday);
    } catch (err) {
      console.error('Fout bij controleren dagelijkse update status:', err.message);
      setIsDailyUpdateDone(false);
    }
  }, []);

  useEffect(() => {
    fetchStocksAndAlerts();
    checkDailyUpdateStatus();
    fetchAvailableStocks();
    fetchAssetTypes();
  }, [fetchStocksAndAlerts, checkDailyUpdateStatus, fetchAvailableStocks, fetchAssetTypes]);

  // Effect to close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsColumnDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Expose function to parent to open the modal
  useImperativeHandle(ref, () => ({
    openAddStockModal: () => {
      handleAddStockClick();
    }
  }));

  useEffect(() => {
    onViewTypeChange(viewType);
  }, [viewType, onViewTypeChange]);

  const handleViewTypeChange = (event) => {
    setViewType(event.target.value);
  };

  const handleUpdateData = async () => {
    setIsUpdatingData(true);
    const promise = fetch('http://localhost:5000/api/watchlist/update-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    });

    toast.promise(promise, {
      loading: 'Prijzen en meldingen worden bijgewerkt...',
      success: (result) => {
        fetchStocksAndAlerts();
        checkDailyUpdateStatus();
        setIsUpdatingData(false);
        return result.message || 'Update succesvol voltooid!';
      },
      error: (err) => `Fout bij bijwerken: ${err.message}`,
    });
  };

  const handleAddStockClick = () => {
    setSelectedStockToAdd('');
    const defaultStockType = assetTypes.find(type => type.type_name === 'STOCK');
    if (defaultStockType) {
      setSelectedAssetType(defaultStockType.asset_type_id);
    } else {
      setSelectedAssetType('');
    }
    setShowAddStockModal(true);
  };

  const handleConfirmAddStock = async () => {
    if (!selectedStockToAdd) {
      toast.error('Selecteer alstublieft een stock uit de lijst.');
      return;
    }
    if (!selectedAssetType) {
      toast.error('Selecteer alstublieft een asset type.');
      return;
    }

    if (stocks.length >= MAX_STOCKS) {
      toast.error(`Je hebt al het maximale aantal van ${MAX_STOCKS} stocks bereikt.`);
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/api/watchlist/add-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aandeel_id: selectedStockToAdd,
          viewType: viewType,
          asset_type_id: selectedAssetType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      toast.success(result.message);
      setShowAddStockModal(false);
      fetchStocksAndAlerts();
      fetchAvailableStocks();
    } catch (err) {
      toast.error(`Fout bij toevoegen stock: ${err.message}`);
      console.error('Fout bij toevoegen stock:', err);
    }
  };

  const handleDeleteStock = (stock) => {
    setStockToDelete(stock);
    setShowConfirmDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!stockToDelete) return;

    try {
      const response = await fetch(`http://localhost:5000/api/watchlist/remove-stock/${stockToDelete.aandeel_id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewType }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      toast.success(result.message);
      setShowConfirmDeleteModal(false);
      setStockToDelete(null);
      fetchStocksAndAlerts();
      fetchAvailableStocks();
    } catch (err) {
      toast.error(`Fout bij verwijderen stock: ${err.message}`);
      console.error('Fout bij verwijderen stock:', err);
    }
  };

  const handleCancelDelete = () => {
    setShowConfirmDeleteModal(false);
    setStockToDelete(null);
  };

  // Functie voor "Voeg Data Toe" knop per aandeel
  const handleAddStockData = (tickerSymbol) => {
    navigate('/data', { state: { ticker: tickerSymbol } });
  };

  // Functie voor "Bereken Data" knop per aandeel
  const handleCalculateSpecificStockData = (tickerSymbol, periodEndDate) => {
    navigate('/updateData', { state: { ticker: tickerSymbol, periodEndDate: periodEndDate } });
  };

  // Functie voor sorteren
  const handleSort = (key) => {
    // Vind de kolomdefinitie om te controleren of deze sorteerbaar is
    const column = ALL_COLUMNS.find(col => col.key === key);
    if (!column || !column.sortable) {
      return; // Sorteer niet als de kolom niet sorteerbaar is
    }

    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Functies voor filteren
  const handleTickerFilterChange = (event) => {
    setTickerFilter(event.target.value);
  };

  const handleAlertTypeFilterChange = (event) => {
    setAlertTypeFilter(event.target.value);
  };

  // Memoized gefilterde en gesorteerde stocks
  const filteredAndSortedStocks = useMemo(() => {
    let currentStocks = [...stocks];

    // Filteren
    if (tickerFilter) {
      currentStocks = currentStocks.filter(stock =>
        stock.ticker_symbol.toLowerCase().includes(tickerFilter.toLowerCase())
      );
    }
    if (alertTypeFilter) {
      currentStocks = currentStocks.filter(stock =>
        stock.latest_alert_type === alertTypeFilter
      );
    }

    // Sorteren
    if (sortConfig.key) {
      currentStocks.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Speciale afhandeling voor datum en numerieke waarden
        const columnType = ALL_COLUMNS.find(col => col.key === sortConfig.key)?.type;

        if (columnType === 'date') {
          aValue = aValue ? new Date(aValue).getTime() : 0;
          bValue = bValue ? new Date(bValue).getTime() : 0;
        } else if (columnType === 'number') {
          aValue = parseFloat(aValue) || 0;
          bValue = parseFloat(bValue) || 0;
        } else if (sortConfig.key === 'current_recommended_amount') {
          // Bereken de waarde direct voor sortering
          aValue = (!isNaN(a.current_signal_line) && a.current_price > 0)
            ? Math.max(0, 1000 * (1 + (-a.current_signal_line / a.current_price) * 4))
            : 0;
          bValue = (!isNaN(b.current_signal_line) && b.current_price > 0)
            ? Math.max(0, 1000 * (1 + (-b.current_signal_line / b.current_price) * 4))
            : 0;
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return currentStocks;
  }, [stocks, tickerFilter, alertTypeFilter, sortConfig, ALL_COLUMNS]);

  // Bereken de totaalsom van het huidige aanbevolen bedrag
  const totalCurrentRecommendedAmount = useMemo(() => {
    const recommendedColumnVisible = visibleColumnKeys.includes('current_recommended_amount');
    if (!recommendedColumnVisible) return null; // Toon de som niet als de kolom niet zichtbaar is

    return filteredAndSortedStocks.reduce((sum, stock) => {
      const amount = (!isNaN(stock.current_signal_line) && stock.current_price > 0)
        ? Math.max(0, 1000 * (1 + (-stock.current_signal_line / stock.current_price) * 4))
        : 0;
      return sum + amount;
    }, 0);
  }, [filteredAndSortedStocks, visibleColumnKeys]);


  // Filter de beschikbare stocks voor de dropdown in de modal
  const filteredAvailableStocks = availableStocks.filter(stock => {
    const isSelectedType = selectedAssetType ? stock.asset_type_id === parseInt(selectedAssetType) : true;
    let notInCurrentView = false;
    if (viewType === 'watchlist') {
      notInCurrentView = !stock.inWatchlist;
    } else { // idealePortfolio
      notInCurrentView = !stock.inIdealePortfolio;
    }
    return isSelectedType && notInCurrentView;
  });

  const getSortArrow = (key) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
    }
    return '';
  };

  // NIEUW: Functie om de "Laatste Data Datum" te renderen met een verouderingsmelding
  const renderLastDataDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const formattedDate = date.toLocaleDateString();

    if (diffDays > 90) {
      return (
        <>
          {formattedDate}
          <span className="block text-red-600 text-xs font-semibold"> (Verouderd! {diffDays} dagen)</span>
        </>
      );
    }
    return formattedDate;
  };

  // Berekent het aantal zichtbare kolommen voor colspan van de "geen aandelen" boodschap
  const totalVisibleColumns = visibleColumnDefinitions.length + 1; // +1 voor de "Acties" kolom

  // Berekent de colspan voor de totaalsom in de footer
  const indexOfRecommendedAmountCol = visibleColumnDefinitions.findIndex(col => col.key === 'current_recommended_amount');
  const colspanForFooterSumLabel = indexOfRecommendedAmountCol !== -1 ? indexOfRecommendedAmountCol : 0; // Spant kolommen ervoor
  const showFooterSum = indexOfRecommendedAmountCol !== -1; // Toon de footerrij alleen als de kolom zichtbaar is


  return (
    <div className="bg-gray-50">
      <div className="container mx-auto">
        {/* Header sectie met titel en knoppen */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 border-b border-gray-200">
          <h1 className="text-2xl text-gray-900 font-bold">Watchlist / Ideale Portfolio</h1>

        {/* Sectie voor de selectie van Watchlist of Ideale Portfolio en Update knop */}
        <div className="mt-4 sm:mt-0 flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label htmlFor="viewType" className="text-sm font-medium text-gray-600">Weergave:</label>
            <select
              id="viewType"
              value={viewType}
              onChange={handleViewTypeChange}
              className="block w-auto rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="idealePortfolio">Ideale Portfolio</option>
              <option value="watchlist">Watchlist</option>
            </select>
          </div>
          {/* Knop om data te updaten via de backend */}
          {/* De knop is verplaatst naar de hoofd-header in de vorige stap, dus deze kan hier weg. */}
        </div>
        </div>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md my-4" role="alert">
            {error}
          </div>
        )}

        {/* Sectie voor actieve meldingen */}
        {alerts.length > 0 && (
          <div className="bg-blue-50 border-l-4 border-blue-500 text-blue-800 p-4 rounded-md my-6" role="alert">
            <h2 className="text-lg font-semibold mb-3 flex items-center">
              <svg className="w-6 h-6 mr-3 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              Actieve MACD Crossover Meldingen Vandaag
            </h2>
            <ul className="list-none m-0 pl-9 space-y-1">
              {alerts.map((alert, index) => (
                <li key={alert.aandeel_id || index} className="flex items-center text-sm">
                  <span className={`inline-block w-2.5 h-2.5 mr-2 rounded-full ${alert.alert_type === 'Koopsignaal' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span className="font-medium">{alert.symbol} ({alert.name})</span>: <span className="font-bold ml-1">{alert.alert_type}</span> geactiveerd op €{alert.price_at_alert ? alert.price_at_alert.toFixed(2) : 'N/A'}. Bedrag: €{alert.trade_amount ? alert.trade_amount.toFixed(2) : 'N/A'}. Signaal Lijn: {alert.signal_line_value ? alert.signal_line_value.toFixed(4) : 'N/A'}.
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Filter controls */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label htmlFor="tickerFilter" className="block text-sm font-medium text-gray-600 mb-1">Filter Ticker:</label>
            <input
              type="text"
              id="tickerFilter"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              placeholder="Zoek op Ticker"
              value={tickerFilter}
              onChange={handleTickerFilterChange}
            />
          </div>
          <div>
            <label htmlFor="alertTypeFilter" className="block text-sm font-medium text-gray-600 mb-1">Filter Melding Type:</label>
            <select
              id="alertTypeFilter"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              value={alertTypeFilter}
              onChange={handleAlertTypeFilterChange}
            >
              <option value="">Alle Meldingen</option>
              <option value="Koopsignaal">Koopsignaal</option>
              <option value="Verkoopsignaal">Verkoopsignaal</option>
            </select>
          </div>
          {/* Kolomzichtbaarheid filter */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-sm font-medium text-gray-600 mb-1">Kolommen Weergeven:</label>
            <button
              onClick={() => setIsColumnDropdownOpen(!isColumnDropdownOpen)}
              className="mt-1 w-full bg-white border border-gray-300 rounded-md shadow-sm px-4 py-2 inline-flex justify-between items-center text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Selecteer Kolommen
              <svg className="-mr-1 ml-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            {isColumnDropdownOpen && (
              <ul className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                {ALL_COLUMNS.map(col => (
                  <li key={col.key} className="text-gray-900 cursor-default select-none relative py-2 pl-3 pr-9 hover:bg-gray-100">
                    <div className="flex items-center">
                      <input
                        id={`col-check-${col.key}`}
                        type="checkbox"
                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        checked={visibleColumnKeys.includes(col.key)}
                        onChange={() => handleColumnToggle(col.key)}
                      />
                      <label htmlFor={`col-check-${col.key}`} className="ml-3 block text-sm font-normal cursor-pointer">
                        {col.label}
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Tabel met aandelen */}
        {loading ? (
          <div className="text-center p-5 text-gray-700 text-lg">Aandelen laden...</div>
        ) : (
          <div className="overflow-x-auto rounded-lg shadow-md border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {visibleColumnDefinitions.map(col => (
                    <th
                      key={col.key}
                      scope="col"
                      className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                      onClick={() => col.sortable && handleSort(col.key)}
                    >
                      {col.label} {col.sortable ? getSortArrow(col.key) : ''}
                    </th>
                  ))}
                  {/* Acties kolom is altijd zichtbaar */}
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acties</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAndSortedStocks.length === 0 ? (
                  <tr>
                    <td colSpan={totalVisibleColumns} className="px-6 py-4 text-center text-sm text-gray-500">
                      Geen aandelen gevonden in de {viewType === 'watchlist' ? 'watchlist' : 'ideale portfolio'} met de huidige filters.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedStocks.map((stock) => {
                    const currentRecommendedAmount = (typeof stock.current_signal_line === 'number' && stock.current_price > 0)
                      ? Math.max(0, 1000 * (1 + (-stock.current_signal_line / stock.current_price) * 4))
                      : null;

                    return (
                      <tr key={stock.aandeel_id}>
                        {visibleColumnDefinitions.map(col => (
                          <td key={`${stock.aandeel_id}-${col.key}`} className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                            {col.key === 'current_price' && stock.current_price !== null ? `€${stock.current_price.toFixed(2)}` :
                             col.key === 'latest_fundamental_data_period_end_date' ? renderLastDataDate(stock.latest_fundamental_data_period_end_date) :
                             col.key === 'current_signal_line' && stock.current_signal_line !== null ? stock.current_signal_line.toFixed(4) :
                             col.key === 'latest_alert_date' && stock.latest_alert_date ? new Date(stock.latest_alert_date).toLocaleDateString() :
                             col.key === 'latest_trade_amount' && stock.latest_trade_amount !== null ? `€${stock.latest_trade_amount.toFixed(2)}` :
                             col.key === 'current_recommended_amount' && currentRecommendedAmount !== null ? `€${currentRecommendedAmount.toFixed(2)}` :
                             stock[col.key] || 'N/A'}
                          </td>
                        ))}
                        {/* Acties kolom is altijd zichtbaar */}
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                          <button
                            className="p-2 text-gray-500 rounded-lg hover:bg-gray-100 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onClick={() => handleAddStockData(stock.ticker_symbol)}
                            title="Voeg fundamentele data toe"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-file-earmark-plus h-5 w-5" viewBox="0 0 16 16">
                              <path d="M8 6.5a.5.5 0 0 1 .5.5v1.5H10a.5.5 0 0 1 0 1H8.5V11a.5.5 0 0 1-1 0V9.5H6a.5.5 0 0 1 0-1h1.5V7a.5.5 0 0 1 .5-.5z"/>
                              <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                            </svg>
                          </button>
                          <button
                            className="p-2 text-gray-500 rounded-lg hover:bg-gray-100 hover:text-green-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                            onClick={() => handleCalculateSpecificStockData(stock.ticker_symbol, stock.latest_fundamental_data_period_end_date)}
                            title="Bereken data"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-calculator h-5 w-5" viewBox="0 0 16 16">
                              <path d="M12 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8zM4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H4z"/>
                              <path d="M4 2.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-2zm0 4a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm4 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm4 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zM4 9a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm4 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm4 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zM4 12a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm4 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm4 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1z"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteStock(stock)}
                            className="p-2 text-gray-500 rounded-lg hover:bg-gray-100 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                            title={`Verwijder ${stock.ticker_symbol} uit ${viewType}`}
                          >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 16 16">
                              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                              <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {/* Tabelvoet voor totaalsom van 'Aanbevolen Bedrag (Huidig)' */}
              {showFooterSum && (
                <tfoot className="bg-gray-50">
                  <tr>
                    {/* Cel die alle kolommen vóór 'Aanbevolen Bedrag (Huidig)' overspant */}
                    <td colSpan={colspanForFooterSumLabel} className="px-6 py-3 text-right text-sm font-bold text-gray-900">
                      Totaal Aanbevolen Bedrag (Huidig):
                    </td>
                    {/* Cel voor de totaalsom */}
                    <td className="px-6 py-3 text-left text-sm font-bold text-gray-900">
                      €{totalCurrentRecommendedAmount.toFixed(2)}
                    </td>
                    {/* Extra cel voor de 'Acties' kolom */}
                    <td className="px-6 py-3"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Knop om aandelen toe te voegen aan de geselecteerde lijst */}
        <div className="mt-6 text-center">
          <div className="flex justify-center space-x-4">
            <button
              onClick={handleUpdateData}
              disabled={isUpdatingData}
              className="bg-green-600 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUpdatingData ? 'Bezig met bijwerken...' : 'Update Prijzen & Meldingen'}
            </button>
          </div>
        </div>

        {/* Modal voor het toevoegen van een stock */}
        {showAddStockModal && (
          <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="relative bg-white w-full max-w-lg rounded-xl shadow-2xl">
              <div className="flex items-start justify-between p-5 border-b border-gray-200 rounded-t-xl">
                <div className="flex items-center space-x-3">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
                    <svg className="h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Voeg Nieuwe Stock Toe</h3>
                </div>
                <button className="cursor-pointer p-1" onClick={() => setShowAddStockModal(false)}>
                  <svg className="w-6 h-6 text-gray-500 hover:text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label htmlFor="selectAssetType" className="block text-sm font-bold text-gray-700 mb-1">Asset Type:</label>
                  <select
                    id="selectAssetType"
                    value={selectedAssetType}
                    onChange={(e) => setSelectedAssetType(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="">Selecteer een type...</option>
                    {assetTypes.map(type => (
                      <option key={type.asset_type_id} value={type.asset_type_id}>
                        {type.type_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="selectStock" className="block text-sm font-bold text-gray-700 mb-1">Selecteer Stock:</label>
                  {filteredAvailableStocks.length > 0 ? (
                    <select
                      id="selectStock"
                      value={selectedStockToAdd}
                      onChange={(e) => setSelectedStockToAdd(e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                      <option value="">Selecteer een stock...</option>
                      {filteredAvailableStocks.map(stock => (
                        <option key={stock.aandeel_id} value={stock.aandeel_id}>
                          {stock.name} ({stock.ticker_symbol})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-gray-600 mt-2">Geen stocks beschikbaar voor het geselecteerde type of ze zijn al toegevoegd.</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end p-5 space-x-4 border-t border-gray-200 rounded-b-xl bg-gray-50">
                <button
                  className="px-6 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
                  onClick={() => setShowAddStockModal(false)}
                >
                  Annuleren
                </button>
                <button
                  className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleConfirmAddStock}
                  disabled={!selectedStockToAdd || !selectedAssetType || filteredAvailableStocks.length === 0}
                >
                  Toevoegen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bevestigingsmodal voor Verwijderen */}
        {showConfirmDeleteModal && stockToDelete && (
          <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="relative bg-white w-full max-w-md rounded-xl shadow-2xl">
              <div className="flex items-start justify-between p-5 border-b border-gray-200 rounded-t-xl">
                <div className="flex items-center space-x-3">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                    <svg className="h-6 w-6 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Verwijdering Bevestigen</h3>
                </div>
                <button className="cursor-pointer p-1" onClick={handleCancelDelete}>
                  <svg className="w-6 h-6 text-gray-500 hover:text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <div className="p-6">
                <p className="text-md text-gray-600">
                    Weet je zeker dat je '<span className="font-semibold text-gray-800">{stockToDelete.ticker_symbol} ({stockToDelete.name})</span>' wilt verwijderen uit je <span className="font-semibold text-gray-800">{viewType}</span>?
                </p>
              </div>
              <div className="flex items-center justify-end p-5 space-x-4 border-t border-gray-200 rounded-b-xl bg-gray-50">
                <button
                  className="px-6 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
                  onClick={handleCancelDelete}
                >
                  Annuleren
                </button>
                <button
                  className="px-6 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  onClick={handleConfirmDelete}
                >
                  Verwijderen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

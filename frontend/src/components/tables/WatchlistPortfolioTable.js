import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const WatchlistPortfolioTable = () => {
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
  const MAX_STOCKS = 99;

  const navigate = useNavigate();

  // NIEUW: State voor sorteren
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  // NIEUW: State voor filteren
  const [tickerFilter, setTickerFilter] = useState('');
  const [alertTypeFilter, setAlertTypeFilter] = useState(''); // 'Koopsignaal', 'Verkoopsignaal', '' (alles)

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

  const handleViewTypeChange = (event) => {
    setViewType(event.target.value);
  };

  const handleUpdateData = async () => {
    setIsUpdatingData(true);
    try {
      const response = await fetch('http://localhost:5000/api/watchlist/update-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      alert(result.message);
      fetchStocksAndAlerts();
      checkDailyUpdateStatus();
    } catch (err) {
      alert(`Fout bij bijwerken data: ${err.message}`);
      console.error('Fout bij bijwerken data:', err);
    } finally {
      setIsUpdatingData(false);
    }
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
      alert('Selecteer alstublieft een stock uit de lijst.');
      return;
    }
    if (!selectedAssetType) {
      alert('Selecteer alstublieft een asset type.');
      return;
    }

    if (stocks.length >= MAX_STOCKS) {
      alert(`Je hebt al het maximale aantal van ${MAX_STOCKS} stocks bereikt.`);
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
      alert(result.message);
      setShowAddStockModal(false);
      fetchStocksAndAlerts();
      fetchAvailableStocks();
    } catch (err) {
      alert(`Fout bij toevoegen stock: ${err.message}`);
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
      alert(result.message);
      setShowConfirmDeleteModal(false);
      setStockToDelete(null);
      fetchStocksAndAlerts();
      fetchAvailableStocks();
    } catch (err) {
      alert(`Fout bij verwijderen stock: ${err.message}`);
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
          {formattedDate}<br/>
          <span className="text-danger small fw-semibold"> (Verouderd! {diffDays} dagen)</span>
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
    <div className="bg-light min-vh-100 py-4" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="container bg-white shadow-lg rounded-3 p-4">
        <h1 className="h3 text-dark fw-bold mb-4">Watchlist / Ideale Portfolio</h1>

        {/* Sectie voor de selectie van Watchlist of Ideale Portfolio en Update knop */}
        <div className="mb-3 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center">
            <label htmlFor="viewType" className="me-3 fw-semibold text-secondary">Weergave:</label>
            <select
              id="viewType"
              value={viewType}
              onChange={handleViewTypeChange}
              className="form-select shadow-sm rounded-2"
            >
              <option value="idealePortfolio">Ideale Portfolio</option>
              <option value="watchlist">Watchlist</option>
            </select>
          </div>
          {/* Knop om data te updaten via de backend */}
          <div className="position-relative">
            <button
              onClick={handleUpdateData}
              disabled={isUpdatingData || isDailyUpdateDone}
              className={`btn btn-success shadow-sm fw-semibold rounded-2 ${isUpdatingData || isDailyUpdateDone ? 'disabled' : ''}`}
            >
              {isUpdatingData ? 'Bezig met updaten...' : 'Update Prijzen & Meldingen'}
            </button>
            {isDailyUpdateDone && (
              <span className="position-absolute top-0 start-50 translate-middle-x mt-n3 small text-muted text-nowrap">
                Vandaag al geüpdatet.
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        {/* Sectie voor actieve meldingen */}
        {alerts.length > 0 && (
          <div className="alert alert-warning border border-warning text-dark bg-warning-subtle rounded-3 mb-4">
            <h2 className="h5 fw-semibold mb-3 d-flex align-items-center">
              <svg className="bi me-2 text-warning" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.91.995l-.35 3.5a.5.5 0 0 1-.98 0l-.35-3.5C7.046 5.462 7.465 5 8 5zm.902 7.155a.502.502 0 0 1-.904 0l-.35-3.5a.5.5 0 0 1 .98 0l.35 3.5z"/>
              </svg>
              Actieve MACD Crossover Meldingen Vandaag
            </h2>
            <ul className="list-unstyled mb-0">
              {alerts.map((alert, index) => (
                <li key={alert.aandeel_id || index} className="d-flex align-items-center text-dark">
                  <span className={`badge rounded-pill me-2 ${alert.alert_type === 'Koopsignaal' ? 'bg-success' : 'bg-danger'} p-2`}></span>
                  <span className="fw-medium">{alert.symbol} ({alert.name})</span>: <span className="fw-bold">{alert.alert_type}</span> geactiveerd op €{alert.price_at_alert ? alert.price_at_alert.toFixed(2) : 'N/A'}. Bedrag: €{alert.trade_amount ? alert.trade_amount.toFixed(2) : 'N/A'}. Signaal Lijn: {alert.signal_line_value ? alert.signal_line_value.toFixed(4) : 'N/A'}.
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Filter controls: Ticker, Melding Type en NIEUW: Kolomzichtbaarheid */}
        <div className="mb-3 d-flex flex-wrap align-items-end gap-3"> {/* align-items-end voor betere uitlijning van labels */}
          <div className="flex-grow-1" style={{ minWidth: '150px' }}>
            <label htmlFor="tickerFilter" className="form-label fw-semibold text-secondary mb-1">Filter Ticker:</label>
            <input
              type="text"
              id="tickerFilter"
              className="form-control rounded-2 shadow-sm"
              placeholder="Zoek op Ticker"
              value={tickerFilter}
              onChange={handleTickerFilterChange}
            />
          </div>
          <div className="flex-grow-1" style={{ minWidth: '150px' }}>
            <label htmlFor="alertTypeFilter" className="form-label fw-semibold text-secondary mb-1">Filter Melding Type:</label>
            <select
              id="alertTypeFilter"
              className="form-select rounded-2 shadow-sm"
              value={alertTypeFilter}
              onChange={handleAlertTypeFilterChange}
            >
              <option value="">Alle Meldingen</option>
              <option value="Koopsignaal">Koopsignaal</option>
              <option value="Verkoopsignaal">Verkoopsignaal</option>
            </select>
          </div>
          {/* NIEUW: Kolomzichtbaarheid filter */}
          <div className="flex-grow-1" style={{ minWidth: '150px' }}>
              <label className="form-label fw-semibold text-secondary mb-1">Kolommen Weergeven:</label>
              <div className="dropdown w-100">
                  <button className="btn btn-outline-secondary dropdown-toggle w-100 rounded-2 shadow-sm" type="button" id="columnVisibilityDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                      Selecteer Kolommen
                  </button>
                  <ul className="dropdown-menu" aria-labelledby="columnVisibilityDropdown" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                      {ALL_COLUMNS.map(col => (
                          <li key={col.key}>
                              <div className="form-check dropdown-item px-3 py-2">
                                  <input
                                      className="form-check-input me-2"
                                      type="checkbox"
                                      id={`col-check-${col.key}`}
                                      checked={visibleColumnKeys.includes(col.key)}
                                      onChange={() => handleColumnToggle(col.key)}
                                  />
                                  <label className="form-check-label" htmlFor={`col-check-${col.key}`}>
                                      {col.label}
                                  </label>
                              </div>
                          </li>
                      ))}
                  </ul>
              </div>
          </div>
        </div>

        {/* Tabel met aandelen */}
        {loading ? (
          <div className="text-center p-5 text-dark h4">Aandelen laden...</div>
        ) : (
          <div className="table-responsive rounded-3 shadow-sm border border-light">
            <table className="table table-striped table-hover mb-0">
              <thead className="bg-light">
                <tr>
                  {visibleColumnDefinitions.map(col => (
                    <th
                      key={col.key}
                      scope="col"
                      className={`px-3 py-2 text-start text-uppercase text-dark small ${col.sortable ? 'clickable' : ''}`}
                      onClick={() => col.sortable && handleSort(col.key)}
                    >
                      {col.label} {col.sortable ? getSortArrow(col.key) : ''}
                    </th>
                  ))}
                  {/* Acties kolom is altijd zichtbaar */}
                  <th scope="col" className="px-3 py-2 text-end text-uppercase text-dark small">Acties</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {filteredAndSortedStocks.length === 0 ? (
                  <tr>
                    <td colSpan={totalVisibleColumns} className="text-center py-4 text-dark small">
                      Geen aandelen gevonden in de {viewType === 'watchlist' ? 'watchlist' : 'ideale portfolio'} met de huidige filters.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedStocks.map((stock) => {
                    const currentRecommendedAmount = (!isNaN(stock.current_signal_line) && stock.current_price > 0)
                      ? Math.max(0, 1000 * (1 + (-stock.current_signal_line / stock.current_price) * 4))
                      : null;

                    return (
                      <tr key={stock.aandeel_id}>
                        {visibleColumnDefinitions.map(col => (
                          <td key={`${stock.aandeel_id}-${col.key}`} className="px-3 py-2 text-dark small">
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
                        <td className="px-3 py-2 text-end">
                          <button
                            className="btn btn-sm btn-outline-info me-2 rounded-2"
                            onClick={() => handleAddStockData(stock.ticker_symbol)}
                            title="Voeg fundamentele data toe"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-file-earmark-plus" viewBox="0 0 16 16">
                              <path d="M8 6.5a.5.5 0 0 1 .5.5v1.5H10a.5.5 0 0 1 0 1H8.5V11a.5.5 0 0 1-1 0V9.5H6a.5.5 0 0 1 0-1h1.5V7a.5.5 0 0 1 .5-.5z"/>
                              <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                            </svg>
                          </button>
                          <button
                            className="btn btn-sm btn-outline-success me-2 rounded-2"
                            onClick={() => handleCalculateSpecificStockData(stock.ticker_symbol, stock.latest_fundamental_data_period_end_date)}
                            title="Bereken data"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-calculator" viewBox="0 0 16 16">
                              <path d="M12 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8zM4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H4z"/>
                              <path d="M4 2.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-2zm0 4a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm4 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm4 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zM4 9a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm4 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm4 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zM4 12a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm4 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1zm4 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1z"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteStock(stock)}
                            className="btn btn-outline-danger btn-sm rounded-circle"
                            title={`Verwijder ${stock.ticker_symbol} uit ${viewType}`}
                          >
                            <svg className="bi" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
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
                <tfoot>
                  <tr>
                    {/* Cel die alle kolommen vóór 'Aanbevolen Bedrag (Huidig)' overspant */}
                    <td colSpan={colspanForFooterSumLabel} className="px-3 py-2 text-end fw-bold text-dark small bg-light">
                      Totaal Aanbevolen Bedrag (Huidig):
                    </td>
                    {/* Cel voor de totaalsom */}
                    <td className="px-3 py-2 text-start fw-bold text-dark small bg-light">
                      €{totalCurrentRecommendedAmount.toFixed(2)}
                    </td>
                    {/* Extra cel voor de 'Acties' kolom */}
                    <td className="px-3 py-2 bg-light"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Knop om aandelen toe te voegen aan de geselecteerde lijst */}
        <div className="mt-4 text-center">
          <button
            onClick={handleAddStockClick}
            disabled={stocks.length >= MAX_STOCKS}
            className={`btn btn-primary shadow-sm fw-semibold rounded-2 ${stocks.length >= MAX_STOCKS ? 'disabled' : ''}`}
          >
            Voeg Aandelen Toe aan {viewType === 'watchlist' ? 'Watchlist' : 'Ideale Portfolio'}
          </button>
          {stocks.length >= MAX_STOCKS && (
            <p className="text-danger small mt-2">Maximum aantal stocks ({MAX_STOCKS}) bereikt.</p>
          )}
        </div>

        {/* Modal voor het toevoegen van een stock (Bootstrap Modal structuur) */}
        {showAddStockModal && (
          <div className="modal fade show d-block" tabIndex="-1" role="dialog" style={{backgroundColor: 'rgba(0,0,0,0.5)'}}>
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content rounded-3 shadow">
                <div className="modal-header">
                  <h5 className="modal-title h5 fw-bold">Voeg Nieuwe Stock Toe</h5>
                  <button type="button" className="btn-close" aria-label="Close" onClick={() => setShowAddStockModal(false)}></button>
                </div>
                <div className="modal-body">
                  {/* Selectie voor Asset Type */}
                  <div className="mb-3">
                    <label htmlFor="selectAssetType" className="form-label fw-bold text-dark">Asset Type:</label>
                    <select
                      id="selectAssetType"
                      value={selectedAssetType}
                      onChange={(e) => setSelectedAssetType(e.target.value)}
                      className="form-select shadow-sm rounded-2"
                    >
                      <option value="">Selecteer een type...</option>
                      {assetTypes.map(type => (
                        <option key={type.asset_type_id} value={type.asset_type_id}>
                          {type.type_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* Selectie voor Stock */}
                  <div className="mb-3">
                    <label htmlFor="selectStock" className="form-label fw-bold text-dark">Selecteer Stock:</label>
                    {filteredAvailableStocks.length > 0 ? (
                      <select
                        id="selectStock"
                        value={selectedStockToAdd}
                        onChange={(e) => setSelectedStockToAdd(e.target.value)}
                        className="form-select shadow-sm rounded-2"
                      >
                        <option value="">Selecteer een stock...</option>
                        {filteredAvailableStocks.map(stock => (
                          <option key={stock.aandeel_id} value={stock.aandeel_id}>
                            {stock.name} ({stock.ticker_symbol})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-dark">Geen stocks beschikbaar voor het geselecteerde type of ze zijn al toegevoegd.</p>
                    )}
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary rounded-2"
                    onClick={() => setShowAddStockModal(false)}
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary rounded-2"
                    onClick={handleConfirmAddStock}
                    disabled={!selectedStockToAdd || !selectedAssetType || filteredAvailableStocks.length === 0}
                  >
                    Toevoegen
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Custom Bevestigingsmodal voor Verwijderen (Bootstrap Modal structuur) */}
        {showConfirmDeleteModal && stockToDelete && (
          <div className="modal fade show d-block" tabIndex="-1" role="dialog" style={{backgroundColor: 'rgba(0,0,0,0.5)'}}>
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content rounded-3 shadow">
                <div className="modal-header">
                  <h5 className="modal-title h5 fw-bold text-danger">Verwijdering Bevestigen</h5>
                  <button type="button" className="btn-close" aria-label="Close" onClick={handleCancelDelete}></button>
                </div>
                <div className="modal-body">
                  <p className="text-dark mb-3">
                    Weet je zeker dat je '<span className="fw-semibold">{stockToDelete.ticker_symbol} ({stockToDelete.name})</span>' wilt verwijderen uit je <span className="fw-semibold">{viewType}</span>?
                  </p>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary rounded-2"
                    onClick={handleCancelDelete}
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger rounded-2"
                    onClick={handleConfirmDelete}
                  >
                    Verwijderen
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WatchlistPortfolioTable;

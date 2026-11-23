import React, { useState, useEffect, useRef } from 'react';
import http from '../../http-common';
import toast from 'react-hot-toast';

function TransactionForm({ onSuccess, onCancel, transactionToEdit, initialStockId, initialTicker, initialStockName }) {
    const formatDateTimeLocal = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const [userId] = useState(localStorage.getItem('userID') || 1);
    const [transactionType, setTransactionType] = useState(transactionToEdit ? transactionToEdit.transaction_type : 'BUY');
    const [aandeelId, setAandeelId] = useState(transactionToEdit ? transactionToEdit.aandeel_id || '' : (initialStockId || ''));
    const [brokerId, setBrokerId] = useState(transactionToEdit ? transactionToEdit.broker_id || 1 : 1);
    const [quantity, setQuantity] = useState(transactionToEdit ? transactionToEdit.quantity : '');
    const [currency, setCurrency] = useState(transactionToEdit ? transactionToEdit.currency || 'EUR' : 'EUR');
    const [transactionPrice, setTransactionPrice] = useState(transactionToEdit ? transactionToEdit.price : '');
    const [transactionTime, setTransactionTime] = useState(transactionToEdit ? formatDateTimeLocal(transactionToEdit.purchase_time) : '');
    const [fees, setFees] = useState(transactionToEdit ? transactionToEdit.fees || 0 : 0);
    const [taxes, setTaxes] = useState(transactionToEdit ? transactionToEdit.taxes || 0 : 0);
    const [exchangeRate, setExchangeRate] = useState(transactionToEdit ? transactionToEdit.exchange_rate || 1 : 1);

    const [stocks, setStocks] = useState([]);
    const [brokers, setBrokers] = useState([
        { broker_id: 1, name: 'Etoro' },
        { broker_id: 2, name: 'Degiro' },
        { broker_id: 3, name: 'Bolero' },
        { broker_id: 4, name: 'Coinbase' }
    ]);
    const [error, setError] = useState('');

    // Asset Type & Zoekfunctionaliteit (Lokaal + Wereldwijd via Yahoo Finance)
    const [assetTypes, setAssetTypes] = useState([]);
    const [selectedAssetTypeId, setSelectedAssetTypeId] = useState('');
    const [stockSearch, setStockSearch] = useState(
        transactionToEdit && transactionToEdit.ticker_symbol
            ? `${transactionToEdit.ticker_symbol} ${transactionToEdit.stock_name ? `(${transactionToEdit.stock_name})` : ''}`.trim()
            : (initialTicker ? `${initialTicker} ${initialStockName ? `(${initialStockName})` : ''}`.trim() : '')
    );
    const [showStockDropdown, setShowStockDropdown] = useState(false);
    const [globalResults, setGlobalResults] = useState([]);
    const [searchingGlobal, setSearchingGlobal] = useState(false);
    const [addingGlobalTicker, setAddingGlobalTicker] = useState('');
    const dropdownRef = useRef(null);

    useEffect(() => {
        Promise.all([
            http.get('/stocks'),
            http.get('/watchlist/asset-types'),
            http.get('/brokers').catch(() => ({ data: null }))
        ]).then(([stocksRes, typesRes, brokersRes]) => {
            const sortedStocks = (stocksRes.data || []).sort((a, b) => (a.ticker || '').localeCompare(b.ticker || ''));
            setStocks(sortedStocks);
            setAssetTypes(typesRes.data || []);
            if (brokersRes?.data && brokersRes.data.length > 0) {
                setBrokers(brokersRes.data);
            }
        }).catch(err => console.error('Fout bij ophalen data:', err));
    }, []);

    const isCashTransaction = transactionType === 'DEPOSIT' || transactionType === 'WITHDRAWAL';

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowStockDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter lokale aandelen
    const filteredStocks = stocks.filter(s => {
        const matchesType = selectedAssetTypeId ? s.asset_type_id === parseInt(selectedAssetTypeId, 10) : true;
        const searchLower = stockSearch.toLowerCase().trim();
        if (!searchLower) return matchesType;
        const matchesSearch = (s.ticker || '').toLowerCase().includes(searchLower) || (s.name && s.name.toLowerCase().includes(searchLower)) || (s.isin && s.isin.toLowerCase().includes(searchLower));
        return matchesType && matchesSearch;
    });

    const handleManualAddUnknownStock = async () => {
        const raw = stockSearch.trim();
        if (!raw) return;
        const cleanTicker = raw.split(' ')[0].toUpperCase();
        await handleSelectGlobalStock({
            ticker: cleanTicker,
            name: raw,
            asset_type_id: selectedAssetTypeId ? parseInt(selectedAssetTypeId, 10) : 1,
            asset_type_name: 'STOCK',
            exchange: 'Handmatig'
        });
    };

    // Wereldwijd zoeken via Yahoo Finance wanneer de gebruiker minstens 2 tekens typt
    useEffect(() => {
        const q = stockSearch.trim();
        if (!showStockDropdown || q.length < 2 || aandeelId) {
            setGlobalResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setSearchingGlobal(true);
            try {
                const res = await http.get(`/stocks/search-global?q=${encodeURIComponent(q)}`);
                const localTickers = new Set(stocks.map(s => String(s.ticker || '').toUpperCase()));
                const externalOnly = (res.data || []).filter(item => !localTickers.has(String(item.ticker || '').toUpperCase()));
                setGlobalResults(externalOnly);
            } catch (e) {
                setGlobalResults([]);
            } finally {
                setSearchingGlobal(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [stockSearch, showStockDropdown, aandeelId, stocks]);

    const handleSelectGlobalStock = async (globalItem) => {
        setAddingGlobalTicker(globalItem.ticker);
        try {
            const rawQuery = stockSearch.trim();
            const isIsinTyped = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(rawQuery);
            const resolvedIsin = globalItem.isin || (isIsinTyped ? rawQuery.toUpperCase() : null);

            const res = await http.post('/stocks/ensure', {
                ticker_symbol: globalItem.ticker,
                name: globalItem.name,
                asset_type_id: globalItem.asset_type_id || 1,
                isin: resolvedIsin,
                exchange: globalItem.exchangeCode || globalItem.exchange || '',
                quoteType: globalItem.quoteType || ''
            });
            const createdStock = res.data?.stock;
            if (createdStock) {
                setStocks(prev => [...prev, createdStock].sort((a, b) => (a.ticker || '').localeCompare(b.ticker || '')));
                setAandeelId(createdStock.stock_id);
                setStockSearch(`${createdStock.ticker} (${createdStock.name})`);
                setShowStockDropdown(false);
                // Stel automatisch valuta in op basis van beurs-extensie (.DE, .AS, .BR, .PA, -EUR => EUR, anders USD)
                const tUpper = String(createdStock.ticker || '').toUpperCase();
                if (tUpper.endsWith('.DE') || tUpper.endsWith('.AS') || tUpper.endsWith('.BR') || tUpper.endsWith('.PA') || tUpper.endsWith('-EUR')) {
                    setCurrency('EUR');
                } else {
                    setCurrency('USD');
                }
                toast.success(res.data.message || `${createdStock.ticker} toegevoegd aan de database!`);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Kon het aandeel niet automatisch toevoegen.');
        } finally {
            setAddingGlobalTicker('');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!isCashTransaction && !aandeelId) {
            setError('Selecteer een aandeel uit de zoeklijst (of klik op een wereldwijd zoekresultaat om het toe te voegen).');
            return;
        }

        const newTransaction = {
            user_id: userId,
            aandeel_id: isCashTransaction ? null : aandeelId,
            broker_id: brokerId,
            transaction_type: transactionType,
            quantity: quantity,
            currency,
            price: isCashTransaction ? 1 : transactionPrice,
            purchase_time: transactionTime,
            fees,
            taxes,
            exchange_rate: exchangeRate
        };

        try {
            if (transactionToEdit) {
                await http.put(`/portfolio/transactions/${transactionToEdit.id}`, newTransaction);
            } else {
                await http.post('/portfolio/addTransaction', newTransaction);
            }
            if (onSuccess) onSuccess(transactionTime);
        } catch (err) {
            if (err.response && err.response.status === 409) {
                setError('Deze transactie is een duplicaat en staat al in je portfolio.');
            } else {
                setError('Fout bij opslaan. Controleer of alle velden correct zijn ingevuld.');
            }
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5 text-sm mt-3">
            {error && <div className="p-3 bg-red-100 text-red-700 rounded-xl font-medium text-xs">{error}</div>}

            {/* 1. Asset Selectie Sectie */}
            {!isCashTransaction && (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <h4 className="text-gray-800 font-bold mb-2.5 border-b border-gray-200 pb-2 flex items-center justify-between">
                        <span>1. Selecteer Aandeel, ETF of Crypto</span>
                        <span className="text-[11px] font-normal text-gray-500">
                            Staat een aandeel er nog niet tussen? Typ de naam, ticker of ISIN!
                        </span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block font-semibold text-gray-700 mb-1 text-xs">Categorie filter</label>
                            <select
                                value={selectedAssetTypeId}
                                onChange={(e) => {
                                    setSelectedAssetTypeId(e.target.value);
                                    setAandeelId('');
                                    setStockSearch('');
                                }}
                                disabled={!!initialStockId}
                                className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none border disabled:bg-gray-100 text-xs font-semibold"
                            >
                                <option value="">-- Alle Categorieën --</option>
                                {assetTypes.map(t => (
                                    <option key={t.asset_type_id} value={t.asset_type_id}>{t.type_name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="md:col-span-2 relative" ref={dropdownRef}>
                            <label className="block font-semibold text-gray-700 mb-1 text-xs">
                                Zoek op Ticker, Bedrijfsnaam of ISIN
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={stockSearch}
                                    onChange={(e) => {
                                        setStockSearch(e.target.value);
                                        setShowStockDropdown(true);
                                        setAandeelId('');
                                    }}
                                    onFocus={() => {
                                        if (!initialStockId) setShowStockDropdown(true);
                                    }}
                                    placeholder="Bijv. AAPL,IWDA, Lotus Bakeries of US0378331005..."
                                    disabled={!!initialStockId}
                                    className="w-full border-gray-300 rounded-lg p-2 pr-8 focus:ring-2 focus:ring-blue-500 outline-none border disabled:bg-gray-100 text-xs font-semibold"
                                />
                                {aandeelId && (
                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-600 font-black text-xs">
                                        ✓
                                    </span>
                                )}
                            </div>

                            {showStockDropdown && (
                                <div className="absolute z-20 w-full bg-white border border-gray-200 shadow-2xl max-h-64 overflow-y-auto rounded-xl mt-1 text-xs divide-y divide-gray-100">
                                    {/* A. Bestaande aandelen in de database */}
                                    {filteredStocks.length > 0 && (
                                        <div>
                                            <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-gray-400">
                                                Reeds in PortfolioVR catalogus ({filteredStocks.length})
                                            </div>
                                            <ul>
                                                {filteredStocks.map(s => (
                                                    <li
                                                        key={s.stock_id}
                                                        onClick={() => {
                                                            setAandeelId(s.stock_id);
                                                            setStockSearch(`${s.ticker} (${s.name})`);
                                                            setShowStockDropdown(false);
                                                            const tUpper = String(s.ticker || '').toUpperCase();
                                                            if (tUpper.endsWith('.DE') || tUpper.endsWith('.AS') || tUpper.endsWith('.BR') || tUpper.endsWith('.PA') || tUpper.endsWith('-EUR')) {
                                                                setCurrency('EUR');
                                                            }
                                                        }}
                                                        className="px-3.5 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between"
                                                    >
                                                        <div>
                                                            <span className="font-extrabold text-gray-900">{s.ticker}</span>{' '}
                                                            <span className="text-gray-500">- {s.name}</span>
                                                        </div>
                                                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                                            Kies
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* B. Wereldwijde zoekresultaten via Yahoo Finance (voor aandelen die Arne nog niet zelf in de DB had) */}
                                    {(searchingGlobal || globalResults.length > 0) && (
                                        <div>
                                            <div className="px-3 py-1.5 bg-indigo-50/80 text-[10px] font-black uppercase tracking-wider text-indigo-700 flex items-center justify-between">
                                                <span>🌐 Wereldwijde Beursdata (Klik om direct toe te voegen)</span>
                                                {searchingGlobal && <span className="animate-pulse">Zoeken...</span>}
                                            </div>
                                            <ul>
                                                {globalResults.map(g => (
                                                    <li
                                                        key={g.ticker}
                                                        onClick={() => handleSelectGlobalStock(g)}
                                                        className="px-3.5 py-2.5 hover:bg-indigo-50 cursor-pointer flex items-center justify-between gap-2 transition-colors"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-black text-indigo-950">{g.ticker}</span>
                                                                <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded">
                                                                    {g.asset_type_name} • {g.exchange}
                                                                </span>
                                                            </div>
                                                            <div className="text-gray-600 truncate">{g.name}</div>
                                                        </div>
                                                        <span className="px-2 py-1 bg-indigo-600 text-white font-extrabold rounded-lg text-[10px] whitespace-nowrap shrink-0">
                                                            {addingGlobalTicker === g.ticker ? 'Toevoegen...' : '+ Toevoegen & Kiezen'}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {filteredStocks.length === 0 && !searchingGlobal && globalResults.length === 0 && (
                                        <div className="px-4 py-3 text-gray-500 space-y-2">
                                            <div className="italic">
                                                {stockSearch.trim().length < 2
                                                    ? 'Typ minstens 2 letters van een ticker, bedrijfsnaam of ISIN om wereldwijd op de beurs te zoeken...'
                                                    : `Geen resultaat gevonden op Yahoo Finance voor "${stockSearch.trim()}".`}
                                            </div>
                                            {stockSearch.trim().length >= 2 && (
                                                <button
                                                    type="button"
                                                    onClick={handleManualAddUnknownStock}
                                                    className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg text-xs flex items-center justify-center gap-1.5"
                                                >
                                                    <span>+ Voeg &ldquo;{stockSearch.trim().toUpperCase()}&rdquo; toch toe als nieuw aandeel</span>
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 2. Transactie Details Sectie */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <h4 className="text-gray-800 font-bold mb-2.5 border-b border-gray-200 pb-2">2. Transactie Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label className="block font-semibold text-gray-700 mb-1 text-xs">Type</label>
                        <select
                            value={transactionType}
                            onChange={(e) => {
                                setTransactionType(e.target.value);
                                setAandeelId('');
                                setStockSearch('');
                                setQuantity('');
                                setTransactionPrice('');
                            }}
                            className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none border text-xs font-semibold"
                        >
                            <option value="BUY">Kopen (Buy)</option>
                            <option value="SELL">Verkopen (Sell)</option>
                            <option value="DIVIDEND">Dividend</option>
                            <option value="DEPOSIT">Storting (Deposit)</option>
                            <option value="WITHDRAWAL">Opname (Withdrawal)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block font-semibold text-gray-700 mb-1 text-xs">Datum &amp; Tijd</label>
                        <input
                            type="datetime-local"
                            value={transactionTime}
                            onChange={(e) => setTransactionTime(e.target.value)}
                            required
                            className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none border text-xs font-semibold"
                        />
                    </div>
                    <div>
                        <label className="block font-semibold text-gray-700 mb-1 text-xs">Broker / Platform</label>
                        <select
                            value={brokerId}
                            onChange={(e) => setBrokerId(Number(e.target.value))}
                            className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none border text-xs font-semibold"
                        >
                            {brokers.map(b => (
                                <option key={b.broker_id} value={b.broker_id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* 3. Financiële Gegevens Sectie */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <h4 className="text-gray-800 font-bold mb-2.5 border-b border-gray-200 pb-2">3. Financiële Gegevens</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {isCashTransaction ? (
                        <div>
                            <label className="block font-semibold text-gray-700 mb-1 text-xs">Bedrag</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                required
                                className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none border text-xs font-semibold"
                            />
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="block font-semibold text-gray-700 mb-1 text-xs">Aantal stuks</label>
                                <input
                                    type="number"
                                    step="0.00001"
                                    min="0"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    required
                                    className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none border text-xs font-semibold"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-gray-700 mb-1 text-xs">Prijs per stuk</label>
                                <input
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    value={transactionPrice}
                                    onChange={(e) => setTransactionPrice(e.target.value)}
                                    required
                                    className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none border text-xs font-semibold"
                                />
                            </div>
                        </>
                    )}
                    <div>
                        <label className="block font-semibold text-gray-700 mb-1 text-xs">Valuta (Munt)</label>
                        <select
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none border text-xs font-semibold"
                        >
                            <option value="EUR">EUR (€)</option>
                            <option value="USD">USD ($)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block font-semibold text-gray-700 mb-1 text-xs">Wisselkoers</label>
                        <input
                            type="number"
                            step="0.000001"
                            min="0"
                            value={exchangeRate}
                            onChange={(e) => setExchangeRate(e.target.value)}
                            className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none border text-xs"
                            placeholder="1.00"
                        />
                    </div>
                    <div>
                        <label className="block font-semibold text-gray-700 mb-1 text-xs">Kosten (Fees)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={fees}
                            onChange={(e) => setFees(e.target.value)}
                            className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none border text-xs"
                            placeholder="0.00"
                        />
                    </div>
                    <div>
                        <label className="block font-semibold text-gray-700 mb-1 text-xs">Belastingen (Taxes)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={taxes}
                            onChange={(e) => setTaxes(e.target.value)}
                            className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none border text-xs"
                            placeholder="0.00"
                        />
                    </div>
                </div>
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-gray-200">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-bold text-xs shadow-2xs transition-colors"
                >
                    Annuleren
                </button>
                <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-extrabold text-xs shadow-sm transition-colors"
                >
                    {transactionToEdit ? 'Wijzigingen Opslaan' : 'Transactie Opslaan'}
                </button>
            </div>
        </form>
    );
}

export default TransactionForm;

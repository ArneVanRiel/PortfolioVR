import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

function TransactionForm({ onSuccess, onCancel, transactionToEdit, initialStockId, initialTicker, initialStockName }) {
    const formatDateTimeLocal = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const [userId, setUserId] = useState(1);
    const [transactionType, setTransactionType] = useState(transactionToEdit ? transactionToEdit.transaction_type : 'BUY'); 
    const [aandeelId, setAandeelId] = useState(transactionToEdit ? transactionToEdit.aandeel_id || '' : (initialStockId || ''));
    const [brokerId, setBrokerId] = useState(transactionToEdit ? transactionToEdit.broker_id || 1 : 1);
    const [quantity, setQuantity] = useState(transactionToEdit ? transactionToEdit.quantity : '');
    const [currency, setCurrency] = useState(transactionToEdit ? transactionToEdit.currency || 'USD' : 'USD');
    const [transactionPrice, setTransactionPrice] = useState(transactionToEdit ? transactionToEdit.price : '');
    const [transactionTime, setTransactionTime] = useState(transactionToEdit ? formatDateTimeLocal(transactionToEdit.purchase_time) : '');
    const [fees, setFees] = useState(transactionToEdit ? transactionToEdit.fees || 0 : 0);
    const [taxes, setTaxes] = useState(transactionToEdit ? transactionToEdit.taxes || 0 : 0);
    const [exchangeRate, setExchangeRate] = useState(transactionToEdit ? transactionToEdit.exchange_rate || 1 : 1);
    
    const [stocks, setStocks] = useState([]);
    const [error, setError] = useState('');

    // Nieuwe states voor Asset Type en Zoekfunctionaliteit
    const [assetTypes, setAssetTypes] = useState([]);
    const [selectedAssetTypeId, setSelectedAssetTypeId] = useState('');
    const [stockSearch, setStockSearch] = useState(
        transactionToEdit && transactionToEdit.ticker_symbol 
            ? `${transactionToEdit.ticker_symbol} ${transactionToEdit.stock_name ? `(${transactionToEdit.stock_name})` : ''}`.trim() 
            : (initialTicker ? `${initialTicker} ${initialStockName ? `(${initialStockName})` : ''}`.trim() : '')
    );
    const [showStockDropdown, setShowStockDropdown] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        // Haal zowel aandelen als categorieën op
        Promise.all([
            axios.get('/api/stocks'),
            axios.get('/api/watchlist/asset-types')
        ]).then(([stocksRes, typesRes]) => {
            const sortedStocks = stocksRes.data.sort((a, b) => a.ticker.localeCompare(b.ticker));
            setStocks(sortedStocks);
            setAssetTypes(typesRes.data);
        }).catch(err => console.error("Fout bij ophalen data:", err));
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!isCashTransaction && !aandeelId) {
            setError('Selecteer aub een geldig aandeel uit de zoeklijst.');
            return;
        }

        const newTransaction = {
            user_id: userId,
            aandeel_id: aandeelId,
            broker_id: isCashTransaction ? null : brokerId,
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
                await axios.put(`/api/portfolio/transactions/${transactionToEdit.id}`, newTransaction);
            } else {
                await axios.post('/api/portfolio/addTransaction', newTransaction);
            }
            if (onSuccess) onSuccess(transactionTime);
        } catch (err) {
            if (err.response && err.response.status === 409) {
                setError('Deze transactie is een duplicaat en staat al in de database.');
            } else {
                setError('Fout bij opslaan. Controleer of alle velden correct zijn ingevuld.');
            }
        }
    };

    // Filter de aandelen op basis van categorie én zoekterm
    const filteredStocks = stocks.filter(s => {
        const matchesType = selectedAssetTypeId ? s.asset_type_id === parseInt(selectedAssetTypeId) : true;
        const searchLower = stockSearch.toLowerCase();
        const matchesSearch = s.ticker.toLowerCase().includes(searchLower) || (s.name && s.name.toLowerCase().includes(searchLower));
        return matchesType && matchesSearch;
    });

    return (
        <form onSubmit={handleSubmit} className="space-y-6 text-sm mt-4">
            {error && <div className="p-3 bg-red-100 text-red-700 rounded mb-4">{error}</div>}
            
            {/* 1. Asset Selectie Sectie */}
            {!isCashTransaction && <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <h4 className="text-gray-800 font-semibold mb-3 border-b border-gray-200 pb-2">1. Selecteer Asset</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block font-medium text-gray-700 mb-1">Asset Type (Categorie)</label>
                        <select value={selectedAssetTypeId} onChange={(e) => { setSelectedAssetTypeId(e.target.value); setAandeelId(''); setStockSearch(''); }} disabled={!!initialStockId} className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow border disabled:bg-gray-100 disabled:text-gray-500">
                            <option value="">-- Alle Types --</option>
                            {assetTypes.map(t => <option key={t.asset_type_id} value={t.asset_type_id}>{t.type_name}</option>)}
                        </select>
                    </div>
                    <div className="relative" ref={dropdownRef}>
                        <label className="block font-medium text-gray-700 mb-1">Aandeel Zoeken</label>
                        <input 
                            type="text" 
                            value={stockSearch} 
                            onChange={(e) => { setStockSearch(e.target.value); setShowStockDropdown(true); setAandeelId(''); }} 
                            onFocus={() => { if (!initialStockId) setShowStockDropdown(true); }} 
                            placeholder="Zoek op ticker of naam..." 
                            disabled={!!initialStockId}
                            className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow border disabled:bg-gray-100 disabled:text-gray-500" 
                        />
                        {showStockDropdown && (
                            <ul className="absolute z-10 w-full bg-white border border-gray-200 shadow-xl max-h-48 overflow-y-auto rounded-lg mt-1 text-sm">
                                {filteredStocks.map(s => (
                                    <li 
                                        key={s.stock_id} 
                                        onClick={() => { setAandeelId(s.stock_id); setStockSearch(`${s.ticker} (${s.name})`); setShowStockDropdown(false); }} 
                                        className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0"
                                    >
                                        <span className="font-bold text-gray-800">{s.ticker}</span> <span className="text-gray-500">- {s.name}</span>
                                    </li>
                                ))}
                                {filteredStocks.length === 0 && <li className="px-4 py-3 text-gray-500 italic">Geen resultaten gevonden...</li>}
                            </ul>
                        )}
                    </div>
                </div>
            </div>}

            {/* 2. Transactie Details Sectie */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <h4 className="text-gray-800 font-semibold mb-3 border-b border-gray-200 pb-2">2. Transactie Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block font-medium text-gray-700 mb-1">Type</label>
                        <select value={transactionType} onChange={(e) => { 
                            setTransactionType(e.target.value); 
                            setAandeelId(''); 
                            setStockSearch(''); 
                            setQuantity(''); 
                            setTransactionPrice(''); 
                        }} className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow border">
                            <option value="BUY">Kopen (Buy)</option>
                            <option value="SELL">Verkopen (Sell)</option>
                            <option value="DIVIDEND">Dividend</option>
                            <option value="DEPOSIT">Storting (Deposit)</option>
                            <option value="WITHDRAWAL">Opname (Withdrawal)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block font-medium text-gray-700 mb-1">Datum & Tijd</label>
                        <input type="datetime-local" value={transactionTime} onChange={(e) => setTransactionTime(e.target.value)} required className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow border" />
                    </div>
                    <div>
                        <label className="block font-medium text-gray-700 mb-1">Broker / Platform</label>
                        <select value={brokerId} onChange={(e) => setBrokerId(Number(e.target.value))} className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow border">
                            <option value={1}>Etoro</option>
                            <option value={2}>Degiro</option>
                            <option value={3}>Saxo</option>
                            <option value={4}>Bolero</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* 3. Financiële Gegevens Sectie */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <h4 className="text-gray-800 font-semibold mb-3 border-b border-gray-200 pb-2">3. Financiële Gegevens</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {isCashTransaction ? (
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Bedrag</label>
                            <input type="number" step="0.01" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} required className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow border" />
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="block font-medium text-gray-700 mb-1">Aantal stuks</label>
                                <input type="number" step="0.00001" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} required className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow border" />
                            </div>
                            <div>
                                <label className="block font-medium text-gray-700 mb-1">Prijs per stuk</label>
                                <input type="number" step="0.0001" min="0" value={transactionPrice} onChange={(e) => setTransactionPrice(e.target.value)} required className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow border" />
                            </div>
                        </>
                    )}
                    <div>
                        <label className="block font-medium text-gray-700 mb-1">Valuta (Munt)</label>
                        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow border">
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (€)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block font-medium text-gray-700 mb-1">Wisselkoers</label>
                        <input type="number" step="0.000001" min="0" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow border" placeholder="1.00" />
                    </div>
                    <div>
                        <label className="block font-medium text-gray-700 mb-1">Kosten (Fees)</label>
                        <input type="number" step="0.01" min="0" value={fees} onChange={(e) => setFees(e.target.value)} className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow border" placeholder="0.00" />
                    </div>
                    <div>
                        <label className="block font-medium text-gray-700 mb-1">Belastingen (Taxes)</label>
                        <input type="number" step="0.01" min="0" value={taxes} onChange={(e) => setTaxes(e.target.value)} className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow border" placeholder="0.00" />
                    </div>
                </div>
            </div>

            <div className="flex justify-end space-x-3 mt-8 pt-4 border-t border-gray-200">
                <button type="button" onClick={onCancel} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium shadow-sm transition-colors">Annuleren</button>
                <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors">{transactionToEdit ? 'Wijzigingen Opslaan' : 'Transactie Opslaan'}</button>
            </div>
        </form>
    );
}

export default TransactionForm;

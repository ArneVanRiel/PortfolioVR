import React, { useState, useEffect } from 'react';
import axios from 'axios';

function AddStockForm({ fetchStocks }) {
    const [isOpen, setIsOpen] = useState(false);
    const [name, setName] = useState('');
    const [ticker, setTicker] = useState('');
    const [stockExchanges, setStockExchanges] = useState([]);
    const [selectedExchange, setSelectedExchange] = useState('');
    const [assetTypes, setAssetTypes] = useState([]);
    const [selectedAssetType, setSelectedAssetType] = useState('');
    const [isin, setIsin] = useState('');

    useEffect(() => {
        if (isOpen) {
            // Haal stock exchanges en asset types op wanneer de modal opent
            const fetchData = async () => {
                try {
                    const [exchangesRes, assetTypesRes] = await Promise.all([
                        axios.get('/api/watchlist/stock-exchanges'),
                        axios.get('/api/watchlist/asset-types')
                    ]);
                    setStockExchanges(exchangesRes.data);
                    setAssetTypes(assetTypesRes.data);
                    
                    // Selecteer standaard 'STOCK' als die bestaat en er nog geen selectie is
                    const stockType = assetTypesRes.data.find(t => t.type_name === 'STOCK');
                    if (stockType && !selectedAssetType) setSelectedAssetType(stockType.asset_type_id);
                } catch (error) {
                    console.error('Fout bij het ophalen van data:', error);
                }
            };

            fetchData();
        }
    }, [isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
    
        if (!name || !ticker || !selectedAssetType || !selectedExchange) {
            alert('Naam, ticker, asset type en beurs zijn verplicht!');
            return;
        }
    
        const newStock = {
            name,
            ticker_symbol: ticker,
            stock_exchange_id: selectedExchange,
            asset_type_id: selectedAssetType,
            isin: isin || null
        };
    
        try {
            await axios.post('/api/stocks', newStock);
            if (fetchStocks) fetchStocks();  // Refresh de tabel indien de functie is meegegeven
            setName('');
            setTicker('');
            setSelectedExchange('');
            setIsin('');
            setIsOpen(false); // Sluit de modal na succesvol toevoegen
        } catch (error) {
            if (error.response && error.response.status === 409) {
                alert('Aandeel met deze naam of ticker bestaat al.');
            } else {
                console.error('Fout bij het toevoegen van aandeel:', error);
                alert('Er is een fout opgetreden bij het toevoegen.');
            }
        }
    };

    return (
        <div>
            <button 
                onClick={() => setIsOpen(true)}
                className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
                Voeg Nieuw Aandeel Toe aan Database
            </button>

            {isOpen && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="relative bg-white w-full max-w-lg rounded-xl shadow-2xl">
                        <div className="flex items-start justify-between p-5 border-b border-gray-200 rounded-t-xl">
                            <div className="flex items-center space-x-3">
                                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
                                    <svg className="h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold text-gray-900">Nieuw Aandeel Aanmaken</h3>
                            </div>
                            <button className="cursor-pointer p-1" onClick={() => setIsOpen(false)}>
                                <svg className="w-6 h-6 text-gray-500 hover:text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Naam:</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                    placeholder="Bijv. Apple Inc."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Asset Type:</label>
                                <select
                                    value={selectedAssetType}
                                    onChange={(e) => setSelectedAssetType(e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                >
                                    <option value="">Selecteer type...</option>
                                    {assetTypes.map(type => (
                                        <option key={type.asset_type_id} value={type.asset_type_id}>
                                            {type.type_name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Ticker Symbool:</label>
                                <input
                                    type="text"
                                    value={ticker}
                                    onChange={(e) => setTicker(e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                    placeholder="Bijv. AAPL"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">ISIN (optioneel):</label>
                                <input
                                    type="text"
                                    value={isin}
                                    onChange={(e) => setIsin(e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                    placeholder="Bijv. US0378331005"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Beurs:</label>
                                <select
                                    value={selectedExchange}
                                    onChange={(e) => setSelectedExchange(e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                >
                                    <option value="">Selecteer beurs...</option>
                                    {stockExchanges.map(exchange => (
                                        <option key={exchange.stock_exchange_id} value={exchange.stock_exchange_id}>
                                            {exchange.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center justify-end p-5 space-x-4 border-t border-gray-200 rounded-b-xl bg-gray-50">
                            <button
                                className="px-6 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
                                onClick={() => setIsOpen(false)}
                            >
                                Annuleren
                            </button>
                            <button
                                className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                onClick={handleSubmit}
                            >
                                Toevoegen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AddStockForm;

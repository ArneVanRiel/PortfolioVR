import React, { useState, useEffect } from 'react';
import http from '../../http-common';
import toast from 'react-hot-toast';

function AddStockForm({ fetchStocks }) {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState('yahoo'); // 'yahoo' | 'manual'
    const [name, setName] = useState('');
    const [ticker, setTicker] = useState('');
    const [stockExchanges, setStockExchanges] = useState([]);
    const [selectedExchange, setSelectedExchange] = useState('');
    const [assetTypes, setAssetTypes] = useState([]);
    const [selectedAssetType, setSelectedAssetType] = useState('');
    const [isin, setIsin] = useState('');

    // Yahoo Finance zoekvelden binnen de modal
    const [yahooQuery, setYahooQuery] = useState('');
    const [yahooResults, setYahooResults] = useState([]);
    const [searchingYahoo, setSearchingYahoo] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const fetchData = async () => {
                try {
                    const [exchangesRes, assetTypesRes] = await Promise.all([
                        http.get('/watchlist/stock-exchanges'),
                        http.get('/watchlist/asset-types')
                    ]);
                    setStockExchanges(exchangesRes.data || []);
                    setAssetTypes(assetTypesRes.data || []);

                    const stockType = (assetTypesRes.data || []).find(t => t.type_name === 'STOCK');
                    if (stockType && !selectedAssetType) setSelectedAssetType(stockType.asset_type_id);
                    if ((exchangesRes.data || []).length > 0 && !selectedExchange) {
                        setSelectedExchange(exchangesRes.data[0].stock_exchange_id);
                    }
                } catch (error) {
                    console.error('Fout bij het ophalen van data:', error);
                }
            };
            fetchData();
        }
    }, [isOpen]);

    // Live zoeken op Yahoo Finance in de modal
    useEffect(() => {
        const q = yahooQuery.trim();
        if (!isOpen || q.length < 2) {
            setYahooResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setSearchingYahoo(true);
            try {
                const res = await http.get(`/stocks/search-global?q=${encodeURIComponent(q)}`);
                setYahooResults(res.data || []);
            } catch (err) {
                setYahooResults([]);
            } finally {
                setSearchingYahoo(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [yahooQuery, isOpen]);

    const matchExchangeId = (rawEx = '', tick = '', qType = '') => {
        if (!stockExchanges || stockExchanges.length === 0) return '';
        const exUpper = String(rawEx || '').toUpperCase();
        const tUpper = String(tick || '').toUpperCase();
        const qUpper = String(qType || '').toUpperCase();

        const findByPat = (pats) => {
            for (const p of pats) {
                const f = stockExchanges.find(e => String(e.name || '').toUpperCase().includes(p));
                if (f) return f.stock_exchange_id;
            }
            return null;
        };

        if (qUpper === 'CRYPTOCURRENCY' || exUpper.includes('CCC') || exUpper.includes('CRYPTO') || tUpper.endsWith('-EUR') || tUpper.endsWith('-USD')) {
            return findByPat(['CRYPTO', 'COINBASE']) || stockExchanges[0].stock_exchange_id;
        }
        if (tUpper.endsWith('.AS') || exUpper.includes('AMS') || exUpper.includes('AMSTERDAM')) {
            return findByPat(['EURONEXTAMS', 'AMS', 'AMSTERDAM']) || stockExchanges[0].stock_exchange_id;
        }
        if (tUpper.endsWith('.BR') || exUpper.includes('BRU') || exUpper.includes('BRUSSEL')) {
            return findByPat(['EURONEXTBRU', 'BRU', 'BRUSSEL']) || stockExchanges[0].stock_exchange_id;
        }
        if (tUpper.endsWith('.DE') || exUpper.includes('XETRA') || exUpper.includes('GER') || exUpper.includes('FRA')) {
            return findByPat(['XETRA', 'GER', 'FRANKFURT']) || stockExchanges[0].stock_exchange_id;
        }
        if (tUpper.endsWith('.TI') || exUpper.includes('TRADEGATE')) {
            return findByPat(['TRADEGATE']) || stockExchanges[0].stock_exchange_id;
        }
        if (exUpper.includes('NYQ') || exUpper.includes('NYSE') || exUpper.includes('PCX') || exUpper.includes('ARCA')) {
            return findByPat(['NYSE']) || stockExchanges[0].stock_exchange_id;
        }
        if (exUpper.includes('NMS') || exUpper.includes('NGM') || exUpper.includes('NAS') || exUpper.includes('NASDAQ')) {
            return findByPat(['NASDAQ']) || stockExchanges[0].stock_exchange_id;
        }
        return findByPat([exUpper]) || stockExchanges[0].stock_exchange_id;
    };

    const handlePickYahooResult = (item) => {
        setTicker(item.ticker || '');
        setName(item.name || item.ticker || '');
        if (item.asset_type_id) {
            setSelectedAssetType(item.asset_type_id);
        }
        const rawQ = yahooQuery.trim();
        if (item.isin) {
            setIsin(item.isin);
        } else if (/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(rawQ)) {
            setIsin(rawQ.toUpperCase());
        }
        // Koppel direct automatisch de juiste Beurs uit jouw StockExchange lijst!
        const matchedExId = matchExchangeId(item.exchangeCode || item.exchange || '', item.ticker || '', item.quoteType || '');
        if (matchedExId) {
            setSelectedExchange(matchedExId);
        }
        toast.success(`${item.ticker} + beurs automatisch ingevuld vanuit Yahoo Finance!`);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!name.trim() || !ticker.trim() || !selectedAssetType) {
            toast.error('Naam, ticker en asset type zijn verplicht!');
            return;
        }

        setSubmitting(true);
        try {
            await http.post('/stocks', {
                name: name.trim(),
                ticker_symbol: ticker.trim().toUpperCase(),
                stock_exchange_id: selectedExchange || 1,
                asset_type_id: Number(selectedAssetType) || 1,
                isin: isin.trim() ? isin.trim().toUpperCase() : null
            });
            toast.success(`${ticker.trim().toUpperCase()} (${name.trim()}) toegevoegd aan database + koershistorie wordt opgehaald!`);
            window.dispatchEvent(new Event('stocksDatabaseUpdated'));
            if (fetchStocks) fetchStocks();
            setName('');
            setTicker('');
            setIsin('');
            setYahooQuery('');
            setYahooResults([]);
            setIsOpen(false);
        } catch (error) {
            if (error.response && error.response.status === 409) {
                toast.error('Aandeel met deze ticker bestaat al in de database.');
            } else {
                console.error('Fout bij het toevoegen van aandeel:', error);
                toast.error('Er is een fout opgetreden bij het toevoegen.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs sm:text-sm py-2 px-4 rounded-xl shadow-xs transition-all flex items-center gap-1.5"
            >
                <i className="ph-bold ph-plus-circle text-base"></i>
                <span>Nieuw Aandeel Toevoegen</span>
            </button>

            {isOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="relative bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-start justify-between p-5 border-b border-gray-100">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">Nieuw Instrument Toevoegen aan Database</h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Zoek snel via Yahoo Finance (automatisch invullen + 10 jaar koersen) of voer in noodgevallen alles handmatig in.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
                                onClick={() => setIsOpen(false)}
                            >
                                <i className="ph-bold ph-x text-lg"></i>
                            </button>
                        </div>

                        {/* Mode Switcher: Via Yahoo Finance Tool vs. Handmatig (Noodgeval) */}
                        <div className="px-5 pt-4">
                            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl text-xs font-extrabold">
                                <button
                                    type="button"
                                    onClick={() => setMode('yahoo')}
                                    className={`py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                        mode === 'yahoo'
                                            ? 'bg-white text-blue-600 shadow-2xs'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    <i className="ph-bold ph-globe"></i>
                                    <span>1. Zoeken via Yahoo Tool</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode('manual')}
                                    className={`py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                        mode === 'manual'
                                            ? 'bg-white text-indigo-600 shadow-2xs'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    <i className="ph-bold ph-pencil-simple"></i>
                                    <span>2. Handmatig Invoeren</span>
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs sm:text-sm">
                            {/* Yahoo Zoekbalk (zichtbaar als mode === 'yahoo') */}
                            {mode === 'yahoo' && (
                                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2.5">
                                    <label className="block text-xs font-extrabold text-blue-950">
                                        🌐 Zoek op Yahoo Finance (op Bedrijfsnaam, Ticker of ISIN-code):
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={yahooQuery}
                                            onChange={(e) => setYahooQuery(e.target.value)}
                                            placeholder="Typ bijv. Lotus Bakeries, IWDA, IE00B4L5Y983 of ASML..."
                                            className="w-full px-3 py-2 bg-white border border-blue-300 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                        {searchingYahoo && (
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-blue-600 animate-pulse">
                                                Zoeken...
                                            </span>
                                        )}
                                    </div>

                                    {yahooResults.length > 0 && (
                                        <div className="bg-white border border-blue-200 rounded-xl max-h-44 overflow-y-auto divide-y divide-gray-100 shadow-sm">
                                            {yahooResults.map(item => (
                                                <div
                                                    key={item.ticker}
                                                    onClick={() => handlePickYahooResult(item)}
                                                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between gap-2 transition-colors"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-black text-gray-900 text-xs">{item.ticker}</span>
                                                            <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded">
                                                                {item.asset_type_name} • {item.exchange}
                                                            </span>
                                                            {item.isin && (
                                                                <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded">
                                                                    ISIN: {item.isin}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-gray-600 truncate">{item.name}</div>
                                                    </div>
                                                    <span className="px-2.5 py-1 bg-blue-600 text-white font-extrabold rounded-lg text-[10px] shrink-0">
                                                        Selecteer
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Formuliervelden (worden automatisch ingevuld door Yahoo of handmatig getypt) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                        Ticker Symbool *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={ticker}
                                        onChange={(e) => setTicker(e.target.value.toUpperCase())}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-xs sm:text-sm"
                                        placeholder="Bijv. AAPL of IWDA.AS"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                        Asset Type (Categorie) *
                                    </label>
                                    <select
                                        value={selectedAssetType}
                                        onChange={(e) => setSelectedAssetType(e.target.value)}
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-xl font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none text-xs sm:text-sm"
                                    >
                                        <option value="">Selecteer type...</option>
                                        {assetTypes.map(type => (
                                            <option key={type.asset_type_id} value={type.asset_type_id}>
                                                {type.type_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                        Volledige Naam *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-xs sm:text-sm"
                                        placeholder="Bijv. Apple Inc. of iShares Core MSCI World"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                        ISIN Code <span className="text-gray-400 font-normal lowercase">(handig voor DeGiro CSV)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={isin}
                                        onChange={(e) => setIsin(e.target.value.toUpperCase())}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none text-xs sm:text-sm"
                                        placeholder="Bijv. US0378331005"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                        Beurs
                                    </label>
                                    <select
                                        value={selectedExchange}
                                        onChange={(e) => setSelectedExchange(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none text-xs sm:text-sm"
                                    >
                                        {stockExchanges.map(exchange => (
                                            <option key={exchange.stock_exchange_id} value={exchange.stock_exchange_id}>
                                                {exchange.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors"
                                    onClick={() => setIsOpen(false)}
                                >
                                    Annuleren
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-xs shadow-sm transition-colors disabled:opacity-50"
                                >
                                    {submitting ? 'Opslaan...' : 'Opslaan in Database'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AddStockForm;

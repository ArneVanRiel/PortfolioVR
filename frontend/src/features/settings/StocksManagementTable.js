import React, { useState, useEffect, useMemo } from 'react';
import http from '../../http-common';
import toast from 'react-hot-toast';

function StocksManagementTable() {
    const [stocks, setStocks] = useState([]);
    const [exchanges, setExchanges] = useState([]);
    const [assetTypes, setAssetTypes] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterOwnership, setFilterOwnership] = useState('ALL'); // 'ALL' | 'OWNED' | 'UNOWNED'
    const [filterType, setFilterType] = useState('ALL');

    const [editStockId, setEditStockId] = useState(null);
    const [editData, setEditData] = useState({
        name: '',
        ticker: '',
        isin: '',
        stock_exchange_id: 1,
        asset_type_id: 1
    });
    const [deleteStockId, setDeleteStockId] = useState(null);

    const fetchStocksAndMeta = async () => {
        try {
            const [stocksRes, exRes, typesRes] = await Promise.all([
                http.get('/stocks'),
                http.get('/stockexchange').catch(() => ({ data: [] })),
                http.get('/watchlist/asset-types').catch(() => ({ data: [] }))
            ]);
            setStocks(stocksRes.data || []);
            setExchanges(exRes.data || []);
            setAssetTypes(typesRes.data || []);
        } catch (error) {
            console.error('Fout bij het ophalen van aandelen:', error);
        }
    };

    useEffect(() => {
        fetchStocksAndMeta();
        const onUpdated = () => fetchStocksAndMeta();
        window.addEventListener('stocksDatabaseUpdated', onUpdated);
        return () => window.removeEventListener('stocksDatabaseUpdated', onUpdated);
    }, []);

    const handleEdit = (stock) => {
        setEditStockId(stock.stock_id);
        setEditData({
            name: stock.name || '',
            ticker: stock.ticker || '',
            isin: stock.isin || '',
            stock_exchange_id: stock.stock_exchange_id || (exchanges[0]?.stock_exchange_id ?? 1),
            asset_type_id: stock.asset_type_id || 1
        });
    };

    const handleSave = async (id) => {
        try {
            await http.put(`/stocks/${id}`, editData);
            toast.success('Aandeel en beurskoppeling bijgewerkt!');
            setEditStockId(null);
            fetchStocksAndMeta();
        } catch (error) {
            console.error('Fout bij het bijwerken van aandeel:', error);
            toast.error('Kon aandeel niet updaten.');
        }
    };

    const handleDelete = async (id) => {
        try {
            await http.delete(`/stocks/${id}`);
            toast.success('Aandeel verwijderd uit de database.');
            setDeleteStockId(null);
            fetchStocksAndMeta();
        } catch (error) {
            console.error('Fout bij het verwijderen van aandeel:', error);
            if (error.response && error.response.status === 409) {
                toast.error(error.response.data.message);
            } else {
                toast.error('Kon aandeel niet verwijderen.');
            }
        }
    };

    const filteredStocks = useMemo(() => {
        return stocks.filter(s => {
            if (filterOwnership === 'OWNED' && Number(s.holder_count || 0) === 0) return false;
            if (filterOwnership === 'UNOWNED' && Number(s.holder_count || 0) > 0) return false;
            if (filterType !== 'ALL' && String(s.asset_type_name || '').toUpperCase() !== filterType) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchTicker = (s.ticker || '').toLowerCase().includes(q);
                const matchName = (s.name || '').toLowerCase().includes(q);
                const matchIsin = (s.isin || '').toLowerCase().includes(q);
                const matchEx = (s.exchange_name || '').toLowerCase().includes(q);
                const matchHolders = (s.holder_names || '').toLowerCase().includes(q);
                if (!matchTicker && !matchName && !matchIsin && !matchEx && !matchHolders) return false;
            }
            return true;
        });
    }, [stocks, filterOwnership, filterType, searchQuery]);

    const ownedCount = useMemo(() => stocks.filter(s => Number(s.holder_count || 0) > 0).length, [stocks]);

    return (
        <div className="flex flex-col space-y-4">
            {/* Filter & Zoekbalk */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                    <button
                        type="button"
                        onClick={() => setFilterOwnership('ALL')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                            filterOwnership === 'ALL'
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                        }`}
                    >
                        Alle ({stocks.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterOwnership('OWNED')}
                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                            filterOwnership === 'OWNED'
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                        }`}
                    >
                        <i className="ph-fill ph-users"></i>
                        <span>In Bezit bij Gebruikers ({ownedCount})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterOwnership('UNOWNED')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                            filterOwnership === 'UNOWNED'
                                ? 'bg-slate-700 text-white shadow-2xs'
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                        }`}
                    >
                        Enkel Watchlist / Niet in bezit ({stocks.length - ownedCount})
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 outline-none"
                    >
                        <option value="ALL">Alle Types</option>
                        <option value="STOCK">💎 Aandelen (STOCK)</option>
                        <option value="ETF">📈 ETF&apos;s (ETF)</option>
                        <option value="CRYPTO">🪙 Crypto (CRYPTO)</option>
                    </select>

                    <div className="relative min-w-[220px]">
                        <i className="ph-bold ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Zoek op ticker, naam, ISIN, beurs of gebruiker..."
                            className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
            </div>

            {deleteStockId && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <p className="text-xs font-bold text-red-900">
                        Weet je zeker dat je dit instrument definitief uit de database wilt verwijderen? (Kan alleen als geen enkele gebruiker er transacties voor heeft).
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => setDeleteStockId(null)}
                            className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-100"
                        >
                            Annuleren
                        </button>
                        <button
                            onClick={() => handleDelete(deleteStockId)}
                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-extrabold hover:bg-red-700"
                        >
                            Ja, Verwijderen
                        </button>
                    </div>
                </div>
            )}

            {/* Tabel */}
            <div className="overflow-x-auto max-h-[540px] overflow-y-auto border border-gray-200 rounded-xl">
                <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-3 text-left text-[11px] font-black text-gray-500 uppercase tracking-wider">Ticker</th>
                            <th className="px-4 py-3 text-left text-[11px] font-black text-gray-500 uppercase tracking-wider">Naam</th>
                            <th className="px-3 py-3 text-left text-[11px] font-black text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="px-3 py-3 text-left text-[11px] font-black text-gray-500 uppercase tracking-wider">Beurs</th>
                            <th className="px-3 py-3 text-left text-[11px] font-black text-gray-500 uppercase tracking-wider">ISIN Code</th>
                            <th className="px-3 py-3 text-left text-[11px] font-black text-gray-500 uppercase tracking-wider">In Bezit (Gebruikers)</th>
                            <th className="px-4 py-3 text-right text-[11px] font-black text-gray-500 uppercase tracking-wider">Acties</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                        {filteredStocks.map(stock => {
                            const isEditing = editStockId === stock.stock_id;
                            const holders = Number(stock.holder_count || 0);
                            const typeUpper = String(stock.asset_type_name || 'STOCK').toUpperCase();

                            return (
                                <tr key={stock.stock_id} className="hover:bg-slate-50/80 transition-colors">
                                    {/* Ticker */}
                                    <td className="px-4 py-2.5 font-black text-gray-900 whitespace-nowrap">
                                        {isEditing ? (
                                            <input
                                                value={editData.ticker}
                                                onChange={e => setEditData({ ...editData, ticker: e.target.value.toUpperCase() })}
                                                className="border border-blue-400 rounded-lg px-2 py-1 w-24 text-xs font-bold"
                                            />
                                        ) : (
                                            <div className="flex items-center gap-1.5">
                                                <span>{stock.ticker}</span>
                                                {(stock.inWatchlist || stock.inIdealePortfolio) ? (
                                                    <span
                                                        className="w-2 h-2 rounded-full bg-blue-500"
                                                        title="Staat op jouw persoonlijke Watchlist / Ideale Portfolio"
                                                    ></span>
                                                ) : null}
                                            </div>
                                        )}
                                    </td>

                                    {/* Naam */}
                                    <td className="px-4 py-2.5 text-gray-700 font-medium">
                                        {isEditing ? (
                                            <input
                                                value={editData.name}
                                                onChange={e => setEditData({ ...editData, name: e.target.value })}
                                                className="border border-blue-400 rounded-lg px-2 py-1 w-full text-xs"
                                            />
                                        ) : (
                                            stock.name
                                        )}
                                    </td>

                                    {/* Type */}
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                        {isEditing ? (
                                            <select
                                                value={editData.asset_type_id}
                                                onChange={e => setEditData({ ...editData, asset_type_id: Number(e.target.value) })}
                                                className="border border-blue-400 rounded-lg px-2 py-1 text-xs font-bold"
                                            >
                                                {assetTypes.map(t => (
                                                    <option key={t.asset_type_id} value={t.asset_type_id}>{t.type_name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                                                typeUpper === 'ETF'
                                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                    : typeUpper === 'CRYPTO'
                                                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                        : 'bg-blue-50 text-blue-800 border-blue-200'
                                            }`}>
                                                {typeUpper}
                                            </span>
                                        )}
                                    </td>

                                    {/* Beurs */}
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                        {isEditing ? (
                                            <select
                                                value={editData.stock_exchange_id}
                                                onChange={e => setEditData({ ...editData, stock_exchange_id: Number(e.target.value) })}
                                                className="border border-blue-400 rounded-lg px-2 py-1 text-xs font-bold"
                                            >
                                                {exchanges.map(ex => (
                                                    <option key={ex.stock_exchange_id} value={ex.stock_exchange_id}>{ex.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-[11px] font-bold">
                                                {stock.exchange_name || 'NASDAQ'}
                                            </span>
                                        )}
                                    </td>

                                    {/* ISIN */}
                                    <td className="px-3 py-2.5 text-gray-600 font-mono text-xs whitespace-nowrap">
                                        {isEditing ? (
                                            <input
                                                value={editData.isin}
                                                onChange={e => setEditData({ ...editData, isin: e.target.value.toUpperCase() })}
                                                placeholder="ISIN invullen"
                                                className="border border-blue-400 rounded-lg px-2 py-1 w-32 text-xs font-mono"
                                            />
                                        ) : (
                                            stock.isin || <span className="text-gray-400 italic font-sans">Geen ISIN</span>
                                        )}
                                    </td>

                                    {/* In Bezit (Gebruikers) */}
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                        {holders > 0 ? (
                                            <div className="flex flex-col">
                                                <span
                                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300 w-fit"
                                                    title={`In bezit bij: ${stock.holder_names}`}
                                                >
                                                    <i className="ph-fill ph-users text-emerald-700"></i>
                                                    <span>{holders} {holders === 1 ? 'gebruiker' : 'gebruikers'}</span>
                                                </span>
                                                {stock.holder_names && (
                                                    <span className="text-[10px] text-gray-500 font-semibold mt-0.5 truncate max-w-[160px]" title={stock.holder_names}>
                                                        {stock.holder_names}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-[11px] text-gray-400 font-medium">
                                                0 gebruikers {stock.total_tx_count > 0 ? `(${stock.total_tx_count} hist. tx)` : ''}
                                            </span>
                                        )}
                                    </td>

                                    {/* Acties */}
                                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                        {isEditing ? (
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleSave(stock.stock_id)}
                                                    className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg font-extrabold text-xs hover:bg-emerald-700"
                                                >
                                                    Opslaan
                                                </button>
                                                <button
                                                    onClick={() => setEditStockId(null)}
                                                    className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg font-bold text-xs hover:bg-gray-200"
                                                >
                                                    Annuleren
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleEdit(stock)}
                                                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors"
                                                >
                                                    Bewerk
                                                </button>
                                                <button
                                                    onClick={() => setDeleteStockId(stock.stock_id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Verwijderen"
                                                >
                                                    <i className="ph-bold ph-trash text-sm"></i>
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredStocks.length === 0 && (
                            <tr>
                                <td colSpan="7" className="px-4 py-8 text-center text-gray-400 font-semibold text-xs">
                                    Geen instrumenten gevonden voor deze filter.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default StocksManagementTable;

import React, { useState, useEffect } from 'react';
import http from '../../http-common';
import toast from 'react-hot-toast';

function StockExchangeTable() {
    const [exchanges, setExchanges] = useState([]);
    const [editExchangeId, setEditExchangeId] = useState(null);
    const [editedName, setEditedName] = useState('');
    const [deleteExchangeId, setDeleteExchangeId] = useState(null);
    const [newExchangeName, setNewExchangeName] = useState('');

    const fetchStockExchanges = async () => {
        try {
            const response = await http.get('/stockexchange');
            setExchanges(response.data || []);
        } catch (error) {
            console.error('Fout bij het ophalen van beurzen:', error);
        }
    };

    const handleEdit = (id, name) => {
        setEditExchangeId(id);
        setEditedName(name);
    };

    const handleSave = async (id) => {
        try {
            await http.put(`/stockexchange/${id}`, { name: editedName });
            toast.success('Beursnaam bijgewerkt!');
            setEditExchangeId(null);
            fetchStockExchanges();
        } catch (error) {
            console.error('Fout bij het bijwerken van beurs:', error);
            toast.error('Kon beurs niet bijwerken.');
        }
    };

    const handleDelete = async (id) => {
        try {
            await http.delete(`/stockexchange/${id}`);
            toast.success('Beurs verwijderd.');
            setDeleteExchangeId(null);
            fetchStockExchanges();
        } catch (error) {
            console.error('Fout bij het verwijderen van beurs:', error);
            toast.error('Kan beurs niet verwijderen omdat er nog aandelen aan gekoppeld zijn.');
        }
    };

    const handleAddExchange = async () => {
        if (!newExchangeName.trim()) return;
        try {
            await http.post('/stockexchange', { name: newExchangeName.trim() });
            toast.success(`Beurs "${newExchangeName.trim()}" toegevoegd!`);
            setNewExchangeName('');
            fetchStockExchanges();
        } catch (error) {
            console.error('Fout bij het toevoegen van beurs:', error);
            toast.error('Kon beurs niet toevoegen.');
        }
    };

    useEffect(() => {
        fetchStockExchanges();
    }, []);

    return (
        <div className="flex flex-col h-full">
            <div className="mb-3">
                <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                    <i className="ph-fill ph-Buildings text-indigo-600"></i>
                    <span>Beurzen (Stock Exchanges)</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                    Elk aandeel in de database is gekoppeld aan een beurs. Nieuwe aandelen via Yahoo Finance worden automatisch aan de juiste beurs gekoppeld (bijv. <code>.AS</code> → EURONEXTAMS, <code>.BR</code> → EURONEXTBRU, <code>.DE</code> → Xetra, US → NASDAQ/NYSE).
                </p>
            </div>

            <div className="flex space-x-2 mb-4">
                <input
                    type="text"
                    value={newExchangeName}
                    onChange={e => setNewExchangeName(e.target.value)}
                    placeholder="Nieuwe beurs toevoegen (bijv. EURONEXTPAR)..."
                    className="flex-grow border border-gray-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                    onClick={handleAddExchange}
                    className="bg-blue-600 text-white px-4 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold hover:bg-blue-700 transition-colors"
                >
                    Toevoegen
                </button>
            </div>

            <div className="overflow-y-auto max-h-72 border border-gray-200 rounded-xl">
                <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                        <tr>
                            <th className="px-4 py-2.5 text-left text-[11px] font-black text-gray-500 uppercase tracking-wider">Beurs Naam</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-black text-gray-500 uppercase tracking-wider">Gekoppelde Aandelen</th>
                            <th className="px-4 py-2.5 text-right text-[11px] font-black text-gray-500 uppercase tracking-wider">Acties</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                        {exchanges.map(exchange => (
                            <tr key={exchange.stock_exchange_id} className="hover:bg-slate-50/80">
                                <td className="px-4 py-2.5 font-bold text-gray-900">
                                    {editExchangeId === exchange.stock_exchange_id ? (
                                        <input
                                            value={editedName}
                                            onChange={(e) => setEditedName(e.target.value)}
                                            autoFocus
                                            className="border border-blue-400 rounded-lg px-2 py-1 w-full text-xs font-bold outline-none"
                                        />
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span>{exchange.name}</span>
                                            <span className="text-[10px] font-mono text-gray-400">#{exchange.stock_exchange_id}</span>
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-2.5">
                                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                        {exchange.stock_count || 0} instrumenten
                                    </span>
                                </td>
                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                    {editExchangeId === exchange.stock_exchange_id ? (
                                        <div className="flex justify-end space-x-2">
                                            <button onClick={() => handleSave(exchange.stock_exchange_id)} className="text-emerald-600 hover:text-emerald-800 font-extrabold text-xs">Opslaan</button>
                                            <button onClick={() => setEditExchangeId(null)} className="text-gray-500 hover:text-gray-700 font-bold text-xs">Annuleren</button>
                                        </div>
                                    ) : (
                                        <div className="flex justify-end items-center gap-2">
                                            <button
                                                onClick={() => handleEdit(exchange.stock_exchange_id, exchange.name)}
                                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold"
                                            >
                                                Bewerk
                                            </button>
                                            <button
                                                onClick={() => setDeleteExchangeId(exchange.stock_exchange_id)}
                                                className="p-1 text-gray-400 hover:text-red-600 rounded-lg"
                                                title="Verwijderen"
                                            >
                                                <i className="ph-bold ph-trash text-sm"></i>
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {deleteExchangeId && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex justify-between items-center text-xs">
                    <p className="font-bold text-red-800">Beurs verwijderen?</p>
                    <div className="space-x-2">
                        <button onClick={() => setDeleteExchangeId(null)} className="px-3 py-1 bg-white border border-gray-300 rounded-lg font-bold text-gray-700">Nee</button>
                        <button onClick={() => handleDelete(deleteExchangeId)} className="px-3 py-1 bg-red-600 text-white rounded-lg font-extrabold">Ja, verwijderen</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default StockExchangeTable;

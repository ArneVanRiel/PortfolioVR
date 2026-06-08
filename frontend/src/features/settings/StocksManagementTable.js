import React, { useState, useEffect } from 'react';
import http from '../../http-common';

function StocksManagementTable() {
    const [stocks, setStocks] = useState([]);
    const [editStockId, setEditStockId] = useState(null);
    const [editData, setEditData] = useState({ name: '', ticker: '', isin: '' });
    const [deleteStockId, setDeleteStockId] = useState(null);

    const fetchStocks = async () => {
        try {
            // Gebruikt de route die al beschikbaar is in je applicatie
            const response = await http.get('/stocks');
            setStocks(response.data);
        } catch (error) {
            console.error('Fout bij het ophalen van aandelen:', error);
        }
    };

    useEffect(() => {
        fetchStocks();
    }, []);

    const handleEdit = (stock) => {
        setEditStockId(stock.stock_id);
        setEditData({ name: stock.name, ticker: stock.ticker, isin: stock.isin || '' });
    };

    const handleSave = async (id) => {
        try {
            await http.put(`/stocks/${id}`, editData);
            setEditStockId(null);
            fetchStocks();
        } catch (error) {
            console.error('Fout bij het bijwerken van aandeel:', error);
            alert("Kon aandeel niet updaten.");
        }
    };

    const handleDelete = async (id) => {
        try {
            await http.delete(`/stocks/${id}`);
            setDeleteStockId(null);
            fetchStocks();
        } catch (error) {
            console.error('Fout bij het verwijderen van aandeel:', error);
            if (error.response && error.response.status === 409) {
                alert(error.response.data.message);
            } else {
                alert("Kon aandeel niet verwijderen.");
            }
        }
    };

    const confirmDelete = (id) => {
        setDeleteStockId(id);
    };

    const cancelDelete = () => {
        setDeleteStockId(null);
    };

    return (
        <div className="flex flex-col mt-4">
            <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0">
                    <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Ticker</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Naam</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">ISIN Code</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase tracking-wider">Acties</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {stocks.map(stock => (
                        <tr key={stock.stock_id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">
                                {editStockId === stock.stock_id ? (
                                    <input value={editData.ticker} onChange={e => setEditData({...editData, ticker: e.target.value})} className="border rounded px-2 py-1 w-24" />
                                ) : ( stock.ticker )}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                                {editStockId === stock.stock_id ? (
                                    <input value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="border rounded px-2 py-1 w-full" />
                                ) : ( stock.name )}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                                {editStockId === stock.stock_id ? (
                                    <input value={editData.isin} onChange={e => setEditData({...editData, isin: e.target.value})} placeholder="ISIN invullen" className="border rounded px-2 py-1 w-full" />
                                ) : ( stock.isin || <span className="text-gray-400 italic">Geen ISIN</span> )}
                            </td>
                        <td className="px-4 py-3 text-right flex justify-end space-x-3">
                                {editStockId === stock.stock_id ? (
                                    <div className="flex space-x-2">
                                    <button onClick={() => handleSave(stock.stock_id)} className="text-green-600 hover:text-green-800 font-medium text-xs">Opslaan</button>
                                    <button onClick={() => setEditStockId(null)} className="text-gray-500 hover:text-gray-700 font-medium text-xs">Annuleren</button>
                                    </div>
                                ) : (
                                <>
                                    <button onClick={() => handleEdit(stock)} className="text-blue-600 hover:text-blue-800 flex items-center text-xs font-semibold">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        Bewerk
                                    </button>
                                    <button onClick={() => confirmDelete(stock.stock_id)} className="text-red-500 hover:text-red-700 text-xs font-semibold">Verwijderen</button>
                                </>
                                )}
                            </td>
                        </tr>
                    ))}
                    {stocks.length === 0 && <tr><td colSpan="4" className="px-4 py-4 text-center text-gray-500">Geen aandelen gevonden in database.</td></tr>}
                </tbody>
            </table>
        </div>
        
        {deleteStockId && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex justify-between items-center">
                <p className="text-sm text-red-800">Weet je zeker dat je dit aandeel definitief wilt verwijderen?</p>
                <div className="space-x-2 flex-shrink-0">
                    <button onClick={cancelDelete} className="px-3 py-1 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-100">Nee, annuleren</button>
                    <button onClick={() => handleDelete(deleteStockId)} className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700">Ja, verwijderen</button>
                </div>
            </div>
        )}
        </div>
    );
}

export default StocksManagementTable;
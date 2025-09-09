import React, { useState, useEffect } from 'react';
import axios from 'axios';

function StockExchangeTable() {
    const [exchanges, setExchanges] = useState([]);
    const [editExchangeId, setEditExchangeId] = useState(null);
    const [editedName, setEditedName] = useState('');
    const [deleteExchangeId, setDeleteExchangeId] = useState(null);

    const fetchStockExchanges = async () => {
        try {
            const response = await axios.get('/api/stockexchange');
            setExchanges(response.data);
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
            await axios.put(`/api/stockexchange/${id}`, { name: editedName });
            setEditExchangeId(null);
            fetchStockExchanges();
        } catch (error) {
            console.error('Fout bij het bijwerken van beurs:', error);
        }
    };

    const handleDelete = async (id) => {
        try {
            await axios.delete(`/api/stockexchange/${id}`);
            fetchStockExchanges();
        } catch (error) {
            console.error('Fout bij het verwijderen van beurs:', error);
        }
    };

    const confirmDelete = (id) => {
        setDeleteExchangeId(id);
    };

    const cancelDelete = () => {
        setDeleteExchangeId(null);
    };

    useEffect(() => {
        fetchStockExchanges();
    }, []);

    return (
        <div>
            <h2>Stock Exchanges</h2>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {exchanges.map(exchange => (
                        <tr key={exchange.stock_exchange_id}>
                            <td onDoubleClick={() => handleEdit(exchange.stock_exchange_id, exchange.name)}>
                                {editExchangeId === exchange.stock_exchange_id ? (
                                    <input
                                        value={editedName}
                                        onChange={(e) => setEditedName(e.target.value)}
                                        onBlur={() => handleSave(exchange.stock_exchange_id)}
                                        autoFocus
                                    />
                                ) : (
                                    exchange.name
                                )}
                            </td>
                            <td>
                                <button onClick={() => confirmDelete(exchange.stock_exchange_id)}>Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {deleteExchangeId && (
                <div className="confirmation-popup">
                    <p>Weet je zeker dat je deze beurs wilt verwijderen?</p>
                    <button onClick={() => handleDelete(deleteExchangeId)}>Ja</button>
                    <button onClick={cancelDelete}>Nee</button>
                </div>
            )}
        </div>
    );
}

export default StockExchangeTable;

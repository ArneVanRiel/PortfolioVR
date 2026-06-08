import React, { useState, useEffect } from 'react';
import http from '../../http-common';

function BrokersTable() {
    const [brokers, setBrokers] = useState([]);
    const [editBrokerId, setEditBrokerId] = useState(null);
    const [editedName, setEditedName] = useState('');
    const [deleteBrokerId, setDeleteBrokerId] = useState(null);
    const [newBrokerName, setNewBrokerName] = useState('');

    const fetchBrokers = async () => {
        try {
            const response = await http.get('/brokers');
            setBrokers(response.data);
        } catch (error) {
            console.error('Fout bij het ophalen van brokers:', error);
        }
    };

    const handleEdit = (id, name) => {
        setEditBrokerId(id);
        setEditedName(name);
    };

    const handleSave = async (id) => {
        try {
            await http.put(`/brokers/${id}`, { name: editedName });
            setEditBrokerId(null);
            fetchBrokers();
        } catch (error) {
            console.error('Fout bij het bijwerken van broker:', error);
        }
    };

    const handleDelete = async (id) => {
        try {
            await http.delete(`/brokers/${id}`);
            fetchBrokers();
        } catch (error) {
            console.error('Fout bij het verwijderen van broker:', error);
        }
    };

    const handleAddBroker = async () => {
        if (!newBrokerName.trim()) return;
        try {
            await http.post('/brokers', { name: newBrokerName });
            setNewBrokerName('');
            fetchBrokers();
        } catch (error) {
            console.error('Fout bij het toevoegen van broker:', error);
        }
    };

    const confirmDelete = (id) => {
        setDeleteBrokerId(id);
    };

    const cancelDelete = () => {
        setDeleteBrokerId(null);
    };

    useEffect(() => {
        fetchBrokers();
    }, []);

    return (
        <div className="flex flex-col h-full">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Brokers Beheren</h3>
            
            <div className="flex space-x-2 mb-4">
                <input 
                    type="text" 
                    value={newBrokerName} 
                    onChange={e => setNewBrokerName(e.target.value)} 
                    placeholder="Nieuwe broker naam..." 
                    className="flex-grow border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring focus:border-blue-300"
                />
                <button onClick={handleAddBroker} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">Toevoegen</button>
            </div>

            <div className="overflow-y-auto max-h-60 border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0">
                    <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Naam</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase tracking-wider">Acties</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                    {brokers.map(broker => (
                        <tr key={broker.broker_id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-800">
                                {editBrokerId === broker.broker_id ? (
                                    <input
                                        value={editedName}
                                        onChange={(e) => setEditedName(e.target.value)}
                                        autoFocus
                                        className="border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:ring focus:border-blue-300"
                                    />
                                ) : (
                                    broker.name
                                )}
                            </td>
                            <td className="px-4 py-3 text-right flex justify-end space-x-3">
                                {editBrokerId === broker.broker_id ? (
                                    <div className="flex space-x-2">
                                        <button onClick={() => handleSave(broker.broker_id)} className="text-green-600 hover:text-green-800 font-medium text-xs">Opslaan</button>
                                        <button onClick={() => setEditBrokerId(null)} className="text-gray-500 hover:text-gray-700 font-medium text-xs">Annuleren</button>
                                    </div>
                                ) : (
                                    <>
                                        <button onClick={() => handleEdit(broker.broker_id, broker.name)} className="text-blue-600 hover:text-blue-800 flex items-center text-xs font-semibold">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                            Bewerk
                                        </button>
                                        <button onClick={() => confirmDelete(broker.broker_id)} className="text-red-500 hover:text-red-700 text-xs font-semibold">Verwijderen</button>
                                    </>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
                </table>
            </div>

            {deleteBrokerId && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex justify-between items-center">
                    <p className="text-sm text-red-800">Zeker weten?</p>
                    <div className="space-x-2">
                        <button onClick={cancelDelete} className="px-3 py-1 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-100">Nee</button>
                        <button onClick={() => handleDelete(deleteBrokerId)} className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700">Ja, verwijderen</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BrokersTable;

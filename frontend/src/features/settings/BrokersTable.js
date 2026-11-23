import React, { useState, useEffect } from 'react';
import http from '../../http-common';
import toast from 'react-hot-toast';

function BrokersTable() {
    const [brokers, setBrokers] = useState([]);
    const [editBrokerId, setEditBrokerId] = useState(null);
    const [editedName, setEditedName] = useState('');
    const [deleteBrokerId, setDeleteBrokerId] = useState(null);
    const [newBrokerName, setNewBrokerName] = useState('');

    const fetchBrokers = async () => {
        try {
            const response = await http.get('/brokers');
            setBrokers(response.data || []);
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
            toast.success('Broker bijgewerkt!');
            setEditBrokerId(null);
            fetchBrokers();
        } catch (error) {
            console.error('Fout bij het bijwerken van broker:', error);
            toast.error('Kon broker niet bijwerken.');
        }
    };

    const handleDelete = async (id) => {
        try {
            await http.delete(`/brokers/${id}`);
            toast.success('Broker verwijderd.');
            setDeleteBrokerId(null);
            fetchBrokers();
        } catch (error) {
            console.error('Fout bij het verwijderen van broker:', error);
            toast.error('Kan broker niet verwijderen omdat er nog transacties aan gekoppeld zijn.');
        }
    };

    const handleAddBroker = async () => {
        if (!newBrokerName.trim()) return;
        try {
            await http.post('/brokers', { name: newBrokerName.trim() });
            toast.success(`Broker "${newBrokerName.trim()}" toegevoegd! Deze is nu voor alle gebruikers kiesbaar bij nieuwe transacties.`);
            setNewBrokerName('');
            fetchBrokers();
        } catch (error) {
            console.error('Fout bij het toevoegen van broker:', error);
            toast.error('Kon broker niet toevoegen.');
        }
    };

    useEffect(() => {
        fetchBrokers();
    }, []);

    return (
        <div className="flex flex-col h-full">
            <div className="mb-3">
                <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                    <i className="ph-fill ph-bank text-blue-600"></i>
                    <span>Brokers &amp; Platformen</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                    Wordt gekoppeld aan elke transactie (<code>PF_transactions.broker_id</code>). Als een nieuwe gebruiker bijv. via <strong>Bolero</strong> of <strong>Trade Republic</strong> belegt, voeg je het platform hier toe en kunnen zij het meteen kiezen én erop groeperen in de Portfolio Donut.
                </p>
            </div>

            <div className="flex space-x-2 mb-4">
                <input
                    type="text"
                    value={newBrokerName}
                    onChange={e => setNewBrokerName(e.target.value)}
                    placeholder="Nieuwe broker toevoegen (bijv. Bolero, Trade Republic)..."
                    className="flex-grow border border-gray-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                    onClick={handleAddBroker}
                    className="bg-blue-600 text-white px-4 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold hover:bg-blue-700 transition-colors"
                >
                    Toevoegen
                </button>
            </div>

            <div className="overflow-y-auto max-h-72 border border-gray-200 rounded-xl">
                <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                        <tr>
                            <th className="px-4 py-2.5 text-left text-[11px] font-black text-gray-500 uppercase tracking-wider">Broker Naam</th>
                            <th className="px-4 py-2.5 text-left text-[11px] font-black text-gray-500 uppercase tracking-wider">Gebruik in Transacties</th>
                            <th className="px-4 py-2.5 text-right text-[11px] font-black text-gray-500 uppercase tracking-wider">Acties</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                        {brokers.map(broker => (
                            <tr key={broker.broker_id} className="hover:bg-slate-50/80">
                                <td className="px-4 py-2.5 font-bold text-gray-900">
                                    {editBrokerId === broker.broker_id ? (
                                        <input
                                            value={editedName}
                                            onChange={(e) => setEditedName(e.target.value)}
                                            autoFocus
                                            className="border border-blue-400 rounded-lg px-2 py-1 w-full text-xs font-bold outline-none"
                                        />
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span>{broker.name}</span>
                                            <span className="text-[10px] font-mono text-gray-400">#{broker.broker_id}</span>
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-2.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-50 text-blue-800 border border-blue-200">
                                            {broker.tx_count || 0} transacties
                                        </span>
                                        {Number(broker.user_count || 0) > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                {broker.user_count} {Number(broker.user_count) === 1 ? 'gebruiker' : 'gebruikers'}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                    {editBrokerId === broker.broker_id ? (
                                        <div className="flex justify-end space-x-2">
                                            <button onClick={() => handleSave(broker.broker_id)} className="text-emerald-600 hover:text-emerald-800 font-extrabold text-xs">Opslaan</button>
                                            <button onClick={() => setEditBrokerId(null)} className="text-gray-500 hover:text-gray-700 font-bold text-xs">Annuleren</button>
                                        </div>
                                    ) : (
                                        <div className="flex justify-end items-center gap-2">
                                            <button
                                                onClick={() => handleEdit(broker.broker_id, broker.name)}
                                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold"
                                            >
                                                Bewerk
                                            </button>
                                            <button
                                                onClick={() => setDeleteBrokerId(broker.broker_id)}
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

            {deleteBrokerId && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex justify-between items-center text-xs">
                    <p className="font-bold text-red-800">Broker verwijderen?</p>
                    <div className="space-x-2">
                        <button onClick={() => setDeleteBrokerId(null)} className="px-3 py-1 bg-white border border-gray-300 rounded-lg font-bold text-gray-700">Nee</button>
                        <button onClick={() => handleDelete(deleteBrokerId)} className="px-3 py-1 bg-red-600 text-white rounded-lg font-extrabold">Ja, verwijderen</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BrokersTable;

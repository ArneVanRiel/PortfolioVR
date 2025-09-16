import React, { useState, useEffect } from 'react';
import axios from 'axios';

function BrokersTable() {
    const [brokers, setBrokers] = useState([]);
    const [editBrokerId, setEditBrokerId] = useState(null);
    const [editedName, setEditedName] = useState('');
    const [deleteBrokerId, setDeleteBrokerId] = useState(null);

    const fetchBrokers = async () => {
        try {
            const response = await axios.get('/api/brokers');
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
            await axios.put(`/api/brokers/${id}`, { name: editedName });
            setEditBrokerId(null);
            fetchBrokers();
        } catch (error) {
            console.error('Fout bij het bijwerken van broker:', error);
        }
    };

    const handleDelete = async (id) => {
        try {
            await axios.delete(`/api/brokers/${id}`);
            fetchBrokers();
        } catch (error) {
            console.error('Fout bij het verwijderen van broker:', error);
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
        <div>
            <h2>Brokers</h2>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {brokers.map(broker => (
                        <tr key={broker.broker_id}>
                            <td onDoubleClick={() => handleEdit(broker.broker_id, broker.name)}>
                                {editBrokerId === broker.broker_id ? (
                                    <input
                                        value={editedName}
                                        onChange={(e) => setEditedName(e.target.value)}
                                        onBlur={() => handleSave(broker.broker_id)}
                                        autoFocus
                                    />
                                ) : (
                                    broker.name
                                )}
                            </td>
                            <td>
                                <button onClick={() => confirmDelete(broker.broker_id)}>Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {deleteBrokerId && (
                <div className="confirmation-popup">
                    <p>Weet je zeker dat je deze broker wilt verwijderen?</p>
                    <button onClick={() => handleDelete(deleteBrokerId)}>Ja</button>
                    <button onClick={cancelDelete}>Nee</button>
                </div>
            )}
        </div>
    );
}

export default BrokersTable;

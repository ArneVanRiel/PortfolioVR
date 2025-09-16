// React knop voor het bijwerken van total_quantity
import React from 'react';
import axios from 'axios';

function UpdateTotalQuantityButton({ fetchTransactions }) {
    const handleUpdate = async () => {
        try {
            const response = await axios.post('/api/updateTotalQuantities');
            alert(response.data.message);
            fetchTransactions();  // Herlaad transacties
        } catch (error) {
            console.error('Fout bij het updaten van total quantities:', error);
            alert('Er is een fout opgetreden bij het updaten.');
        }
    };

    return (
        <button onClick={handleUpdate} className="button">
            Update Total Quantities
        </button>
    );
}

export default UpdateTotalQuantityButton;
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function TransactionTable({ transactions, fetchTransactions }) {
    const [deleteTransactionId, setDeleteTransactionId] = useState(null);

    const handleDelete = async (id) => {
        try {
            await axios.delete(`/api/transactions/${id}`);
            fetchTransactions();
        } catch (error) {
            console.error('Fout bij het verwijderen van de transactie:', error);
        }
    };

    const confirmDelete = (id) => {
        setDeleteTransactionId(id);
    };

    const cancelDelete = () => {
        setDeleteTransactionId(null);
    };

    useEffect(() => {
        fetchTransactions(); // Zorg ervoor dat transacties worden opgehaald bij het laden
    }, []);

    return (
        <div>
            <h2>Transactions</h2>
            <table>
                <thead>
                    <tr>
                        <th>User ID</th>
                        <th>Stock Symbol</th>
                        <th>Transaction Type</th>
                        <th>Platform</th>
                        <th>Quantity</th>
                        <th>Currency</th>
                        <th>Transaction Price</th>
                        <th>Total transaction Price</th>
                        <th>Transaction Time</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {transactions.map(transaction => (
                        <tr key={transaction.id}>
                            <td>{transaction.user_id}</td>
                            <td>{transaction.stock_symbol}</td>
                            <td>{transaction.transaction_type}</td>
                            <td>{transaction.platform}</td>
                            <td>{transaction.quantity}</td>
                            <td>{transaction.currency}</td>
                            <td>{transaction.purchase_price}</td>
                            <td>{(transaction.quantity * transaction.purchase_price).toFixed(2)}</td>
                            <td>{new Date(transaction.purchase_time).toLocaleString()}</td>
                            <td>
                                <button onClick={() => confirmDelete(transaction.id)}>Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {deleteTransactionId && (
                <div className="confirmation-popup">
                    <p>Weet je zeker dat je deze transactie wilt verwijderen?</p>
                    <button onClick={() => handleDelete(deleteTransactionId)}>Ja</button>
                    <button onClick={cancelDelete}>Nee</button>
                </div>
            )}
        </div>
    );
}

export default TransactionTable;

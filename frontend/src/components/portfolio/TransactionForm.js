import React, { useState } from 'react';
import axios from 'axios';

function TransactionForm() {
    const [userId, setUserId] = useState(1);
    const [transactionType, setTransactionType] = useState(1); // 1 = BUY, 0 = SELL
    const [aandeelId, setAandeelId] = useState('');  // aandeel_id in plaats van tickerSymbol
    const [brokerId, setBrokerId] = useState(1);  // broker_id in plaats van platform
    const [quantity, setQuantity] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [transactionPrice, setTransactionPrice] = useState('');
    const [transactionTime, setTransactionTime] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        const newTransaction = {
            user_id: userId,
            aandeel_id: aandeelId,  // Gebruik aandeel_id
            broker_id: brokerId,    // Gebruik broker_id
            transaction_type: transactionType, // Transactie type als 1 of 0
            quantity,
            currency,
            purchase_price: transactionPrice,
            purchase_time: transactionTime,
        };

        await axios.post('/api/addTransaction', newTransaction);

        clearForm();
    };

    const clearForm = () => {
        setUserId(1);
        setTransactionType(1);
        setAandeelId('');
        setBrokerId(1);
        setQuantity('');
        setCurrency('USD');
        setTransactionPrice('');
        setTransactionTime('');
    };

    return (
        <form onSubmit={handleSubmit}>
            <div>
                <label>User ID:</label>
                <input type="text" value={userId} onChange={(e) => setUserId(e.target.value)} required />
            </div>
            <div>
                <label>Transaction Type:</label>
                <select value={transactionType} onChange={(e) => setTransactionType(Number(e.target.value))}>
                    <option value={1}>Buy</option>
                    <option value={0}>Sell</option>
                </select>
            </div>
            <div>
                <label>Aandeel:</label>
                <select value={aandeelId} onChange={(e) => setAandeelId(Number(e.target.value))}>
                    <option >kies een optie</option>
                    <option value={2}>AAPL</option>
                    <option value={3}>MSFT</option>
                    <option value={4}>GOOGL</option>
                    <option value={6}>META</option>
                    <option value={8}>NVDA</option>
                    <option value={23}>ADBE</option>
                    <option value={24}>ACN</option>
                    <option value={25}>INTU</option>
                    <option value={26}>PGR</option>
                    <option value={27}>AMAT</option>
                    <option value={28}>COST</option>
                    <option value={29}>SWKS</option>
                    <option value={30}>ON</option>
                    <option value={31}>LULU</option>
                    <option value={32}>RHI</option>
                    <option value={33}>MNST</option>
                    <option value={35}>EMR</option>
                </select>
            </div>
            <div>
                <label>Broker:</label>
                <select value={brokerId} onChange={(e) => setBrokerId(Number(e.target.value))}>
                    <option value={1}>Etoro</option>
                    <option value={2}>Degiro</option>
                    <option value={3}>Saxo</option>
                </select>
            </div>
            <div>
                <label>Quantity:</label>
                <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} step="0.00001" min="0" required />
            </div>
            <div>
                <label>Currency:</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                </select>
            </div>
            <div>
                <label>Transaction Price (prijs/aandeel):</label>
                <input type="number" value={transactionPrice} onChange={(e) => setTransactionPrice(e.target.value)} required />
            </div>
            <div>
                <label>Transaction Time:</label>
                <input type="datetime-local" value={transactionTime} onChange={(e) => setTransactionTime(e.target.value)} required />
            </div>
            <button type="submit">Transaction</button>
        </form>
    );
}

export default TransactionForm;

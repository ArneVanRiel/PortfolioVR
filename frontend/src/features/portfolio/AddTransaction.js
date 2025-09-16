import React, { useState } from 'react';

const AddTransaction = () => {
    const [userId, setUserId] = useState('');
    const [stockSymbol, setStockSymbol] = useState('');
    const [quantity, setQuantity] = useState('');
    const [purchasePrice, setPurchasePrice] = useState('');
    const [purchaseTime, setPurchaseTime] = useState('');
    const [transactionType, setTransactionType] = useState('BUY');
    const [currency, setCurrency] = useState('USD'); // Nieuw toegevoegd
    const [platform, setPlatform] = useState('Etoro'); // Nieuw toegevoegd

    const handleSubmit = async (event) => {
        event.preventDefault();

        const transaction = {
            user_id: userId,
            stock_symbol: stockSymbol,
            quantity: parseFloat(quantity),
            purchase_price: parseFloat(purchasePrice),
            purchase_time: purchaseTime,
            transaction_type: transactionType,
            currency: currency, // Nieuw toegevoegd
            platform: platform // Nieuw toegevoegd
        };

        try {
            const response = await fetch('/api/portfolio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(transaction),
            });

            if (response.ok) {
                const result = await response.json();
                alert('Transaction and portfolio updated successfully!');
                // Reset the form fields if needed
                setUserId('');
                setStockSymbol('');
                setQuantity('');
                setPurchasePrice('');
                setPurchaseTime('');
                setTransactionType('BUY');
                setCurrency('USD'); // Reset to default
                setPlatform('Etoro'); // Reset to empty
            } else {
                alert('Failed to add transaction and update portfolio');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred while adding the transaction');
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <div>
                <label>User ID:</label>
                <input 
                    type="text" 
                    value={userId} 
                    onChange={(e) => setUserId(e.target.value)} 
                    required 
                />
            </div>
            <div>
                <label>Transaction Type:</label>
                <select value={transactionType} onChange={(e) => setTransactionType(e.target.value)}>
                    <option value="BUY">Buy</option>
                    <option value="SELL">Sell</option>
                </select>
            </div>
            <div>
                <label>Stock Symbol:</label>
                <input 
                    type="text" 
                    value={stockSymbol} 
                    onChange={(e) => setStockSymbol(e.target.value)} 
                    required 
                />
            </div>
            <div>
                <label>Platform:</label>
                <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                    <option value="Etoro">Etoro</option>
                    <option value="Degiro">Degiro</option>
                    <option value="Bolero">Bolero</option>
                    <option value="Saxo">Saxo</option>
                </select>
            </div>
            <div>
                <label>Quantity:</label>
                <input 
                    type="number" 
                    value={quantity} 
                    onChange={(e) => setQuantity(e.target.value)} 
                    step="0.00001"
                    min="0"
                    required 
                />
            </div>
            <div>
                <label>Currency:</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                </select>
            </div>
            <div>
                <label>Purchase Price:</label>
                <input 
                    type="number" 
                    value={purchasePrice} 
                    onChange={(e) => setPurchasePrice(e.target.value)} 
                    required 
                />
            </div>
            <div>
                <label>Purchase Time:</label>
                <input 
                    type="datetime-local" 
                    value={purchaseTime} 
                    onChange={(e) => setPurchaseTime(e.target.value)} 
                    required 
                />
            </div>
            <button type="submit">Add Transaction</button>
        </form>
    );
};

export default AddTransaction;

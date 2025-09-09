import React, { useState } from 'react';
import axios from 'axios';

const MonthlyClosingPrices = ({ stocks }) => {
    const [selectedStock, setSelectedStock] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleUpdatePrices = async () => {
        if (!selectedStock) {
            setMessage('Selecteer een aandeel.');
            return;
        }

        setLoading(true);
        setMessage('');

        try {
            const response = await axios.post('/api/updateMonthlyPrices', { aandeel_id: selectedStock });
            setMessage(response.data.message);
        } catch (error) {
            setMessage('Er is een fout opgetreden bij het bijwerken van prijzen.');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h2>Update Maandelijkse Closingprijzen</h2>
            <div>
                <label htmlFor="stock-select">Selecteer een aandeel:</label>
                <select
                    id="stock-select"
                    value={selectedStock || ''}
                    onChange={(e) => setSelectedStock(e.target.value)}
                >
                    <option value="" disabled>
                        -- Kies een aandeel --
                    </option>
                    {stocks.map((stock) => (
                        <option key={stock.aandeel_id} value={stock.aandeel_id}>
                            {stock.ticker_symbol}
                        </option>
                    ))}
                </select>
            </div>
            <button onClick={handleUpdatePrices} disabled={loading}>
                {loading ? 'Bijwerken...' : 'Update Prijzen'}
            </button>
            {message && <p>{message}</p>}
        </div>
    );
};

export default MonthlyClosingPrices;

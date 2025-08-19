import React, { useState, useEffect } from 'react';
import axios from 'axios';

function AddStockForm({ fetchStocks }) {
    const [name, setName] = useState('');
    const [ticker, setTicker] = useState('');
    const [stockExchanges, setStockExchanges] = useState([]);
    const [selectedExchange, setSelectedExchange] = useState('');

    useEffect(() => {
        // Haal stock exchanges op bij het laden van de component
        const fetchStockExchanges = async () => {
            try {
                const response = await axios.get('/api/stockexchange');
                setStockExchanges(response.data);
            } catch (error) {
                console.error('Fout bij het ophalen van stock exchanges:', error);
            }
        };

        fetchStockExchanges();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
    
        if (!name || !ticker) {
            alert('Naam en ticker zijn verplicht!');
            return;
        }
    
        const newStock = {
            name,
            ticker_symbol: ticker,
            stock_exchange_id: selectedExchange || null
        };
    
        try {
            await axios.post('/api/stocks', newStock);
            fetchStocks();  // Refresh de tabel
            setName('');
            setTicker('');
            setSelectedExchange('');
        } catch (error) {
            if (error.response && error.response.status === 409) {
                alert('Aandeel met deze naam of ticker bestaat al.');
            } else {
                console.error('Fout bij het toevoegen van aandeel:', error);
            }
        }
    };
    

    return (
        <div>
            <h3>Voeg nieuw aandeel toe</h3>
            <form onSubmit={handleSubmit}>
                <div>
                    <label>Naam:</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />
                </div>

                <div>
                    <label>Ticker Symbool:</label>
                    <input
                        type="text"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value)}
                        required
                    />
                </div>

                <div>
                    <label>Beurs (optioneel):</label>
                    <select
                        value={selectedExchange}
                        onChange={(e) => setSelectedExchange(e.target.value)}
                    >
                        <option value="">Geen</option>
                        {stockExchanges.map(exchange => (
                            <option key={exchange.stock_exchange_id} value={exchange.stock_exchange_id}>
                                {exchange.name}
                            </option>
                        ))}
                    </select>
                </div>

                <button type="submit">Toevoegen</button>
            </form>
        </div>
    );
}

export default AddStockForm;

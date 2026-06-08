import React, { useState } from 'react';
import axios from 'axios';

const StockPriceComponent = () => {
    const [ticker, setTicker] = useState('');
    const [date, setDate] = useState('');
    const [closePrice, setClosePrice] = useState(null);

    const fetchStockPrice = async () => {
        const apiKey = process.env.REACT_APP_ALPHA_VANTAGE_API_KEY;
        const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${apiKey}`;

        try {
            const response = await axios.get(url);
            const data = response.data['Time Series (Daily)'];
            if (data && data[date]) {
                setClosePrice(data[date]['4. close']);
            } else {
                setClosePrice('Geen data gevonden voor deze datum');
            }
        } catch (error) {
            console.error('Error fetching stock price:', error);
            setClosePrice('Fout bij het ophalen van gegevens');
        }
    };

    return (
        <div>
            <h1>Stock Price Checker</h1>
            <form onSubmit={(e) => {
                e.preventDefault();
                fetchStockPrice();
            }}>
                <div>
                    <label>
                        Ticker:
                        <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value)} />
                    </label>
                </div>
                <div>
                    <label>
                        Datum:
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </label>
                </div>
                <button type="submit">Prijs ophalen</button>
            </form>
            {closePrice && (
                <div>
                    <h2>Slotkoers:</h2>
                    <p>{closePrice}</p>
                </div>
            )}
        </div>
    );
};

export default StockPriceComponent;

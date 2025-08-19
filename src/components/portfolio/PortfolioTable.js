import React, { useState, useEffect } from 'react';
import axios from 'axios';

function PortfolioTable() {
    const [portfolio, setPortfolio] = useState([]);
    const [inputDate, setInputDate] = useState('2025-05-12'); // Je kunt dit aanpassen naar een dynamische datum
    const [totalValue, setTotalValue] = useState(0); // Totale waarde van het portfolio


    const fetchPortfolio = async () => {
        try {
            const response = await axios.get(`/api/portfolio?inputDate=${inputDate}`);
            setPortfolio(response.data);
            // Bereken de totale waarde van het portfolio
            const total = response.data.reduce((acc, item) => acc + item.waarde, 0);
            setTotalValue(total);
        } catch (error) {
            console.error('Fout bij het ophalen van het portfolio:', error);
        }
    };

    useEffect(() => {
        fetchPortfolio(); // Portfolio ophalen bij het laden van het component
    }, [inputDate]); // Herlaad wanneer de datum verandert

    return (
        <div>
            <h2>Portfolio</h2>
            <input 
                type="date" 
                value={inputDate} 
                onChange={(e) => setInputDate(e.target.value)} 
            />
            <h3>Total Portfolio Value: {totalValue.toFixed(2)} USD</h3>
            <table>
                <thead>
                    <tr>
                        <th>Stock Symbol</th>
                        <th>Naam</th>
                        <th>Aandelen</th>
                        <th>Aandelen waarde</th>
                        <th>% Portefeuille</th>
                        <th>Huidige prijs</th>
                    </tr>
                </thead>
                <tbody>
                    {portfolio.map(item => (
                        <tr key={item.transaction_id}>
                            <td>{item.ticker_symbol}</td>
                            <td>{item.stock_name}</td>
                            <td>{item.total_quantity}</td>
                            <td>$ {item.waarde.toFixed(2)}</td>
                            <td>{item.percentage.toFixed(2)}%</td>
                            <td>$ {item.last_closing_price.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default PortfolioTable;

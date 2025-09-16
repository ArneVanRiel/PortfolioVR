import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import 'chart.js/auto'; // Zorgt ervoor dat alle vereiste modules geladen worden

function TransactionChart({ transactions, selectedFilter, selectedSymbolFilter }) {
    const [chartData, setChartData] = useState({});

    useEffect(() => {
        if (Array.isArray(transactions) && transactions.length > 0) { // Controleer of transactions een array is en niet leeg
            const filteredTransactions = transactions.filter(transaction => {
                // Filter op basis van de geselecteerde filter en het aandelen symbool
                const matchesFilter = selectedFilter === 'All' || transaction.period === selectedFilter;
                const matchesSymbol = selectedSymbolFilter ? transaction.stock_symbol.includes(selectedSymbolFilter) : true;
    
                return matchesFilter && matchesSymbol;
            });
            const labels = filteredTransactions.map(transaction => 
                transaction.purchase_time ? new Date(transaction.purchase_time).toLocaleDateString() : ''
            );
            
            const buyData = filteredTransactions
                .filter(transaction => transaction.transaction_type === 'BUY')
                .map(transaction => transaction.quantity * transaction.purchase_price);
    
            const sellData = filteredTransactions
                .filter(transaction => transaction.transaction_type === 'SELL')
                .map(transaction => transaction.quantity * transaction.purchase_price);
    
            setChartData({
                labels: labels,
                datasets: [
                    {
                        label: 'Buy',
                        data: buyData,
                        backgroundColor: 'rgba(0, 255, 0, 0.6)', // Groen voor buy
                    },
                    {
                        label: 'Sell',
                        data: sellData,
                        backgroundColor: 'rgba(255, 0, 0, 0.6)', // Rood voor sell
                    },
                ],
            });
        } else {
            setChartData({ labels: [], datasets: [] }); // Als transactions leeg is, een leeg object instellen
        }
    }, [transactions, selectedFilter, selectedSymbolFilter]);
    

    const options = {
        responsive: true,
        plugins: {
            legend: { position: 'top' },
        },
        scales: {
            x: { title: { display: true, text: 'Tijd' } },
            y: { title: { display: true, text: 'Totale Waarde van de Transactie' } },
        },
    };

    return (
        <div className="chart-container">
            <h3>Transacties Overzicht</h3>
            {transactions && transactions.length > 0 ? (
                <Bar data={chartData} options={options} />
            ) : (
                <p>Geen transacties beschikbaar voor grafiek.</p>
            )}
        </div>
    );
}

export default TransactionChart;

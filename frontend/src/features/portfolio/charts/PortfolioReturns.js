import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

// Registreer de chart-componenten van Chart.js
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

function PortfolioReturns({ portfolioReturns }) {
    /*const [returnsData, setReturnsData] = useState([]);

    // Ophalen van de rendementen van de server
    const fetchReturnsData = async () => {
        try {
            const response = await axios.get('/api/calculateReturns');
            setReturnsData(response.data.calculatedReturns);
        } catch (error) {
            console.error('Fout bij het ophalen van rendementen:', error);
        }
    };

    useEffect(() => {
        fetchReturnsData();
    }, []);

    // Data voorbereiden voor de grafiek
    const chartData = {
        labels: returnsData.map(item => item.date), // De datums op de X-as
        datasets: [
            {
                label: 'Portfolio Rendement',
                data: returnsData.map(item => item.return_value * 100), // Het rendement (omgezet naar percentage)
                fill: false,
                borderColor: 'rgba(75, 192, 192, 1)',
                tension: 0.1
            },
            {
                label: 'Cumulatief Rendement (%)',
                data: returnsData.map(item => (item.return_value_cumulative - 1) * 100), // Cumulatieve rendementen in procent
                fill: false,
                borderColor: 'rgba(192, 75, 75, 1)',
                tension: 0.1
            }
        ]
    };
    const chartOptions = {
        responsive: true,
        plugins: {
            legend: {
                display: true,
                position: 'top'
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        return `${context.raw.toFixed(2)}%`; // Toon percentage met 2 decimalen
                    }
                }
            }
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Datum'
                }
            },
            y: {
                title: {
                    display: true,
                    text: 'Rendement (%)'
                }
            }
        }
    };*/
    const data = {
        labels: portfolioReturns.map((item) => item.date),
        datasets: [
            {
                label: "Cumulatieve Rendementen",
                data: portfolioReturns.map((item) => item.return_value_cumulative),
                borderColor: "green",
                fill: false,
            },
        ],
    };

    return (
        /*<div>
            <h2>Portfolio Rendementen</h2>
            <Line data={chartData} options={chartOptions} />
        </div>*/
        <Line data={data} />
    );
}

export default PortfolioReturns;

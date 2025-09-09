import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    LineElement,
    CategoryScale,
    LinearScale,
    PointElement,
    Tooltip,
    Legend,
} from 'chart.js';

// Chart.js registreren
ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend);

function DailyPortfolioLineChart({ portfolioValues }) {
    /*const [chartData, setChartData] = useState(null);

    const fetchDailyValues = async () => {
        try {
            const response = await axios.get('/api/dailyPortfolioValues'); // Endpoint voor het ophalen van de data
            const data = response.data;

            // Data omzetten voor Chart.js
            const dates = data.map((entry) => entry.date);
            const values = data.map((entry) => entry.total_value);

            setChartData({
                labels: dates,
                datasets: [
                    {
                        label: 'Totale Portfolio Waarde ($)',
                        data: values,
                        borderColor: 'rgba(75, 192, 192, 1)', // Lijnkleur
                        backgroundColor: 'rgba(75, 192, 192, 0.2)', // Schaduw onder de lijn
                        borderWidth: 2,
                        pointRadius: 3, // Grootte van de punten
                    },
                ],
            });
        } catch (error) {
            console.error('Fout bij het ophalen van dagelijkse portfolio waarden:', error);
        }
    };

    useEffect(() => {
        fetchDailyValues();
    }, []);

    if (!chartData) {
        return <p>Bezig met laden...</p>;
    }*/
    const data = {
        labels: portfolioValues.map((item) => item.date),
        datasets: [
            {
                label: "Portfolio Waarde",
                data: portfolioValues.map((item) => item.total_value),
                borderColor: "blue",
                fill: false,
            },
        ],
    };

    return (
        /*<div>
            <h2>Dagelijkse Portfolio Waarde</h2>
            <Line
                data={chartData}
                options={{
                    responsive: true,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) =>
                                    `$ ${context.raw.toLocaleString('nl-BE', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}`,
                            },
                        },
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Datum',
                            },
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Totale Waarde ($)',
                            },
                            ticks: {
                                callback: (value) =>
                                    `$ ${value.toLocaleString('nl-BE', {
                                        minimumFractionDigits: 0,
                                    })}`,
                            },
                        },
                    },
                }}
            />
        </div>*/
        <Line data={data} />
    );
}

export default DailyPortfolioLineChart;

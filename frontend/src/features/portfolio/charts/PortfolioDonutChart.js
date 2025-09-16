import React, { useEffect, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import axios from 'axios';
import 'chart.js/auto'; // Laad Chart.js automatisch

function PortfolioDonutChart() {
    const [portfolio, setPortfolio] = useState([]);
    const [totalValue, setTotalValue] = useState(0);
    const [chartData, setChartData] = useState(null);

    const fetchPortfolio = async () => {
        try {
            const response = await axios.get('/api/portfolio?inputDate=2025-01-12');
            const data = response.data;

            // Bereken de totale waarde
            const total = data.reduce((acc, item) => acc + item.waarde, 0);
            setTotalValue(total);

            // Zet data om voor de grafiek
            const labels = data.map(item => item.ticker_symbol);
            const percentages = data.map(item => item.percentage);

            setChartData({
                labels,
                datasets: [
                    {
                        data: percentages,
                        backgroundColor: [
                            '#FF6384',
                            '#36A2EB',
                            '#FFCE56',
                            '#4BC0C0',
                            '#9966FF',
                            '#FF9F40',
                        ],
                        hoverBackgroundColor: [
                            '#FF6384',
                            '#36A2EB',
                            '#FFCE56',
                            '#4BC0C0',
                            '#9966FF',
                            '#FF9F40',
                        ],
                    },
                ],
            });
        } catch (error) {
            console.error('Fout bij het ophalen van portfolio:', error);
        }
    };

    useEffect(() => {
        fetchPortfolio();
    }, []);

    if (!chartData) {
        return <p>Loading...</p>;
    }

    return (
        <div style={{ width: '50%', margin: 'auto' }}>
            <h2>Portfolio Overview</h2>
            <Doughnut
                data={chartData}
                options={{
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: (tooltipItem) => {
                                    const value = tooltipItem.raw.toFixed(2);
                                    return `${tooltipItem.label}: ${value}%`;
                                },
                            },
                        },
                        legend: {
                            position: 'top',
                        },
                        doughnutLabel: {
                            labels: [
                                {
                                    text: `Total`,
                                    font: {
                                        size: '20px',
                                    },
                                },
                                {
                                    text: `$${totalValue.toFixed(2)}`,
                                    font: {
                                        size: '24px',
                                    },
                                    color: '#36A2EB',
                                },
                            ],
                        },
                    },
                }}
            />
        </div>
    );
}

export default PortfolioDonutChart;

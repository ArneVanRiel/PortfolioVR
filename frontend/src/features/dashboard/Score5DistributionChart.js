import React, { useState, useEffect } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import http from '../../http-common';

ChartJS.register(ArcElement, Tooltip, Legend);

const Score5DistributionChart = () => {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Gebruik de datum van vandaag voor de meest recente status
        const today = new Date().toISOString().split('T')[0];
        const response = await http.get('/calculations/summary-by-date', {
          params: { date: today }
        });
        
        const data = response.data;
        
        // Filter: alleen aandelen met score 5 en een positieve waardeverdeling
        const filteredData = data.filter(item => item.selectiecriteria === 5 && item.waarde_verdeling > 0);
        
        // Sorteer van hoog naar laag voor een logische volgorde in de chart
        filteredData.sort((a, b) => b.waarde_verdeling - a.waarde_verdeling);

        const labels = filteredData.map(item => item.ticker_symbol);
        const values = filteredData.map(item => item.waarde_verdeling);
        
        // Kleurenpalet
        const backgroundColors = [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
          '#E7E9ED', '#76A346', '#FDB45C', '#949FB1', '#4D5360', '#C9CBCF'
        ];

        // Zorg voor voldoende kleuren door te herhalen indien nodig
        const colors = values.map((_, i) => backgroundColors[i % backgroundColors.length]);

        setChartData({
          labels: labels,
          datasets: [
            {
              data: values,
              backgroundColor: colors,
              hoverBackgroundColor: colors,
              borderWidth: 1,
            },
          ],
        });
        setLoading(false);
      } catch (err) {
        console.error("Fout bij ophalen data voor Score 5 chart", err);
        setError("Kon data niet laden");
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          boxWidth: 12,
          font: {
            size: 11
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.label || '';
            if (label) {
              label += ': ';
            }
            const value = context.raw;
            const total = context.chart._metasets[context.datasetIndex].total;
            const percentage = ((value / total) * 100).toFixed(2) + '%';
            return `${label}${value.toFixed(2)} (${percentage})`;
          }
        }
      }
    },
  };

  if (loading) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">Laden...</div>;
  if (error) return <div className="flex items-center justify-center h-full text-red-500 text-sm">{error}</div>;
  if (!chartData || chartData.labels.length === 0) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">Geen aandelen met score 5 gevonden.</div>;

  return <Doughnut data={chartData} options={options} />;
};

export default Score5DistributionChart;
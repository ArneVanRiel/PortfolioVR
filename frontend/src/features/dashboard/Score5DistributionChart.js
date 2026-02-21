// c:\Arne\ArneVR\PortfolioVR\frontend\src\features\dashboard\Score5DistributionChart.js
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
        const today = new Date().toISOString().split('T')[0];
        const response = await http.get('/calculations/summary-by-date', {
          params: { date: today }
        });
        
        const data = response.data;
        
        // Filter: alleen aandelen met score 5 en een positieve waardeverdeling
        const filteredData = data.filter(item => item.selectiecriteria === 5 && item.waarde_verdeling > 0);
        
        // Sorteer van hoog naar laag
        filteredData.sort((a, b) => b.waarde_verdeling - a.waarde_verdeling);

        const labels = filteredData.map(item => item.ticker_symbol);
        const values = filteredData.map(item => item.waarde_verdeling);
        
        // Modern Kleurenpalet (Tailwind-ish kleuren)
        const backgroundColors = [
          '#3B82F6', // Blue 500
          '#10B981', // Emerald 500
          '#F59E0B', // Amber 500
          '#EF4444', // Red 500
          '#8B5CF6', // Violet 500
          '#EC4899', // Pink 500
          '#6366F1', // Indigo 500
          '#14B8A6', // Teal 500
          '#F97316', // Orange 500
          '#06B6D4', // Cyan 500
          '#0EA5E9', // Sky 500
          '#64748B'  // Slate 500
        ];

        const colors = values.map((_, i) => backgroundColors[i % backgroundColors.length]);

        setChartData({
          labels: labels,
          datasets: [
            {
              data: values,
              backgroundColor: colors,
              hoverBackgroundColor: colors,
              borderWidth: 2,
              borderColor: '#ffffff',
              hoverBorderWidth: 0,
              hoverOffset: 10, // Laat segment uitspringen bij hover
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
    cutout: '75%', // Dunnere ring voor moderne look
    animation: {
      animateScale: true,
      animateRotate: true
    },
    plugins: {
      legend: {
        position: 'right',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 15,
          font: {
            size: 12,
            family: "'Inter', sans-serif"
          },
          color: '#4B5563' // Gray-600
        }
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#1F2937',
        bodyColor: '#4B5563',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        padding: 10,
        boxPadding: 4,
        usePointStyle: true,
        callbacks: {
          label: function(context) {
            let label = context.label || '';
            if (label) {
              label += ': ';
            }
            const value = context.raw;
            const total = context.chart._metasets[context.datasetIndex].total;
            const percentage = ((value / total) * 100).toFixed(1) + '%';
            return `${label}${value.toFixed(2)} (${percentage})`;
          }
        }
      }
    },
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
  
  if (error) return (
    <div className="flex items-center justify-center h-full text-red-500 text-sm font-medium">
      {error}
    </div>
  );
  
  if (!chartData || chartData.labels.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
      <svg className="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"></path>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"></path>
      </svg>
      Geen aandelen met score 5 gevonden.
    </div>
  );

  return (
    <div className="relative h-full w-full">
      <Doughnut data={chartData} options={options} />
    </div>
  );
};

export default Score5DistributionChart;

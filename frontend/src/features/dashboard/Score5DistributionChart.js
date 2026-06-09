// c:\Arne\ArneVR\PortfolioVR\frontend\src\features\dashboard\Score5DistributionChart.js
import React, { useState, useEffect, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import http from '../../http-common';
import { useIncognito } from '../../hooks/useIncognito';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const Score5DistributionChart = () => {
  const [portfolioData, setPortfolioData] = useState(null);
  const isIncognito = useIncognito();
  const [sortBy, setSortBy] = useState('ideal'); // 'ideal' of 'actual'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        
        // 1. Haal de ideale portfolio (berekende waardeverdeling) op
        const calcResponse = await http.get('/calculations/summary-by-date', {
          params: { date: today }
        });
        const calcData = calcResponse.data;

        // 2. Haal de huidige portfolio (actuele holdings) op
        const holdingsResponse = await http.get('/portfolio/holdings?userId=1');
        const holdingsData = holdingsResponse.data;
        
        // --- Verwerk Ideale Portfolio ---
        // Neem alle aandelen met een score van 5 en een positieve waardeverdeling
        const idealStocks = calcData.filter(item => item.selectiecriteria === 5 && item.waarde_verdeling > 0);
        const totalIdealWaarde = idealStocks.reduce((sum, item) => sum + item.waarde_verdeling, 0);
        
        const idealMap = {};
        idealStocks.forEach(item => {
          idealMap[item.ticker_symbol] = totalIdealWaarde > 0 ? (item.waarde_verdeling / totalIdealWaarde) * 100 : 0;
        });

        // --- Verwerk Huidige Portfolio ---
        const totalActualValue = holdingsData.reduce((sum, item) => sum + item.value, 0);
        const actualMap = {};
        const actualValueMap = {};
        holdingsData.forEach(item => {
          actualMap[item.ticker] = totalActualValue > 0 ? (item.value / totalActualValue) * 100 : 0;
          actualValueMap[item.ticker] = item.value || 0;
        });

        // Combineer alle unieke tickers en sorteer alfabetisch
        const allTickers = Array.from(new Set([...Object.keys(idealMap), ...Object.keys(actualMap)])).sort();

        // Sla de ruwe data op in de state zodat we kunnen sorteren zonder de database opnieuw aan te spreken
        setPortfolioData({
          idealMap,
          actualMap,
          actualValueMap,
          allTickers
        });
        setLoading(false);
      } catch (err) {
        console.error("Fout bij ophalen data voor portfolio comparison chart", err);
        setError("Kon data niet laden");
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Bouw de grafiekdata op basis van de gekozen sortering
  const chartData = useMemo(() => {
    if (!portfolioData) return null;
    const { idealMap, actualMap, actualValueMap, allTickers } = portfolioData;

    // Bepaal de volgorde (van groot naar klein)
    const sortedTickers = [...allTickers].sort((a, b) => {
      if (sortBy === 'ideal') {
        return (idealMap[b] || 0) - (idealMap[a] || 0);
      } else {
        return (actualMap[b] || 0) - (actualMap[a] || 0);
      }
    });

    const idealDataPoints = sortedTickers.map(ticker => idealMap[ticker] || 0);
    const actualDataPoints = sortedTickers.map(ticker => actualMap[ticker] || 0);
    const actualAbsolutePoints = sortedTickers.map(ticker => actualValueMap[ticker] || 0);

    // Modern Kleurenpalet (Tailwind-ish kleuren)
    const backgroundColors = [
      '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899',
      '#6366F1', '#14B8A6', '#F97316', '#06B6D4', '#0EA5E9', '#64748B'
    ];

    // Zorg ervoor dat het aandeel dezelfde kleur behoudt, ongeacht de sortering
    const colors = sortedTickers.map(ticker => {
      const originalIndex = allTickers.indexOf(ticker);
      return backgroundColors[originalIndex % backgroundColors.length];
    });

    return {
      labels: sortedTickers,
      datasets: [
        {
          label: 'Ideaal (%)',
          data: idealDataPoints,
          backgroundColor: colors.map(c => c + '40'), // 25% transparant voor het 'Ideale' profiel
          borderColor: colors,
          borderWidth: 2,
        },
        {
          label: 'Huidig (%)',
          data: actualDataPoints,
          absoluteValues: actualAbsolutePoints, // Voeg de absolute waarden toe voor de tooltip
          backgroundColor: colors, // Solid kleur voor je Huidige bezit
          borderColor: colors,
          borderWidth: 2,
        },
      ],
    };
  }, [portfolioData, sortBy]);

  const options = {
    indexAxis: 'y', // Grafiek horizontaal maken
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { // Omdat de grafiek nu horizontaal is, bevinden de percentages zich op de x-as
        beginAtZero: true,
        title: {
          display: true,
          text: 'Percentage van Portfolio (%)'
        }
      },
      y: {
        ticks: {
          autoSkip: false // Zorgt dat alle tickernamen altijd leesbaar en zichtbaar blijven
        }
      }
    },
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const datasetLabel = context.dataset.label;
            const percentage = context.raw.toFixed(2);
            
            if (datasetLabel === 'Huidig (%)') {
              const absValue = context.dataset.absoluteValues[context.dataIndex];
              const formattedValue = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(absValue);
              return `${datasetLabel}: ${percentage}% ${isIncognito ? '€ ••••••' : `(${formattedValue})`}`;
            }
            
            return `${datasetLabel}: ${percentage}%`;
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
      Geen data gevonden om te vergelijken.
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex justify-end mb-2 z-10">
        <select 
          value={sortBy} 
          onChange={(e) => setSortBy(e.target.value)}
          className="text-xs py-1 px-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 bg-white"
        >
          <option value="ideal">Sorteer: Ideaal (Hoog → Laag)</option>
          <option value="actual">Sorteer: Huidig (Hoog → Laag)</option>
        </select>
      </div>
      <div className="relative flex-grow w-full min-h-[300px]">
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
};

export default Score5DistributionChart;

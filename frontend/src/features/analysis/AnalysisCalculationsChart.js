import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import http from '../../http-common';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  zoomPlugin
);

const AnalysisCalculationsChart = ({ selectedStock }) => {
  const [calculations, setCalculations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const chartRef = useRef(null);

  const fetchCalculations = useCallback(async () => {
    if (!selectedStock) return;
    setLoading(true);
    try {
      const response = await http.get(`/calculations/${selectedStock.stock_id}`);
      // Sorteer chronologisch van oud naar nieuw voor de grafiek
      const sorted = response.data.sort((a, b) => new Date(a.period_end_date) - new Date(b.period_end_date));
      setCalculations(sorted);
    } catch (err) {
      setError('Kon de berekeningen niet laden voor de grafiek.');
    } finally {
      setLoading(false);
    }
  }, [selectedStock]);

  useEffect(() => {
    fetchCalculations();
  }, [fetchCalculations]);

  const chartData = useMemo(() => {
    if (calculations.length === 0) return null;

    const labels = calculations.map(c => new Date(c.period_end_date).toLocaleDateString());

    return {
      labels,
      datasets: [
        {
          label: 'Gem. FCF Groei',
          data: calculations.map(c => c.gem_groeipercentage_FCF),
          borderColor: '#3B82F6', // Blue
          backgroundColor: '#3B82F6',
          tension: 0.1,
        },
        {
          label: 'Gem. ROE (10j)',
          data: calculations.map(c => c.gemiddelde_stijging_ROE_10_Y),
          borderColor: '#10B981', // Emerald
          backgroundColor: '#10B981',
          tension: 0.1,
        },
        {
          label: 'Waardefactor ROE',
          data: calculations.map(c => c.waardefactor_ROE),
          borderColor: '#8B5CF6', // Violet
          backgroundColor: '#8B5CF6',
          tension: 0.1,
        },
        {
          label: 'Waardefactor LTD/Equity',
          data: calculations.map(c => c.waardefactor_LTD_equity),
          borderColor: '#F59E0B', // Amber
          backgroundColor: '#F59E0B',
          tension: 0.1,
        },
        // Grenswaarden (Thresholds)
        {
          label: 'Ondergrens (0) - FCF & WF ROE',
          data: calculations.map(() => 0),
          borderColor: '#9CA3AF', // Gray
          borderDash: [5, 5],
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Ondergrens (0.15) - Gem. ROE',
          data: calculations.map(() => 0.15),
          borderColor: '#6EE7B7', // Emerald light
          borderDash: [5, 5],
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Bovengrens (1.0) - WF LTD/Eq',
          data: calculations.map(() => 1.0),
          borderColor: '#FCD34D', // Amber light
          borderDash: [5, 5],
          pointRadius: 0,
          borderWidth: 2,
        }
      ]
    };
  }, [calculations]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: `Evolutie Berekende Selectiecriteria - ${selectedStock?.ticker || ''}` },
      zoom: {
        pan: { enabled: true, mode: 'x' },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
      }
    }
  };

  const handleResetZoom = () => {
    if (chartRef.current) chartRef.current.resetZoom();
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-gray-800">Criteria & Waardefactoren</h3>
        {chartData && (
          <button onClick={handleResetZoom} className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded shadow-sm transition-colors">Reset Zoom</button>
        )}
      </div>
      {error && <p className="text-red-500">{error}</p>}
      {loading ? <p>Berekeningen laden...</p> : chartData ? (
        <div style={{ height: '500px', marginBottom: '20px' }}>
          <Line ref={chartRef} data={chartData} options={options} />
        </div>
      ) : <p>Geen berekende data beschikbaar voor grafiek.</p>}
    </div>
  );
};

export default AnalysisCalculationsChart;
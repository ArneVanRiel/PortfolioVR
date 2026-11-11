import React, { useState, useRef, useEffect, useCallback } from 'react';
import CalculationsSummaryTable from '../analysis/CalculationsSummaryTable';
import AlertsSummaryTable from '../analysis/AlertsSummaryTable';
import Modal from '../../components/ui/modal';
import http from '../../http-common';
import toast from 'react-hot-toast';
import Score5DistributionChart from './Score5DistributionChart';
import IncompleteDataWidget from './IncompleteDataWidget';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const ChartCard = ({ title, children, isExpanded, onToggleExpand }) => (
  <div
    className={`bg-white rounded-xl shadow-sm border border-gray-100 transition-all duration-300 flex flex-col ${isExpanded ? 'fixed inset-4 z-50 h-auto shadow-2xl' : 'h-full p-6'
      }`}
  >
    <div className={`flex justify-between items-center mb-4 ${isExpanded ? 'p-6 border-b border-gray-100' : ''}`}>
      <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      <button
        onClick={onToggleExpand}
        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-blue-600"
        title={isExpanded ? "Minimaliseren" : "Maximaliseren"}
      >
        {isExpanded ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        )}
      </button>
    </div>
    <div className={`flex-grow overflow-auto ${isExpanded ? 'p-6' : 'h-72'}`}>
      {children}
    </div>
  </div>
);

const Dashboard = () => {
  const [viewType] = useState('idealePortfolio');
  const watchlistTableRef = useRef(null);
  const calculationsTableRef = useRef(null);
  const alertsTableRef = useRef(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDate, setExportDate] = useState(new Date().toISOString().split('T')[0]);
  const [isUpdatingData, setIsUpdatingData] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [expandedCard, setExpandedCard] = useState(null);
  const [isUpdatedToday, setIsUpdatedToday] = useState(false);
  const [sharedSummaryData, setSharedSummaryData] = useState(null);
  const [sharedHoldingsData, setSharedHoldingsData] = useState(null);

  const checkUpdateStatus = useCallback(async () => {
    try {
      const response = await http.get('/watchlist/update-status');
      setIsUpdatedToday(response.data.isUpdatedToday);
    } catch (error) {
      console.error("Fout bij ophalen update status:", error);
    }
  }, []);

  const fetchSharedDashboardData = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [summaryRes, holdingsRes] = await Promise.all([
        http.get('/calculations/summary-by-date', { params: { date: today } }),
        http.get('/portfolio/holdings')
      ]);
      setSharedSummaryData(summaryRes.data || []);
      setSharedHoldingsData(holdingsRes.data || []);
    } catch (error) {
      console.error("Fout bij ophalen gedeelde dashboard data:", error);
    }
  }, []);

  useEffect(() => {
    checkUpdateStatus();
    fetchSharedDashboardData();
  }, [checkUpdateStatus, fetchSharedDashboardData]);

  const userRole = localStorage.getItem('role') || 'user';
  const userId = Number(localStorage.getItem('userID') || 0);
  const isAdmin = userId === 1 || userRole === 'admin';
  const isDemo = userRole === 'demo';
  const userPermissions = (() => {
    try {
      const raw = localStorage.getItem('user_permissions');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  })();
  const canEditSystemData = isAdmin || !!userPermissions.canEditSystemData;
  const canViewFormulas = isAdmin || !!userPermissions.canViewFormulas;

  const toggleExpand = (cardId) => {
    setExpandedCard(expandedCard === cardId ? null : cardId);
  };

  const handleAddStock = () => {
    if (calculationsTableRef.current && calculationsTableRef.current.openAddStockModal) {
      calculationsTableRef.current.openAddStockModal(viewType || 'watchlist');
    } else if (watchlistTableRef.current && watchlistTableRef.current.openAddStockModal) {
      watchlistTableRef.current.openAddStockModal();
    }
  };

  const handleOpenExportModal = () => setShowExportModal(true);
  const handleCloseExportModal = () => setShowExportModal(false);

  const fetchReportData = async () => {
    try {
      const [response, holdingsResponse] = await Promise.all([
        http.get('/calculations/summary-by-date', { params: { date: exportDate } }),
        http.get('/portfolio/holdings')
      ]);
      return { summaryData: response.data, holdingsData: holdingsResponse.data };
    } catch (error) {
      console.error("Fout bij ophalen rapport data", error);
      throw error;
    }
  };

  const processReportData = (dataObj) => {
    if (!dataObj || !dataObj.summaryData || dataObj.summaryData.length === 0) return [];

    const { summaryData, holdingsData } = dataObj;
    const totalActualValue = holdingsData.reduce((sum, item) => sum + (item.value || 0), 0);

    const totalWaardeVerdeling = summaryData
      .filter(item => item.waarde_verdeling > 0)
      .reduce((sum, item) => sum + item.waarde_verdeling, 0);

    return summaryData.map(item => {
      const percentage = totalWaardeVerdeling > 0 && item.waarde_verdeling > 0
        ? (item.waarde_verdeling / totalWaardeVerdeling) * 100
        : 0;

      const ideal_invested = (percentage / 100) * totalActualValue;
      const holding = holdingsData.find(h => h.ticker === item.ticker_symbol);
      const actual_invested = holding ? (holding.value || 0) : 0;
      const weight_factor = actual_invested === 0 ? 2 : Math.min(2, ideal_invested / actual_invested);

      let koopmargefactor = 1;
      if (item.current_price && item.intrinsieke_waarde && item.intrinsieke_waarde > 0) {
        const ratio = item.current_price / item.intrinsieke_waarde;
        if (item.current_price < item.intrinsieke_waarde * 0.75) {
          koopmargefactor = Math.abs(ratio - 1) + 1;
        } else {
          koopmargefactor = 1 / ratio;
        }
      }

      const currentRecommendedAmount = (typeof item.current_signal_line === 'number' && item.current_price > 0)
        ? Math.max(0, 30000 * (1 + (-item.current_signal_line / item.current_price) * 4)) * (percentage / 100) * (koopmargefactor / 10) * weight_factor
        : 0;

      const latestTradeAmountProcessed = item.latest_trade_amount != null
        ? (item.latest_trade_amount * (percentage / 100) / 10 * weight_factor)
        : null;

      const priceToIntrinsic = (item.current_price && item.intrinsieke_waarde > 0)
        ? (item.current_price / item.intrinsieke_waarde) - 1
        : null;

      return {
        'Aandeel': `${item.name} (${item.ticker_symbol})`,
        'Laatste Prijs': item.current_price ? `€${Number(item.current_price).toFixed(2)}` : 'N/A',
        'Waardeverdeling': item.waarde_verdeling ? Number(item.waarde_verdeling).toFixed(2) : 'N/A',
        'Percentage': `${percentage.toFixed(2)}%`,
        'Intrinsieke Waarde': item.intrinsieke_waarde ? `€${Number(item.intrinsieke_waarde).toFixed(2)}` : 'N/A',
        'Koopmarge': priceToIntrinsic != null ? `${(priceToIntrinsic * 100).toFixed(2)}%` : 'N/A',
        'Period End Date': item.period_end_date ? new Date(item.period_end_date).toLocaleDateString() : 'N/A',
        'Signal Line': item.current_signal_line ? Number(item.current_signal_line).toFixed(4) : 'N/A',
        'Type Melding': item.latest_alert_type || 'N/A',
        'Laatste Alert': item.latest_alert_date ? new Date(item.latest_alert_date).toLocaleDateString() : 'N/A',
        'Trade Bedrag (Alert)': latestTradeAmountProcessed != null ? `€${latestTradeAmountProcessed.toFixed(2)}` : 'N/A',
        'Aanbevolen Bedrag (Huidig)': currentRecommendedAmount ? `€${currentRecommendedAmount.toFixed(2)}` : 'N/A'
      };
    });
  };

  const handleExportExcel = async () => {
    try {
      const rawData = await fetchReportData();
      const data = processReportData(rawData);
      if (!data || data.length === 0) {
        alert("Geen data gevonden voor de geselecteerde datum.");
        return;
      }

      const headers = Object.keys(data[0]);
      const csvRows = [];
      csvRows.push(headers.join(','));

      for (const row of data) {
        const values = headers.map(header => {
          const escaped = ('' + (row[header] || '')).replace(/"/g, '\\"');
          return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
      }

      const csvData = csvRows.join('\n');
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('hidden', '');
      a.setAttribute('href', url);
      a.setAttribute('download', `Calculations_Report_${exportDate}.csv`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      handleCloseExportModal();
    } catch (error) {
      alert("Er is een fout opgetreden bij het exporteren naar Excel.");
    }
  };

  const handleExportPDF = async () => {
    try {
      const rawData = await fetchReportData();
      const data = processReportData(rawData);
      if (!data || data.length === 0) {
        alert("Geen data gevonden voor de geselecteerde datum.");
        return;
      }

      const printWindow = window.open('', '_blank');
      let html = `<html><head><title>Rapport ${exportDate}</title><style>table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px; } th, td { border: 1px solid #ddd; padding: 8px; text-align: left; } th { background-color: #f2f2f2; } h1 { font-family: Arial, sans-serif; }</style></head><body>`;
      html += `<h1>Calculations Summary Rapport - ${exportDate}</h1>`;
      html += `<table><thead><tr>${Object.keys(data[0]).map(key => `<th>${key}</th>`).join('')}</tr></thead><tbody>`;
      data.forEach(row => {
        html += `<tr>${Object.values(row).map(val => `<td>${val !== null ? val : ''}</td>`).join('')}</tr>`;
      });
      html += `</tbody></table></body></html>`;

      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
      handleCloseExportModal();
    } catch (error) {
      alert("Er is een fout opgetreden bij het genereren van de PDF.");
    }
  };

  // NIEUW: Functie om data te updaten met streaming response
  const handleUpdateData = async () => {
    setIsUpdatingData(true);
    setUpdateProgress(0);
    const toastId = toast.loading('Verbinden met server...');

    try {
      const response = await fetch(`${API_URL}/watchlist/update-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Bewaar het laatste onvolledige stukje

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);

            if (data.type === 'progress') {
              setUpdateProgress(data.progress);
              toast.loading(`${data.message} - ${data.progress}%`, { id: toastId });
            } else if (data.type === 'stock_update') {
              // Update de tabel direct via de ref
              if (watchlistTableRef.current) {
                watchlistTableRef.current.updateStockLocal(data);
              }
              if (calculationsTableRef.current) {
                calculationsTableRef.current.updateStockLocal(data);
              }
              toast.success(`Updated: Aandeel ID ${data.aandeel_id}`, { id: toastId, duration: 1000 });
            } else if (data.type === 'complete') {
              toast.success(data.message, { id: toastId });
              checkUpdateStatus();
            } else if (data.type === 'error') {
              toast.error(data.message, { id: toastId });
              checkUpdateStatus();
            }
          } catch (e) {
            console.error("Error parsing JSON chunk", e);
          }
        }
      }
    } catch (err) {
      toast.error(`Fout bij bijwerken: ${err.message}`, { id: toastId });
    } finally {
      setIsUpdatingData(false);
      setUpdateProgress(0);
      window.dispatchEvent(new Event('dataStatusUpdated'));
      await fetchSharedDashboardData();
      if (alertsTableRef.current) {
        alertsTableRef.current.refreshData();
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
        <div className="flex flex-wrap gap-2 sm:gap-3 w-full md:w-auto">
          {/* Knoppen */}
          {!isDemo && canEditSystemData && (
            <>
              <button
                onClick={handleAddStock}
                className="w-full sm:w-auto bg-blue-600 text-white font-medium py-2 px-4 rounded-lg shadow-sm hover:bg-blue-700 hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm sm:text-base"
              >
                Voeg Aandelen Toe aan {viewType === 'watchlist' ? 'Watchlist' : 'Ideale Portfolio'}
              </button>
              <button
                onClick={handleUpdateData}
                disabled={isUpdatingData || (isUpdatedToday && !isUpdatingData)}
                className="w-full sm:w-auto bg-emerald-500 text-white font-medium py-2 px-4 rounded-lg shadow-sm hover:bg-emerald-600 hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
              >
                {isUpdatingData ? `Bezig... (${updateProgress}%)` : isUpdatedToday ? 'Prijzen & Meldingen Up-to-date' : 'Update Prijzen & Meldingen'}
              </button>
              {isUpdatedToday && !isUpdatingData && (
                <button
                  onClick={() => {
                    if (window.confirm("Weet je zeker dat je de update opnieuw wilt forceren?")) {
                      setIsUpdatedToday(false);
                      setTimeout(() => handleUpdateData(), 100);
                    }
                  }}
                  className="text-xs text-blue-500 hover:text-blue-700 underline font-medium self-center py-1 sm:py-0"
                >
                  Forceer update
                </button>
              )}
              {canViewFormulas && (
                <button
                  onClick={handleOpenExportModal}
                  className="w-full sm:w-auto bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-all duration-200 text-sm sm:text-base"
                >
                  Generate Report
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Ideale vs Huidige Portfolio (%)"
          isExpanded={expandedCard === 'distribution'}
          onToggleExpand={() => toggleExpand('distribution')}
        >
          <Score5DistributionChart
            sharedSummaryData={sharedSummaryData}
            sharedHoldingsData={sharedHoldingsData}
          />
        </ChartCard>

        <ChartCard
          title="Meldingen"
          isExpanded={expandedCard === 'alerts'}
          onToggleExpand={() => toggleExpand('alerts')}
        >
          <AlertsSummaryTable
            ref={alertsTableRef}
            isCompact={expandedCard !== 'alerts'}
            sharedSummaryData={sharedSummaryData}
            sharedHoldingsData={sharedHoldingsData}
          />
        </ChartCard>
      </div>

      {/* Calculations Summary Table */}
      <CalculationsSummaryTable
        ref={calculationsTableRef}
        sharedSummaryData={sharedSummaryData}
        sharedHoldingsData={sharedHoldingsData}
        onDataChanged={fetchSharedDashboardData}
      />

      {/* Incomplete Data Widget (enkel voor Admin / Systeembeheer) */}
      {canEditSystemData && <IncompleteDataWidget />}

      {/* Export Modal */}
      <Modal isOpen={showExportModal} onClose={handleCloseExportModal}>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Rapport Exporteren</h3>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Selecteer Datum:</label>
            <input
              type="date"
              value={exportDate}
              onChange={(e) => setExportDate(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Kies een formaat om de <strong>Calculations Summary Table</strong> te exporteren.
          </p>
          <div className="flex justify-end space-x-3">
            <button onClick={handleCloseExportModal} className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">
              Annuleren
            </button>
            <button onClick={handleExportExcel} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
              Excel (CSV)
            </button>
            <button onClick={handleExportPDF} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
              PDF (Print)
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Dashboard;

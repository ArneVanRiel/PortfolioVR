import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import http from '../../http-common';
import TransactionForm from '../portfolio/TransactionForm';
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
import { useIncognito } from '../../hooks/useIncognito';

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

const AnalysisPortfolioTab = ({ selectedStock }) => {
  const [transactions, setTransactions] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const chartRef = useRef(null);

  // Stock split state
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitDate, setSplitDate] = useState('');
  const [splitRatio, setSplitRatio] = useState('');
  const [isSplitting, setIsSplitting] = useState(false);

  // Edit & Delete state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [transactionToEdit, setTransactionToEdit] = useState(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [transTypeFilter, setTransTypeFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'purchase_time', direction: 'desc' });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const isIncognito = useIncognito();
  const userRole = localStorage.getItem('role') || 'user';
  const isDemo = userRole === 'demo';
  const uid = localStorage.getItem('userID') || 1;

  const fetchData = useCallback(async () => {
    if (!selectedStock) return;
    setLoading(true);
    try {
      const stockId = selectedStock.stock_id || selectedStock.aandeel_id;
      const [transRes, priceRes] = await Promise.all([
        http.get(`/portfolio/transactions?userId=${uid}&period=All`),
        http.get(`/calculations/${stockId}/price-history`)
      ]);

      const stockTrans = transRes.data.filter(t => t.aandeel_id === stockId).sort((a, b) => new Date(a.purchase_time) - new Date(b.purchase_time));
      setTransactions(stockTrans);
      setPriceHistory(priceRes.data);
    } catch (error) {
      console.error("Fout bij ophalen portfolio data voor aandeel:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedStock, uid]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { chartData, currentPrice, avgBuyPrice, totalQuantity, totalInvested } = useMemo(() => {
    if (!priceHistory.length) return { chartData: null, currentPrice: 0, avgBuyPrice: 0, totalQuantity: 0, totalInvested: 0 };

    const labels = [];
    const prices = [];
    const buyPoints = [];
    const sellPoints = [];
    const holdingValues = [];

    let currentQty = 0;
    let invested = 0;

    const transMap = {};
    transactions.forEach(t => {
      const dStr = new Date(t.purchase_time).toISOString().split('T')[0];
      if (!transMap[dStr]) transMap[dStr] = [];
      transMap[dStr].push(t);
    });

    priceHistory.forEach(ph => {
      const dStr = new Date(ph.date).toISOString().split('T')[0];
      labels.push(new Date(ph.date).toLocaleDateString('nl-BE'));
      prices.push(ph.closing_price);

      let buyPrice = null;
      let sellPrice = null;

      if (transMap[dStr]) {
        transMap[dStr].forEach(t => {
          if (t.transaction_type === 'BUY') {
            currentQty += t.quantity;
            invested += (t.quantity * t.price) + (t.fees || 0) + (t.taxes || 0);
            buyPrice = t.price;
          } else if (t.transaction_type === 'SELL') {
            currentQty -= t.quantity;
            invested -= (t.quantity * t.price) - (t.fees || 0) - (t.taxes || 0);
            sellPrice = t.price;
          }
        });
      }

      buyPoints.push(buyPrice);
      sellPoints.push(sellPrice);
      holdingValues.push(currentQty > 0 ? currentQty * ph.closing_price : 0);
    });

    const cPrice = priceHistory[priceHistory.length - 1].closing_price;
    const avgBuy = currentQty > 0 ? invested / currentQty : 0;

    const cData = {
      labels,
      datasets: [
        {
          label: 'Prijs',
          data: prices,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          yAxisID: 'y',
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.1,
        },
        {
          label: 'Holding Waarde',
          data: holdingValues,
          borderColor: 'rgb(153, 102, 255)',
          backgroundColor: 'rgba(153, 102, 255, 0.1)',
          yAxisID: 'y1',
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.1,
          fill: true
        },
        {
          label: 'Gekocht',
          data: buyPoints,
          borderColor: 'green',
          backgroundColor: 'green',
          pointStyle: 'triangle',
          pointRadius: 8,
          rotation: 0,
          showLine: false,
          yAxisID: 'y',
        },
        {
          label: 'Verkocht',
          data: sellPoints,
          borderColor: 'red',
          backgroundColor: 'red',
          pointStyle: 'triangle',
          pointRadius: 8,
          rotation: 180,
          showLine: false,
          yAxisID: 'y',
        }
      ]
    };

    return { chartData: cData, currentPrice: cPrice, avgBuyPrice: avgBuy, totalQuantity: currentQty, totalInvested: invested };
  }, [priceHistory, transactions]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top' },
      tooltip: { callbacks: { label: (context) => `${context.dataset.label}: €${context.parsed.y.toFixed(2)}` } },
      zoom: { pan: { enabled: true, mode: 'x' }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' } }
    },
    scales: {
      x: { ticks: { maxTicksLimit: 20 }, grid: { display: false } },
      y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Prijs (€)' } },
      y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Positie Waarde (€)' } }
    }
  };

  // Bereken de historische gemiddelde aankoopprijs per transactie voor de tabel
  const displayTransactions = useMemo(() => {
    let runningQty = 0;
    let runningInvested = 0;
    let runningAvg = 0;

    const enriched = transactions.map(t => {
      let txAvg = runningAvg;
      if (t.transaction_type === 'BUY') {
        const cost = (t.quantity * t.price) + (t.fees || 0) + (t.taxes || 0);
        runningInvested += cost;
        runningQty += t.quantity;
        runningAvg = runningQty > 0 ? runningInvested / runningQty : 0;
        txAvg = runningAvg; 
      } else if (t.transaction_type === 'SELL') {
        txAvg = runningAvg; 
        const costOfSold = t.quantity * runningAvg;
        runningInvested -= costOfSold;
        runningQty -= t.quantity;
        if (runningQty <= 0.0001) { runningQty = 0; runningInvested = 0; runningAvg = 0; }
      }
      
      const total_value = t.quantity * t.price;
      
      let result_pct = null;
      if (t.transaction_type === 'BUY') {
        result_pct = ((currentPrice - t.price) / t.price) * 100;
      } else if (t.transaction_type === 'SELL') {
        result_pct = txAvg > 0 ? ((t.price - txAvg) / txAvg) * 100 : 0;
      }
      
      return { ...t, historicalAvgBuyPrice: txAvg, total_value, result_pct };
    });

    let result = [...enriched];
    if (transTypeFilter) {
      result = result.filter(t => t.transaction_type === transTypeFilter);
    }
    
    if (sortConfig.key) {
        result.sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];
            
            if (sortConfig.key === 'purchase_time') {
                aVal = new Date(aVal).getTime();
                bVal = new Date(bVal).getTime();
            }
            
            if (aVal === null) aVal = -Infinity; // Push nulls naar beneden
            if (bVal === null) bVal = -Infinity;

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    } else {
        // Default fallback (nieuwste bovenaan) als er geen sortering is (of first-load)
        result.sort((a, b) => new Date(b.purchase_time) - new Date(a.purchase_time));
    }
    
    return result;
  }, [transactions, transTypeFilter, sortConfig, currentPrice]);

  const formatCurrency = (val) => new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(val || 0);

  const confirmDeleteTransaction = async () => {
    if (!transactionToDelete) return;
    try {
      await http.delete(`/portfolio/transactions/${transactionToDelete.id}`);
      setTransactionToDelete(null);
      fetchData();
      alert('Transactie verwijderd. Vergeet niet in je dashboard de "Volledige Historie Herberekenen" uit te voeren als dit impact heeft op je historische grafieken.');
    } catch (error) {
      console.error("Fout bij verwijderen transactie:", error);
      alert("Er is een fout opgetreden bij het verwijderen van de transactie.");
    }
  };

  const handleApplySplit = async () => {
      if (!splitDate || !splitRatio) return;
      setIsSplitting(true);
      try {
          const stockId = selectedStock.stock_id || selectedStock.aandeel_id;
          await http.post('/portfolio/apply-stock-split', {
              stockId,
              splitDate,
              splitRatio
          });
          alert('Stock split succesvol toegepast! Ga hierna naar het Dashboard en klik op "Volledige Historie Herberekenen" om je rendementsgrafieken te updaten.');
          setShowSplitModal(false);
          // Herlaad transacties voor dit specifieke aandeel
          const transRes = await http.get(`/portfolio/transactions?userId=${uid}&period=All`);
          const stockTrans = transRes.data.filter(t => t.aandeel_id === stockId).sort((a, b) => new Date(a.purchase_time) - new Date(b.purchase_time));
          setTransactions(stockTrans);
      } catch (err) {
          alert(err.response?.data?.message || 'Fout bij toepassen stock split');
      } finally {
          setIsSplitting(false);
      }
  };

  const handleSort = (key) => {
      let direction = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') {
          direction = 'desc';
      }
      setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
      if (sortConfig.key === key) {
          return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
      }
      return '';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Korte samenvatting statcards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Huidige Positie</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 privacy-blur">{isIncognito ? '••••••' : totalQuantity} stuks</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Gem. Aankoopprijs</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 privacy-blur">{formatCurrency(avgBuyPrice)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Actuele Waarde</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 privacy-blur">{formatCurrency(totalQuantity * currentPrice)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Totaal Rendement</p>
          <p className={`text-2xl font-bold mt-1 privacy-blur ${(totalQuantity * currentPrice) - totalInvested >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency((totalQuantity * currentPrice) - totalInvested)}
          </p>
        </div>
      </div>

      {/* Grafiek */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Prijs vs Positie Waarde</h3>
          <button onClick={() => chartRef.current?.resetZoom()} className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded shadow-sm transition-colors">Reset Zoom</button>
        </div>
        <div style={{ height: '400px' }} className="incognito-hide">
          {loading ? <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div> : chartData ? <Line ref={chartRef} data={chartData} options={options} /> : <p>Geen data.</p>}
        </div>
        <div className="incognito-show flex-col items-center justify-center h-full text-gray-400 text-sm" style={{ height: '400px' }}>
          <i className="ph-fill ph-eye-slash text-4xl mb-2 opacity-30"></i>
          Waardegrafiek verborgen in privacymodus
        </div>
      </div>

      {/* Transactie Historiek Specifiek voor Aandeel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center flex-wrap gap-4">
            <h3 className="text-lg font-bold text-gray-900">Mijn Transacties</h3>
            <div className="flex items-center gap-3">
                <select
                    value={transTypeFilter}
                    onChange={(e) => setTransTypeFilter(e.target.value)}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">Alle Types</option>
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                    <option value="DIVIDEND">DIVIDEND</option>
                </select>
                {!isDemo && (
                  <>
                    <button onClick={() => setIsAddModalOpen(true)} className="px-3 py-1.5 text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md transition-colors shadow-sm border border-blue-200">
                        + Transactie
                    </button>
                    <button onClick={() => setShowSplitModal(true)} className="px-3 py-1.5 text-xs font-bold bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-md transition-colors shadow-sm border border-orange-200">
                        Stock Split Verwerken
                    </button>
                  </>
                )}
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none transition-colors" onClick={() => handleSort('purchase_time')}>Datum{getSortIcon('purchase_time')}</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none transition-colors" onClick={() => handleSort('transaction_type')}>Type{getSortIcon('transaction_type')}</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase text-right cursor-pointer hover:bg-gray-100 select-none transition-colors" onClick={() => handleSort('quantity')}>Aantal{getSortIcon('quantity')}</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase text-right cursor-pointer hover:bg-gray-100 select-none transition-colors" onClick={() => handleSort('price')}>Prijs{getSortIcon('price')}</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase text-right cursor-pointer hover:bg-gray-100 select-none transition-colors" onClick={() => handleSort('total_value')}>Totaalwaarde{getSortIcon('total_value')}</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase text-right cursor-pointer hover:bg-gray-100 select-none transition-colors" onClick={() => handleSort('result_pct')}>Resultaat{getSortIcon('result_pct')}</th>
                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase text-right">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayTransactions.map(t => {
                let result = <span className="text-gray-400">-</span>;
                if (t.transaction_type === 'BUY' && t.result_pct !== null) {
                  result = <span className={`font-bold ${t.result_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>{t.result_pct >= 0 ? '+' : ''}{t.result_pct.toFixed(2)}% <span className="text-[10px] font-normal text-gray-400 block leading-none">(vs huidige koers)</span></span>;
                } else if (t.transaction_type === 'SELL' && t.result_pct !== null) {
                  result = <span className={`font-bold ${t.result_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>{t.result_pct >= 0 ? '+' : ''}{t.result_pct.toFixed(2)}% <span className="text-[10px] font-normal text-gray-400 block leading-none">(vs gem. aankoop)</span></span>;
                }
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-700">
                        {new Date(t.purchase_time).toLocaleDateString('nl-BE')}
                        <span className="text-xs text-gray-400 block mt-0.5">{new Date(t.purchase_time).toLocaleTimeString('nl-BE', {hour: '2-digit', minute:'2-digit'})}</span>
                    </td>
                    <td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-bold rounded-md ${t.transaction_type === 'BUY' ? 'bg-green-100 text-green-700' : t.transaction_type === 'SELL' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{t.transaction_type}</span></td>
                    <td className="px-6 py-4 text-sm text-gray-700 text-right privacy-blur">{isIncognito ? '••••••' : t.quantity}</td>
                    <td className="px-6 py-4 text-sm text-gray-700 text-right privacy-blur">{formatCurrency(t.price)}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right privacy-blur">{formatCurrency(t.quantity * t.price)}</td>
                    <td className="px-6 py-4 text-sm text-right">{result}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => { setTransactionToEdit(t); setIsEditModalOpen(true); }} className="text-gray-400 hover:text-blue-600 transition-colors focus:outline-none mr-3" title="Bewerken">
                          <i className="ph-fill ph-pencil-simple text-lg"></i>
                        </button>
                        <button onClick={() => setTransactionToDelete(t)} className="text-gray-400 hover:text-rose-600 transition-colors focus:outline-none" title="Verwijderen">
                          <i className="ph-fill ph-trash text-lg"></i>
                        </button>
                    </td>
                  </tr>
                );
              })}
              {displayTransactions.length === 0 && (<tr><td colSpan="7" className="px-6 py-8 text-center text-sm text-gray-500">Geen transacties in portfolio gevonden voor dit aandeel.</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal voor Stock Split */}
      {showSplitModal && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 overflow-y-auto h-full w-full z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800">Stock Split Toepassen</h3>
            <p className="text-gray-600 mb-4 text-sm">
              Vul de datum in waarop de split plaatsvond, en de ratio. Bijvoorbeeld voor een <strong className="text-gray-900">20:1</strong> split vul je <strong className="text-gray-900">20</strong> in. 
              Hierdoor wordt de hoeveelheid van al je historische transacties in de database vermenigvuldigd met 20, en de aankoopprijs gedeeld door 20.
            </p>
            <div className="space-y-4 mb-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Datum van de Split</label>
                    <input type="date" value={splitDate} onChange={e => setSplitDate(e.target.value)} className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none border" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ratio (Bv. 20 voor 20:1 split)</label>
                    <input type="number" step="any" value={splitRatio} onChange={e => setSplitRatio(e.target.value)} placeholder="Bv. 20 of 4" className="w-full border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none border" />
                </div>
            </div>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setShowSplitModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium">Annuleren</button>
              <button onClick={handleApplySplit} disabled={isSplitting || !splitDate || !splitRatio} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-md transition-colors disabled:opacity-50">Toepassen</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Overlay voor Add Transaction */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 overflow-y-auto h-full w-full z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl">
            <h3 className="text-2xl font-bold mb-2 text-gray-800">Nieuwe Transactie</h3>
            <TransactionForm
              initialStockId={selectedStock.stock_id || selectedStock.aandeel_id}
              initialTicker={selectedStock.ticker || selectedStock.ticker_symbol}
              initialStockName={selectedStock.name}
              onSuccess={() => { 
                setIsAddModalOpen(false); 
                fetchData(); 
                alert('Transactie opgeslagen! Vergeet niet om in je dashboard "Volledige Historie Herberekenen" uit te voeren als dit impact heeft op je historie.');
              }}
              onCancel={() => setIsAddModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Modal Overlay voor Edit Transaction */}
      {isEditModalOpen && transactionToEdit && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 overflow-y-auto h-full w-full z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl">
            <h3 className="text-2xl font-bold mb-2 text-gray-800">Transactie Bewerken</h3>
            <TransactionForm
              transactionToEdit={transactionToEdit}
              onSuccess={() => { 
                setIsEditModalOpen(false); 
                setTransactionToEdit(null); 
                fetchData(); 
                alert('Transactie opgeslagen! Vergeet niet om in je dashboard "Volledige Historie Herberekenen" uit te voeren als dit impact heeft op je historie.');
              }}
              onCancel={() => { setIsEditModalOpen(false); setTransactionToEdit(null); }}
            />
          </div>
        </div>
      )}

      {/* Modal Overlay voor Verwijderen Bevestigen */}
      {transactionToDelete && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 overflow-y-auto h-full w-full z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800">Transactie Verwijderen</h3>
            <p className="text-gray-600 mb-6 text-sm">
              Weet je zeker dat je de <strong>{transactionToDelete.transaction_type}</strong> transactie op <strong>{new Date(transactionToDelete.purchase_time).toLocaleDateString('nl-BE')}</strong> wilt verwijderen?<br/><br/>Deze actie kan niet ongedaan worden gemaakt.
            </p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setTransactionToDelete(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium">Annuleren</button>
              <button onClick={confirmDeleteTransaction} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-md transition-colors">Verwijderen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AnalysisPortfolioTab;
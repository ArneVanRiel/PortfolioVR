import React, { useState, useEffect, useMemo, useRef } from 'react';
import http from '../../http-common';
import * as XLSX from 'xlsx';
import TransactionForm from './TransactionForm';
import TaxesTab from './TaxesTab';
import { useNavigate } from 'react-router-dom';
import { Doughnut, Line, Bar } from 'react-chartjs-2';
import { useIncognito } from '../../hooks/useIncognito';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
  BarElement
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler, BarElement
);

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const PortfolioManager = () => {
  const navigate = useNavigate();

  const userRole = localStorage.getItem('role') || 'user';
  const isDemo = userRole === 'demo';
  const uid = localStorage.getItem('userID') || 1;

  const [rawHoldings, setRawHoldings] = useState([]);
  const [rawTransactions, setRawTransactions] = useState([]);
  const [history, setHistory] = useState([]);
  const [availableAssetTypes, setAvailableAssetTypes] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState([]); // Empty means "Overview (alles)"
  const [loading, setLoading] = useState(true);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [transactionToEdit, setTransactionToEdit] = useState(null);
  const fileInputRef = useRef(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [showImportReviewModal, setShowImportReviewModal] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState([]);
  const [uploadDropdownOpen, setUploadDropdownOpen] = useState(false);
  const [uploadType, setUploadType] = useState('template'); // 'template', 'etoro', 'degiro'

  const [chartPeriod, setChartPeriod] = useState('1Y');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [holdingsSearch, setHoldingsSearch] = useState('');
  const [holdingsSort, setHoldingsSort] = useState({ key: 'value', direction: 'desc' });
  const [transSearch, setTransSearch] = useState('');
  const [transSort, setTransSort] = useState({ key: 'purchase_time', direction: 'desc' });
  const [transTypeFilter, setTransTypeFilter] = useState('');
  const [transCurrentPage, setTransCurrentPage] = useState(1);
  const transPerPage = 20;
  const [activeTab, setActiveTab] = useState('common');
  const [displayCurrency, setDisplayCurrency] = useState('USD');

  // --- Haal voorkeursvaluta op uit profiel ---
  useEffect(() => {
      const fetchProfileCurrency = async () => {
          const uid = localStorage.getItem('userID') || 1;
          try {
              const res = await http.get(`/auth/profile/${uid}`);
              if (res.data && res.data.default_currency) {
                  setDisplayCurrency(res.data.default_currency);
              }
          } catch (err) {
              console.error("Kon voorkeursvaluta niet laden", err);
          }
      };
      fetchProfileCurrency();
  }, []);

  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState(0);
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairProgress, setRepairProgress] = useState(0);
  const [logMessages, setLogMessages] = useState([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logModalTitle, setLogModalTitle] = useState('');
  const [showTransOnChart, setShowTransOnChart] = useState(false);
  const [chartView, setChartView] = useState('value'); // 'value' of 'rendement'

  // Growth tab specific states
  const [growthShowCostBasis, setGrowthShowCostBasis] = useState(true);
  const [growthShowTrades, setGrowthShowTrades] = useState(false);
  const [growthPerfType, setGrowthPerfType] = useState('value'); // 'value' | 'percent'
  const [growthPerfCalcFor, setGrowthPerfCalcFor] = useState('period'); // 'all_time' | 'period'
  const [growthPerfGroupBySource, setGrowthPerfGroupBySource] = useState(true);
  const [dynamicsPeriod, setDynamicsPeriod] = useState('monthly');
  const [dynamicsDisplay, setDynamicsDisplay] = useState('percent');
  const [dynamicsData, setDynamicsData] = useState([]);
  const [dynamicsLoading, setDynamicsLoading] = useState(false);
  const [dynamicsView, setDynamicsView] = useState('chart');

  // Individuele tijdsframe states per grafiek
  const [valPeriod, setValPeriod] = useState('1Y');
  const [valStart, setValStart] = useState('');
  const [valEnd, setValEnd] = useState('');

  const [perfPeriod, setPerfPeriod] = useState('1Y');
  const [perfStart, setPerfStart] = useState('');
  const [perfEnd, setPerfEnd] = useState('');

  const [dynPeriod, setDynPeriod] = useState('1Y');
  const [dynStart, setDynStart] = useState('');
  const [dynEnd, setDynEnd] = useState('');

  // Dividends tab specifieke states
  const [divGrouping, setDivGrouping] = useState('monthly');
  const [divTimeframe, setDivTimeframe] = useState('1Y');
  const [divStart, setDivStart] = useState('');
  const [divEnd, setDivEnd] = useState('');
  const isIncognito = useIncognito();

  const calculateDatesForPeriod = (period) => {
    let startDate = new Date();
    let endDate = new Date();
    
    if (period === '1W') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '1M') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'YTD') {
      startDate.setMonth(0, 1);
    } else if (period === '1Y') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    } else if (period === 'All') {
      startDate.setFullYear(1970);
    } else {
      startDate.setFullYear(startDate.getFullYear() - 1); // default 1Y
    }
    return { start: startDate.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0] };
  };

  const handlePeriodChange = (p) => {
    if (p === 'Custom' && chartPeriod !== 'Custom') {
      const { start, end } = calculateDatesForPeriod(chartPeriod);
      setCustomStartDate(start);
      setCustomEndDate(end);
    }
    setChartPeriod(p);
  };

  const fetchPortfolioData = async () => {
    try {
      setLoading(true);
      const customStartParam = chartPeriod === 'Custom' && customStartDate ? `&customStartDate=${customStartDate}` : '';
      const customEndParam = chartPeriod === 'Custom' && customEndDate ? `&customEndDate=${customEndDate}` : '';
      const currencyParam = `&currency=${displayCurrency}`;
      const [holdingsRes, transactionsRes, typesRes] = await Promise.all([
        http.get(`/portfolio/holdings?userId=${uid}&period=${chartPeriod}${customStartParam}${customEndParam}${currencyParam}`),
        http.get(`/portfolio/transactions?userId=${uid}&period=All`),
        http.get('/watchlist/asset-types') // Gebruikt de bestaande route voor categorieën
      ]);
      
      // Verwijder onzichtbare spaties uit de database strings met .trim()
      setRawHoldings(holdingsRes.data.map(h => ({ 
        ...h, 
        asset_type: h.asset_type ? String(h.asset_type).trim() : 'Onbekend', 
        todayChange: 0 
      })));
      setRawTransactions(transactionsRes.data.map(t => ({
        ...t, 
        asset_type: t.asset_type ? String(t.asset_type).trim() : 'Onbekend' 
      })));
      const trimmedTypes = typesRes.data.map(t => t.type_name ? String(t.type_name).trim() : 'Onbekend');
      setAvailableAssetTypes([...new Set(trimmedTypes)]); // Set verwijdert eventuele duplicaten
    } catch (error) {
      console.error("Fout bij het ophalen van portfolio data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Haalt de historische data specifiek voor de geselecteerde filters op
  const fetchHistoryData = async () => {
    const typesParam = selectedTypes.length > 0 ? `&assetTypes=${selectedTypes.join(',')}` : '';
    const periodToFetch = activeTab === 'growth' ? 'All' : chartPeriod;
    const customStartParam = periodToFetch === 'Custom' && customStartDate ? `&customStartDate=${customStartDate}` : '';
    const customEndParam = periodToFetch === 'Custom' && customEndDate ? `&customEndDate=${customEndDate}` : '';
    const currencyParam = `&currency=${displayCurrency}`;
    try {
      const res = await http.get(`/portfolio/calculatePortfolioValues?userId=${uid}&period=${periodToFetch}${typesParam}${customStartParam}${customEndParam}${currencyParam}`);
      setHistory(res.data);
    } catch (e) {
      console.error("Fout bij ophalen van historische grafiek:", e);
    }
  };

  const fetchDynamicsData = async () => {
    // Wacht met fetchen als er Custom is gekozen maar de datums nog niet volledig of geldig zijn
    if (dynPeriod === 'Custom') {
        if (!dynStart || !dynEnd) return;
        if (new Date(dynStart) > new Date(dynEnd)) return;
    }
    setDynamicsLoading(true);
    try {
        const params = new URLSearchParams({
            userId: uid,
            period: dynPeriod,
            currency: displayCurrency,
            periodGrouping: dynamicsPeriod
        });
        if (dynPeriod === 'Custom' && dynStart && dynEnd) {
            params.append('customStartDate', dynStart);
            params.append('customEndDate', dynEnd);
        }
        const res = await http.get(`/portfolio/returns-dynamics?${params.toString()}`);
        setDynamicsData(res.data);
    } catch (e) {
        console.error("Error fetching dynamics data:", e);
        setDynamicsData([]);
    } finally {
        setDynamicsLoading(false);
    }
  };
  // Reset paginatie als filters wijzigen
  useEffect(() => {
    setTransCurrentPage(1);
  }, [transSearch, transTypeFilter, transSort, selectedTypes, chartPeriod]);

  useEffect(() => {
    if (chartPeriod === 'Custom') {
      if (!customStartDate || !customEndDate) return;
      if (customStartDate.length !== 10 || customEndDate.length !== 10) return;
      const d1 = new Date(customStartDate);
      const d2 = new Date(customEndDate);
      if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return;
      if (d1 > d2) return; // Wacht met fetchen als de startdatum na de einddatum ligt
    }
    fetchPortfolioData();
    fetchHistoryData();
  }, [selectedTypes, chartPeriod, customStartDate, customEndDate, displayCurrency, activeTab]);

  // Aparte useEffect voor Dynamics Data zodat deze direct herlaadt als enkel de Dynamics filters wijzigen
  useEffect(() => {
    if (activeTab === 'growth') {
      fetchDynamicsData();
    }
  }, [dynPeriod, dynStart, dynEnd, displayCurrency, dynamicsPeriod, activeTab]);

  // Functie om de historische waarden en rendementen opnieuw te berekenen en op te slaan
  const handleRecalculateHistory = async (isBackground = false, fromDate = null) => {
    const isBg = isBackground === true; // Voorkom event object errors vanuit onClick
    setIsRecalculating(true);
    setRecalcProgress(0);
    
    if (!isBg) {
      setLogMessages([]);
      setLogModalTitle('Voortgang Herberekenen Historie');
      setShowLogModal(true);
    }

    try {
      const payload = { userId: uid };
      if (fromDate && typeof fromDate === 'string') {
        payload.fromDate = fromDate;
      }

      const response = await fetch(`${API_URL}/portfolio/recalculateAndStorePortfolioHistory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Onbekende serverfout.' }));
        throw new Error(errorData.message || `Serverfout: ${response.status}`);
      }

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
              setRecalcProgress(data.progress);
            }
            // Voeg alleen toe aan het logboek als we niet in achtergrondmodus zijn
            if (!isBg) {
              setLogMessages(prev => [...prev, { type: data.type || 'info', message: data.message }]);
            }
          } catch (e) {
            console.error("Fout bij parsen van progress stream:", e, "Line:", line);
          }
        }
      }
      await fetchHistoryData(); // Herlaad de data na succesvolle herberekening
      await fetchPortfolioData(); // Herlaad holdings en transacties
    } catch (error) {
      console.error("Fout bij herberekenen historie:", error);
      if (!isBg) {
        setLogMessages(prev => [...prev, { type: 'error', message: `Fout bij herberekenen: ${error.message}` }]);
      } else {
        alert(`Er is een fout opgetreden bij de automatische herberekening: ${error.message}`);
      }
    } finally {
      setIsRecalculating(false);
      if (isBg) setRecalcProgress(0);
    }
  };

  const handleCheckAndRepairPrices = async () => {
    setIsRepairing(true);
    setRepairProgress(0);
    setLogMessages([]);
    setLogModalTitle('Voortgang Prijsdata Reparatie');
    setShowLogModal(true);

    try {
        const response = await fetch(`${API_URL}/portfolio/checkAndRepairPriceData`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uid })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Onbekende serverfout.' }));
            throw new Error(errorData.message || `Serverfout: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        let repairedDate = null;
        let count = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    setLogMessages(prev => [...prev, { type: data.type || 'info', message: data.message }]);
                    if (data.type === 'progress') {
                        setRepairProgress(data.progress);
                    }
                    if (data.type === 'complete') {
                        repairedDate = data.earliestRepairedDate;
                        count = data.repairedCount;
                    }
                } catch (e) {
                    console.error("Fout bij parsen van progress stream:", e, "Line:", line);
                }
            }
        }
        
        if (count > 0 && repairedDate) {
            setLogMessages(prev => [...prev, { type: 'info', message: `Automatische herberekening starten vanaf ${repairedDate}...` }]);
            setTimeout(() => handleRecalculateHistory(true, repairedDate), 1500);
        }
    } catch (error) {
        console.error("Fout bij controleren/repareren prijsdata:", error);
        setLogMessages(prev => [...prev, { type: 'error', message: `Fout bij reparatie: ${error.message}` }]);
    } finally {
        setIsRepairing(false);
    }
  };

  const handleUpdateExchangeRates = async () => {
    setIsRecalculating(true);
    setRecalcProgress(0);
    setLogMessages([]);
    setLogModalTitle('EUR/USD Historie Ophalen');
    setShowLogModal(true);

    try {
      const response = await fetch(`${API_URL}/portfolio/force-update-exchange-rates`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Serverfout');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); 

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === 'progress') setRecalcProgress(data.progress);
            setLogMessages(prev => [...prev, { type: data.type || 'info', message: data.message }]);
          } catch (e) {}
        }
      }
      fetchHistoryData();
    } catch (error) {
      setLogMessages(prev => [...prev, { type: 'error', message: `Fout: ${error.message}` }]);
    } finally {
      setIsRecalculating(false);
    }
  };

  // --- Filter Logica ---
  const toggleType = (type) => {
    if (selectedTypes.includes(type)) {
      setSelectedTypes(selectedTypes.filter(t => t !== type));
    } else {
      setSelectedTypes([...selectedTypes, type]);
    }
  };

  // Maak de filter logica ongevoelig voor hoofdletters/kleine letters
  const filteredHoldings = useMemo(() => rawHoldings.filter(h => 
    selectedTypes.length === 0 || selectedTypes.some(st => st.toLowerCase() === h.asset_type.toLowerCase())
  ), [rawHoldings, selectedTypes]);
  
  const filteredTransactions = useMemo(() => {
    let result = rawTransactions;
    if (selectedTypes.length > 0) {
        result = result.filter(t => selectedTypes.some(st => st.toLowerCase() === t.asset_type.toLowerCase()));
    }

    if (chartPeriod !== 'All') {
        let startDateStr = '';
        let endDateStr = new Date().toISOString().split('T')[0];

        if (chartPeriod === 'Custom') {
            if (customStartDate && customEndDate && customStartDate.length === 10 && customEndDate.length === 10) {
                startDateStr = customStartDate;
                endDateStr = customEndDate;
            } else {
                return result; 
            }
        } else {
            const { start, end } = calculateDatesForPeriod(chartPeriod);
            startDateStr = start;
            endDateStr = end;
        }

        result = result.filter(t => {
            const tDate = new Date(t.purchase_time).toISOString().split('T')[0];
            return tDate >= startDateStr && tDate <= endDateStr;
        });
    }

    return result;
  }, [rawTransactions, selectedTypes, chartPeriod, customStartDate, customEndDate]);

  // --- Sorteer Logica ---
  const handleHoldingsSort = (key) => {
    let direction = 'asc';
    if (holdingsSort.key === key && holdingsSort.direction === 'asc') direction = 'desc';
    setHoldingsSort({ key, direction });
  };

  const handleTransSort = (key) => {
    let direction = 'asc';
    if (transSort.key === key && transSort.direction === 'asc') direction = 'desc';
    setTransSort({ key, direction });
  };

  const getSortIcon = (sortConfig, key) => {
    if (sortConfig.key === key) return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
    return '';
  };

  // --- Zoek en Sorteer Applicatie ---
  const processedHoldings = useMemo(() => {
    let result = [...filteredHoldings];
    if (holdingsSearch) {
      const lower = holdingsSearch.toLowerCase();
      result = result.filter(h => h.ticker?.toLowerCase().includes(lower) || h.name?.toLowerCase().includes(lower));
    }
    if (holdingsSort.key) {
      result.sort((a, b) => {
        if (a[holdingsSort.key] < b[holdingsSort.key]) return holdingsSort.direction === 'asc' ? -1 : 1;
        if (a[holdingsSort.key] > b[holdingsSort.key]) return holdingsSort.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [filteredHoldings, holdingsSearch, holdingsSort]);

  const processedTransactions = useMemo(() => {
    let result = [...filteredTransactions];
    if (transTypeFilter) {
      result = result.filter(t => t.transaction_type === transTypeFilter);
    }
    if (transSearch) {
      const lower = transSearch.toLowerCase();
      result = result.filter(t => 
        t.ticker_symbol?.toLowerCase().includes(lower) || 
        t.transaction_type?.toLowerCase().includes(lower) ||
        t.stock_name?.toLowerCase().includes(lower)
      );
    }
    if (transSort.key) {
      result.sort((a, b) => {
        let valA = a[transSort.key];
        let valB = b[transSort.key];
        if (transSort.key === 'purchase_time') {
          valA = new Date(valA).getTime();
          valB = new Date(valB).getTime();
        } else if (transSort.key === 'total_value') {
          valA = a.quantity * a.price;
          valB = b.quantity * b.price;
        }
        if (valA < valB) return transSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return transSort.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [filteredTransactions, transSearch, transSort]);

  // Paginatie logica
  const totalTransPages = Math.ceil(processedTransactions.length / transPerPage) || 1;
  const currentTransactions = processedTransactions.slice(
    (transCurrentPage - 1) * transPerPage,
    transCurrentPage * transPerPage
  );

  // --- Zoek Mogelijke Duplicaten ---
  const potentialDuplicates = useMemo(() => {
    const groups = {};
    rawTransactions.forEach(t => {
      // Toon voorlopig enkel BUY en SELL duplicaten (negeer dividenden, stortingen, etc.)
      if (t.transaction_type !== 'BUY' && t.transaction_type !== 'SELL') return;

      const tDate = new Date(t.purchase_time).toISOString().split('T')[0];
      const tAsset = t.ticker_symbol || t.aandeel_id || 'CASH';
      // Om stock splits te vinden: groepeer op Totale Waarde (inleg) i.p.v. Aantal
      const tTotalValue = (parseFloat(t.quantity || 0) * parseFloat(t.price || 0)).toFixed(1);
      const key = `${tDate}_${t.transaction_type}_${tAsset}_${tTotalValue}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    const duplicates = [];
    Object.values(groups).forEach(group => {
      if (group.length > 1) {
        // Bereken of er een prijsverschil is in deze groep
        const prices = group.map(t => parseFloat(t.price || 0));
        const qtys = group.map(t => parseFloat(t.quantity || 0));
        const maxPrice = Math.max(...prices);
        const minPrice = Math.min(...prices);
        const priceVariance = maxPrice - minPrice;
        const hasVariance = priceVariance > 0.015; // Toon afwijking als het meer dan ~1 cent is

        // Factor 1.5+ verschil in aandelen bij zelfde inlegbedrag wijst vrijwel altijd op een split dubbele boeking
        const isPossibleSplit = hasVariance && (Math.max(...qtys) / (Math.min(...qtys) || 1)) > 1.5;

        group.forEach(t => {
          duplicates.push({ ...t, _hasVariance: hasVariance, _varianceAmount: priceVariance, _isPossibleSplit: isPossibleSplit });
        });
      }
    });
    return duplicates.sort((a, b) => new Date(b.purchase_time) - new Date(a.purchase_time));
  }, [rawTransactions]);

  // --- Verwijder Transactie ---
  const confirmDeleteTransaction = async () => {
    if (!transactionToDelete) return;
    try {
      const delDate = transactionToDelete.purchase_time;
      await http.delete(`/portfolio/transactions/${transactionToDelete.id}`);
      setTransactionToDelete(null);
      fetchPortfolioData();
      handleRecalculateHistory(true, delDate);
    } catch (error) {
      console.error("Fout bij verwijderen transactie:", error);
      alert("Er is een fout opgetreden bij het verwijderen van de transactie.");
    }
  };

  // --- Summary Calculator ---
  const summary = useMemo(() => {
    let totalVal = 0;
    let totalInv = 0;
    filteredHoldings.forEach(h => {
      totalVal += h.value;
      totalInv += h.total_invested;
    });
    const gainLoss = totalVal - totalInv;
    return {
      totalValue: totalVal,
      overallGainLoss: gainLoss,
      overallGainLossPercentage: totalInv > 0 ? (gainLoss / totalInv) * 100 : 0,
      todayChange: 0, // Mock
      todayChangePercentage: 0
    };
  }, [filteredHoldings]);

  // Haal de meest recente portfolio data op voor de summary cards
  const latestPortfolioData = useMemo(() => {
    if (history && history.length > 0) {
      // De geschiedenis is al gesorteerd op datum, dus het laatste element is het meest recent
      return history[history.length - 1];
    }
    return null;
  }, [history]);

  // --- Periode Statistieken ---
  const periodStats = useMemo(() => {
    const totalTrans = filteredTransactions.length;
    const buys = filteredTransactions.filter(t => t.transaction_type === 'BUY').length;
    const sells = filteredTransactions.filter(t => t.transaction_type === 'SELL').length;
    
    let startValue = history.length > 0 ? history[0].total_value : 0;
    let endValue = history.length > 0 ? history[history.length - 1].total_value : 0;
    
    let netAssetInflow = 0;
    filteredTransactions.forEach(t => {
      if (t.transaction_type === 'BUY') {
        netAssetInflow += (t.quantity * t.price) + (t.fees || 0) + (t.taxes || 0);
      } else if (t.transaction_type === 'SELL') {
        netAssetInflow -= ((t.quantity * t.price) - (t.fees || 0) - (t.taxes || 0));
      } else if (t.transaction_type === 'DIVIDEND') {
        netAssetInflow -= ((t.quantity * t.price) - (t.taxes || 0));
      }
    });
    
    // Periode winst: Eindwaarde - Startwaarde - Netto geïnvesteerd bedrag in deze periode
    const periodProfit = endValue - startValue - netAssetInflow;

    return { totalTrans, buys, sells, periodProfit };
  }, [filteredTransactions, history]);


  const formatCurrency = (val) => {
    if (isIncognito) return displayCurrency === 'EUR' ? '€ ••••••' : '$ ••••••';
    return new Intl.NumberFormat(displayCurrency === 'EUR' ? 'nl-BE' : 'en-US', { style: 'currency', currency: displayCurrency }).format(val || 0);
  };
  const formatPercentage = (val) => isIncognito ? '••• %' : `${(val > 0 ? '+' : '')}${(val || 0).toFixed(2)}%`;

  // --- Helpers voor Custom Excel Imports ---
  const parseNumber = (val) => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      const str = String(val).trim();
      // Als het getal zowel een punt als een komma heeft (bijv 1.234,56 of 1,234.56)
      if (str.includes('.') && str.includes(',')) {
          if (str.lastIndexOf('.') < str.lastIndexOf(',')) {
              return parseFloat(str.replace(/\./g, '').replace(',', '.')); // EU formaat
          } else {
              return parseFloat(str.replace(/,/g, '')); // US formaat
          }
      }
      // Alleen een komma aanwezig (EU formaat)
      if (str.includes(',')) return parseFloat(str.replace(',', '.'));
      // Alleen een punt of geen decimalen (US formaat)
      return parseFloat(str);
  };

  const parseDeGiroDate = (dateStr, timeStr) => {
      try {
          const [day, month, year] = String(dateStr).split('-');
          return `${year}-${month}-${day}T${timeStr}:00.000Z`;
      } catch(e) { return new Date().toISOString(); }
  };

  const parseEtoroDate = (dateTimeStr) => {
      try {
          // Formaat: 02/03/2026 14:43:52
          const parts = String(dateTimeStr).split(' ');
          const [day, month, year] = parts[0].split('/');
          const time = parts[1] || '00:00:00';
          return `${year}-${month}-${day}T${time}.000Z`;
      } catch(e) { return new Date().toISOString(); }
  };

  // --- Download Excel Template ---
  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { Ticker: 'AAPL', Type: 'BUY', Date: '2025-01-15 10:30', Broker: 'Etoro', Quantity: 10, Price: 150.50, Fees: 1.50, Taxes: 0.00, Currency: 'USD', 'Exchange Rate': 1 },
      { Ticker: 'MSFT', Type: 'SELL', Date: '2025-01-20 15:45', Broker: 'Degiro', Quantity: 5, Price: 310.20, Fees: 0.50, Taxes: 0.10, Currency: 'USD', 'Exchange Rate': 0.92 },
      { Ticker: 'NVDA', Type: 'DIVIDEND', Date: '2025-02-01', Broker: 'Bolero', Quantity: 20, Price: 0.15, Fees: 0, Taxes: 0.90, Currency: 'USD', 'Exchange Rate': 1 }
    ]);
    // Maak kolommen iets breder voor de leesbaarheid
    ws['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, "Portfolio_Import_Template.xlsx");
  };

  const triggerUpload = (type) => {
      setUploadType(type);
      setUploadDropdownOpen(false);
      fileInputRef.current.click();
  };

  // --- Excel Bulk Import ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const bstr = evt.target.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);

            let parsedTransactions = [];

            // === PARSING LOGICA OP MAAT ===
            if (uploadType === 'degiro') {
                const grouped = {};
                data.forEach(row => {
                    // Zoek de Order Id kolom (soms met spaties achteraan)
                    const orderIdRaw = Object.keys(row).find(k => k.trim().toLowerCase() === 'order id');
                    const orderId = orderIdRaw ? row[orderIdRaw] : null;
                    if (!orderId) return; // Sla momenteel losse dividenden over (alleen BUYS/SELLS verwerkt per request)

                    if (!grouped[orderId]) grouped[orderId] = { fees: 0, taxes: 0, main: null };
                    
                    const desc = String(row['Omschrijving'] || '').toLowerCase();
                    const mutatieKolom = Object.keys(row).find(k => k.trim().toLowerCase() === 'mutatie');
                    const mutatie = parseNumber(row[mutatieKolom]);

                    if (desc.startsWith('koop') || desc.startsWith('verkoop')) {
                        grouped[orderId].main = row;
                        grouped[orderId].type = desc.startsWith('koop') ? 'BUY' : 'SELL';
                        // Haal de Qty en Price uit de tekst "Koop 4 @ 147,54 EUR"
                        const match = desc.match(/(koop|verkoop)\s+([\d,.]+)\s+@\s+([\d,.]+)/i);
                        if (match) {
                            grouped[orderId].qty = parseNumber(match[2]);
                            grouped[orderId].price = parseNumber(match[3]);
                        }
                    } else if (desc.includes('belasting')) {
                        grouped[orderId].taxes += Math.abs(mutatie);
                    } else if (desc.includes('kosten')) {
                        grouped[orderId].fees += Math.abs(mutatie);
                    }
                });

                parsedTransactions = Object.values(grouped).filter(g => g.main).map(g => {
                    const row = g.main;
                    return {
                        ticker: row['Product'] || row['Product '],
                        isin: String(row['ISIN'] || '').trim(),
                        transaction_type: g.type,
                        broker_id: 2, // DeGiro ID
                        quantity: g.qty,
                        price: g.price,
                        purchase_time: parseDeGiroDate(row['Datum'], row['Tijd']),
                        fees: g.fees,
                        taxes: g.taxes,
                        currency: row['FX'] || 'EUR',
                        exchange_rate: 1,
                        _brokerName: 'Degiro'
                    };
                });

            } else if (uploadType === 'etoro') {
                const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('accountactiviteit') || n.toLowerCase().includes('account activity'));
                if (!sheetName) throw new Error("Kon tabblad 'Accountactiviteit' niet vinden in eToro Excel.");
                const etoroData = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
                
                const grouped = {};
                etoroData.forEach(row => {
                    const posId = row['Positie-ID'] || row['Position ID'];
                    if(!posId) return;
                    if(!grouped[posId]) grouped[posId] = { fees: 0, transactions: [] };
                    
                    const typeRaw = String(row['Type'] || '').toLowerCase();
                    const details = String(row['Details'] || '');
                    const amount = parseNumber(row['Bedrag'] || row['Amount']);
                    const units = parseNumber(row['Eenheden'] || row['Units']);

                    // Fallback voor dividenden (soms geen units vermeld in eToro)
                    const actualQty = units > 0 ? units : 1;
                    const actualPrice = units > 0 ? Math.abs(amount) / units : Math.abs(amount);

                    if (typeRaw.includes('openen') || typeRaw.includes('open position')) {
                        grouped[posId].transactions.push({
                            type: 'BUY',
                            ticker: details.split('/')[0].trim(),
                            qty: actualQty,
                            price: actualPrice,
                            date: row['Datum'] || row['Date']
                        });
                    } else if (typeRaw.includes('winst/verlies') || typeRaw.includes('profit/loss') || typeRaw.includes('sluiten')) {
                        grouped[posId].transactions.push({
                            type: 'SELL',
                            ticker: details.split('/')[0].trim(),
                            qty: actualQty,
                            price: actualPrice,
                            date: row['Datum'] || row['Date']
                        });
                    } else if (typeRaw.includes('commissie') || typeRaw.includes('commission') || typeRaw.includes('rollover')) {
                        grouped[posId].fees += Math.abs(amount);
                    } else if (typeRaw.includes('dividend')) {
                        grouped[posId].transactions.push({
                            type: 'DIVIDEND',
                            ticker: details.split('/')[0].trim(),
                            qty: actualQty,
                            price: actualPrice,
                            date: row['Datum'] || row['Date']
                        });
                    }
                });

                parsedTransactions = [];
                Object.values(grouped).forEach(g => {
                    g.transactions.forEach((t, index) => {
                        parsedTransactions.push({
                            ticker: t.ticker,
                            isin: null,
                            transaction_type: t.type,
                            broker_id: 1, // eToro ID
                            quantity: t.qty,
                            price: t.price,
                            purchase_time: parseEtoroDate(t.date),
                            fees: index === 0 ? g.fees : 0, // Kosten enkel aan het 1ste record van deze positie toewijzen
                            taxes: 0,
                            currency: 'USD',
                            exchange_rate: 1,
                            _brokerName: 'Etoro'
                        });
                    });
                });

            } else {
                // Standaard Template Parsing
                parsedTransactions = data.map(row => {
                    const rawBroker = row['Broker'] || row['Platform'] || 'Etoro';
                    let broker_id = 1;
                    if (String(rawBroker).toLowerCase().includes('degiro')) broker_id = 2;
                    else if (String(rawBroker).toLowerCase().includes('saxo')) broker_id = 3;
                    else if (String(rawBroker).toLowerCase().includes('bolero')) broker_id = 4;

                    return {
                        ticker: row['Ticker'] || row['Symbol'] || row['Aandeel'],
                        isin: row['ISIN'],
                        transaction_type: (row['Type'] || row['Action'] || row['Actie'])?.toUpperCase(),
                        broker_id: broker_id,
                        quantity: parseFloat(row['Quantity'] || row['Shares'] || row['Aantal']),
                        price: parseFloat(row['Price'] || row['Cost Per Share'] || row['Prijs']),
                        purchase_time: convertExcelDate(row['Date'] || row['Datum']),
                        fees: parseFloat(row['Fees'] || row['Commissions'] || row['Kosten']) || 0,
                        taxes: parseFloat(row['Taxes'] || row['Belasting'] || row['Belastingen']) || 0,
                        currency: row['Currency'] || row['Valuta'] || 'USD',
                        exchange_rate: parseFloat(row['Exchange Rate'] || row['FX Rate'] || row['Wisselkoers']) || 1,
                        _brokerName: rawBroker
                    };
                });
            }

            // Haal álle transacties van de gebruiker op, ongeacht het geselecteerde tijdsframe in de UI,
            // om een 100% accurate duplicaat check te garanderen.
            let allTransactionsForCheck = rawTransactions;
            try {
                const allTransRes = await http.get(`/portfolio/transactions?userId=${uid}&period=All`);
                allTransactionsForCheck = allTransRes.data;
            } catch (err) {
                console.warn("Kon niet alle transacties ophalen voor duplicaat check", err);
            }

            // === DUPLICAAT CHECK OP DE GEPARSEDE DATA ===
            const mappedTransactions = parsedTransactions.filter(t => (t.ticker || t.isin) && t.transaction_type && !isNaN(t.quantity) && !isNaN(t.price)).map(row => {
                // Lokale Duplicaat Check (Vergelijkt met alle transacties in de database)
                const rowDate = new Date(row.purchase_time).toISOString().split('T')[0];
                
                // Zoek ALLE transacties op dezelfde dag voor dit aandeel
                const dayTransactions = allTransactionsForCheck.filter(t => {
                    const tDate = new Date(t.purchase_time).toISOString().split('T')[0];
                    // Controleer op ISIN indien beschikbaar, anders Ticker
                    const isSameAsset = row.isin ? t.isin === row.isin : t.ticker_symbol === row.ticker;
                    return isSameAsset && tDate === rowDate;
                });

                // Exacte/Mogelijke match (zelfde type, qty en ongeveer zelfde prijs)
                const matchedTransaction = dayTransactions.find(t => 
                    t.transaction_type === row.transaction_type &&
                    Math.abs(t.quantity - row.quantity) < 0.0001 &&
                    Math.abs(t.price - row.price) <= 0.015
                );

                return {
                    ...row,
                    user_id: 1,
                    _isDuplicate: !!matchedTransaction, // Interne flag voor weergave
                    _duplicateMatch: matchedTransaction, // Bewaar de originele transactie
                    _dayReferences: dayTransactions, // Bewaar referentietransacties van die dag
                    _selected: !matchedTransaction    // Vink standaard af als het een duplicaat is
                };
            });

            // Toon het review scherm in plaats van direct door te sturen
            setImportPreviewData(mappedTransactions);
            setShowImportReviewModal(true);
            
        } catch (error) {
            console.error(error);
            alert("Fout bij het inlezen van Excel bestand. Controleer de kolomnamen.");
        }
        fileInputRef.current.value = ""; // Reset de input
    };
    reader.readAsBinaryString(file);
  };

  const convertExcelDate = (excelDate) => {
      if (!excelDate) return new Date().toISOString();
      // Als Excel datum een numerieke format (serial) is
      if (typeof excelDate === 'number') return new Date(Math.round((excelDate - 25569) * 86400 * 1000)).toISOString();
      // Anders JS dit laten proberen te converteren
      return new Date(excelDate).toISOString();
  };

  const toggleImportRow = (index) => {
      const newData = [...importPreviewData];
      newData[index]._selected = !newData[index]._selected;
      setImportPreviewData(newData);
  };

  const confirmImport = async () => {
      const dataToImport = importPreviewData.filter(t => t._selected);
      if (dataToImport.length === 0) {
          alert("Geen transacties geselecteerd om te importeren.");
          return;
      }
      
      const earliestDate = dataToImport.reduce((min, t) => {
         const d = new Date(t.purchase_time);
         return d < min ? d : min;
      }, new Date());

      const res = await http.post('/portfolio/addMultipleTransactions', { transactions: dataToImport });
      alert(res.data.message);
      setShowImportReviewModal(false);
      fetchPortfolioData();
      handleRecalculateHistory(true, earliestDate.toISOString().split('T')[0]); // Automatische herberekening op de achtergrond starten
  };

  // --- Configuratie Donut Chart (Asset Allocation) ---
  const sortedForDonut = [...filteredHoldings].sort((a, b) => b.value - a.value);
  const donutData = {
    labels: sortedForDonut.map(h => h.ticker),
    datasets: [
      {
        data: sortedForDonut.map(h => h.value),
        backgroundColor: ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#4f46e5', '#0d9488', '#ea580c', '#0891b2', '#0284c7', '#475569'],
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 10,
      },
    ],
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '80%', // Iets dunnere donut voor modernere look
    plugins: {
      legend: { display: false }, // Verbergen we om zelf een strakkere lijst ernaast te kunnen maken, of we laten hem weg voor clean look
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (context) => {
            if (isIncognito) return ' ••••••';
            const value = context.raw;
            return ` ${formatCurrency(value)}`;
          }
        }
      }
    },
  };

  // --- Configuratie Lijngrafiek (Portfolio Performance) ---
  const lineData = useMemo(() => {
    const labels = history.map(h => new Date(h.date).toLocaleDateString('nl-BE'));
    const datasets = [];

    if (chartView === 'value') {
      datasets.push({
        label: 'Portfolio Value',
        data: history.map(h => h.total_value),
        borderColor: '#2563eb', // Dieper blauw zoals Snowball
        backgroundColor: 'rgba(37, 99, 235, 0.05)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.1 // Minder curve, strakkere "finance" look
      });
    } else { // chartView === 'rendement'
      datasets.push({
        label: 'Asset XIRR',
        data: history.map(h => (isFinite(h.asset_xirr) ? h.asset_xirr * 100 : null)), 
        borderColor: '#059669', 
        backgroundColor: 'rgba(5, 150, 105, 0.05)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false,
        tension: 0.1
      });
      datasets.push({
        label: 'Account XIRR',
        data: history.map(h => (isFinite(h.account_xirr) ? h.account_xirr * 100 : null)), 
        borderColor: '#d97706', 
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false,
        tension: 0.1
      });
    }

    if (showTransOnChart) {
      const transData = history.map(h => {
         const tDateStr = new Date(h.date).toLocaleDateString('nl-BE');
         const dayTrans = filteredTransactions.filter(t => new Date(t.purchase_time).toLocaleDateString('nl-BE') === tDateStr && ['BUY', 'SELL', 'DIVIDEND'].includes(t.transaction_type));
         
         if (dayTrans.length > 0) {
             return chartView === 'value' ? h.total_value : (h.asset_xirr * 100);
         }
         return null;
      });

      datasets.push({
          type: 'line',
          label: 'Transactions',
          data: transData,
          showLine: false,
          pointBackgroundColor: history.map(h => {
             const tDateStr = new Date(h.date).toLocaleDateString('nl-BE');
             const dayTrans = filteredTransactions.filter(t => new Date(t.purchase_time).toLocaleDateString('nl-BE') === tDateStr && ['BUY', 'SELL', 'DIVIDEND'].includes(t.transaction_type));
             if (dayTrans.length > 0) {
                 if (dayTrans.some(t => t.transaction_type === 'BUY')) return '#10B981'; // Groen voor Buy
                 if (dayTrans.some(t => t.transaction_type === 'SELL')) return '#EF4444'; // Rood voor Sell
                 return '#3B82F6'; // Blauw voor dividend
             }
             return 'transparent';
          }),
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointHitRadius: 10
      });
    }

    return { labels, datasets };
  }, [history, chartView, showTransOnChart, filteredTransactions]);

  const lineOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const dataIndex = elements[0].index;
        const clickedRawDate = history[dataIndex].date;
        const endDate = new Date(clickedRawDate);
        const startDate = new Date(endDate);
        startDate.setFullYear(startDate.getFullYear() - 1);
        
        setCustomEndDate(endDate.toISOString().split('T')[0]);
        setCustomStartDate(startDate.toISOString().split('T')[0]);
        setChartPeriod('Custom');
      }
    },
    plugins: { 
      legend: { display: false }, // Snowball verbergt standaard de chart.js legend voor clean look
      tooltip: { 
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleFont: { size: 13, family: 'Inter, sans-serif', weight: 'normal', color: '#9CA3AF' },
        bodyFont: { size: 14, family: 'Inter, sans-serif', weight: 'bold' },
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
        mode: 'index', 
        intersect: false, 
        callbacks: { 
          title: (items) => { return items[0].label; },
          label: (context) => {
            if (isIncognito) return '••••••';
            if (context.dataset.label === 'Transactions') {
               const h = history[context.dataIndex];
               const tDateStr = new Date(h.date).toLocaleDateString('nl-BE');
               const dayTrans = filteredTransactions.filter(t => new Date(t.purchase_time).toLocaleDateString('nl-BE') === tDateStr && ['BUY', 'SELL', 'DIVIDEND'].includes(t.transaction_type));
               if (dayTrans.length === 0) return null;
               
               const grouped = {};
               dayTrans.forEach(t => {
                   const key = `${t.transaction_type}_${t.ticker_symbol || 'Asset'}`;
                   if (!grouped[key]) {
                       grouped[key] = { type: t.transaction_type, ticker: t.ticker_symbol || 'Asset', totalValue: 0, totalQty: 0 };
                   }
                   grouped[key].totalValue += (t.quantity * t.price);
                   grouped[key].totalQty += t.quantity;
               });

               return Object.values(grouped).map(g => `${g.type} ${g.ticker}: ${formatCurrency(g.totalValue)}`);
            }
            return chartView === 'value' 
              ? `${formatCurrency(context.raw)}` 
              : `${context.raw?.toFixed(2)}%`; 
          } 
        } 
      } 
    },
    scales: { 
      x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 8, font: { family: 'Inter, sans-serif' }, color: '#9CA3AF' } }, 
      y: { grid: { color: '#F3F4F6' }, border: { display: false }, ticks: { font: { family: 'Inter, sans-serif' }, color: '#9CA3AF', callback: (value) => isIncognito ? '•••' : (chartView === 'value' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 3, notation: "compact", compactDisplay: "short" }).format(value) : `${value}%`) } } 
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
    hover: { mode: 'nearest', intersect: true }
  }), [chartView, history, showTransOnChart, filteredTransactions]);

  // --- Tab Configuratie (Snowball Stijl) ---
  const TABS = [
    { id: 'common', label: 'Common', icon: 'ph-chart-pie' },
    { id: 'diversification', label: 'Diversification', icon: 'ph-chart-polar' },
    { id: 'dividends', label: 'Dividends', icon: 'ph-money' },
    { id: 'growth', label: 'Growth', icon: 'ph-trend-up' },
    { id: 'metrics', label: 'Metrics', icon: 'ph-sliders' },
    { id: 'transactions', label: 'Transactions', icon: 'ph-list-dashes' },
    { id: 'income', label: 'Income', icon: 'ph-wallet' },
    { id: 'taxes', label: 'Taxes', icon: 'ph-wallet' }
  ];

  // Lokale filter logica voor de timeframes op de Growth tab (zonder API calls)
  const filterHistoryLocally = (hist, period, start, end) => {
    if (!hist || hist.length === 0) return [];
    if (period === 'All') return hist;
    
    let startDateStr = '';
    let endDateStr = new Date().toISOString().split('T')[0];

    if (period === 'Custom') {
        if (start && end && start.length === 10 && end.length === 10 && new Date(start) <= new Date(end)) {
            startDateStr = start;
            endDateStr = end;
        } else {
            return []; // Toon geen data totdat de custom dates correct zijn ingevuld
        }
    } else {
        const { start: s, end: e } = calculateDatesForPeriod(period);
        startDateStr = s;
        endDateStr = e;
    }
    return hist.filter(h => h.date >= startDateStr && h.date <= endDateStr);
  };

  const filteredHistVal = useMemo(() => filterHistoryLocally(history, valPeriod, valStart, valEnd), [history, valPeriod, valStart, valEnd]);
  const filteredHistPerf = useMemo(() => filterHistoryLocally(history, perfPeriod, perfStart, perfEnd), [history, perfPeriod, perfStart, perfEnd]);

  // Reusable Timeframe Selector per Grafiek
  const renderTimeframeSelector = (period, setPeriod, customStart, setCustomStart, customEnd, setCustomEnd) => (
    <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
      {['1W', '1M', 'YTD', '1Y', 'All', 'Custom'].map(p => (
        <button
          key={p}
          onClick={() => {
            if (p === 'Custom' && period !== 'Custom') {
              const { start, end } = calculateDatesForPeriod(period === 'Custom' ? '1Y' : period);
              setCustomStart(start);
              setCustomEnd(end);
            }
            setPeriod(p);
          }}
          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {p}
        </button>
      ))}
      {period === 'Custom' && (
        <div className="flex items-center bg-white border border-gray-300 rounded-md overflow-hidden ml-1 h-[28px]">
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="px-2 py-1 text-xs font-semibold border-none outline-none focus:ring-0 bg-transparent text-gray-700 cursor-pointer" />
          <span className="text-gray-300 font-medium px-1">→</span>
          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="px-2 py-1 text-xs font-semibold border-none outline-none focus:ring-0 bg-transparent text-gray-700 cursor-pointer" />
        </div>
      )}
    </div>
  );

  // --- Growth Tab Chart Logica ---
  const growthChart1Data = useMemo(() => {
    const labels = filteredHistVal.map(h => new Date(h.date).toLocaleDateString('nl-BE'));
    const datasets = [];

    datasets.push({
        label: 'Portfolio Value',
        data: filteredHistVal.map(h => h.total_value),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        borderWidth: 2,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.1
    });

    if (growthShowCostBasis) {
        datasets.push({
            label: 'Cost Basis',
            data: filteredHistVal.map(h => h.net_invested),
            borderColor: '#9CA3AF',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.1
        });
    }

    if (growthShowTrades) {
        const transData = filteredHistVal.map(h => {
            const tDateStr = new Date(h.date).toLocaleDateString('nl-BE');
            const dayTrans = filteredTransactions.filter(t => new Date(t.purchase_time).toLocaleDateString('nl-BE') === tDateStr && ['BUY', 'SELL', 'DIVIDEND'].includes(t.transaction_type));
            return dayTrans.length > 0 ? h.total_value : null;
        });

        datasets.push({
            type: 'line',
            label: 'Trades',
            data: transData,
            showLine: false,
            pointBackgroundColor: filteredHistVal.map(h => {
                const tDateStr = new Date(h.date).toLocaleDateString('nl-BE');
                const dayTrans = filteredTransactions.filter(t => new Date(t.purchase_time).toLocaleDateString('nl-BE') === tDateStr && ['BUY', 'SELL', 'DIVIDEND'].includes(t.transaction_type));
                if (dayTrans.length > 0) {
                    if (dayTrans.some(t => t.transaction_type === 'BUY')) return '#10B981';
                    if (dayTrans.some(t => t.transaction_type === 'SELL')) return '#EF4444';
                    return '#3B82F6';
                }
                return 'transparent';
            }),
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8
        });
    }

    return { labels, datasets };
  }, [filteredHistVal, growthShowCostBasis, growthShowTrades, filteredTransactions]);

  const growthChart1Options = useMemo(() => ({
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => isIncognito ? '••••••' : `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` } }
      },
      scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { family: 'Inter, sans-serif' }, color: '#9CA3AF' }, border: { display: false } },
          y: { grid: { color: '#F3F4F6' }, border: { display: false }, ticks: { font: { family: 'Inter, sans-serif' }, color: '#9CA3AF', callback: (val) => isIncognito ? '•••' : new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency, maximumSignificantDigits: 3, notation: "compact", compactDisplay: "short" }).format(val) } }
      }
  }), [displayCurrency]);

  const growthChart2Data = useMemo(() => {
      const labels = filteredHistPerf.map(h => new Date(h.date).toLocaleDateString('nl-BE'));
      const datasets = [];

      const baselineGain = filteredHistPerf.length > 0 ? (filteredHistPerf[0].total_value - filteredHistPerf[0].net_invested) : 0;
      const baselineDivs = filteredHistPerf.length > 0 ? filteredHistPerf[0].cumulative_dividends : 0;
      const baselineValue = filteredHistPerf.length > 0 ? (filteredHistPerf[0].total_value || 1) : 1;

      const perfData = filteredHistPerf.map((h) => {
          const capitalGainAllTime = h.total_value - h.net_invested;
          const dividendsAllTime = h.cumulative_dividends;
          
          let cg = capitalGainAllTime;
          let div = dividendsAllTime;

          if (growthPerfCalcFor === 'period') {
              cg = capitalGainAllTime - baselineGain;
              div = dividendsAllTime - baselineDivs;
          }

          if (growthPerfType === 'percent') {
              if (growthPerfCalcFor === 'period') {
                  cg = (cg / baselineValue) * 100;
                  div = (div / baselineValue) * 100;
              } else {
                  const invested = h.net_invested || 1;
                  cg = (cg / invested) * 100;
                  div = (div / invested) * 100;
              }
          }

          return { capitalGain: cg, dividends: div, totalProfit: cg + div };
      });

      if (growthPerfGroupBySource) {
          datasets.push({ label: 'Capital Gain', data: perfData.map(d => d.capitalGain), borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 2, fill: true, pointRadius: 0, pointHoverRadius: 4, tension: 0.1 });
          datasets.push({ label: 'Dividends', data: perfData.map(d => d.dividends), borderColor: '#8B5CF6', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderWidth: 2, fill: true, pointRadius: 0, pointHoverRadius: 4, tension: 0.1 });
      } else {
          datasets.push({ label: 'Total Profit', data: perfData.map(d => d.totalProfit), borderColor: '#3B82F6', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 2, fill: true, pointRadius: 0, pointHoverRadius: 4, tension: 0.1 });
      }

      return { labels, datasets };
  }, [filteredHistPerf, growthPerfCalcFor, growthPerfType, growthPerfGroupBySource]);

  const growthChart2Options = useMemo(() => ({
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${growthPerfType === 'value' ? formatCurrency(ctx.raw) : ctx.raw.toFixed(2) + '%'}` } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { family: 'Inter, sans-serif' }, color: '#9CA3AF' }, border: { display: false } }, y: { grid: { color: '#F3F4F6' }, border: { display: false }, ticks: { font: { family: 'Inter, sans-serif' }, color: '#9CA3AF', callback: (val) => growthPerfType === 'value' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency, maximumSignificantDigits: 3, notation: "compact", compactDisplay: "short" }).format(val) : `${val}%` } } }
  }), [growthPerfType, displayCurrency]);

  const dynamicsChartData = useMemo(() => {
      const labels = dynamicsData.map(d => d.period);
      const data = dynamicsData.map(d => dynamicsDisplay === 'percent' ? d.returnPercent : d.returnValue);
      
      return {
          labels,
          datasets: [{
              label: 'Return',
              data,
              backgroundColor: data.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)'),
              borderColor: data.map(v => v >= 0 ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)'),
              borderWidth: 1,
          }]
      };
  }, [dynamicsData, dynamicsDisplay]);

  const dynamicsChartOptions = useMemo(() => ({
      responsive: true, maintainAspectRatio: false,
      plugins: {
          legend: { display: false },
          tooltip: {
              callbacks: {
                  label: (ctx) => {
                      const value = ctx.raw;
                      return dynamicsDisplay === 'percent' ? `${value.toFixed(2)}%` : formatCurrency(value);
                  }
              }
          }
      },
      scales: {
          x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
          y: {
              grid: { color: '#F3F4F6' },
              ticks: {
                  callback: (val) => dynamicsDisplay === 'percent' ? `${val.toFixed(0)}%` : new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency, notation: "compact", compactDisplay: "short" }).format(val)
              }
          }
      }
  }), [dynamicsDisplay, displayCurrency]);

  // --- Dividends Tab Logica ---
  const dividendTransactions = useMemo(() => {
    return filteredTransactions.filter(t => t.transaction_type === 'DIVIDEND');
  }, [filteredTransactions]);

  const filteredDivs = useMemo(() => {
    if (!dividendTransactions || dividendTransactions.length === 0) return [];
    if (divTimeframe === 'All') return dividendTransactions;
    
    let startDateStr = '';
    let endDateStr = new Date().toISOString().split('T')[0];

    if (divTimeframe === 'Custom') {
        if (divStart && divEnd && divStart.length === 10 && divEnd.length === 10 && new Date(divStart) <= new Date(divEnd)) {
            startDateStr = divStart;
            endDateStr = divEnd;
        } else {
            return []; 
        }
    } else {
        const { start: s, end: e } = calculateDatesForPeriod(divTimeframe);
        startDateStr = s;
        endDateStr = e;
    }
    return dividendTransactions.filter(d => {
        const dDate = new Date(d.purchase_time).toISOString().split('T')[0];
        return dDate >= startDateStr && dDate <= endDateStr;
    });
  }, [dividendTransactions, divTimeframe, divStart, divEnd]);

  const divChartData = useMemo(() => {
    const grouped = {};
    filteredDivs.forEach(d => {
      const date = new Date(d.purchase_time);
      let key = '';
      if (divGrouping === 'monthly') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (divGrouping === 'annually') {
        key = `${date.getFullYear()}`;
      } else if (divGrouping === 'quarterly') {
        const q = Math.floor(date.getMonth() / 3) + 1;
        key = `${date.getFullYear()}-Q${q}`;
      }
      
      if (!grouped[key]) grouped[key] = 0;
      grouped[key] += (d.quantity * d.price) - (d.taxes || 0); // Netto dividend
    });

    const sortedKeys = Object.keys(grouped).sort();
    const data = sortedKeys.map(k => grouped[k]);

    return {
      labels: sortedKeys,
      datasets: [{ label: 'Net Dividends', data: data, backgroundColor: 'rgba(139, 92, 246, 0.8)', borderColor: 'rgb(139, 92, 246)', borderWidth: 1, borderRadius: 4 }]
    };
  }, [filteredDivs, divGrouping]);

  const divChartOptions = useMemo(() => ({
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `Netto Dividend: ${formatCurrency(ctx.raw)}` } } },
      scales: { x: { grid: { display: false }, ticks: { font: { family: 'Inter, sans-serif' }, color: '#9CA3AF' } }, y: { grid: { color: '#F3F4F6' }, border: { display: false }, ticks: { font: { family: 'Inter, sans-serif' }, color: '#9CA3AF', callback: (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency, notation: "compact", compactDisplay: "short" }).format(val) } } }
  }), [displayCurrency]);

  const totalDivsPeriod = useMemo(() => filteredDivs.reduce((sum, d) => sum + ((d.quantity * d.price) - (d.taxes || 0)), 0), [filteredDivs]);
  const divByAssetData = useMemo(() => {
    const grouped = {};
    filteredDivs.forEach(d => {
      const ticker = d.ticker_symbol || `ID: ${d.aandeel_id}`;
      if (!grouped[ticker]) grouped[ticker] = { ticker, totalGross: 0, totalNet: 0, totalTaxes: 0, count: 0 };
      const gross = d.quantity * d.price;
      const tax = d.taxes || 0;
      grouped[ticker].totalGross += gross;
      grouped[ticker].totalTaxes += tax;
      grouped[ticker].totalNet += (gross - tax);
      grouped[ticker].count += 1;
    });
    return Object.values(grouped).sort((a, b) => b.totalNet - a.totalNet);
  }, [filteredDivs]);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-gray-50/50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <div className="space-y-8 font-sans text-gray-900 bg-gray-50/50 min-h-screen">
      {/* Top Card: Hero Header + Tabs (Snowball Stijl) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 pb-0">
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6 mb-6">
        <div>
          <h1 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Mijn Portfolio</h1>
          <div className="flex flex-wrap items-baseline gap-4">
            <span className="text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tighter privacy-blur">
              {formatCurrency(latestPortfolioData?.total_value)}
            </span>
            <span className={`text-xl font-bold tracking-tight privacy-blur ${periodStats.periodProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {periodStats.periodProfit >= 0 ? '+' : ''}{formatCurrency(periodStats.periodProfit)} 
              <span className="text-sm font-medium text-gray-400 ml-2 bg-white px-2 py-1 rounded-md border border-gray-200">({chartPeriod})</span>
            </span>
          </div>
        </div>

        {/* Top Actieknoppen */}
        {!isDemo && (
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            <button onClick={handleDownloadTemplate} className="text-sm font-semibold flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
              <i className="ph ph-download-simple mr-2 text-lg"></i> Template
            </button>
            
            {/* Upload Transacties Dropdown */}
            <div className="relative inline-block text-left">
              <button onClick={() => setUploadDropdownOpen(!uploadDropdownOpen)} className="text-sm font-semibold flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
                <i className="ph ph-upload-simple mr-2 text-lg"></i> Upload <span className="ml-2 text-[10px] text-gray-400">▼</span>
              </button>
              {uploadDropdownOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-xl shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50 overflow-hidden">
                  <div className="py-1" role="menu">
                    <button onClick={() => triggerUpload('template')} className="block w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 font-medium">Standaard Excel Template</button>
                    <div className="border-t border-gray-100"></div>
                    <button onClick={() => triggerUpload('etoro')} className="block w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 font-medium">eToro Afschrift</button>
                    <button onClick={() => triggerUpload('degiro')} className="block w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 font-medium">DeGiro Afschrift</button>
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => setIsAddModalOpen(true)} className="text-sm font-bold flex items-center bg-blue-600 text-white px-5 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
              <i className="ph-fill ph-plus-circle mr-2 text-xl"></i> Transactie
            </button>

            {/* Extra functies als iconen om de header rustig te houden */}
            <div className="flex bg-white rounded-lg border border-gray-300 shadow-sm p-1 ml-2">
              <button 
                onClick={() => handleRecalculateHistory(false)} 
                disabled={isRecalculating}
                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
              title="Snel Herberekenen (Laatste dagen)">
                <i className={`ph-fill ph-calculator text-xl ${isRecalculating ? 'animate-pulse text-blue-600' : ''}`}></i>
              </button>
              <button 
                onClick={() => handleRecalculateHistory(false, '1970-01-01')} 
                disabled={isRecalculating || isRepairing}
                className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors disabled:opacity-50"
                title="Volledige Historie Herberekenen (Vanaf de eerste transactie)">
                <i className={`ph-fill ph-clock-counter-clockwise text-xl ${isRecalculating ? 'animate-pulse text-purple-600' : ''}`}></i>
              </button>
              <button 
                onClick={handleCheckAndRepairPrices} 
                disabled={isRepairing || isRecalculating}
                className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-colors disabled:opacity-50"
                title="Controleer Prijsdata">
                <i className={`ph-fill ph-wrench text-xl ${isRepairing ? 'animate-spin text-orange-600' : ''}`}></i>
              </button>
              <button 
                onClick={handleUpdateExchangeRates} 
                disabled={isRepairing || isRecalculating}
                className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors disabled:opacity-50"
                title="Haal EUR/USD Historie op (10 Jaar)">
                <i className={`ph-fill ph-currency-dollar text-xl ${isRecalculating ? 'animate-pulse text-green-600' : ''}`}></i>
              </button>
              <button onClick={fetchPortfolioData} className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors" title="Refresh">
                <i className="ph-fill ph-arrows-clockwise text-xl"></i>
              </button>
            </div>
          </div>
        )}
          </div>

          {/* Tab Navigatie */}
          <nav className="flex space-x-6 overflow-x-auto hide-scrollbar" aria-label="Tabs">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                  activeTab === tab.id 
                    ? 'border-blue-600 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className={`ph-fill ${tab.icon} text-lg`}></i>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* --- GLOBAL CONTROL BAR (Alleen tonen op relevante tabs) --- */}
      {['common', 'diversification', 'transactions', 'dividends'].includes(activeTab) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col lg:flex-row justify-between items-center p-1.5 mb-6">
          
          {/* 1. Asset Types (Crypto, ETF, Stock, etc) */}
          <div className="flex overflow-x-auto w-full lg:w-auto hide-scrollbar">
            <button onClick={() => setSelectedTypes([])} className={`whitespace-nowrap px-5 py-2 rounded-lg text-sm font-semibold transition-all ${selectedTypes.length === 0 ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              Overview
            </button>
            {availableAssetTypes.map(type => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`whitespace-nowrap px-5 py-2 rounded-lg text-sm font-semibold transition-all ${selectedTypes.includes(type) ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* 2. Tijdsframes & Weergave (Waarde vs Rendement) */}
          <div className="flex items-center gap-2 p-1 w-full lg:w-auto overflow-x-auto hide-scrollbar">
                      
            {/* Currency Toggle */}
            <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
              <button type="button" onClick={() => setDisplayCurrency('USD')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${displayCurrency === 'USD' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                USD ($)
              </button>
              <button type="button" onClick={() => setDisplayCurrency('EUR')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${displayCurrency === 'EUR' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                EUR (€)
              </button>
            </div>
            {/* View Toggle */}
            <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
              <button type="button" onClick={() => setChartView('value')}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${chartView === 'value' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Waarde
              </button>
              <button type="button" onClick={() => setChartView('rendement')}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${chartView === 'rendement' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Rendement
              </button>
            </div>

            {/* Timeframes */}
            <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
              {['1W', '1M', 'YTD', '1Y', 'All', 'Custom'].map(p => (
                <button
                  key={p}
                  onClick={() => handlePeriodChange(p)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${chartPeriod === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {p}
                </button>
              ))}
            </div>
            {chartPeriod === 'Custom' && (
              <div className="flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden transition-all focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 h-[32px]">
                <input 
                  type="date" 
                  value={customStartDate} 
                  onChange={(e) => setCustomStartDate(e.target.value)} 
                  className="px-2 py-1 text-xs font-semibold border-none outline-none focus:ring-0 bg-transparent text-gray-700 cursor-pointer" 
                />
                <span className="text-gray-300 font-medium px-1">→</span>
                <input 
                  type="date" 
                  value={customEndDate} 
                  onChange={(e) => setCustomEndDate(e.target.value)} 
                  className="px-2 py-1 text-xs font-semibold border-none outline-none focus:ring-0 bg-transparent text-gray-700 cursor-pointer" 
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: COMMON --- */}
      {activeTab === 'common' && (
        <div className="space-y-6">
          {/* Performance Chart */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[500px]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-gray-900">Portfolio Performance</h3>
            <div className="flex items-center space-x-3">
              <label className="flex items-center cursor-pointer text-xs font-bold text-gray-500 uppercase tracking-wide bg-gray-50 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <input 
                  type="checkbox" 
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  checked={showTransOnChart}
                  onChange={(e) => setShowTransOnChart(e.target.checked)}
                />
                Toon Transacties
              </label>
            </div>
          </div>
          <div className={`flex-grow relative min-h-0 ${chartView === 'value' ? 'incognito-hide' : ''}`}>
            {history.length > 0 ? (
              <Line data={lineData} options={lineOptions} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                <i className="ph-fill ph-chart-line-up text-4xl mb-2 opacity-30"></i>
                Bereken eerst je portfolio waarden
              </div>
            )}
          </div>
          {chartView === 'value' && (
            <div className="incognito-show flex-col items-center justify-center h-full text-gray-400 text-sm">
              <i className="ph-fill ph-eye-slash text-4xl mb-2 opacity-30"></i>
              Waardegrafiek verborgen in privacymodus
            </div>
          )}
        </div>

          {/* Holdings Tabel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-center p-6 border-b border-gray-100">
              <div className="flex items-center gap-4 mb-4 sm:mb-0">
                <h3 className="text-lg font-bold text-gray-900">Holdings</h3>
                <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full">{processedHoldings.length} Assets</span>
              </div>
              <div className="relative">
                <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input 
                  type="text" 
                  placeholder="Zoek in holdings..." 
                  value={holdingsSearch} 
                  onChange={(e) => setHoldingsSearch(e.target.value)} 
                  className="pl-9 pr-4 py-2 bg-gray-50 border-none rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64 transition-all"
                />
              </div>
            </div>
          
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" onClick={() => handleHoldingsSort('ticker')}>Asset{getSortIcon(holdingsSort, 'ticker')}</th>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('price')}>Prijs{getSortIcon(holdingsSort, 'price')}</th>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('quantity')}>Holdings{getSortIcon(holdingsSort, 'quantity')}</th>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('total_invested')}>Cost Basis{getSortIcon(holdingsSort, 'total_invested')}</th>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('gainLoss')}>Winst / Verlies{getSortIcon(holdingsSort, 'gainLoss')}</th>
                  </tr>
                </thead>
                <tbody>
                 {processedHoldings.map((holding) => (
                    <tr key={holding.ticker} className="hover:bg-gray-50/80 transition-colors group">
                      <td className="px-6 py-4 border-b border-gray-100">
                        <div 
                          className="flex flex-col cursor-pointer group-hover:bg-gray-100 p-1 -ml-1 rounded transition-colors"
                          onClick={() => navigate(`/analysis?ticker=${holding.ticker}`)}
                          title="Bekijk analyse voor dit aandeel"
                        >
                          <span className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors">{holding.ticker}</span>
                          <span className="text-xs font-medium text-gray-500 truncate max-w-[200px]" title={holding.name}>{holding.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 border-b border-gray-100 text-right">
                        <span className="text-sm font-semibold text-gray-800 privacy-blur">{formatCurrency(holding.price)}</span>
                      </td>
                      <td className="px-6 py-4 border-b border-gray-100 text-right">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-gray-800 privacy-blur">{formatCurrency(holding.value)}</span>
                          <span className="text-xs font-medium text-gray-500 privacy-blur">{parseFloat(holding.quantity).toFixed(4)} stuks</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 border-b border-gray-100 text-right">
                        <span className="text-sm font-semibold text-gray-800 privacy-blur">{formatCurrency(holding.total_invested)}</span>
                      </td>
                      <td className="px-6 py-4 border-b border-gray-100 text-right">
                        <div className="flex flex-col items-end">
                          <span className={`text-sm font-bold privacy-blur ${holding.gainLoss >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {holding.gainLoss >= 0 ? '+' : ''}{formatCurrency(holding.gainLoss)}
                          </span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md mt-1 ${holding.gainLoss >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {formatPercentage(holding.total_invested > 0 ? (holding.gainLoss / holding.total_invested) * 100 : 0)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                 {processedHoldings.length === 0 && (
                    <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">Geen holdings gevonden voor de huidige filter.</td></tr>
                 )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: DIVERSIFICATION --- */}
      {activeTab === 'diversification' && (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center h-[550px]">
          <div className="lg:col-span-2 relative h-full w-full min-h-0">
            {filteredHoldings.length > 0 ? (
              <Doughnut data={donutData} options={donutOptions} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                 <i className="ph-fill ph-chart-donut text-4xl mb-2 opacity-30"></i> Geen allocatiedata
              </div>
            )}
          </div>
          <div className="lg:col-span-1 h-full overflow-y-auto hide-scrollbar pl-4 border-l border-gray-100">
             <h3 className="text-base font-bold text-gray-900 mb-6">Allocatie Verdeling</h3>
             {filteredHoldings.length > 0 && donutData.labels.map((label, idx) => {
               const val = donutData.datasets[0].data[idx];
               const pct = ((val / donutData.datasets[0].data.reduce((a,b)=>a+b,0))*100).toFixed(1);
               return (
                 <div key={label} className="flex justify-between items-center text-sm py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full shadow-sm" style={{backgroundColor: donutData.datasets[0].backgroundColor[idx]}}></span>
                      <span className="font-bold text-gray-800">{label}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-semibold text-gray-900">{pct}%</span>
                      <span className="text-xs text-gray-400 privacy-blur">{formatCurrency(val)}</span>
                    </div>
                 </div>
               )
             })}
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: TRANSACTIONS --- */}
      {activeTab === 'transactions' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-center p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4 sm:mb-0">Transactie Historiek</h3>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={transTypeFilter}
                  onChange={(e) => setTransTypeFilter(e.target.value)}
                  className="px-3 py-2 bg-gray-50 border-none rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Alle Types</option>
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                  <option value="DIVIDEND">DIVIDEND</option>
                  <option value="DEPOSIT">DEPOSIT</option>
                  <option value="WITHDRAWAL">WITHDRAWAL</option>
                </select>
                <div className="relative flex-grow sm:flex-grow-0">
                  <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                  <input 
                    type="text" 
                    placeholder="Zoek transactie..." 
                    value={transSearch} 
                    onChange={(e) => setTransSearch(e.target.value)} 
                    className="pl-9 pr-4 py-2 bg-gray-50 border-none rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                  />
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                 <tr>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" onClick={() => handleTransSort('purchase_time')}>Datum{getSortIcon(transSort, 'purchase_time')}</th>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" onClick={() => handleTransSort('transaction_type')}>Type{getSortIcon(transSort, 'transaction_type')}</th>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" onClick={() => handleTransSort('ticker_symbol')}>Asset{getSortIcon(transSort, 'ticker_symbol')}</th>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right" onClick={() => handleTransSort('quantity')}>Aantal{getSortIcon(transSort, 'quantity')}</th>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right" onClick={() => handleTransSort('price')}>Prijs{getSortIcon(transSort, 'price')}</th>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right" onClick={() => handleTransSort('total_value')}>Totaal{getSortIcon(transSort, 'total_value')}</th>
                    {!isDemo && <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Acties</th>}
                  </tr>
                </thead>
                <tbody>
                 {currentTransactions.map((t, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/80 transition-colors border-b border-gray-100">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600">{new Date(t.purchase_time).toLocaleDateString('nl-BE')}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 inline-flex text-xs font-bold rounded-md ${
                          t.transaction_type === 'BUY' ? 'bg-emerald-50 text-emerald-600' :
                          t.transaction_type === 'SELL' ? 'bg-rose-50 text-rose-600' :
                          t.transaction_type === 'DEPOSIT' ? 'bg-blue-50 text-blue-600' :
                          t.transaction_type === 'WITHDRAWAL' ? 'bg-purple-50 text-purple-600' :
                          'bg-gray-100 text-gray-600'
                       }`}>
                         {t.transaction_type}
                       </span>
                     </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-800">
                        {['DEPOSIT', 'WITHDRAWAL'].includes(t.transaction_type) ? (
                            <span className="text-gray-400 font-medium">CASH</span>
                        ) : (
                            <span 
                                className="cursor-pointer text-blue-600 hover:text-blue-800 transition-colors hover:underline"
                                onClick={() => navigate(`/analysis?ticker=${t.ticker_symbol}`)}
                                title="Bekijk analyse voor dit aandeel"
                            >
                                {t.ticker_symbol || `ID: ${t.aandeel_id}`}
                            </span>
                        )}
                     </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600 text-right privacy-blur">{t.quantity}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600 text-right privacy-blur">{formatCurrency(t.price)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-800 text-right privacy-blur">{formatCurrency(t.quantity * t.price)}</td>
                      {!isDemo && (
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button onClick={() => { setTransactionToEdit(t); setIsEditModalOpen(true); }} className="text-gray-400 hover:text-blue-600 transition-colors focus:outline-none mr-3" title="Bewerken">
                            <i className="ph-fill ph-pencil-simple text-lg"></i>
                          </button>
                          <button onClick={() => setTransactionToDelete(t)} className="text-gray-400 hover:text-rose-600 transition-colors focus:outline-none" title="Verwijderen">
                            <i className="ph-fill ph-trash text-lg"></i>
                          </button>
                        </td>
                      )}
                   </tr>
                 ))}
                 {processedTransactions.length === 0 && (
                    <tr><td colSpan="7" className="px-6 py-8 text-center text-sm text-gray-500">Geen transacties gevonden voor de huidige filter.</td></tr>
                 )}
                </tbody>
              </table>
            </div>

            {/* Paginatie Navigatie */}
            {processedTransactions.length > 0 && (
              <div className="flex justify-between items-center p-4 border-t border-gray-100 bg-gray-50 text-sm text-gray-500 font-medium">
                <div>
                  Toont {(transCurrentPage - 1) * transPerPage + 1} tot {Math.min(transCurrentPage * transPerPage, processedTransactions.length)} van de {processedTransactions.length} transacties
                </div>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setTransCurrentPage(p => Math.max(1, p - 1))} 
                    disabled={transCurrentPage === 1}
                    className="px-3 py-1 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
                  >Vorige</button>
                  <span className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md">P {transCurrentPage} / {totalTransPages}</span>
                  <button 
                    onClick={() => setTransCurrentPage(p => Math.min(totalTransPages, p + 1))} 
                    disabled={transCurrentPage === totalTransPages}
                    className="px-3 py-1 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
                  >Volgende</button>
                </div>
              </div>
            )}
          </div>

          {/* Mogelijke Duplicaten Sectie */}
          {potentialDuplicates.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 p-6 rounded-lg shadow-sm overflow-x-auto mt-6">
              <h3 className="text-lg font-bold text-orange-800 mb-2 flex items-center">
                <i className="ph-fill ph-warning-circle mr-2 text-xl"></i>
                Mogelijke Duplicaten Gevonden
              </h3>
              <p className="text-sm text-orange-700 mb-4">De onderstaande transacties lijken sterk op elkaar (zelfde datum, aandeel en totale inlegwaarde). Dit kan wijzen op een per ongeluk dubbel ingevoerde transactie of een <strong>Stock Split</strong>. Controleer en verwijder de onjuiste/oude rij.</p>
              
              <table className="min-w-full divide-y divide-orange-200 bg-white rounded-md shadow-sm">
                <thead className="bg-orange-100">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800 uppercase">Datum</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800 uppercase">Aandeel</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800 uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800 uppercase">Aantal / Prijs</th>
                    {!isDemo && <th className="px-4 py-2 text-right text-xs font-semibold text-orange-800 uppercase">Acties</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-100">
                  {potentialDuplicates.map((t, idx) => (
                    <tr key={idx} className="hover:bg-orange-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{new Date(t.purchase_time).toLocaleDateString('nl-BE')} {new Date(t.purchase_time).toLocaleTimeString('nl-BE', {hour: '2-digit', minute:'2-digit'})}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-800">{['DEPOSIT', 'WITHDRAWAL'].includes(t.transaction_type) ? 'Cash' : t.ticker_symbol}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-700">{t.transaction_type}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        {t.quantity} <span className="text-gray-400 mx-1">@</span> <span className="privacy-blur">{formatCurrency(t.price)}</span>
                        {t._hasVariance && !t._isPossibleSplit && (
                          <span className="ml-2 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-600" title="Prijs wijkt af van de andere duplicaten in deze groep">
                            Δ {formatCurrency(t._varianceAmount)}
                          </span>
                        )}
                        {t._isPossibleSplit && (
                          <span className="ml-2 px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700" title="Let op: Dit lijkt op een dubbele boeking door een stock split! Verwijder de transactie met de oude (hoge) prijs.">
                            Mogelijke Stock Split
                          </span>
                        )}
                      </td>
                      {!isDemo && (
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                          <button onClick={() => setTransactionToDelete(t)} className="text-red-500 hover:text-red-700 focus:outline-none bg-red-50 px-3 py-1 rounded" title="Verwijderen">Verwijderen</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --- TAB CONTENT: GROWTH --- OLD */}
      {activeTab === 'growth' && (
        <div className="space-y-6">
          {/* GROWTH SPECIFIC CONTROL BAR */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col lg:flex-row justify-between items-center p-1.5 mb-6">
            <div className="flex overflow-x-auto w-full lg:w-auto hide-scrollbar">
              <button onClick={() => setSelectedTypes([])} className={`whitespace-nowrap px-5 py-2 rounded-lg text-sm font-semibold transition-all ${selectedTypes.length === 0 ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                Overview
              </button>
              {availableAssetTypes.map(type => (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`whitespace-nowrap px-5 py-2 rounded-lg text-sm font-semibold transition-all ${selectedTypes.includes(type) ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 p-1 w-full lg:w-auto overflow-x-auto hide-scrollbar">
              <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                <button type="button" onClick={() => setDisplayCurrency('USD')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${displayCurrency === 'USD' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  USD ($)
                </button>
                <button type="button" onClick={() => setDisplayCurrency('EUR')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${displayCurrency === 'EUR' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  EUR (€)
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {/* Portfolio Value Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[500px]">
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
                <h3 className="text-lg font-bold text-gray-900">Portfolio value</h3>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  {renderTimeframeSelector(valPeriod, setValPeriod, valStart, setValStart, valEnd, setValEnd)}
                  <select className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium">
                    <option>Portfolio value considering trades</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-medium">Group by</span>
                    <select className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium">
                      <option>no</option>
                    </select>
                  </div>
                  <label className="flex items-center cursor-pointer text-gray-700 font-medium hover:text-gray-900">
                    <input type="checkbox" className="mr-2 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300" checked={growthShowCostBasis} onChange={e => setGrowthShowCostBasis(e.target.checked)} /> Show cost basis
                  </label>
                  <label className="flex items-center cursor-pointer text-gray-700 font-medium hover:text-gray-900">
                    <input type="checkbox" className="mr-2 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300" checked={growthShowTrades} onChange={e => setGrowthShowTrades(e.target.checked)} /> Show trades
                  </label>
                </div>
              </div>
              <div className="flex-grow relative min-h-0 incognito-hide">
                {filteredHistVal.length > 0 && filteredHistVal[0].net_invested !== undefined ? (
                  <Line data={growthChart1Data} options={growthChart1Options} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                    <i className="ph-fill ph-chart-line-up text-4xl mb-2 opacity-30"></i>
                    {filteredHistVal.length === 0 ? "Geen data beschikbaar voor deze periode" : "Voeg 'net_invested' toe aan je database en klik op Herbereken Historie."}
                  </div>
                )}
              </div>
              <div className="incognito-show flex-col items-center justify-center h-full text-gray-400 text-sm">
                <i className="ph-fill ph-eye-slash text-4xl mb-2 opacity-30"></i>
                Waardegrafiek verborgen in privacymodus
              </div>
            </div>

            {/* Portfolio Performance Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[500px]">
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
                <h3 className="text-lg font-bold text-gray-900">Portfolio performance</h3>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  {renderTimeframeSelector(perfPeriod, setPerfPeriod, perfStart, setPerfStart, perfEnd, setPerfEnd)}
                  <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                    <button onClick={() => setGrowthPerfType('percent')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${growthPerfType === 'percent' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>%</button>
                    <button onClick={() => setGrowthPerfType('value')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${growthPerfType === 'value' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{displayCurrency}</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-medium">Group by</span>
                    <select className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium">
                      <option>no</option>
                    </select>
                  </div>
                  <label className="flex items-center cursor-pointer text-gray-700 font-medium hover:text-gray-900">
                    <input type="checkbox" className="mr-2 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-gray-300" checked={growthPerfGroupBySource} onChange={e => setGrowthPerfGroupBySource(e.target.checked)} /> Group by the profit source
                  </label>
                  <div className="flex items-center gap-2 group relative">
                    <span className="text-gray-500 font-medium">Calculate PL for:</span>
                    <select value={growthPerfCalcFor} onChange={e => setGrowthPerfCalcFor(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium cursor-help">
                      <option value="period">Selected period</option>
                      <option value="all_time">All time</option>
                    </select>
                    <div className="absolute top-full mt-2 right-0 w-80 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                      {growthPerfCalcFor === 'period' 
                        ? "PL is calculated relative to the portfolio value at the beginning of the period. Realized PL is calculated relative to the price of the asset at the beginning of the selected period (NOT the purchase price)." 
                        : "PL is always calculated from the date of the first transaction, and then the chart is 'zoomed' to the selected period. Total values are calculated as the difference between PL values at the beginning and PL values at the end of the selected period."}
                    </div>
                  </div>
                </div>
              </div>
              <div className={`flex-grow relative min-h-0 ${growthPerfType === 'value' ? 'incognito-hide' : ''}`}>
                {filteredHistPerf.length > 0 && filteredHistPerf[0].cumulative_dividends !== undefined ? (
                  <Line data={growthChart2Data} options={growthChart2Options} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                    <i className="ph-fill ph-chart-bar text-4xl mb-2 opacity-30"></i>
                    {filteredHistPerf.length === 0 ? "Geen data beschikbaar voor deze periode" : "Bereken historie opnieuw."}
                  </div>
                )}
              </div>
              {growthPerfType === 'value' && (
                <div className="incognito-show flex-col items-center justify-center h-full text-gray-400 text-sm">
                  <i className="ph-fill ph-eye-slash text-4xl mb-2 opacity-30"></i>
                  Waardegrafiek verborgen in privacymodus
                </div>
              )}
            </div>
          </div>

          {/* Dynamics of Portfolio Returns Chart */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[500px]">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
              <h3 className="text-lg font-bold text-gray-900">Dynamics of portfolio returns</h3>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {renderTimeframeSelector(dynPeriod, setDynPeriod, dynStart, setDynStart, dynEnd, setDynEnd)}
                <button onClick={() => setDynamicsView(dynamicsView === 'chart' ? 'table' : 'chart')} className="p-2 bg-gray-100 rounded-md text-gray-600 hover:bg-gray-200">
                  <i className={`ph-fill ${dynamicsView === 'chart' ? 'ph-table' : 'ph-chart-bar'} text-lg`}></i>
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-medium">Period</span>
                  <select value={dynamicsPeriod} onChange={e => setDynamicsPeriod(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium">
                    <option value="monthly">Month</option>
                    <option value="quarterly">Quarter</option>
                    <option value="annually">Year</option>
                    <option value="weekly">Week</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-medium">Display values</span>
                  <select value={dynamicsDisplay} onChange={e => setDynamicsDisplay(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium">
                    <option value="percent">Percent</option>
                    <option value="value">Value</option>
                    <option value="irr" disabled>IRR</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-medium">Group by</span>
                  <select className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium" disabled>
                    <option>no</option>
                  </select>
                </div>
              </div>
            </div>
            <div className={`flex-grow relative min-h-0 ${dynamicsDisplay === 'value' ? 'incognito-hide' : ''}`}>
              {dynamicsLoading ? (
                  <div className="flex h-full items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
              ) : dynamicsData.length > 0 ? (
                dynamicsView === 'chart' ? (
                  <Bar data={dynamicsChartData} options={dynamicsChartOptions} />
                ) : (
                  <div className="overflow-y-auto h-full">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2">Period</th>
                          <th className="px-4 py-2 text-right">Return ({dynamicsDisplay === 'percent' ? '%' : displayCurrency})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dynamicsData.map(d => (
                          <tr key={d.period} className="border-b border-gray-100">
                            <td className="px-4 py-2 font-medium text-gray-800">{d.period}</td>
                            <td className={`px-4 py-2 text-right font-semibold ${d.returnValue >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {dynamicsDisplay === 'percent' ? `${d.returnPercent.toFixed(2)}%` : formatCurrency(d.returnValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                  <i className="ph-fill ph-chart-bar-horizontal text-4xl mb-2 opacity-30"></i>
                  Geen data beschikbaar voor de geselecteerde periode.
                </div>
              )}
            </div>
            {dynamicsDisplay === 'value' && (
              <div className="incognito-show flex-col items-center justify-center h-full text-gray-400 text-sm">
                <i className="ph-fill ph-eye-slash text-4xl mb-2 opacity-30"></i>
                Waardegrafiek verborgen in privacymodus
              </div>
            )}
          </div>

          {/* Holdings Performance Tabel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Holdings Performance</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none transition-colors" onClick={() => handleHoldingsSort('ticker')}>Asset{getSortIcon(holdingsSort, 'ticker')}</th>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('price')}>Huidige Prijs{getSortIcon(holdingsSort, 'price')}</th>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('average_price')}>Gem. Aankoopprijs{getSortIcon(holdingsSort, 'average_price')}</th>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('total_invested')}>Geïnvesteerd{getSortIcon(holdingsSort, 'total_invested')}</th>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('value')}>Huidige Waarde{getSortIcon(holdingsSort, 'value')}</th>
                    <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none text-right transition-colors" onClick={() => handleHoldingsSort('gainLoss')}>Winst / Verlies{getSortIcon(holdingsSort, 'gainLoss')}</th>
                  </tr>
                </thead>
                <tbody>
                 {processedHoldings.map((holding) => (
                    <tr key={holding.ticker} className="hover:bg-gray-50/80 transition-colors group">
                      <td className="px-6 py-4 border-b border-gray-100">
                        <div 
                          className="flex flex-col cursor-pointer group-hover:bg-gray-100 p-1 -ml-1 rounded transition-colors"
                          onClick={() => navigate(`/analysis?ticker=${holding.ticker}`)}
                          title="Bekijk analyse voor dit aandeel"
                        >
                          <span className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors">{holding.ticker}</span>
                          <span className="text-xs font-medium text-gray-500 truncate max-w-[200px]" title={holding.name}>{holding.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 border-b border-gray-100 text-right">
                        <span className="text-sm font-semibold text-gray-800 privacy-blur">{formatCurrency(holding.price)}</span>
                      </td>
                      <td className="px-6 py-4 border-b border-gray-100 text-right">
                        <span className="text-sm font-semibold text-gray-800 privacy-blur">{formatCurrency(holding.average_price)}</span>
                      </td>
                      <td className="px-6 py-4 border-b border-gray-100 text-right">
                        <span className="text-sm font-semibold text-gray-800 privacy-blur">{formatCurrency(holding.total_invested)}</span>
                      </td>
                      <td className="px-6 py-4 border-b border-gray-100 text-right">
                        <span className="text-sm font-semibold text-gray-800 privacy-blur">{formatCurrency(holding.value)}</span>
                      </td>
                      <td className="px-6 py-4 border-b border-gray-100 text-right">
                        <div className="flex flex-col items-end">
                          <span className={`text-sm font-bold privacy-blur ${holding.gainLoss >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {holding.gainLoss >= 0 ? '+' : ''}{formatCurrency(holding.gainLoss)}
                          </span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md mt-1 ${holding.gainLoss >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {formatPercentage(holding.total_invested > 0 ? (holding.gainLoss / holding.total_invested) * 100 : 0)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                 {processedHoldings.length === 0 && (
                    <tr><td colSpan="6" className="px-6 py-8 text-center text-sm text-gray-500">Geen holdings gevonden voor de huidige filter.</td></tr>
                 )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: DIVIDENDS --- */}
      {activeTab === 'dividends' && (
        <div className="space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center">
                <div className="p-4 bg-purple-50 text-purple-600 rounded-full mr-4">
                    <i className="ph-fill ph-money text-3xl"></i>
                </div>
                <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Total Netto Dividends ({divTimeframe})</h4>
                    <div className="text-3xl font-bold text-gray-900 privacy-blur">{formatCurrency(totalDivsPeriod)}</div>
                </div>
             </div>
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center">
                <div className="p-4 bg-blue-50 text-blue-600 rounded-full mr-4">
                    <i className="ph-fill ph-chart-line-up text-3xl"></i>
                </div>
                <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">Gemiddeld Per Maand</h4>
                    <div className="text-3xl font-bold text-gray-900 privacy-blur">{formatCurrency(divTimeframe === '1M' ? totalDivsPeriod : divTimeframe === 'YTD' ? (totalDivsPeriod / (new Date().getMonth() + 1)) : divTimeframe === '1Y' ? (totalDivsPeriod / 12) : 0)}</div>
                    <div className="text-xs text-gray-400">Gebaseerd op gekozen periode</div>
                </div>
             </div>
          </div>

          {/* Dividend Chart */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[500px]">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
              <h3 className="text-lg font-bold text-gray-900">Dividend Historiek</h3>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {renderTimeframeSelector(divTimeframe, setDivTimeframe, divStart, setDivStart, divEnd, setDivEnd)}
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-medium">Group by</span>
                  <select value={divGrouping} onChange={e => setDivGrouping(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-700 rounded-md px-3 py-1.5 outline-none font-medium">
                    <option value="monthly">Month</option>
                    <option value="quarterly">Quarter</option>
                    <option value="annually">Year</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex-grow relative min-h-0 incognito-hide">
               {filteredDivs.length > 0 ? (
                 <Bar data={divChartData} options={divChartOptions} />
               ) : (
                 <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                   <i className="ph-fill ph-money text-4xl mb-2 opacity-30"></i>
                   Geen dividend data beschikbaar voor deze periode.
                 </div>
               )}
            </div>
            <div className="incognito-show flex-col items-center justify-center h-full text-gray-400 text-sm">
              <i className="ph-fill ph-eye-slash text-4xl mb-2 opacity-30"></i>
              Waardegrafiek verborgen in privacymodus
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Table: Dividends Per Asset */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900">Top Betalers ({divTimeframe})</h3>
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">Asset</th>
                        <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Uitbetalingen</th>
                        <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Netto Totaal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                     {divByAssetData.map((d, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{d.ticker}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">{d.count}x</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-emerald-600 text-right privacy-blur">{formatCurrency(d.totalNet)}</td>
                        </tr>
                     ))}
                     {divByAssetData.length === 0 && <tr><td colSpan="3" className="px-6 py-8 text-center text-sm text-gray-500">Geen data</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table: Recent Dividend Payouts */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900">Recente Uitbetalingen</h3>
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">Datum</th>
                        <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">Asset</th>
                        <th className="px-6 py-3 border-b-2 border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Netto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                     {filteredDivs.sort((a,b) => new Date(b.purchase_time) - new Date(a.purchase_time)).map((div, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{new Date(div.purchase_time).toLocaleDateString('nl-BE')}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{div.ticker_symbol || `ID: ${div.aandeel_id}`}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-emerald-600 text-right privacy-blur">{formatCurrency((div.quantity * div.price) - (div.taxes || 0))}</td>
                        </tr>
                     ))}
                     {filteredDivs.length === 0 && <tr><td colSpan="3" className="px-6 py-8 text-center text-sm text-gray-500">Geen data</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
          </div>
        </div>
      )}

      {/* --- TAB CONTENT: UNDER CONSTRUCTION (Metrics, Income) --- */}
      {['metrics', 'income'].includes(activeTab) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-16 flex flex-col items-center justify-center text-center">
           <i className={`ph-fill ${TABS.find(t => t.id === activeTab)?.icon} text-6xl text-gray-200 mb-4`}></i>
           <h3 className="text-2xl font-bold text-gray-800 mb-2">In Ontwikkeling</h3>
           <p className="text-gray-500 max-w-md">De functionaliteit voor '{TABS.find(t => t.id === activeTab)?.label}' wordt momenteel gebouwd. Kijk binnenkort nog eens!</p>
        </div>
      )}

      {activeTab === 'taxes' && (
          <TaxesTab 
              transactions={rawTransactions} 
              rawHoldings={rawHoldings} 
              displayCurrency={displayCurrency} 
              onUpdate={fetchPortfolioData}
          />
      )}

      {/* Modal Overlay voor Add Transaction */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 overflow-y-auto h-full w-full z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-2xl">
            <h3 className="text-2xl font-bold mb-2 text-gray-800">Nieuwe Transactie</h3>
            <TransactionForm
              onSuccess={(txDate) => { setIsAddModalOpen(false); fetchPortfolioData(); handleRecalculateHistory(true, txDate); }}
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
              onSuccess={(txDate) => { 
                setIsEditModalOpen(false); 
                const earliestDate = new Date(Math.min(new Date(txDate), new Date(transactionToEdit.purchase_time))).toISOString().split('T')[0];
                setTransactionToEdit(null); 
                fetchPortfolioData(); 
                handleRecalculateHistory(true, earliestDate); 
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
              Weet je zeker dat je de <strong>{transactionToDelete.transaction_type}</strong> transactie van <strong>{transactionToDelete.ticker_symbol || `ID: ${transactionToDelete.aandeel_id}`}</strong> op <strong>{new Date(transactionToDelete.purchase_time).toLocaleDateString('nl-BE')}</strong> wilt verwijderen?<br/><br/>Deze actie kan niet ongedaan worden gemaakt.
            </p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setTransactionToDelete(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium">Annuleren</button>
              <button onClick={confirmDeleteTransaction} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-md transition-colors">Verwijderen</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Overlay voor Import Review (Duplicaat check) */}
      {showImportReviewModal && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 overflow-y-auto h-full w-full z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-5xl">
            <h3 className="text-2xl font-bold mb-2 text-gray-800">Controleer Import</h3>
            <p className="text-gray-600 mb-4 text-sm">Controleer de onderstaande rijen. Rijen die rood gemarkeerd zijn, lijken al in de database te staan op basis van Ticker, Datum en Aantal. Vink de rijen aan die je definitief wilt toevoegen.</p>
            
            <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg mb-4">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                        <tr>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">Import</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">Date</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">Ticker</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">Type</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">Broker</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">Aantal</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">Prijs</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">Kosten / Taks</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                        {importPreviewData.map((row, idx) => (
                            <tr key={idx} className={row._isDuplicate ? 'bg-red-50' : 'hover:bg-gray-50'}>
                                <td className="px-4 py-2 text-center">
                                    <input type="checkbox" checked={row._selected} onChange={() => toggleImportRow(idx)} className="w-4 h-4 text-blue-600 rounded" />
                                </td>
                                <td className="px-4 py-2 font-medium">
                                    {row._isDuplicate ? (
                                        <div title={`Identieke match gevonden in DB (Prijs: ${row._duplicateMatch?.price}, Aantal: ${row._duplicateMatch?.quantity}).\n\nAndere transacties op deze dag:\n${row._dayReferences.map(t => `- ${t.transaction_type} ${t.quantity} stuks @ ${t.price}`).join('\n')}`}>
                                            <span className="text-red-600 text-xs bg-red-100 px-2 py-1 rounded block w-max">Mogelijk Duplicaat</span>
                                            <span className="text-[10px] text-gray-400 block mt-1 leading-tight font-normal">Zit al in DB ({row._duplicateMatch?.quantity} stuks)</span>
                                        </div>
                                    ) : row._dayReferences && row._dayReferences.length > 0 ? (
                                        <div title={`Let op: Er zijn al andere transacties voor dit aandeel op deze dag:\n${row._dayReferences.map(t => `- ${t.transaction_type} ${t.quantity} stuks @ ${t.price}`).join('\n')}`}>
                                            <span className="text-yellow-600 text-xs bg-yellow-100 px-2 py-1 rounded block w-max">Extra Vandaag</span>
                                            <span className="text-[10px] text-gray-400 block mt-1 leading-tight font-normal">Bekijk tooltip</span>
                                        </div>
                                    ) : (
                                        <span className="text-green-600 text-xs bg-green-100 px-2 py-1 rounded">Nieuw</span>
                                    )}
                                </td>
                                <td className="px-4 py-2 text-gray-600">
                                    {new Date(row.purchase_time).toLocaleDateString('nl-BE')} 
                                    <span className="text-xs text-gray-400 ml-1">{new Date(row.purchase_time).toLocaleTimeString('nl-BE', {hour: '2-digit', minute:'2-digit'})}</span>
                                </td>
                                <td className="px-4 py-2 font-semibold text-gray-800" title={row.isin ? `ISIN: ${row.isin}` : ''}>{row.ticker || <span className="text-gray-400 text-xs">{row.isin}</span>}</td>
                                <td className="px-4 py-2 text-gray-600">{row.transaction_type}</td>
                                <td className="px-4 py-2 text-gray-600 capitalize">{row._brokerName}</td>
                                <td className="px-4 py-2 text-gray-600">{row.quantity}</td>
                                <td className="px-4 py-2 text-gray-600">{formatCurrency(row.price)}</td>
                                <td className="px-4 py-2 text-gray-600 text-xs">F: {row.fees} / T: {row.taxes}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
                <span className="text-sm text-gray-500">Geselecteerd: {importPreviewData.filter(r => r._selected).length} van de {importPreviewData.length} transacties.</span>
                <div className="space-x-3">
                    <button onClick={() => setShowImportReviewModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium">Annuleren</button>
                    <button onClick={confirmImport} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors">Bevestig Import</button>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Modal for Recalculate/Repair */}
      {showLogModal && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 overflow-y-auto h-full w-full z-[10000] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-3xl">
            <h3 className="text-xl font-bold mb-4 text-gray-800">{logModalTitle}</h3>
            <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gray-50 font-mono text-xs">
              {logMessages.map((log, index) => {
                let colorClass = 'text-gray-600';
                if (log.type === 'error') colorClass = 'text-red-600 font-semibold';
                else if (log.type === 'warn') colorClass = 'text-yellow-600';
                else if (log.type === 'info') colorClass = 'text-blue-600';
                else if (log.type === 'complete') colorClass = 'text-green-600 font-bold';
                
                return <p key={index} className={colorClass} style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{log.message}</p>
              })}
            </div>
            <div className="flex justify-end mt-6">
              <button 
                onClick={() => {
                  setShowLogModal(false);
                  setIsRecalculating(false);
                  setIsRepairing(false);
                }} 
                disabled={isRecalculating || isRepairing}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(isRecalculating || isRepairing) ? 'Bezig...' : 'Sluiten'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortfolioManager;
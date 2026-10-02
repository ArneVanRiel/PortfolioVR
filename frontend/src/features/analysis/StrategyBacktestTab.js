// frontend/src/features/analysis/StrategyBacktestTab.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../../http-common';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const StrategyBacktestTab = ({ selectedStock, stocks = [] }) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState('dynamic_score5'); // 'single' | 'dynamic_score5' | 'portfolio_list'
  const [targetStock, setTargetStock] = useState(selectedStock);
  const [portfolioType, setPortfolioType] = useState('ideal'); // 'ideal' | 'watchlist'
  const [singleChartView, setSingleChartView] = useState('price'); // 'price' | 'equity'
  const [dynamicChartView, setDynamicChartView] = useState('profit'); // 'profit' | 'return' | 'value'
  
  // Strategie Parameters
  const [initialCapital, setInitialCapital] = useState(10000);
  const [requireScore5, setRequireScore5] = useState(true);
  const [requireWaardeverdelingRise, setRequireWaardeverdelingRise] = useState(true);
  const [sellOnScoreDrop, setSellOnScoreDrop] = useState(true);
  const [useWaardeverdelingSell, setUseWaardeverdelingSell] = useState(true);
  const [useMacdSell, setUseMacdSell] = useState(false);
  const [usePortfolioRelativeWeight, setUsePortfolioRelativeWeight] = useState(true);
  const [enableActiveRebalance, setEnableActiveRebalance] = useState(true);
  const [useTrendFilter200Sma, setUseTrendFilter200Sma] = useState(true);
  const [stopLossPct, setStopLossPct] = useState(0); // 0 = off
  const [maxPositions, setMaxPositions] = useState(0); // 0 = onbeperkt
  const [maxPriceToIntrinsicRatio, setMaxPriceToIntrinsicRatio] = useState(1.3); // 0 = off, 1.3 = max 30% overwaardering
  const [takeProfitAtIntrinsicRatio, setTakeProfitAtIntrinsicRatio] = useState(0); // 0 = off, 2.5 = 2.5x
  const [maxDebtRatio, setMaxDebtRatio] = useState(0); // 0 = off, 0.60
  const [activePreset, setActivePreset] = useState('super_quality'); // 'super_quality' | 'value_discount' | 'optimal' | 'top10' | 'trend_protected' | 'custom'

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [singleResult, setSingleResult] = useState(null);
  const [dynamicResult, setDynamicResult] = useState(null);
  const [portfolioResult, setPortfolioResult] = useState(null);
  const [timeRange, setTimeRange] = useState('ALL'); // '1Y' | '3Y' | '5Y' | 'ALL'
  const [tradeFilter, setTradeFilter] = useState('ALL'); // 'ALL' | 'WINS' | 'LOSSES' | 'PARTIAL' | 'REBALANCE' | 'STOP_LOSS' | 'VALUATION' | 'OPEN'

  // Update targetStock als selectedStock verandert
  useEffect(() => {
    if (selectedStock) {
      setTargetStock(selectedStock);
    }
  }, [selectedStock]);

  const handleRunBacktest = useCallback(async (overrides = {}) => {
    setLoading(true);
    setError('');

    const activeInitialCapital = overrides.initialCapital !== undefined ? overrides.initialCapital : initialCapital;
    const activeRequireScore5 = overrides.requireScore5 !== undefined ? overrides.requireScore5 : requireScore5;
    const activeRequireWaardeverdelingRise = overrides.requireWaardeverdelingRise !== undefined ? overrides.requireWaardeverdelingRise : requireWaardeverdelingRise;
    const activeSellOnScoreDrop = overrides.sellOnScoreDrop !== undefined ? overrides.sellOnScoreDrop : sellOnScoreDrop;
    const activeUseWaardeverdelingSell = overrides.useWaardeverdelingSell !== undefined ? overrides.useWaardeverdelingSell : useWaardeverdelingSell;
    const activeUseMacdSell = overrides.useMacdSell !== undefined ? overrides.useMacdSell : useMacdSell;
    const activeUsePortfolioRelativeWeight = overrides.usePortfolioRelativeWeight !== undefined ? overrides.usePortfolioRelativeWeight : usePortfolioRelativeWeight;
    const activeEnableActiveRebalance = overrides.enableActiveRebalance !== undefined ? overrides.enableActiveRebalance : enableActiveRebalance;
    const activeUseTrendFilter200Sma = overrides.useTrendFilter200Sma !== undefined ? overrides.useTrendFilter200Sma : useTrendFilter200Sma;
    const activeStopLossPct = overrides.stopLossPct !== undefined ? overrides.stopLossPct : stopLossPct;
    const activeMaxPositions = overrides.maxPositions !== undefined ? overrides.maxPositions : maxPositions;
    const activeMaxPriceToIntrinsicRatio = overrides.maxPriceToIntrinsicRatio !== undefined ? overrides.maxPriceToIntrinsicRatio : maxPriceToIntrinsicRatio;
    const activeTakeProfitAtIntrinsicRatio = overrides.takeProfitAtIntrinsicRatio !== undefined ? overrides.takeProfitAtIntrinsicRatio : takeProfitAtIntrinsicRatio;
    const activeMaxDebtRatio = overrides.maxDebtRatio !== undefined ? overrides.maxDebtRatio : maxDebtRatio;
    const activeMode = overrides.mode !== undefined ? overrides.mode : mode;

    try {
      if (activeMode === 'single') {
        const stockId = targetStock?.stock_id || targetStock?.aandeel_id;
        const ticker = targetStock?.ticker || targetStock?.ticker_symbol;

        if (!stockId && !ticker) {
          setError('Selecteer eerst een aandeel om de individuele backtest uit te voeren.');
          setLoading(false);
          return;
        }

        const res = await http.post('/backtest/single', {
          stockId,
          ticker,
          initialCapital: Number(activeInitialCapital),
          requireScore5: activeRequireScore5,
          requireWaardeverdelingRise: activeRequireWaardeverdelingRise,
          sellOnScoreDrop: activeSellOnScoreDrop,
          useWaardeverdelingSell: activeUseWaardeverdelingSell,
          useMacdSell: activeUseMacdSell
        });

        setSingleResult(res.data);
      } else if (activeMode === 'dynamic_score5') {
        const res = await http.post('/backtest/dynamic-score5', {
          initialCapital: Number(activeInitialCapital),
          useWaardeverdelingSell: activeUseWaardeverdelingSell,
          sellOnScoreDrop: activeSellOnScoreDrop,
          useMacdSell: activeUseMacdSell,
          usePortfolioRelativeWeight: activeUsePortfolioRelativeWeight,
          enableActiveRebalance: activeEnableActiveRebalance,
          useTrendFilter200Sma: activeUseTrendFilter200Sma,
          stopLossPct: Number(activeStopLossPct),
          maxPositions: Number(activeMaxPositions),
          maxPriceToIntrinsicRatio: Number(activeMaxPriceToIntrinsicRatio),
          takeProfitAtIntrinsicRatio: Number(activeTakeProfitAtIntrinsicRatio),
          maxDebtRatio: Number(activeMaxDebtRatio)
        });

        setDynamicResult(res.data);
      } else {
        const res = await http.post('/backtest/portfolio', {
          portfolioType,
          initialCapitalPerStock: Number(activeInitialCapital),
          requireScore5: activeRequireScore5,
          requireWaardeverdelingRise: activeRequireWaardeverdelingRise,
          sellOnScoreDrop: activeSellOnScoreDrop,
          useWaardeverdelingSell: activeUseWaardeverdelingSell,
          useMacdSell: activeUseMacdSell
        });

        setPortfolioResult(res.data);
      }
    } catch (err) {
      console.error('Fout bij uitvoeren backtest:', err);
      setError(err.response?.data?.message || 'Er is een fout opgetreden bij het berekenen van de backtest.');
    } finally {
      setLoading(false);
    }
  }, [mode, targetStock, portfolioType, initialCapital, requireScore5, requireWaardeverdelingRise, sellOnScoreDrop, useWaardeverdelingSell, useMacdSell, usePortfolioRelativeWeight, enableActiveRebalance, useTrendFilter200Sma, stopLossPct, maxPositions, maxPriceToIntrinsicRatio, takeProfitAtIntrinsicRatio, maxDebtRatio]);

  const applyPreset = (presetType) => {
    setActivePreset(presetType);
    if (presetType === 'current_strategy') {
      setUsePortfolioRelativeWeight(true);
      setEnableActiveRebalance(true);
      setSellOnScoreDrop(true);
      setUseWaardeverdelingSell(true);
      setUseTrendFilter200Sma(false); // Kopen onder 200 SMA toegestaan via MACD Golden Cross bodemherstel
      setMaxPriceToIntrinsicRatio(1.3);
      setTakeProfitAtIntrinsicRatio(0);
      setMaxDebtRatio(0);
      setStopLossPct(0);
      setMaxPositions(0);
      setUseMacdSell(false);
      handleRunBacktest({
        usePortfolioRelativeWeight: true,
        enableActiveRebalance: true,
        sellOnScoreDrop: true,
        useWaardeverdelingSell: true,
        useTrendFilter200Sma: false,
        maxPriceToIntrinsicRatio: 1.3,
        takeProfitAtIntrinsicRatio: 0,
        maxDebtRatio: 0,
        stopLossPct: 0,
        maxPositions: 0,
        useMacdSell: false
      });
    } else if (presetType === 'super_quality') {
      setUsePortfolioRelativeWeight(true);
      setEnableActiveRebalance(true);
      setSellOnScoreDrop(true);
      setUseWaardeverdelingSell(true);
      setUseTrendFilter200Sma(true);
      setMaxPriceToIntrinsicRatio(1.3);
      setTakeProfitAtIntrinsicRatio(0);
      setMaxDebtRatio(0);
      setStopLossPct(0);
      setMaxPositions(0);
      setUseMacdSell(false);
      handleRunBacktest({
        usePortfolioRelativeWeight: true,
        enableActiveRebalance: true,
        sellOnScoreDrop: true,
        useWaardeverdelingSell: true,
        useTrendFilter200Sma: true,
        maxPriceToIntrinsicRatio: 1.3,
        takeProfitAtIntrinsicRatio: 0,
        maxDebtRatio: 0,
        stopLossPct: 0,
        maxPositions: 0,
        useMacdSell: false
      });
    } else if (presetType === 'value_discount') {
      setUsePortfolioRelativeWeight(true);
      setEnableActiveRebalance(true);
      setSellOnScoreDrop(true);
      setUseWaardeverdelingSell(true);
      setUseTrendFilter200Sma(false);
      setMaxPriceToIntrinsicRatio(1.0);
      setTakeProfitAtIntrinsicRatio(0);
      setMaxDebtRatio(0);
      setStopLossPct(0);
      setMaxPositions(0);
      setUseMacdSell(false);
      handleRunBacktest({
        usePortfolioRelativeWeight: true,
        enableActiveRebalance: true,
        sellOnScoreDrop: true,
        useWaardeverdelingSell: true,
        useTrendFilter200Sma: false,
        maxPriceToIntrinsicRatio: 1.0,
        takeProfitAtIntrinsicRatio: 0,
        maxDebtRatio: 0,
        stopLossPct: 0,
        maxPositions: 0,
        useMacdSell: false
      });
    } else if (presetType === 'optimal') {
      setUsePortfolioRelativeWeight(true);
      setEnableActiveRebalance(true);
      setSellOnScoreDrop(true);
      setUseWaardeverdelingSell(true);
      setUseTrendFilter200Sma(false);
      setMaxPriceToIntrinsicRatio(1.2);
      setTakeProfitAtIntrinsicRatio(0);
      setMaxDebtRatio(0);
      setStopLossPct(0);
      setMaxPositions(0);
      setUseMacdSell(false);
      handleRunBacktest({
        usePortfolioRelativeWeight: true,
        enableActiveRebalance: true,
        sellOnScoreDrop: true,
        useWaardeverdelingSell: true,
        useTrendFilter200Sma: false,
        maxPriceToIntrinsicRatio: 1.2,
        takeProfitAtIntrinsicRatio: 0,
        maxDebtRatio: 0,
        stopLossPct: 0,
        maxPositions: 0,
        useMacdSell: false
      });
    } else if (presetType === 'top10') {
      setUsePortfolioRelativeWeight(true);
      setEnableActiveRebalance(true);
      setSellOnScoreDrop(true);
      setUseWaardeverdelingSell(true);
      setUseTrendFilter200Sma(false);
      setMaxPriceToIntrinsicRatio(1.2);
      setTakeProfitAtIntrinsicRatio(0);
      setMaxDebtRatio(0);
      setStopLossPct(0);
      setMaxPositions(10);
      setUseMacdSell(false);
      handleRunBacktest({
        usePortfolioRelativeWeight: true,
        enableActiveRebalance: true,
        sellOnScoreDrop: true,
        useWaardeverdelingSell: true,
        useTrendFilter200Sma: false,
        maxPriceToIntrinsicRatio: 1.2,
        takeProfitAtIntrinsicRatio: 0,
        maxDebtRatio: 0,
        stopLossPct: 0,
        maxPositions: 10,
        useMacdSell: false
      });
    } else if (presetType === 'trend_protected') {
      setUsePortfolioRelativeWeight(true);
      setEnableActiveRebalance(true);
      setSellOnScoreDrop(true);
      setUseWaardeverdelingSell(true);
      setUseTrendFilter200Sma(true);
      setMaxPriceToIntrinsicRatio(0);
      setTakeProfitAtIntrinsicRatio(0);
      setMaxDebtRatio(0);
      setStopLossPct(25);
      setMaxPositions(16);
      setUseMacdSell(false);
      handleRunBacktest({
        usePortfolioRelativeWeight: true,
        enableActiveRebalance: true,
        sellOnScoreDrop: true,
        useWaardeverdelingSell: true,
        useTrendFilter200Sma: true,
        maxPriceToIntrinsicRatio: 0,
        takeProfitAtIntrinsicRatio: 0,
        maxDebtRatio: 0,
        stopLossPct: 25,
        maxPositions: 16,
        useMacdSell: false
      });
    }
  };

  // Initial load
  useEffect(() => {
    handleRunBacktest();
  }, [mode]);

  // Filter Equity Curve data op basis van tijdspanne
  const activeEquityCurve = useMemo(() => {
    const curve = mode === 'single' ? singleResult?.equityCurve : mode === 'dynamic_score5' ? dynamicResult?.equityCurve : null;
    if (!curve || curve.length === 0) return [];
    if (timeRange === 'ALL') return curve;

    const lastDate = new Date(curve[curve.length - 1].date);
    let cutoffYears = 1;
    if (timeRange === '3Y') cutoffYears = 3;
    if (timeRange === '5Y') cutoffYears = 5;

    const cutoffDate = new Date(lastDate);
    cutoffDate.setFullYear(cutoffDate.getFullYear() - cutoffYears);

    return curve.filter(pt => new Date(pt.date) >= cutoffDate);
  }, [singleResult, dynamicResult, mode, timeRange]);

  // Chart Configuratie
  const chartData = useMemo(() => {
    if (!activeEquityCurve || activeEquityCurve.length === 0) return null;

    const labels = activeEquityCurve.map(pt => pt.date);

    // Single mode: Keuze tussen Koersgrafiek met Signalen OF Vermogensgrafiek
    if (mode === 'single' && singleChartView === 'price') {
      const priceData = activeEquityCurve.map(pt => pt.price);
      const buyPoints = activeEquityCurve.map(pt => pt.buySignalPrice ?? null);
      const partialSellPoints = activeEquityCurve.map(pt => pt.partialSellSignalPrice ?? null);
      const fullSellPoints = activeEquityCurve.map(pt => pt.sellSignalPrice ?? null);

      return {
        labels,
        datasets: [
          {
            label: `${singleResult?.ticker || 'Aandeel'} Slotkoers (€)`,
            data: priceData,
            borderColor: '#3B82F6', // Blauw
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 5,
            borderWidth: 2,
            order: 3
          },
          {
            label: '🟢 Koopsignaal (Instap)',
            data: buyPoints,
            borderColor: '#10B981',
            backgroundColor: '#10B981',
            pointStyle: 'triangle',
            pointRadius: 9,
            pointHoverRadius: 11,
            showLine: false,
            order: 1
          },
          {
            label: '🟣 Deelverkoop (WV daling)',
            data: partialSellPoints,
            borderColor: '#8B5CF6',
            backgroundColor: '#8B5CF6',
            pointStyle: 'triangle',
            rotation: 180,
            pointRadius: 8,
            pointHoverRadius: 10,
            showLine: false,
            order: 2
          },
          {
            label: '🔴 100% Volledige Verkoop (Score < 5)',
            data: fullSellPoints,
            borderColor: '#EF4444',
            backgroundColor: '#EF4444',
            pointStyle: 'triangle',
            rotation: 180,
            pointRadius: 9,
            pointHoverRadius: 11,
            showLine: false,
            order: 1
          }
        ]
      };
    }

    // Dynamic 5/5 Portfolio Grafiekweergaves (Winst € / Rendement % / Portfoliowaarde €)
    if (mode === 'dynamic_score5') {
      if (dynamicChartView === 'profit') {
        return {
          labels,
          datasets: [
            {
              label: '🏆 Dynamisch 5/5 Strategie Zuivere Winst (€)',
              data: activeEquityCurve.map(pt => pt.strategyProfit),
              borderColor: '#10B981', // Emerald
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              fill: true,
              tension: 0.15,
              pointRadius: 0,
              pointHoverRadius: 6,
              borderWidth: 2.5
            },
            {
              label: '🇺🇸 S&P 500 Index (SPY) Winst (€)',
              data: activeEquityCurve.map(pt => pt.sp500Profit),
              borderColor: '#8B5CF6', // Purple
              backgroundColor: 'transparent',
              borderDash: [5, 5],
              fill: false,
              tension: 0.15,
              pointRadius: 0,
              pointHoverRadius: 5,
              borderWidth: 2
            },
            {
              label: '🌍 MSCI World ETF (URTH) Winst (€)',
              data: activeEquityCurve.map(pt => pt.worldProfit),
              borderColor: '#06B6D4', // Cyan
              backgroundColor: 'transparent',
              borderDash: [3, 3],
              fill: false,
              tension: 0.15,
              pointRadius: 0,
              pointHoverRadius: 5,
              borderWidth: 2
            }
          ]
        };
      }

      if (dynamicChartView === 'return') {
        return {
          labels,
          datasets: [
            {
              label: '🏆 Dynamisch 5/5 Strategie Rendement (%)',
              data: activeEquityCurve.map(pt => pt.strategyReturnPct),
              borderColor: '#10B981', // Emerald
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              fill: true,
              tension: 0.15,
              pointRadius: 0,
              pointHoverRadius: 6,
              borderWidth: 2.5
            },
            {
              label: '🇺🇸 S&P 500 Index (SPY) Rendement (%)',
              data: activeEquityCurve.map(pt => pt.sp500ReturnPct),
              borderColor: '#8B5CF6', // Purple
              backgroundColor: 'transparent',
              borderDash: [5, 5],
              fill: false,
              tension: 0.15,
              pointRadius: 0,
              pointHoverRadius: 5,
              borderWidth: 2
            },
            {
              label: '🌍 MSCI World ETF (URTH) Rendement (%)',
              data: activeEquityCurve.map(pt => pt.worldReturnPct),
              borderColor: '#06B6D4', // Cyan
              backgroundColor: 'transparent',
              borderDash: [3, 3],
              fill: false,
              tension: 0.15,
              pointRadius: 0,
              pointHoverRadius: 5,
              borderWidth: 2
            }
          ]
        };
      }

      // 'value' (Portfoliowaarde breakdown)
      return {
        labels,
        datasets: [
          {
            label: 'Dynamisch Portfolio Waarde (€)',
            data: activeEquityCurve.map(pt => pt.strategyValue),
            borderColor: '#10B981', // Emerald Groen
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 6,
            borderWidth: 2.5
          },
          {
            label: '🇺🇸 S&P 500 (SPY) Waarde (€)',
            data: activeEquityCurve.map(pt => pt.sp500Value),
            borderColor: '#8B5CF6',
            borderDash: [5, 5],
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 1.8
          },
          {
            label: '🌍 MSCI World (URTH) Waarde (€)',
            data: activeEquityCurve.map(pt => pt.worldValue),
            borderColor: '#06B6D4',
            borderDash: [3, 3],
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 1.8
          },
          {
            label: 'Belegd Vermogen (€)',
            data: activeEquityCurve.map(pt => pt.invested),
            borderColor: '#3B82F6', // Blue
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            borderWidth: 1.5
          },
          {
            label: 'Beschikbare Cash (€)',
            data: activeEquityCurve.map(pt => pt.cash),
            borderColor: '#F59E0B', // Amber
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            borderWidth: 1.5
          }
        ]
      };
    }

    // Single mode vermogensgrafiek
    const strategyData = activeEquityCurve.map(pt => pt.strategyValue || pt.portfolioValue);
    const buyHoldData = activeEquityCurve.map(pt => pt.buyAndHoldValue);

    return {
      labels,
      datasets: [
        {
          label: 'Strategie Waarde (€)',
          data: strategyData,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          fill: true,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 6,
          borderWidth: 2.5
        },
        {
          label: 'Buy & Hold Benchmark (€)',
          data: buyHoldData,
          borderColor: '#94A3B8',
          borderDash: [5, 5],
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2
        }
      ]
    };
  }, [activeEquityCurve, mode, singleChartView, dynamicChartView, singleResult]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          font: { size: 12, weight: '600' }
        }
      },
      tooltip: {
        backgroundColor: '#1E293B',
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12 },
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context) {
            if (context.parsed.y === null || isNaN(context.parsed.y)) return null;
            const val = context.parsed.y;
            if (mode === 'dynamic_score5' && dynamicChartView === 'return') {
              return ` ${context.dataset.label}: ${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
            }
            return ` ${context.dataset.label}: € ${val.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxTicksLimit: 8, font: { size: 11 } }
      },
      y: {
        grid: { color: '#F1F5F9' },
        ticks: {
          callback: (value) => {
            if (mode === 'dynamic_score5' && dynamicChartView === 'return') {
              return `${value}%`;
            }
            return `€ ${value.toLocaleString('nl-NL')}`;
          },
          font: { size: 11 }
        }
      }
    }
  };

  // Filter trades
  const filteredTrades = useMemo(() => {
    const rawTrades = mode === 'single' ? singleResult?.trades : mode === 'dynamic_score5' ? dynamicResult?.trades : [];
    if (!rawTrades) return [];
    if (tradeFilter === 'WINS') return rawTrades.filter(t => t.profit > 0 && !t.isOpen);
    if (tradeFilter === 'LOSSES') return rawTrades.filter(t => t.profit <= 0 && !t.isOpen);
    if (tradeFilter === 'PARTIAL') return rawTrades.filter(t => t.type === 'PARTIAL_EXIT' && !t.isRebalance);
    if (tradeFilter === 'REBALANCE') return rawTrades.filter(t => t.isRebalance);
    if (tradeFilter === 'STOP_LOSS') return rawTrades.filter(t => t.isStopLoss || t.type === 'STOP_LOSS');
    if (tradeFilter === 'VALUATION') return rawTrades.filter(t => t.type === 'TAKE_PROFIT_VALUATION');
    if (tradeFilter === 'OPEN') return rawTrades.filter(t => t.isOpen);
    return rawTrades;
  }, [singleResult, dynamicResult, mode, tradeFilter]);

  const exportTradesCsv = () => {
    const rawTrades = mode === 'single' ? singleResult?.trades : dynamicResult?.trades;
    if (!rawTrades?.length) return;
    const headers = ['Aandeel', 'Trade #', 'Type', 'Verkoop %', 'Stuks Verkocht', 'Stuks Restant', 'Koop Datum', 'Koop Koers', 'Koop Reden', 'Verkoop Datum', 'Verkoop Koers', 'Exacte Exit Reden', 'Dagen', 'Rendement %', 'Winst (€)', 'Status'];
    const rows = rawTrades.map(t => [
      t.ticker || targetStock?.ticker || '',
      t.tradeNumber,
      t.type || '',
      t.sellPct ?? 100,
      t.sharesSold ?? t.shares ?? '',
      t.sharesRemaining ?? '',
      t.entryDate,
      t.entryPrice?.toFixed(2) || '',
      `"${t.entryReason || ''}"`,
      t.exitDate,
      t.exitPrice?.toFixed(2) || '',
      `"${t.exitReason || ''}"`,
      t.holdingDays,
      t.returnPct ? t.returnPct.toFixed(2) : 0,
      t.profit ? t.profit.toFixed(2) : 0,
      t.isOpen ? 'Open' : 'Gesloten'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Backtest_Trades_${mode}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header en Configuratie Paneel */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-6 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <i className="ph-fill ph-trend-up text-2xl"></i>
              </span>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Strategie Backtester & Simulator</h2>
                <p className="text-sm text-gray-500">
                  Simuleer en valideer uw kwartaal- en momentumstrategie over de 10-jarige beurshistorie.
                </p>
              </div>
            </div>
          </div>

          {/* Modus Selector (3 opties) */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl flex-wrap gap-1">
            <button
              onClick={() => setMode('dynamic_score5')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                mode === 'dynamic_score5'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <i className="ph-fill ph-sparkle text-emerald-600"></i>
              ⚡ Dynamisch 5/5 Portfolio
            </button>
            <button
              onClick={() => setMode('single')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                mode === 'single'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <i className="ph-bold ph-chart-line"></i>
              Enkel Aandeel
            </button>
            <button
              onClick={() => setMode('portfolio_list')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                mode === 'portfolio_list'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <i className="ph-bold ph-briefcase"></i>
              Portfolio Vergelijking
            </button>
          </div>
        </div>

        {/* Strategie Presets Bar voor Dynamisch Portfolio */}
        {mode === 'dynamic_score5' && (
          <div className="mt-4 p-3 bg-gradient-to-r from-indigo-50 via-emerald-50 to-purple-50 border border-emerald-200/80 rounded-xl flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-600 text-white rounded-lg">
                <i className="ph-fill ph-lightning text-sm"></i>
              </span>
              <div>
                <span className="text-xs font-extrabold text-gray-900">Strategie Presets:</span>
                <span className="text-xs text-gray-600 ml-1.5">Kies direct de geteste data-gedreven configuratie</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => applyPreset('current_strategy')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  activePreset === 'current_strategy'
                    ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300'
                    : 'bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-300'
                }`}
              >
                <i className="ph-fill ph-star text-amber-400"></i>
                ⭐ Huidige Live Strategie (+212%)
              </button>
              <button
                onClick={() => applyPreset('super_quality')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activePreset === 'super_quality'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-gray-700 hover:bg-indigo-50 border border-gray-200'
                }`}
              >
                <i className="ph-fill ph-rocket-launch"></i>
                🚀 Super-Kwaliteit (+369% Alpha)
              </button>
              <button
                onClick={() => applyPreset('value_discount')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activePreset === 'value_discount'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-white text-gray-700 hover:bg-teal-50 border border-gray-200'
                }`}
              >
                <i className="ph-fill ph-gem"></i>
                💎 Korting op Intrinsiek (+358%)
              </button>
              <button
                onClick={() => applyPreset('optimal')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activePreset === 'optimal'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white text-gray-700 hover:bg-emerald-50 border border-gray-200'
                }`}
              >
                <i className="ph-fill ph-crown"></i>
                🌟 Optimale Versie (+285%)
              </button>
              <button
                onClick={() => applyPreset('top10')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activePreset === 'top10'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-white text-gray-700 hover:bg-amber-50 border border-gray-200'
                }`}
              >
                <i className="ph-fill ph-target"></i>
                🎯 Top 10 Focus
              </button>
              <button
                onClick={() => applyPreset('trend_protected')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activePreset === 'trend_protected'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-white text-gray-700 hover:bg-purple-50 border border-gray-200'
                }`}
              >
                <i className="ph-fill ph-shield-check"></i>
                🛡️ Trend + Stop-Loss
              </button>
            </div>
          </div>
        )}

        {/* Callout naar Strategie Assistent */}
        <div className="mt-4 p-3.5 bg-gradient-to-r from-blue-900 to-indigo-900 rounded-xl text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-indigo-500/30 border border-indigo-400/30 rounded-lg text-amber-300">
              <i className="ph-fill ph-sparkle text-lg"></i>
            </span>
            <div>
              <div className="text-xs font-bold text-white">Wil je deze strategie stapsgewijs toepassen op jouw huidige portefeuille?</div>
              <div className="text-[11px] text-indigo-200">Bekijk live koop-, hold- en winstnemingssignalen berekend op jouw echte aandelen.</div>
            </div>
          </div>
          <button
            onClick={() => navigate('/portfolio')}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-extrabold text-xs rounded-lg shadow-sm transition-all whitespace-nowrap self-stretch sm:self-auto flex items-center justify-center gap-1.5"
          >
            <span>👉 Naar Strategie Assistent</span>
            <i className="ph-bold ph-arrow-right"></i>
          </button>
        </div>

        {/* Instellingen Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-6">
          {/* Aandeel / Portfolio Keuze */}
          {mode === 'single' && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Aandeel
              </label>
              <select
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={targetStock?.stock_id || targetStock?.aandeel_id || ''}
                onChange={(e) => {
                  const sId = parseInt(e.target.value);
                  const found = stocks.find(s => s.stock_id === sId || s.aandeel_id === sId);
                  setTargetStock(found);
                }}
              >
                {stocks.map(s => (
                  <option key={s.stock_id || s.aandeel_id} value={s.stock_id || s.aandeel_id}>
                    {s.ticker || s.ticker_symbol} - {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === 'portfolio_list' && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Doel Portfolio
              </label>
              <select
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={portfolioType}
                onChange={(e) => setPortfolioType(e.target.value)}
              >
                <option value="ideal">⭐ Ideale Portfolio Aandelen</option>
                <option value="watchlist">👁️ Watchlist Aandelen</option>
              </select>
            </div>
          )}

          {mode === 'dynamic_score5' && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Universum
              </label>
              <div className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-emerald-700 flex items-center gap-2">
                <i className="ph-fill ph-check-circle text-emerald-600"></i>
                Alle Database Aandelen (Score 5)
              </div>
            </div>
          )}

          {/* Startkapitaal */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Startkapitaal (€)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">€</span>
              <input
                type="number"
                step="1000"
                min="100"
                value={initialCapital}
                onChange={(e) => setInitialCapital(e.target.value)}
                className="w-full pl-8 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Strategie Regels & Toggles */}
          <div className="lg:col-span-2 flex flex-col justify-between">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Strategie Filters & Verkoopregels
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2.5 p-2 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={sellOnScoreDrop}
                  onChange={(e) => { setSellOnScoreDrop(e.target.checked); setActivePreset('custom'); }}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-gray-300"
                />
                <span className="text-xs font-semibold text-gray-700">
                  100% Verkoop zodra Score &lt; 5
                </span>
              </label>

              <label className="flex items-center gap-2.5 p-2 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={useWaardeverdelingSell}
                  onChange={(e) => { setUseWaardeverdelingSell(e.target.checked); setActivePreset('custom'); }}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-gray-300"
                />
                <span className="text-xs font-semibold text-gray-700">
                  Deelverkoop bij daling Waardeverdeling
                </span>
              </label>

              <label className="flex items-center gap-2.5 p-2 bg-emerald-50/50 rounded-xl border border-emerald-200 cursor-pointer hover:bg-emerald-100/50 transition-colors">
                <input
                  type="checkbox"
                  checked={usePortfolioRelativeWeight}
                  onChange={(e) => { setUsePortfolioRelativeWeight(e.target.checked); setActivePreset('custom'); }}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-emerald-300"
                />
                <span className="text-xs font-semibold text-emerald-950">
                  Exacte Portfolio Weging (Relatief % van 5/5 pool)
                </span>
              </label>

              <label className="flex items-center gap-2.5 p-2 bg-purple-50/60 rounded-xl border border-purple-200 cursor-pointer hover:bg-purple-100/60 transition-colors">
                <input
                  type="checkbox"
                  checked={enableActiveRebalance}
                  onChange={(e) => { setEnableActiveRebalance(e.target.checked); setActivePreset('custom'); }}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 border-purple-300"
                />
                <span className="text-xs font-semibold text-purple-950">
                  ✂️ Actieve Herbalancering / Snoeien bij Koopkansen
                </span>
              </label>

              {/* Trendfilter 200 SMA */}
              <label className="flex items-center gap-2.5 p-2 bg-blue-50/50 rounded-xl border border-blue-200 cursor-pointer hover:bg-blue-100/50 transition-colors">
                <input
                  type="checkbox"
                  checked={useTrendFilter200Sma}
                  onChange={(e) => { setUseTrendFilter200Sma(e.target.checked); setActivePreset('custom'); }}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-blue-300"
                />
                <span className="text-xs font-semibold text-blue-950">
                  🛡️ Trendfilter (Koop enkel bij Koers &gt; 200 SMA)
                </span>
              </label>

              {/* Waarderingsfilter (Koers vs Intrinsieke Waarde) */}
              <div className="flex items-center justify-between gap-2 p-2 bg-teal-50/50 rounded-xl border border-teal-200">
                <span className="text-xs font-semibold text-teal-950 whitespace-nowrap">🏷️ Max. Waardering:</span>
                <select
                  value={maxPriceToIntrinsicRatio}
                  onChange={(e) => { setMaxPriceToIntrinsicRatio(Number(e.target.value)); setActivePreset('custom'); }}
                  className="px-2 py-1 bg-white border border-teal-300 rounded-lg text-xs font-bold text-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value={0}>Uit (Geen limiet)</option>
                  <option value={1.0}>1.0x (💎 Korting)</option>
                  <option value={1.2}>1.2x (Max +20%)</option>
                  <option value={1.3}>1.3x (🌟 Super-Kwaliteit)</option>
                  <option value={1.5}>1.5x (Max +50%)</option>
                </select>
              </div>

              {/* Winstname bij Extreme Overwaardering */}
              <div className="flex items-center justify-between gap-2 p-2 bg-indigo-50/50 rounded-xl border border-indigo-200">
                <span className="text-xs font-semibold text-indigo-950 whitespace-nowrap">💰 Winstname Overwaardering:</span>
                <select
                  value={takeProfitAtIntrinsicRatio}
                  onChange={(e) => { setTakeProfitAtIntrinsicRatio(Number(e.target.value)); setActivePreset('custom'); }}
                  className="px-2 py-1 bg-white border border-indigo-300 rounded-lg text-xs font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={0}>Uit (Laat lopen)</option>
                  <option value={2.0}>2.0x Intrinsiek</option>
                  <option value={2.5}>2.5x Intrinsiek</option>
                  <option value={3.0}>3.0x Intrinsiek</option>
                </select>
              </div>

              {/* Stop-Loss Verliesstop */}
              <div className="flex items-center justify-between gap-2 p-2 bg-rose-50/50 rounded-xl border border-rose-200">
                <span className="text-xs font-semibold text-rose-950 whitespace-nowrap">🛑 Stop-Loss:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="5"
                    value={stopLossPct}
                    onChange={(e) => { setStopLossPct(e.target.value); setActivePreset('custom'); }}
                    className="w-14 px-2 py-1 bg-white border border-rose-300 rounded-lg text-xs font-bold text-rose-900 text-center focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="text-[11px] text-rose-600 font-medium whitespace-nowrap">% (0 = uit)</span>
                </div>
              </div>

              {/* Max Aantal Posities Filter */}
              <div className="flex items-center justify-between gap-2 p-2 bg-amber-50/50 rounded-xl border border-amber-200">
                <span className="text-xs font-semibold text-amber-950 whitespace-nowrap">🎯 Max. Posities:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="1"
                    value={maxPositions}
                    onChange={(e) => { setMaxPositions(e.target.value); setActivePreset('custom'); }}
                    className="w-14 px-2 py-1 bg-white border border-amber-300 rounded-lg text-xs font-bold text-amber-900 text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-[11px] text-amber-700 font-medium whitespace-nowrap">(0 = onbeperkt)</span>
                </div>
              </div>

              <button
                onClick={() => handleRunBacktest()}
                disabled={loading}
                className="w-full sm:col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm shadow-emerald-200 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <i className="ph-bold ph-spinner animate-spin text-base"></i>
                    Simulatie Bezig...
                  </>
                ) : (
                  <>
                    <i className="ph-bold ph-play text-base"></i>
                    Herbereken Backtest
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm flex items-center gap-3">
          <i className="ph-fill ph-warning-circle text-xl flex-shrink-0"></i>
          <span>{error}</span>
        </div>
      )}

      {/* 2. DYNAMISCH 5/5 PORTFOLIO RESULTATEN */}
      {mode === 'dynamic_score5' && dynamicResult && (
        <div className="space-y-6">
          {/* KPI Dashboard Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Portfolio Eindwaarde</span>
              <div className="text-xl font-extrabold text-gray-900 mt-1">
                € {dynamicResult.kpis.finalPortfolioValue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
              </div>
              <div className={`text-xs font-bold mt-1 flex items-center gap-1 ${dynamicResult.kpis.totalReturnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                <i className={`ph-bold ${dynamicResult.kpis.totalReturnPct >= 0 ? 'ph-arrow-up-right' : 'ph-arrow-down-right'}`}></i>
                {dynamicResult.kpis.totalReturnPct >= 0 ? '+' : ''}{dynamicResult.kpis.totalReturnPct.toFixed(1)}% Totale Winst
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Totale Zuivere Winst</span>
              <div className={`text-xl font-extrabold mt-1 ${dynamicResult.kpis.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                € {dynamicResult.kpis.totalProfit.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Start: € {dynamicResult.kpis.initialCapital.toLocaleString('nl-NL')}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">vs S&P 500 (SPY)</span>
              <div className={`text-xl font-extrabold mt-1 ${dynamicResult.kpis.outperformanceVsSp500 >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {dynamicResult.kpis.outperformanceVsSp500 >= 0 ? '+' : ''}{dynamicResult.kpis.outperformanceVsSp500.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                SPY: +{dynamicResult.kpis.sp500TotalReturnPct.toFixed(1)}% (€ {dynamicResult.kpis.sp500TotalProfit.toLocaleString('nl-NL', { maximumFractionDigits: 0 })})
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">vs MSCI World (URTH)</span>
              <div className={`text-xl font-extrabold mt-1 ${dynamicResult.kpis.outperformanceVsWorld >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {dynamicResult.kpis.outperformanceVsWorld >= 0 ? '+' : ''}{dynamicResult.kpis.outperformanceVsWorld.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                World: +{dynamicResult.kpis.worldTotalReturnPct.toFixed(1)}% (€ {dynamicResult.kpis.worldTotalProfit.toLocaleString('nl-NL', { maximumFractionDigits: 0 })})
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Transacties & Snoei</span>
              <div className="text-xl font-extrabold text-gray-900 mt-1">
                {dynamicResult.kpis.totalTrades}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {dynamicResult.kpis.rebalanceTradesCount || 0} snoeiacties • {dynamicResult.kpis.winRate.toFixed(0)}% Win
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Max Drawdown</span>
              <div className="text-xl font-extrabold text-red-600 mt-1">
                -{dynamicResult.kpis.maxDrawdownPct.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {dynamicResult.kpis.activePositionsCount} posities • Cash: € {dynamicResult.kpis.cash.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>

          {/* Equity Grafiek Card met Rendement / Winst / Waarde Selectie */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {dynamicChartView === 'profit'
                    ? '💰 Zuivere Winst (€) Vergelijking vs S&P 500 & MSCI World'
                    : dynamicChartView === 'return'
                    ? '📈 Cumulatief Rendement (%) Vergelijking vs S&P 500 & MSCI World'
                    : '📊 Portfoliowaarde (€) & Vermogensverdeling'}
                </h3>
                <p className="text-xs text-gray-500">
                  {dynamicResult.timeframe.totalTradingDays} handelsdagen • Proportionele allocatie, partiële verkoop bij WV daling & actieve snoei
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* 3 Grafiekweergaves */}
                <div className="flex items-center bg-gray-100 p-1 rounded-xl gap-1">
                  <button
                    onClick={() => setDynamicChartView('profit')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      dynamicChartView === 'profit'
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <i className="ph-bold ph-coins text-emerald-600"></i>
                    💰 Zuivere Winst (€)
                  </button>
                  <button
                    onClick={() => setDynamicChartView('return')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      dynamicChartView === 'return'
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <i className="ph-bold ph-chart-line-up text-blue-600"></i>
                    📈 Rendement (%)
                  </button>
                  <button
                    onClick={() => setDynamicChartView('value')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      dynamicChartView === 'value'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <i className="ph-bold ph-wallet"></i>
                    📊 Portfoliowaarde (€)
                  </button>
                </div>

                {/* Tijdspanne Filter */}
                <div className="flex items-center bg-gray-100 p-1 rounded-xl">
                  {['1Y', '3Y', '5Y', 'ALL'].map(range => (
                    <button
                      key={range}
                      onClick={() => setTimeRange(range)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        timeRange === range
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      {range === 'ALL' ? 'Alles' : range}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="h-80 w-full">
              {chartData ? (
                <Line data={chartData} options={chartOptions} />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                  Geen grafiekdata beschikbaar
                </div>
              )}
            </div>
          </div>

          {/* Jaarlijkse Prestatie Tabel vs SPY & URTH */}
          {dynamicResult.annualPerformance && dynamicResult.annualPerformance.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                      <i className="ph-fill ph-calendar text-sm"></i>
                    </span>
                    <h3 className="text-base font-bold text-gray-900">
                      📅 Jaarlijks Rendement & Outperformance vs S&P 500 & MSCI World
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Jaar-op-jaar vergelijking van jouw portefeuille tegenover de benchmarks SPY (S&P 500) en URTH (MSCI World).
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg border border-emerald-200">
                    🟢 {dynamicResult.annualPerformance.filter(y => y.alphaVsWorld >= 0).length} / {dynamicResult.annualPerformance.length} jr &gt; World
                  </span>
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-200">
                    🔵 {dynamicResult.annualPerformance.filter(y => y.alphaVsSp500 >= 0).length} / {dynamicResult.annualPerformance.length} jr &gt; S&P 500
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-gray-50/80 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-100">
                      <th className="py-3 px-3">Kalenderjaar</th>
                      <th className="py-3 px-3 text-right">🟢 Strategie Rendement</th>
                      <th className="py-3 px-3 text-right">Jaarwinst (€)</th>
                      <th className="py-3 px-3 text-right">🔵 S&P 500 (SPY)</th>
                      <th className="py-3 px-3 text-right">⚡ Alpha vs SPY</th>
                      <th className="py-3 px-3 text-right">🟠 MSCI World (URTH)</th>
                      <th className="py-3 px-3 text-right">⚡ Alpha vs World</th>
                      <th className="py-3 px-3 text-right">Portfoliowaarde Einde Jaar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {dynamicResult.annualPerformance.map((y) => (
                      <tr key={y.year} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-3 font-extrabold text-gray-900 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                          {y.year}
                        </td>
                        <td className={`py-3 px-3 text-right font-extrabold ${y.strategyReturnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {y.strategyReturnPct >= 0 ? '+' : ''}{y.strategyReturnPct.toFixed(1)}%
                        </td>
                        <td className={`py-3 px-3 text-right font-bold ${y.strategyProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {y.strategyProfit >= 0 ? '+' : ''}€ {y.strategyProfit.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </td>
                        <td className={`py-3 px-3 text-right font-semibold ${y.spyReturnPct >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                          {y.spyReturnPct >= 0 ? '+' : ''}{y.spyReturnPct.toFixed(1)}%
                        </td>
                        <td className={`py-3 px-3 text-right font-bold ${y.alphaVsSp500 >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          <span className={`px-1.5 py-0.5 rounded ${y.alphaVsSp500 >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {y.alphaVsSp500 >= 0 ? '+' : ''}{y.alphaVsSp500.toFixed(1)}%
                          </span>
                        </td>
                        <td className={`py-3 px-3 text-right font-semibold ${y.worldReturnPct >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                          {y.worldReturnPct >= 0 ? '+' : ''}{y.worldReturnPct.toFixed(1)}%
                        </td>
                        <td className={`py-3 px-3 text-right font-bold ${y.alphaVsWorld >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          <span className={`px-1.5 py-0.5 rounded ${y.alphaVsWorld >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {y.alphaVsWorld >= 0 ? '+' : ''}{y.alphaVsWorld.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-gray-900">
                          € {y.strategyEndValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50/90 font-extrabold border-t-2 border-gray-200">
                      <td className="py-3.5 px-3 text-gray-900">TOTAAL (Cumulatief)</td>
                      <td className={`py-3.5 px-3 text-right text-sm ${dynamicResult.kpis.totalReturnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        +{dynamicResult.kpis.totalReturnPct.toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-3 text-right text-emerald-600 font-extrabold">
                        +€ {dynamicResult.kpis.totalProfit.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-3.5 px-3 text-right text-gray-700">
                        +{dynamicResult.kpis.sp500TotalReturnPct.toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-3 text-right text-emerald-600">
                        +{dynamicResult.kpis.outperformanceVsSp500.toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-3 text-right text-gray-700">
                        +{dynamicResult.kpis.worldTotalReturnPct.toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-3 text-right text-emerald-600">
                        +{dynamicResult.kpis.outperformanceVsWorld.toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-3 text-right text-gray-900 text-sm">
                        € {dynamicResult.kpis.finalPortfolioValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Actieve Lopende Posities */}
          {dynamicResult.openPositions && dynamicResult.openPositions.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                <h3 className="text-base font-bold text-gray-900">
                  Actieve Portfolio Posities op Dit Moment ({dynamicResult.openPositions.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-400 font-bold uppercase tracking-wider border-b border-gray-100">
                      <th className="py-3 px-3">Ticker</th>
                      <th className="py-3 px-3">Naam</th>
                      <th className="py-3 px-3">Instapdatum</th>
                      <th className="py-3 px-3 text-right">Aankoopkoers</th>
                      <th className="py-3 px-3 text-right">Aantal</th>
                      <th className="py-3 px-3 text-right">Investering</th>
                      <th className="py-3 px-3 text-right">Huidige Koers</th>
                      <th className="py-3 px-3 text-right">Huidige Waarde</th>
                      <th className="py-3 px-3 text-right">Ongerealiseerd Rendement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dynamicResult.openPositions.map((p) => (
                      <tr key={p.ticker} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-3 font-extrabold text-gray-900">{p.ticker}</td>
                        <td className="py-3 px-3 text-gray-600 font-medium">{p.name}</td>
                        <td className="py-3 px-3 text-gray-500">{p.entryDate}</td>
                        <td className="py-3 px-3 text-right font-medium">€ {p.entryPrice.toFixed(2)}</td>
                        <td className="py-3 px-3 text-right font-semibold">{p.sharesRemaining || p.shares}</td>
                        <td className="py-3 px-3 text-right font-medium">€ {p.cost.toFixed(2)}</td>
                        <td className="py-3 px-3 text-right font-semibold text-blue-600">€ {p.exitPrice.toFixed(2)}</td>
                        <td className="py-3 px-3 text-right font-bold text-gray-900">€ {p.revenue.toFixed(2)}</td>
                        <td className={`py-3 px-3 text-right font-extrabold ${p.returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {p.returnPct >= 0 ? '+' : ''}{p.returnPct.toFixed(1)}% (€ {p.profit.toFixed(2)})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Transactie Logboek Tabel */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h3 className="text-base font-bold text-gray-900">Transactie Logboek</h3>
                <p className="text-xs text-gray-500">
                  Alle {dynamicResult.trades.length} gesimuleerde koop-, snoei- en verkooptransacties
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center bg-gray-100 p-1 rounded-xl flex-wrap gap-1">
                  {[
                    { id: 'ALL', label: 'Alles' },
                    { id: 'WINS', label: 'Winst' },
                    { id: 'LOSSES', label: 'Verlies' },
                    { id: 'PARTIAL', label: 'Deelverkoop' },
                    { id: 'REBALANCE', label: '✂️ Snoei' },
                    { id: 'STOP_LOSS', label: '🛑 Stop-Loss' },
                    { id: 'VALUATION', label: '💰 Waardering Winst' },
                    { id: 'OPEN', label: 'Lopend' }
                  ].map(filter => (
                    <button
                      key={filter.id}
                      onClick={() => setTradeFilter(filter.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        tradeFilter === filter.id
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={exportTradesCsv}
                  className="px-3.5 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm"
                >
                  <i className="ph-bold ph-download-simple text-sm"></i>
                  CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-50/80 text-gray-400 font-bold uppercase tracking-wider border-b border-gray-100">
                    <th className="py-3 px-3">#</th>
                    <th className="py-3 px-3">Aandeel</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Koop Datum</th>
                    <th className="py-3 px-3">Koop Koers</th>
                    <th className="py-3 px-3">Verkoop Datum</th>
                    <th className="py-3 px-3">Verkoop Koers</th>
                    <th className="py-3 px-3">Exacte Exit / Snoei Reden</th>
                    <th className="py-3 px-3 text-right">Dagen</th>
                    <th className="py-3 px-3 text-right">Rendement %</th>
                    <th className="py-3 px-3 text-right">Winst / Verlies</th>
                    <th className="py-3 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTrades.map((t) => (
                    <tr key={`${t.ticker}-${t.tradeNumber}`} className={`transition-colors ${t.isRebalance ? 'bg-purple-50/20 hover:bg-purple-50/40' : 'hover:bg-gray-50/60'}`}>
                      <td className="py-3 px-3 font-bold text-gray-400">{t.tradeNumber}</td>
                      <td className="py-3 px-3 font-extrabold text-gray-900">{t.ticker}</td>
                      <td className="py-3 px-3">
                        {t.type === 'TAKE_PROFIT_VALUATION' ? (
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-bold text-[10px] border border-indigo-200 whitespace-nowrap">
                            💰 Winstname Overwaardering
                          </span>
                        ) : t.type === 'STOP_LOSS' ? (
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full font-bold text-[10px] border border-rose-200 whitespace-nowrap">
                            🛑 Stop-Loss
                          </span>
                        ) : t.type === 'REBALANCE_TRIM' ? (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-800 rounded-full font-bold text-[10px] border border-amber-200 whitespace-nowrap">
                            ✂️ Snoei {t.sellPct}%
                          </span>
                        ) : t.type === 'PARTIAL_EXIT' ? (
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full font-bold text-[10px] border border-purple-200 whitespace-nowrap">
                            Deelverkoop {t.sellPct}%
                          </span>
                        ) : t.type === 'FULL_EXIT' ? (
                          <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-full font-bold text-[10px] border border-red-200 whitespace-nowrap">
                            {t.isRebalance ? '✂️ 100% Verkoop' : '100% Verkoop'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-bold text-[10px] border border-blue-200 whitespace-nowrap">
                            Lopend
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-semibold text-gray-800">{t.entryDate}</td>
                      <td className="py-3 px-3 text-gray-700">€ {t.entryPrice?.toFixed(2)}</td>
                      <td className="py-3 px-3 font-semibold text-gray-800">{t.exitDate}</td>
                      <td className="py-3 px-3 text-gray-700">€ {t.exitPrice?.toFixed(2)}</td>
                      <td className="py-3 px-3 font-medium text-gray-600 text-[11px]">
                        <span className={t.isRebalance ? 'text-purple-900 font-semibold' : t.exitReason?.includes('Score is gezakt') ? 'text-red-700 font-semibold' : t.exitReason?.includes('Deelverkoop') ? 'text-purple-800' : 'text-gray-700'}>
                          {t.exitReason}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-gray-500">{t.holdingDays}d</td>
                      <td className={`py-3 px-3 text-right font-extrabold ${t.returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {t.returnPct >= 0 ? '+' : ''}{t.returnPct.toFixed(1)}%
                      </td>
                      <td className={`py-3 px-3 text-right font-bold ${t.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {t.profit >= 0 ? '+' : ''}€ {t.profit.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {t.isOpen ? (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-bold text-[10px]">
                            Lopend
                          </span>
                        ) : t.isWin ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-bold text-[10px]">
                            Winst
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-full font-bold text-[10px]">
                            Verlies
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. ENKEL AANDEEL RESULTATEN */}
      {mode === 'single' && singleResult && (
        <div className="space-y-6">
          {/* KPI Dashboard Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Strategie Waarde</span>
              <div className="text-xl font-extrabold text-gray-900 mt-1">
                € {singleResult.kpis.finalStrategyValue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
              </div>
              <div className={`text-xs font-bold mt-1 flex items-center gap-1 ${singleResult.kpis.strategyTotalReturnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                <i className={`ph-bold ${singleResult.kpis.strategyTotalReturnPct >= 0 ? 'ph-arrow-up-right' : 'ph-arrow-down-right'}`}></i>
                {singleResult.kpis.strategyTotalReturnPct >= 0 ? '+' : ''}{singleResult.kpis.strategyTotalReturnPct.toFixed(1)}%
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Buy & Hold Waarde</span>
              <div className="text-xl font-extrabold text-gray-900 mt-1">
                € {singleResult.kpis.finalBuyAndHoldValue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
              </div>
              <div className={`text-xs font-bold mt-1 flex items-center gap-1 ${singleResult.kpis.buyAndHoldTotalReturnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                <i className={`ph-bold ${singleResult.kpis.buyAndHoldTotalReturnPct >= 0 ? 'ph-arrow-up-right' : 'ph-arrow-down-right'}`}></i>
                {singleResult.kpis.buyAndHoldTotalReturnPct >= 0 ? '+' : ''}{singleResult.kpis.buyAndHoldTotalReturnPct.toFixed(1)}%
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Alpha t.o.v. B&H</span>
              <div className={`text-xl font-extrabold mt-1 ${singleResult.kpis.outperformancePct >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {singleResult.kpis.outperformancePct >= 0 ? '+' : ''}{singleResult.kpis.outperformancePct.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {singleResult.kpis.outperformancePct >= 0 ? '🏆 Strategie verslaat B&H' : '⚠️ Benchmark is hoger'}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Win Rate</span>
              <div className="text-xl font-extrabold text-gray-900 mt-1">
                {singleResult.kpis.winRate.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {singleResult.kpis.winningTradesCount} win / {singleResult.kpis.losingTradesCount} verlies
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Transacties</span>
              <div className="text-xl font-extrabold text-gray-900 mt-1">
                {singleResult.kpis.totalTrades}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Profit Factor: {singleResult.kpis.profitFactor >= 90 ? '99+' : singleResult.kpis.profitFactor.toFixed(2)}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Max Drawdown</span>
              <div className="text-xl font-extrabold text-red-600 mt-1">
                -{singleResult.kpis.maxDrawdownPct.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Gem. duur: {singleResult.kpis.avgHoldingDays} dgn
              </div>
            </div>
          </div>

          {/* Grafiek Card met Koers vs Vermogen Toggle */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {singleChartView === 'price' ? `Koersverloop met Koop- en Verkooppunten (${singleResult.ticker})` : `Vermogensontwikkeling (${singleResult.ticker})`}
                </h3>
                <p className="text-xs text-gray-500">
                  {singleResult.name} • {singleResult.timeframe.totalTradingDays} handelsdagen
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Switch tussen Koersgrafiek met signalen en Vermogensontwikkeling */}
                <div className="flex items-center bg-gray-100 p-1 rounded-xl">
                  <button
                    onClick={() => setSingleChartView('price')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      singleChartView === 'price'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <i className="ph-bold ph-chart-line-up"></i>
                    Koers + Signalen
                  </button>
                  <button
                    onClick={() => setSingleChartView('equity')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      singleChartView === 'equity'
                        ? 'bg-white text-emerald-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <i className="ph-bold ph-currency-eur"></i>
                    Vermogensgroei
                  </button>
                </div>

                {/* Tijdspanne */}
                <div className="flex items-center bg-gray-100 p-1 rounded-xl">
                  {['1Y', '3Y', '5Y', 'ALL'].map(range => (
                    <button
                      key={range}
                      onClick={() => setTimeRange(range)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        timeRange === range
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      {range === 'ALL' ? 'Alles' : range}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="h-80 w-full">
              {chartData ? (
                <Line data={chartData} options={chartOptions} />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                  Geen grafiekdata beschikbaar
                </div>
              )}
            </div>
          </div>

          {/* Signalen & Transactie Tijdlijn Card */}
          {singleResult.timelineEvents && singleResult.timelineEvents.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-base font-bold text-gray-900 mb-2">Historische Signalen & Transactie Tijdlijn</h3>
              <p className="text-xs text-gray-500 mb-4">
                Exacte data waarop een koop- of (deel)verkoopsignaal is afgegeven.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {singleResult.timelineEvents.map((evt, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                      evt.type === 'BUY'
                        ? 'bg-emerald-50/50 border-emerald-200/80 text-emerald-950'
                        : evt.type === 'PARTIAL_SELL'
                        ? 'bg-purple-50/50 border-purple-200/80 text-purple-950'
                        : 'bg-red-50/50 border-red-200/80 text-red-950'
                    }`}
                  >
                    <span
                      className={`p-2 rounded-lg font-bold text-[10px] shrink-0 ${
                        evt.type === 'BUY' 
                          ? 'bg-emerald-600 text-white' 
                          : evt.type === 'PARTIAL_SELL'
                          ? 'bg-purple-600 text-white'
                          : 'bg-red-600 text-white'
                      }`}
                    >
                      {evt.type === 'BUY' ? 'KOOP' : evt.type === 'PARTIAL_SELL' ? 'DEELVERKOOP' : '100% EXIT'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center text-xs font-bold mb-1">
                        <span>{evt.date}</span>
                        <span>€ {evt.price.toFixed(2)}</span>
                      </div>
                      <p className="text-[11px] leading-tight text-gray-700">
                        {evt.reason}
                      </p>
                      {evt.returnPct != null && (
                        <div className={`mt-1.5 text-xs font-extrabold ${evt.returnPct >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          Resultaat: {evt.returnPct >= 0 ? '+' : ''}{evt.returnPct.toFixed(1)}% (€ {evt.profit.toFixed(2)})
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transactielijst Logboek */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h3 className="text-base font-bold text-gray-900">Transactie Logboek</h3>
                <p className="text-xs text-gray-500">
                  Alle {singleResult.trades.length} gesimuleerde transacties voor {singleResult.ticker}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center bg-gray-100 p-1 rounded-xl flex-wrap gap-1">
                  {[
                    { id: 'ALL', label: 'Alles' },
                    { id: 'WINS', label: 'Winst' },
                    { id: 'LOSSES', label: 'Verlies' },
                    { id: 'PARTIAL', label: 'Deelverkoop' },
                    { id: 'OPEN', label: 'Lopend' }
                  ].map(filter => (
                    <button
                      key={filter.id}
                      onClick={() => setTradeFilter(filter.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        tradeFilter === filter.id
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={exportTradesCsv}
                  className="px-3.5 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm"
                >
                  <i className="ph-bold ph-download-simple text-sm"></i>
                  CSV
                </button>
              </div>
            </div>

            {filteredTrades.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                Geen transacties binnen dit filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-gray-50/80 text-gray-400 font-bold uppercase tracking-wider border-b border-gray-100">
                      <th className="py-3 px-3">#</th>
                      <th className="py-3 px-3">Type</th>
                      <th className="py-3 px-3">Stuks</th>
                      <th className="py-3 px-3">Koop Datum</th>
                      <th className="py-3 px-3">Koop Koers</th>
                      <th className="py-3 px-3">Verkoop Datum</th>
                      <th className="py-3 px-3">Verkoop Koers</th>
                      <th className="py-3 px-3">Exacte Exit Reden</th>
                      <th className="py-3 px-3 text-right">Dagen</th>
                      <th className="py-3 px-3 text-right">Rendement %</th>
                      <th className="py-3 px-3 text-right">Winst / Verlies</th>
                      <th className="py-3 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredTrades.map((t) => (
                      <tr key={t.tradeNumber} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-3 font-bold text-gray-500">{t.tradeNumber}</td>
                        <td className="py-3 px-3">
                          {t.type === 'PARTIAL_EXIT' ? (
                            <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full font-bold text-[10px] border border-purple-200">
                              Deelverkoop {t.sellPct}%
                            </span>
                          ) : t.type === 'FULL_EXIT' ? (
                            <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-full font-bold text-[10px] border border-red-200">
                              100% Verkoop
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-bold text-[10px] border border-blue-200">
                              Lopend
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-medium text-gray-700">
                          {t.sharesSold != null && t.sharesRemaining != null ? (
                            <span>{t.sharesSold} <span className="text-gray-400">({t.sharesRemaining} over)</span></span>
                          ) : (
                            t.shares
                          )}
                        </td>
                        <td className="py-3 px-3 font-semibold text-gray-900">{t.entryDate}</td>
                        <td className="py-3 px-3 text-gray-700 font-medium">€ {t.entryPrice?.toFixed(2)}</td>
                        <td className="py-3 px-3 font-semibold text-gray-900">{t.exitDate}</td>
                        <td className="py-3 px-3 text-gray-700 font-medium">€ {t.exitPrice?.toFixed(2)}</td>
                        <td className="py-3 px-3 font-medium text-gray-600 text-[11px]">
                          <span className={t.exitReason?.includes('Score gedaald') ? 'text-red-700 font-semibold' : t.exitReason?.includes('Deelverkoop') ? 'text-purple-800' : 'text-gray-700'}>
                            {t.exitReason}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right text-gray-500">{t.holdingDays}d</td>
                        <td className={`py-3 px-3 text-right font-extrabold ${t.returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {t.returnPct >= 0 ? '+' : ''}{t.returnPct.toFixed(1)}%
                        </td>
                        <td className={`py-3 px-3 text-right font-bold ${t.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {t.profit >= 0 ? '+' : ''}€ {t.profit.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {t.isOpen ? (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-bold text-[10px]">
                              Lopend
                            </span>
                          ) : t.isWin ? (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-bold text-[10px]">
                              Winst
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-full font-bold text-[10px]">
                              Verlies
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. RESULTATEN PORTFOLIO LIJST VERGELIJKING */}
      {mode === 'portfolio_list' && portfolioResult && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Totaal Geïnvesteerd</span>
              <div className="text-2xl font-extrabold text-gray-900 mt-1">
                € {portfolioResult.portfolioSummary.totalInvested.toLocaleString('nl-NL')}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Over {portfolioResult.totalStocks} geteste aandelen
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Strategie Eindwaarde</span>
              <div className="text-2xl font-extrabold text-gray-900 mt-1">
                € {portfolioResult.portfolioSummary.totalStrategyEndValue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
              </div>
              <div className={`text-xs font-bold mt-1 ${portfolioResult.portfolioSummary.strategyTotalReturnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {portfolioResult.portfolioSummary.strategyTotalReturnPct >= 0 ? '+' : ''}{portfolioResult.portfolioSummary.strategyTotalReturnPct.toFixed(1)}% Totale Winst
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Buy & Hold Benchmark</span>
              <div className="text-2xl font-extrabold text-gray-900 mt-1">
                € {portfolioResult.portfolioSummary.totalBuyAndHoldEndValue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {portfolioResult.portfolioSummary.buyAndHoldTotalReturnPct.toFixed(1)}% Benchmark Rendement
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Gemiddelde Win Rate</span>
              <div className="text-2xl font-extrabold text-gray-900 mt-1">
                {portfolioResult.portfolioSummary.overallWinRate.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {portfolioResult.portfolioSummary.totalTrades} transacties over alle aandelen
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 mb-4">Uitsplitsing Prestaties per Aandeel</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-50/80 text-gray-400 font-bold uppercase tracking-wider border-b border-gray-100">
                    <th className="py-3 px-3">Ticker</th>
                    <th className="py-3 px-3">Bedrijfsnaam</th>
                    <th className="py-3 px-3 text-right">Eindwaarde</th>
                    <th className="py-3 px-3 text-right">Strategie Rendement</th>
                    <th className="py-3 px-3 text-right">B&H Rendement</th>
                    <th className="py-3 px-3 text-right">Alpha</th>
                    <th className="py-3 px-3 text-right">Trades</th>
                    <th className="py-3 px-3 text-right">Win Rate</th>
                    <th className="py-3 px-3 text-right">Max Drawdown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {portfolioResult.stockBreakdown.map((s) => (
                    <tr key={s.ticker} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-3 font-extrabold text-gray-900">{s.ticker}</td>
                      <td className="py-3 px-3 text-gray-600 font-medium">{s.name}</td>
                      <td className="py-3 px-3 text-right font-bold text-gray-900">
                        € {s.kpis.finalStrategyValue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`py-3 px-3 text-right font-extrabold ${s.kpis.strategyTotalReturnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {s.kpis.strategyTotalReturnPct >= 0 ? '+' : ''}{s.kpis.strategyTotalReturnPct.toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-right text-gray-600">
                        {s.kpis.buyAndHoldTotalReturnPct >= 0 ? '+' : ''}{s.kpis.buyAndHoldTotalReturnPct.toFixed(1)}%
                      </td>
                      <td className={`py-3 px-3 text-right font-bold ${s.kpis.outperformancePct >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {s.kpis.outperformancePct >= 0 ? '+' : ''}{s.kpis.outperformancePct.toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-right text-gray-600">{s.kpis.totalTrades}</td>
                      <td className="py-3 px-3 text-right font-semibold text-gray-800">{s.kpis.winRate.toFixed(1)}%</td>
                      <td className="py-3 px-3 text-right text-red-600">-{s.kpis.maxDrawdownPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StrategyBacktestTab;

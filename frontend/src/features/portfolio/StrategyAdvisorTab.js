import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import http from '../../http-common';
import toast from 'react-hot-toast';
import { useIncognito } from '../../hooks/useIncognito';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

import EtfStrategyAdvisor from './EtfStrategyAdvisor';
import StockStrategyTimeline from './StockStrategyTimeline';

ChartJS.register(ArcElement, Tooltip, Legend);

// Sparkline Component voor Kwartaal Waardeverdeling Trend (Laatste 8 Kwartalen in chronologische volgorde)
const WvSparkline = ({ history = [], currentWv, prevWv, wvDiff, wvDiffPct, isDropping, compact = false }) => {
  if (!history || history.length === 0) {
    if (currentWv !== undefined && currentWv !== null) {
      return <span className="font-bold text-gray-700">{Number(currentWv).toFixed(1)}%</span>;
    }
    return <span className="text-gray-400">-</span>;
  }

  // Sorteer altijd strikt chronologisch (oudste links ➔ nieuwste kwartaal rechts) en pak de laatste 8 kwartalen
  const sortedHistory = [...history]
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
    .slice(-8);

  const values = sortedHistory.map(h => Number(h.waardeVerdeling) || 0);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const min = Math.max(0, minVal * 0.85);
  const max = maxVal * 1.15 || 1;
  const range = max - min || 1;
  
  const width = compact ? 105 : 135;
  const height = compact ? 26 : 34;
  const padding = 3;

  const points = values.map((val, idx) => {
    const x = padding + (idx / Math.max(1, values.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((val - min) / range) * (height - 2 * padding);
    return { x, y, val, date: sortedHistory[idx]?.date };
  });

  const pathD = points.reduce((acc, p, idx) => (
    idx === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `${acc} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  ), '');

  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

  const isRising = prevWv !== null && prevWv !== undefined && Number(currentWv) > Number(prevWv);
  const strokeColor = isDropping ? '#ef4444' : '#10b981';
  const gradId = `wv-grad-${Math.random().toString(36).substring(2, 8)}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <span className="text-[11px] font-bold text-gray-800">
          WV: <strong className={isDropping ? 'text-rose-600 font-black' : 'text-emerald-700 font-black'}>
            {Number(currentWv ?? values[values.length - 1]).toFixed(1)}%
          </strong>
        </span>
        {prevWv !== null && prevWv !== undefined && (
          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 ${
            isDropping
              ? 'bg-rose-100 text-rose-800 border border-rose-200'
              : isRising
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              : 'bg-slate-100 text-slate-700 border border-slate-200'
          }`}>
            {isDropping ? '📉 Dalend' : isRising ? '📈 Stijgend' : '➖ Stabiel'} {wvDiff > 0 ? `+${wvDiff.toFixed(1)}%` : `${wvDiff?.toFixed(1)}%`}
          </span>
        )}
      </div>

      <div className="relative group flex items-center">
        <svg width={width} height={height} className="overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <path d={areaD} fill={`url(#${gradId})`} />
          <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x.toFixed(1)}
              cy={p.y.toFixed(1)}
              r={i === points.length - 1 ? "3.5" : "2"}
              fill={i === points.length - 1 ? strokeColor : "#ffffff"}
              stroke={strokeColor}
              strokeWidth="1.5"
            >
              <title>{`${p.date ? new Date(p.date).toLocaleDateString('nl-BE') : 'Kwartaal'}: ${p.val.toFixed(1)}%`}</title>
            </circle>
          ))}
        </svg>
      </div>
      
      {/* Historie kwartaal labels (Laatste 8 kwartalen: oudste links -> nieuwste rechts) */}
      {sortedHistory.length > 1 && (
        <div className="flex justify-between text-[9px] text-gray-400 font-semibold px-0.5">
          <span>{sortedHistory[0]?.date ? new Date(sortedHistory[0].date).toLocaleDateString('nl-BE', { month: 'short', year: '2-digit' }) : ''}</span>
          <span>➔ {sortedHistory[sortedHistory.length - 1]?.date ? new Date(sortedHistory[sortedHistory.length - 1].date).toLocaleDateString('nl-BE', { month: 'short', year: '2-digit' }) : ''}</span>
        </div>
      )}
    </div>
  );
};

const StrategyAdvisorTab = () => {
  const uid = localStorage.getItem('userID') || 1;
  const userRole = localStorage.getItem('role') || 'user';
  const isAdmin = Number(uid) === 1 || userRole === 'admin';
  const userPermissions = useMemo(() => {
    if (isAdmin) {
      return { canUseStockStrategy: true, canUseEtfStrategy: true, canViewFormulas: true };
    }
    try {
      const saved = localStorage.getItem('user_permissions');
      return saved ? JSON.parse(saved) : { canUseStockStrategy: true, canUseEtfStrategy: true, canViewFormulas: false };
    } catch {
      return { canUseStockStrategy: true, canUseEtfStrategy: true, canViewFormulas: false };
    }
  }, [isAdmin]);
  const canUseStocks = isAdmin || userPermissions.canUseStockStrategy !== false;
  const canUseEtf = isAdmin || userPermissions.canUseEtfStrategy !== false;

  const [data, setData] = useState(() => {
    try {
      const cached = localStorage.getItem(`cached_strategy_advisor_stocks_v4_${uid}`);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      return !localStorage.getItem(`cached_strategy_advisor_stocks_v4_${uid}`);
    } catch (e) {
      return true;
    }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeViewMode, setActiveViewMode] = useState('timeline'); // 'timeline' | 'alerts' | 'charts' | 'matrix' | 'history'
  const [alertLayoutMode, setAlertLayoutMode] = useState('COLUMNS'); // 'COLUMNS' (2-koloms groen/geel) | 'TIMELINE' (lijst)
  const [alertFilter, setAlertFilter] = useState('ALL'); // 'ALL' | 'ACTIONABLE' | 'CAUTION' | 'SELL' | 'ROTATION' | 'OLD_STRATEGY'
  const [matrixFilter, setMatrixFilter] = useState('ALL');
  const [idealTableFilter, setIdealTableFilter] = useState('ALL'); // 'ALL' | 'WATCH_OR_BUY' | 'MACD_RED_TURNING' | 'UNDERVALUED' | 'RISING_WV'
  const [idealTableSort, setIdealTableSort] = useState('WEIGHT'); // 'WEIGHT' | 'RADAR'
  const [showTimingRules, setShowTimingRules] = useState(false);
  const [strategyType, setStrategyType] = useState(() => (canUseStocks ? 'stocks' : 'etf')); // 'stocks' | 'etf'
  const [isCashWidgetOpen, setIsCashWidgetOpen] = useState(false);
  const [showStrategyConfigModal, setShowStrategyConfigModal] = useState(false);
  const [myStrategyConfig, setMyStrategyConfig] = useState(null);
  const [allStrategiesList, setAllStrategiesList] = useState([]);
  const [savingConfigType, setSavingConfigType] = useState('');

  // Flexibele lijst van actieve strategieën (1, 2 of meer; elk Aandelen of ETF met prioriteit)
  const [activeStrategiesDraft, setActiveStrategiesDraft] = useState([]);
  const [showAddStrategyForm, setShowAddStrategyForm] = useState(false);
  const [newStratId, setNewStratId] = useState(1);
  const [newStratPriority, setNewStratPriority] = useState(1);
  const [newStratFundingMode, setNewStratFundingMode] = useState('available_cash');
  const [newStratMonthlyBudget, setNewStratMonthlyBudget] = useState(500);
  const [newStratAllowSelling, setNewStratAllowSelling] = useState('full_strategy');

  // Bevestigingsmodal state zodat er nooit per ongeluk een strategie wordt aangepast of verwijderd
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    description: '',
    details: [],
    confirmLabel: 'Bevestigen',
    variant: 'indigo', // 'indigo' | 'red' | 'amber'
    onConfirm: null
  });

  const isIncognito = useIncognito();

  const fetchMyStrategyConfig = useCallback(async () => {
    try {
      const [cfgRes, listRes] = await Promise.all([
        http.get('/strategies/my-config'),
        http.get('/strategies')
      ]);
      if (cfgRes.data) {
        setMyStrategyConfig(cfgRes.data);
        const activeList = Array.isArray(cfgRes.data.activeStrategies) ? cfgRes.data.activeStrategies : [];
        setActiveStrategiesDraft(
          activeList.map((item, idx) => ({
            entry_id: item.entry_id,
            strategy_id: Number(item.strategy_id),
            name: item.name,
            strategy_type: item.strategy_type || 'STOCKS',
            priority_order: Number(item.priority_order || idx + 1),
            funding_mode: item.funding_mode || (item.strategy_type === 'ETF' ? 'monthly_amount' : 'available_cash'),
            monthly_budget: Number(item.monthly_budget ?? (item.strategy_type === 'ETF' ? 450 : 500)),
            allow_selling: item.allow_selling || (item.strategy_type === 'ETF' ? 'buy_only' : 'full_strategy'),
            activated_at: item.activated_at
          }))
        );
        setNewStratPriority(activeList.length + 1);
      }
      if (listRes.data) {
        setAllStrategiesList(listRes.data);
        if (listRes.data.length > 0) {
          setNewStratId(listRes.data[0].strategy_id);
        }
      }
    } catch (err) {
      console.warn('Kon persoonlijke strategie-configuratie niet laden:', err.message);
    }
  }, []);

  const fetchAdvisorData = useCallback(async (force = false) => {
    if (force) setLoading(true);
    try {
      const res = await http.get(`/portfolio/strategy-advisor?userId=${uid}&currency=EUR${force ? '&forceRefresh=true' : ''}`);
      setData(res.data);
      try {
        localStorage.setItem(`cached_strategy_advisor_stocks_v4_${uid}`, JSON.stringify(res.data));
      } catch (e) {
        // localStorage quota
      }
    } catch (err) {
      console.error('Fout bij ophalen Strategie Assistent data:', err);
      if (!data) toast.error('Kon strategie-advies niet laden.');
    } finally {
      setLoading(false);
    }
  }, [uid, data]);

  useEffect(() => {
    fetchAdvisorData();
    fetchMyStrategyConfig();
  }, [fetchAdvisorData, fetchMyStrategyConfig]);

  const updateDraftField = (index, field, value) => {
    setActiveStrategiesDraft(prev => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };
      if (field === 'strategy_id') {
        const found = allStrategiesList.find(s => Number(s.strategy_id) === Number(value));
        if (found) {
          item.name = found.name;
          item.strategy_type = found.strategy_type || 'STOCKS';
        }
      }
      next[index] = item;
      return next;
    });
  };

  const formatFundingLabel = (mode, budget) => {
    if (mode === 'monthly_amount') return `Vast bedrag (€${Number(budget || 0)}/mnd)`;
    if (mode === 'cash_plus_rotation') return 'Beschikbaar vrij geld + Rotatie';
    return 'Enkel beschikbaar vrij geld';
  };

  const formatSellingLabel = (rule) => {
    if (rule === 'buy_only') return 'Nooit verkopen (100% Buy & Hold)';
    if (rule === 'score_drop_only') return 'Enkel verkopen bij Score < 5';
    return 'Volledige verkoop- & snoeiregels';
  };

  // 1. Bevestiging vragen vóór het opslaan/aanpassen van een actieve strategie
  const requestSaveActiveStrategy = (draftItem) => {
    const chosenStrat = allStrategiesList.find(s => Number(s.strategy_id) === Number(draftItem.strategy_id));
    const stratName = chosenStrat ? chosenStrat.name : draftItem.name;
    setConfirmModal({
      isOpen: true,
      title: 'Bevestig aanpassing van actieve strategie',
      description: `Weet je zeker dat je jouw actieve strategie op Prioriteit #${draftItem.priority_order} wilt aanpassen?`,
      details: [
        `Strategie: ${stratName} (${(chosenStrat?.strategy_type || draftItem.strategy_type) === 'ETF' ? 'ETF DCA' : 'Losse Aandelen'})`,
        `Prioriteit: #${draftItem.priority_order}`,
        `Inlegmethode: ${formatFundingLabel(draftItem.funding_mode, draftItem.monthly_budget)}`,
        `Verkoopregel: ${formatSellingLabel(draftItem.allow_selling)}`,
        `Meldingen van eventuele vorige strategieën blijven altijd bewaard.`
      ],
      confirmLabel: 'Ja, wijziging opslaan',
      variant: 'indigo',
      onConfirm: async () => {
        setSavingConfigType(`save-${draftItem.entry_id || draftItem.priority_order}`);
        try {
          const res = await http.post('/strategies/my-active', {
            entry_id: draftItem.entry_id,
            strategy_id: Number(draftItem.strategy_id),
            priority_order: Number(draftItem.priority_order),
            funding_mode: draftItem.funding_mode,
            monthly_budget: Number(draftItem.monthly_budget || 0),
            allow_selling: draftItem.allow_selling
          });
          toast.success(res.data?.message || 'Actieve strategie bijgewerkt!');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          await fetchMyStrategyConfig();
          await fetchAdvisorData(true);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Kon strategie niet aanpassen.');
        } finally {
          setSavingConfigType('');
        }
      }
    });
  };

  // 2. Bevestiging vragen vóór het wijzigen van de prioriteitsvolgorde
  const requestChangePriority = (draftItem, newPriority) => {
    if (!draftItem.entry_id) return;
    setConfirmModal({
      isOpen: true,
      title: 'Prioriteit van strategie wijzigen',
      description: `Wil je "${draftItem.name}" verplaatsen van Prioriteit #${draftItem.priority_order} naar Prioriteit #${newPriority}?`,
      details: [
        `Prioriteit #1 heeft altijd als eerste recht op jouw beschikbare cash of maandbudget.`,
        `De overige actieve strategieën schuiven automatisch mee op.`
      ],
      confirmLabel: `Ja, zet op Prioriteit #${newPriority}`,
      variant: 'indigo',
      onConfirm: async () => {
        setSavingConfigType(`prio-${draftItem.entry_id}`);
        try {
          const res = await http.put(`/strategies/my-active/${draftItem.entry_id}/priority`, {
            new_priority: Number(newPriority)
          });
          toast.success(res.data?.message || `Prioriteit aangepast naar #${newPriority}`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          await fetchMyStrategyConfig();
          await fetchAdvisorData(true);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Kon prioriteit niet aanpassen.');
        } finally {
          setSavingConfigType('');
        }
      }
    });
  };

  // 3. Bevestiging vragen vóór het verwijderen/stopzetten van een actieve strategie
  const requestRemoveActiveStrategy = (draftItem) => {
    if (!draftItem.entry_id) return;
    setConfirmModal({
      isOpen: true,
      title: 'Actieve strategie verwijderen / stopzetten?',
      description: `Weet je zeker dat je "${draftItem.name}" (Prioriteit #${draftItem.priority_order}) uit jouw actieve strategieën wilt verwijderen?`,
      details: [
        `Je ontvangt voor deze strategie geen nieuwe dagelijkse meldingen meer.`,
        `Alle eerdere meldingen van "${draftItem.name}" blijven wél netjes bewaard in je historiek met hun oorspronkelijke strategielabel.`,
        `De strategie zelf blijft gewoon beschikbaar in de lijst mocht je haar later opnieuw willen activeren.`
      ],
      confirmLabel: 'Ja, actieve strategie verwijderen',
      variant: 'red',
      onConfirm: async () => {
        setSavingConfigType(`del-${draftItem.entry_id}`);
        try {
          const res = await http.delete(`/strategies/my-active/${draftItem.entry_id}`);
          toast.success(res.data?.message || 'Strategie verwijderd uit je actieve lijst.');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          await fetchMyStrategyConfig();
          await fetchAdvisorData(true);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Kon actieve strategie niet verwijderen.');
        } finally {
          setSavingConfigType('');
        }
      }
    });
  };

  // 4. Bevestiging vragen vóór het toevoegen van een extra actieve strategie
  const requestAddActiveStrategy = () => {
    const chosenStrat = allStrategiesList.find(s => Number(s.strategy_id) === Number(newStratId));
    if (!chosenStrat) {
      toast.error('Selecteer eerst een strategie.');
      return;
    }
    const alreadyActive = activeStrategiesDraft.some(s => Number(s.strategy_id) === Number(newStratId));
    setConfirmModal({
      isOpen: true,
      title: alreadyActive ? 'Bestaande actieve strategie bijwerken?' : 'Nieuwe actieve strategie toevoegen?',
      description: alreadyActive
        ? `"${chosenStrat.name}" staat al in je actieve lijst. Wil je haar instellingen en prioriteit (#${newStratPriority}) bijwerken?`
        : `Wil je "${chosenStrat.name}" toevoegen aan jouw actieve strategieën op Prioriteit #${newStratPriority}?`,
      details: [
        `Type: ${(chosenStrat.strategy_type || 'STOCKS') === 'ETF' ? 'ETF DCA Strategie' : 'Losse Aandelen Strategie'}`,
        `Prioriteit: #${newStratPriority} (${Number(newStratPriority) === 1 ? 'Hoogste prioriteit voor cash/budget' : `Volgt na prioriteit #${Number(newStratPriority) - 1}`})`,
        `Inlegmethode: ${formatFundingLabel(newStratFundingMode, newStratMonthlyBudget)}`,
        `Verkoopregel: ${formatSellingLabel(newStratAllowSelling)}`
      ],
      confirmLabel: alreadyActive ? 'Ja, bijwerken' : 'Ja, strategie activeren',
      variant: 'indigo',
      onConfirm: async () => {
        setSavingConfigType('add-new');
        try {
          const res = await http.post('/strategies/my-active', {
            strategy_id: Number(newStratId),
            priority_order: Number(newStratPriority),
            funding_mode: newStratFundingMode,
            monthly_budget: Number(newStratMonthlyBudget || 0),
            allow_selling: newStratAllowSelling
          });
          toast.success(res.data?.message || 'Strategie geactiveerd!');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          setShowAddStrategyForm(false);
          await fetchMyStrategyConfig();
          await fetchAdvisorData(true);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Kon strategie niet toevoegen.');
        } finally {
          setSavingConfigType('');
        }
      }
    });
  };

  // Handmatige update trigger
  const handleTriggerUpdate = async () => {
    setIsUpdating(true);
    try {
      toast.loading('Bezig met ophalen laatste beurskoersen & SEC kwartalen...', { id: 'sync-data' });
      await http.post('/watchlist/update-data');
      toast.success('Data & koersen succesvol bijgewerkt!', { id: 'sync-data' });
      await fetchAdvisorData(true);
    } catch (err) {
      console.error('Fout bij updaten data:', err);
      toast.error('Update mislukt of gedeeltelijk voltooid.', { id: 'sync-data' });
    } finally {
      setIsUpdating(false);
    }
  };

  const formatCurrency = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '€ 0,00';
    return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(val);
  };

  // Kleurenpalet voor Donut grafieken
  const PALETTE = [
    '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', 
    '#06b6d4', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
    '#a855f7', '#d946ef', '#0ea5e9', '#22c55e', '#eab308'
  ];

  // Donut Chart Data: Huidige Portefeuille
  const currentChartData = useMemo(() => {
    if (!data?.holdings) return null;
    const topHoldings = [...data.holdings].sort((a, b) => b.holdingValue - a.holdingValue);
    const mainItems = topHoldings.slice(0, 9);
    const otherItems = topHoldings.slice(9);
    const otherValue = otherItems.reduce((acc, h) => acc + h.holdingValue, 0);

    const labels = mainItems.map(h => `${h.ticker} (${h.weightPct.toFixed(1)}%)`);
    const values = mainItems.map(h => h.holdingValue);
    if (otherValue > 0) {
      const otherPct = data.totalPortfolioValue > 0 ? (otherValue / data.totalPortfolioValue) * 100 : 0;
      labels.push(`Overige (${otherPct.toFixed(1)}%)`);
      values.push(otherValue);
    }

    return {
      labels,
      datasets: [{
        data: values,
        backgroundColor: PALETTE.slice(0, labels.length),
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 6
      }]
    };
  }, [data]);

  // Donut Chart Data: Ideale Portefeuille (Gewogen naar Waardeverdeling!)
  const idealChartData = useMemo(() => {
    if (!data?.idealPortfolio) return null;
    const labels = data.idealPortfolio.map(i => `${i.ticker} (${i.targetWeightPct}%)`);
    const values = data.idealPortfolio.map(i => i.targetValueEur);

    return {
      labels,
      datasets: [{
        data: values,
        backgroundColor: PALETTE.slice(0, labels.length),
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 6
      }]
    };
  }, [data]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          boxWidth: 12,
          font: { size: 11, weight: '600' },
          color: '#374151',
          padding: 10
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const val = context.raw || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
            return ` ${formatCurrency(val)} (${pct}%)`;
          }
        }
      }
    },
    cutout: '62%'
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-12 border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-gray-700 font-semibold text-lg">Strategie Assistent Berekenen...</div>
        <p className="text-gray-400 text-sm max-w-md">
          We analyseren je huidige posities, berekenen de ideale portefeuille verdeling (gewogen naar Waardeverdeling) en synchroniseren de data-gedreven meldingen.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-red-200 text-center text-red-600">
        Geen data beschikbaar om te analyseren.
      </div>
    );
  }

  const {
    totalPortfolioValue,
    alignmentPercentage,
    actionSummary,
    dataDrivenAlerts = [],
    idealPortfolio = [],
    holdings = [],
    dataFreshness,
    isBlackBoxMode = false
  } = data;
  const hideFormulas = !isAdmin && (isBlackBoxMode || !userPermissions.canViewFormulas);

  const filteredAlerts = dataDrivenAlerts.filter(a => {
    const matchesSearch = (a.ticker || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (a.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (alertFilter === 'ALL') return true;
    if (alertFilter === 'ACTIONABLE') return a.isActionableBuy;
    if (alertFilter === 'CAUTION') return a.isCautionBuy;
    if (alertFilter === 'SELL') return a.signalType === 'Verkoopsignaal';
    if (alertFilter === 'ROTATION') return a.fundingSource?.status === 'ROTATION_REQUIRED';
    if (alertFilter === 'OLD_STRATEGY') return Boolean(a.isFromOldStrategy);
    return true;
  });

  const actionableBuyAlerts = filteredAlerts.filter(a => a.isActionableBuy);
  const cautionBuyAlerts = filteredAlerts.filter(a => a.isCautionBuy);
  const sellAlerts = filteredAlerts.filter(a => a.signalType === 'Verkoopsignaal');

  const actionableCount = dataDrivenAlerts.filter(a => a.isActionableBuy).length;
  const cautionCount = dataDrivenAlerts.filter(a => a.isCautionBuy).length;
  const sellAlertsCount = dataDrivenAlerts.filter(a => a.signalType === 'Verkoopsignaal').length;
  const rotationNeededCount = dataDrivenAlerts.filter(a => a.fundingSource?.status === 'ROTATION_REQUIRED').length;
  const oldStrategyAlertsCount = dataDrivenAlerts.filter(a => a.isFromOldStrategy).length;

  const filteredHoldings = holdings.filter(h => {
    const matchesSearch = h.ticker.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          h.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (matrixFilter === 'ALL') return true;
    if (matrixFilter === 'BUY_MORE') return h.actionType === 'BUY_MORE';
    if (matrixFilter === 'HOLD') return h.actionType === 'HOLD' || h.actionType === 'ETF_INDEX';
    if (matrixFilter === 'TAKE_PROFIT') return h.actionType === 'TAKE_PROFIT';
    if (matrixFilter === 'TRIM') return h.actionType.startsWith('TRIM');
    if (matrixFilter === 'ETF') return h.actionType === 'ETF_INDEX';
    return true;
  });

  // Reusable Alert Card Component
  const renderAlertCard = (alert) => {
    const isSell = alert.signalType === 'Verkoopsignaal';
    const isActionable = alert.isActionableBuy;
    const isCaution = alert.isCautionBuy;
    const isBuy = !isSell && !isCaution;
    const hasLinkedSales = alert.linkedSales && alert.linkedSales.length > 0;
    const isWvDropping = alert.isWvDown || (alert.wvDiff < 0);
    const isOldStrategy = Boolean(alert.isFromOldStrategy);
    const cardStrategyName = alert.strategyName || data?.activeStrategyConfig?.name || 'Huidige Live Strategie Arne';

    return (
      <div
        key={alert.alertId}
        className={`bg-white rounded-3xl p-5 border transition-all shadow-xs hover:shadow-md flex flex-col justify-between ${
          isOldStrategy
            ? 'border-purple-300 bg-gradient-to-b from-purple-50/40 to-white ring-1 ring-purple-200'
            : isSell 
            ? 'border-rose-200/90 hover:border-rose-300' 
            : isActionable 
            ? 'border-emerald-200 hover:border-emerald-300 bg-gradient-to-b from-white to-emerald-50/20' 
            : 'border-amber-200 hover:border-amber-300 bg-gradient-to-b from-white to-amber-50/20'
        }`}
      >
        <div className="space-y-4">
          {/* STRATEGIE HERKOMST BALK: Laat direct zien bij welke strategie deze melding hoort */}
          <div className={`px-3 py-1.5 rounded-xl border text-[11px] font-extrabold flex items-center justify-between gap-2 ${
            isOldStrategy
              ? 'bg-purple-100/90 text-purple-950 border-purple-300'
              : 'bg-indigo-50/90 text-indigo-950 border-indigo-200/80'
          }`}>
            <span className="flex items-center gap-1.5 truncate">
              <i className={`ph-fill ${isOldStrategy ? 'ph-clock-counter-clockwise text-purple-700' : 'ph-target text-indigo-600'} text-sm shrink-0`}></i>
              <span className="truncate">
                {isOldStrategy ? `Vorige Strategie (Bewaard): ${cardStrategyName}` : `Strategie: ${cardStrategyName}`}
              </span>
            </span>
            <span className={`px-2 py-0.5 rounded-md text-[9px] uppercase tracking-wider shrink-0 font-black ${
              isOldStrategy ? 'bg-purple-200 text-purple-900' : 'bg-indigo-200/80 text-indigo-900'
            }`}>
              {isOldStrategy ? 'Vóór wissel' : 'Actief'}
            </span>
          </div>

          {/* Top Row: Date, Ticker, Badges */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-2xl flex flex-col items-center justify-center font-bold text-center shrink-0 ${
                isSell 
                  ? 'bg-rose-100 text-rose-800' 
                  : isActionable 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : 'bg-amber-100 text-amber-900'
              }`}>
                <span className="text-[9px] uppercase tracking-wider">{new Date(alert.date).toLocaleDateString('nl-BE', { month: 'short' })}</span>
                <span className="text-sm font-black leading-none">{new Date(alert.date).getDate()}</span>
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-black text-gray-900">{alert.ticker}</span>
                  <span className="text-xs text-gray-500 font-medium truncate max-w-[140px]" title={alert.name}>{alert.name}</span>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-black text-[10px]">
                    ★ 5/5
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span>Signaaldatum: <strong>{alert.date}</strong></span>
                  {isSell && alert.reportDate && (
                    <span className="text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                      📅 Rapportagedatum: {alert.reportDate} (Kwartaal: {alert.periodEndDate || '-'})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Badges */}
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-black border shrink-0 ${
              isSell 
                ? 'bg-rose-100 text-rose-800 border-rose-200' 
                : isActionable 
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                : 'bg-amber-100 text-amber-950 border-amber-300'
            }`}>
              {isSell ? '🔴 Verkoop' : (isActionable ? '🟢 Direct Kopen' : '⚠️ Onder Toezicht (Geen Koop)')}
            </span>
          </div>

          {/* Waardeverdeling Sparkline & Daling Inzicht */}
          <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                <i className="ph-bold ph-chart-line text-indigo-600"></i>
                {hideFormulas ? 'Strategie Kwaliteitstrend:' : 'Waardeverdeling Trend (Kwartalen):'}
              </span>
              {!isBuy ? (
                <span className="text-[10px] text-rose-700 font-bold">
                  Bekend op rapportagedatum: <strong>{alert.reportDate ? new Date(alert.reportDate).toLocaleDateString('nl-BE') : alert.date}</strong>
                </span>
              ) : (
                alert.latestQuarterDate && (
                  <span className="text-[10px] text-gray-500">
                    Laatste kwartaal: <strong>{new Date(alert.latestQuarterDate).toLocaleDateString('nl-BE')}</strong>
                  </span>
                )
              )}
            </div>

            {hideFormulas ? (
              <div className="flex items-center justify-between pt-0.5">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${
                  isWvDropping
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}>
                  {isWvDropping ? '📉 Dalende Kwaliteitstrend (Kwartaal)' : '📈 Stabiele / Stijgende Kwaliteitstrend'}
                </span>
              </div>
            ) : (
              <>
                <WvSparkline
                  history={alert.wvHistory || []}
                  currentWv={alert.waardeVerdeling}
                  prevWv={alert.prevWaardeVerdeling}
                  wvDiff={alert.wvDiff}
                  wvDiffPct={alert.wvDiffPct}
                  isDropping={isWvDropping}
                />

                {/* Expliciete Waarschuwing bij Daling */}
                {isWvDropping && alert.prevWaardeVerdeling !== null && alert.prevWaardeVerdeling !== undefined && (
                  <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-[11px] flex items-start gap-1.5 leading-tight">
                    <i className="ph-fill ph-trend-down text-rose-600 text-sm shrink-0 mt-0.5"></i>
                    <span>
                      <strong>Waardeverdeling gezakt:</strong> Van {alert.prevWaardeVerdeling.toFixed(1)}% naar {alert.waardeVerdeling?.toFixed(1)}% 
                      <strong className="text-rose-700"> ({alert.wvDiff < 0 ? alert.wvDiff?.toFixed(1) : `-${alert.wvDiff}`}% / {alert.wvDiffPct?.toFixed(1)}%)</strong>.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Waardering Status & Waarschuwing */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white p-2.5 rounded-xl border border-gray-200 flex flex-col justify-between">
              <span className="text-[10px] text-gray-400 font-bold uppercase">Koers op Signaal</span>
              <span className="font-bold text-gray-900">{formatCurrency(alert.priceAtAlert)}</span>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-gray-200 flex flex-col justify-between">
              <span className="text-[10px] text-gray-400 font-bold uppercase">
                {hideFormulas ? 'Waardering Status' : 'Waardering (x Intr.)'}
              </span>
              {hideFormulas ? (
                <span className={`font-black ${alert.isOvervalued ? 'text-amber-800' : 'text-emerald-700'}`}>
                  {alert.isOvervalued ? '⚠️ Overgewaardeerd' : '🟢 Koopwaardig'}
                </span>
              ) : (
                <span className={`font-black ${
                  alert.priceToIntrinsicRatio <= 1.0 
                    ? 'text-emerald-700' 
                    : alert.priceToIntrinsicRatio <= 1.3 
                    ? 'text-teal-700' 
                    : 'text-amber-800'
                }`}>
                  {alert.priceToIntrinsicRatio ? `${alert.priceToIntrinsicRatio.toFixed(2)}x` : '-'}
                  {alert.isOvervalued && <span className="text-[10px] font-bold text-amber-700 block">(Overgewaardeerd)</span>}
                </span>
              )}
            </div>
          </div>

          {/* Live Koersvergelijking & Late Koopkans Inzicht */}
          {alert.currentPrice && (
            <div className={`p-3 rounded-2xl border text-xs space-y-2 ${
              alert.isCheaperNow 
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950' 
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="font-extrabold flex items-center gap-1.5">
                  <i className={`ph-fill ${alert.isCheaperNow ? 'ph-sparkle text-emerald-600' : 'ph-clock text-slate-500'}`}></i>
                  {alert.isLatestAlertForStock ? '⭐ Laatste Koopsignaal' : 'Signaal vs Huidige Koers'}
                </span>
                {alert.currentPriceDate && (
                  <span className="text-[10px] text-gray-500">
                    Laatste slotkoers van: <strong>{new Date(alert.currentPriceDate).toLocaleDateString('nl-BE')}</strong>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-0.5">
                <div className="bg-white/90 p-2 rounded-xl border border-gray-200/80">
                  <span className="text-[9px] text-gray-400 font-bold uppercase block">Op Signaaldatum ({alert.date})</span>
                  <span className="font-bold text-gray-800">{formatCurrency(alert.priceAtAlert)}</span>
                </div>

                <div className="bg-white/90 p-2 rounded-xl border border-gray-200/80">
                  <span className="text-[9px] text-gray-400 font-bold uppercase block">Huidige Slotkoers</span>
                  <span className={`font-black ${alert.isCheaperNow ? 'text-emerald-700 font-black' : 'text-gray-900'}`}>
                    {formatCurrency(alert.currentPrice)}
                  </span>
                </div>

                <div className={`p-2 rounded-xl border col-span-2 sm:col-span-1 flex flex-col justify-between ${
                  alert.isCheaperNow ? 'bg-emerald-100/70 border-emerald-300' : 'bg-white/90 border-gray-200/80'
                }`}>
                  <span className="text-[9px] text-gray-500 font-bold uppercase block">Koersverschil</span>
                  <span className={`font-black text-xs ${alert.isCheaperNow ? 'text-emerald-800' : 'text-slate-700'}`}>
                    {alert.priceDiffSinceAlertPct > 0 ? `+${alert.priceDiffSinceAlertPct.toFixed(1)}%` : `${alert.priceDiffSinceAlertPct?.toFixed(1)}%`}
                    {alert.isCheaperNow ? ' (Goedkoper!)' : ''}
                  </span>
                </div>
              </div>

              {/* Late Koopkans Toelichting */}
              {alert.isLateBuyOpportunity && (
                <div className="p-2 rounded-xl bg-emerald-100/90 border border-emerald-300 text-emerald-900 text-[11px] flex items-center gap-1.5 font-semibold">
                  <i className="ph-fill ph-check-circle text-emerald-700 text-sm shrink-0"></i>
                  <span>
                    <strong>Late Koopkans:</strong> Noteert momenteel {Math.abs(alert.priceDiffSinceAlertPct).toFixed(1)}% goedkoper dan op de signaaldatum zonder nieuwe kwartaalwijzigingen.
                  </span>
                </div>
              )}
            </div>
          )}

          {alert.warning && (
            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-1.5 leading-snug">
              <i className="ph-fill ph-warning text-amber-600 text-sm shrink-0 mt-0.5"></i>
              <span>{alert.warning}</span>
            </div>
          )}

          {/* Positiegrootte Inzicht: Bezit op meldingsdatum vs Ideaal Doel */}
          {isBuy && alert.targetValueEur !== null && (
            <div className="p-2.5 bg-indigo-50/70 rounded-xl border border-indigo-100/90 text-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider block">
                  In bezit op {alert.date}:
                </span>
                <span className="font-bold text-gray-900">
                  {alert.currentShares > 0 
                    ? `${alert.currentShares} stuks (${formatCurrency(alert.currentOwnedEur)})` 
                    : '0 stuks (Nog niet in bezit)'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider block">
                  Streefdoel ({alert.targetWeightPct}%):
                </span>
                <span className="font-extrabold text-indigo-900">
                  {alert.targetShares ? `${alert.targetShares} stuks` : '-'} ({formatCurrency(alert.targetValueEur)})
                </span>
              </div>
            </div>
          )}

          {/* Transactie Box */}
          {isCaution ? (
            <div className="bg-amber-950/90 border border-amber-800/80 text-amber-100 p-3.5 rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <div className="text-[10px] text-amber-300 font-bold uppercase tracking-wider flex items-center gap-1">
                  <i className="ph-fill ph-prohibit text-amber-400"></i>
                  Strategie Status
                </div>
                <div className="text-sm font-black text-amber-200 mt-0.5">
                  GEEN AANKOOP (Conform Backtest)
                </div>
              </div>
              <div className="text-right">
                <span className="px-2.5 py-1 bg-amber-900/80 text-amber-200 border border-amber-700/60 rounded-xl text-xs font-bold inline-block">
                  Overgeslagen
                </span>
                <div className="text-[10px] text-amber-300/80 mt-1 font-semibold">
                  Budget: € 0,00
                </div>
              </div>
            </div>
          ) : !isSell && (alert.shares === 0 || alert.fundingSource?.status === 'TARGET_REACHED') ? (
            <div className="bg-indigo-950/90 border border-indigo-800/80 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <div className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider flex items-center gap-1">
                  <i className="ph-fill ph-target text-indigo-400"></i>
                  Portefeuille Allocatie
                </div>
                <div className="text-sm font-black text-indigo-200 mt-0.5">
                  STREEFDOEL REEDS BEREIKT
                </div>
              </div>
              <div className="text-right">
                <span className="px-2.5 py-1 bg-indigo-900/80 text-indigo-200 border border-indigo-700/60 rounded-xl text-xs font-bold inline-block">
                  Geen extra aankoop
                </span>
                <div className="text-[10px] text-indigo-300/80 mt-1 font-semibold">
                  Budget: € 0,00
                </div>
              </div>
            </div>
          ) : (
            <div className={`${isSell ? 'bg-rose-950 border border-rose-800/80' : 'bg-slate-900'} text-white p-3.5 rounded-2xl flex items-center justify-between`}>
              <div>
                <div className={`text-[10px] ${isSell ? 'text-rose-300' : 'text-slate-400'} font-bold uppercase tracking-wider`}>
                  {isSell ? '🚨 Verplichte Verkooporder' : 'Aankooporder'}
                </div>
                <div className={`text-sm font-black ${isSell ? 'text-rose-300' : 'text-emerald-400'}`}>
                  {isSell ? 'VERKOOP' : 'KOOP'} {alert.shares} stuks {isSell && alert.totalOwnedShares ? `(van ${alert.totalOwnedShares})` : ''}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-[10px] ${isSell ? 'text-rose-300' : 'text-slate-400'} font-bold uppercase tracking-wider`}>
                  {isSell ? 'Vrijkomend Kapitaal' : 'Totaal Bedrag'}
                </div>
                <div className="text-base font-black text-white privacy-blur">
                  {isIncognito ? '€ ••••••' : formatCurrency(alert.amountEur)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Toelichting & Verkoopreden */}
        {isSell && alert.fundingSource && (
          <div className="mt-3 pt-3 border-t border-rose-100">
            <div className="bg-rose-50 text-rose-950 p-3 rounded-xl border border-rose-200 text-xs space-y-1">
              <div className="font-black text-rose-900 flex items-center gap-1.5">
                <i className="ph-fill ph-warning-octagon text-rose-600 text-base"></i>
                {alert.fundingSource.badge || 'Verplichte Strategie Verkoop'}
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed font-medium">
                {alert.fundingSource.message}
              </p>
            </div>
          </div>
        )}

        {/* Toelichting Onder Toezicht (Conform Backtest) */}
        {isCaution && alert.fundingSource && (
          <div className="mt-3 pt-3 border-t border-amber-200/60">
            <div className="bg-amber-100/90 text-amber-950 p-3 rounded-xl border border-amber-300 text-xs space-y-1">
              <div className="font-black text-amber-950 flex items-center gap-1.5">
                <i className="ph-fill ph-prohibit text-amber-700 text-base"></i>
                {alert.fundingSource.badge || '🛑 Geen Koopkans (Conform Backtest)'}
              </div>
              <p className="text-[11px] text-amber-900 leading-relaxed font-semibold">
                {alert.fundingSource.message}
              </p>
            </div>
          </div>
        )}

        {/* Financiering & Rotatie Logica voor Valide Aankoop */}
        {isActionable && alert.fundingSource && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            {alert.fundingSource.status === 'TARGET_REACHED' ? (
              <div className="bg-indigo-50 text-indigo-900 p-2.5 rounded-xl border border-indigo-200 text-[11px] flex items-center gap-2">
                <i className="ph-fill ph-check-circle text-indigo-600 text-sm shrink-0"></i>
                <span className="font-semibold">{alert.fundingSource.message}</span>
              </div>
            ) : alert.fundingSource.status === 'DIRECT_CASH' ? (
              <div className="bg-emerald-50 text-emerald-900 p-2.5 rounded-xl border border-emerald-200 text-[11px] flex items-center gap-2">
                <i className="ph-fill ph-check-circle text-emerald-600 text-sm shrink-0"></i>
                <span className="font-semibold">{alert.fundingSource.message}</span>
              </div>
            ) : (
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900">
                  <i className="ph-fill ph-warning text-amber-600 text-sm shrink-0"></i>
                  <span>{alert.fundingSource.message}</span>
                </div>

                {hasLinkedSales && (
                  <div className="space-y-1.5 pt-1">
                    {alert.linkedSales.map((sale) => (
                      <div key={sale.ticker} className="bg-white p-2 rounded-lg border border-amber-200 text-[11px] flex items-center justify-between">
                        <div>
                          <div className="font-bold text-gray-900">
                            <span className="text-rose-600 font-black">VERKOOP</span> {sale.ticker}
                          </div>
                          <div className="text-[10px] text-gray-500">{sale.reason}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-amber-900">{sale.sharesToSell} stuks</div>
                          <div className="font-black text-gray-900 privacy-blur">
                            {isIncognito ? '€ ••••••' : formatCurrency(sale.amountToSellEur)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3 sm:space-y-6 animate-fade-in">
      
      {/* HOOFDSTRATEGIE SELECTOR: Losse Aandelen vs ETF DCA Strategie + Mijn Strategie-Instellingen Knop */}
      {(canUseStocks && canUseEtf) && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1 flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 bg-slate-900/5 border border-slate-200 rounded-xl sm:rounded-3xl">
            <button
              onClick={() => setStrategyType('stocks')}
              className={`flex-1 px-2.5 sm:px-5 py-1.5 sm:py-2.5 rounded-lg sm:rounded-2xl text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-1 sm:gap-2 ${
                strategyType === 'stocks'
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-white text-slate-700 hover:text-slate-950 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <i className="ph-fill ph-diamonds-four text-xs sm:text-base text-amber-300"></i>
              <span>Losse Aandelen</span>
              {myStrategyConfig?.activeStockStrategy ? (
                <span className={`hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full font-bold truncate max-w-[190px] ${
                  strategyType === 'stocks' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-800'
                }`}>
                  #{myStrategyConfig.activeStockStrategy.priority_order || 1} • {myStrategyConfig.activeStockStrategy.name}
                </span>
              ) : (
                <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full font-bold bg-gray-100 text-gray-500">
                  Geen actief
                </span>
              )}
            </button>

            <button
              onClick={() => setStrategyType('etf')}
              className={`flex-1 px-2.5 sm:px-5 py-1.5 sm:py-2.5 rounded-lg sm:rounded-2xl text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-1 sm:gap-2 ${
                strategyType === 'etf'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-white text-slate-700 hover:text-slate-950 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <i className="ph-fill ph-chart-line-up text-xs sm:text-base text-emerald-300"></i>
              <span>ETF DCA</span>
              {myStrategyConfig?.activeEtfStrategy ? (
                <span className={`hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full font-bold truncate max-w-[190px] ${
                  strategyType === 'etf' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  #{myStrategyConfig.activeEtfStrategy.priority_order || 1} • €{myStrategyConfig.activeEtfStrategy.monthly_budget || 450}/mnd
                </span>
              ) : (
                <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full font-bold bg-gray-100 text-gray-500">
                  Geen actief
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => setShowStrategyConfigModal(prev => !prev)}
            className={`px-4 py-2.5 rounded-xl sm:rounded-2xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 border shrink-0 shadow-xs ${
              showStrategyConfigModal
                ? 'bg-purple-700 text-white border-purple-800 shadow-purple-500/20'
                : 'bg-white hover:bg-purple-50 text-purple-900 border-purple-200'
            }`}
          >
            <i className="ph-fill ph-sliders-horizontal text-base"></i>
            <span>Mijn Actieve Strategieën & Prioriteit ({activeStrategiesDraft.length})</span>
            {myStrategyConfig?.strategyHistory?.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                showStrategyConfigModal ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-800'
              }`}>
                {myStrategyConfig.strategyHistory.length} wissels
              </span>
            )}
          </button>
        </div>
      )}

      {/* UITKLAPBAAR PANEEL: MIJN ACTIEVE STRATEGIEËN (FLEXIBEL AANTAL + PRIORITEIT + VERWIJDEREN + BEVESTIGING) */}
      {showStrategyConfigModal && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-purple-200 shadow-lg space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-200 mb-1">
                🎯 Persoonlijke Strategie-Koppeling, Prioriteit & Historiek
              </div>
              <h2 className="text-lg sm:text-xl font-black text-gray-900">
                Mijn Actieve Strategieën ({activeStrategiesDraft.length}) & Prioriteitsvolgorde
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Je kiest zelf hoeveel en welke strategieën je volgt: bijvoorbeeld <strong>enkel 1 strategie</strong>, <strong>2 aandelen-strategieën</strong>, <strong>1 ETF-strategie</strong> of een combinatie. Met <strong>Prioriteit (#1, #2, ...)</strong> bepaal je welke strategie als eerste recht heeft op je beschikbare cash/maandbudget. Elke wijziging of verwijdering vraagt eerst om een bevestiging.
              </p>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                onClick={() => {
                  setNewStratPriority(activeStrategiesDraft.length + 1);
                  setShowAddStrategyForm(prev => !prev);
                }}
                className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-extrabold shadow-xs flex items-center gap-1.5 transition-all"
              >
                <i className="ph-bold ph-plus-circle text-sm"></i>
                <span>Extra Strategie Toevoegen</span>
              </button>
              <button
                onClick={() => setShowStrategyConfigModal(false)}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
              >
                Sluiten ✕
              </button>
            </div>
          </div>

          {/* FORMULIER OM EEN EXTRA STRATEGIE TOE TE VOEGEN */}
          {showAddStrategyForm && (
            <div className="p-4 sm:p-5 rounded-2xl bg-purple-50/70 border-2 border-purple-300 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-purple-950 flex items-center gap-2">
                  <i className="ph-fill ph-plus-circle text-purple-600 text-lg"></i>
                  <span>Nieuwe of Extra Strategie Activeren op jouw Portefeuille</span>
                </h3>
                <button
                  onClick={() => setShowAddStrategyForm(false)}
                  className="text-xs font-bold text-gray-500 hover:text-gray-800"
                >
                  Annuleren ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-gray-700 mb-1">Welke strategie wil je activeren? (Aandelen of ETF):</label>
                  <select
                    value={newStratId}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setNewStratId(val);
                      const found = allStrategiesList.find(s => Number(s.strategy_id) === val);
                      if (found?.strategy_type === 'ETF') {
                        setNewStratFundingMode('monthly_amount');
                        setNewStratMonthlyBudget(450);
                        setNewStratAllowSelling('buy_only');
                      } else {
                        setNewStratFundingMode('available_cash');
                        setNewStratMonthlyBudget(500);
                        setNewStratAllowSelling('full_strategy');
                      }
                    }}
                    className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-purple-500 outline-none"
                  >
                    {allStrategiesList.map(s => (
                      <option key={s.strategy_id} value={s.strategy_id}>
                        [{(s.strategy_type || 'STOCKS') === 'ETF' ? '📈 ETF' : '💎 Aandelen'}] {s.name} {s.is_system_default ? '(Standaard)' : `(${s.creator_username})`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Prioriteit toekennen:</label>
                  <select
                    value={newStratPriority}
                    onChange={(e) => setNewStratPriority(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-bold text-purple-900 focus:ring-2 focus:ring-purple-500 outline-none"
                  >
                    {Array.from({ length: activeStrategiesDraft.length + 1 }, (_, i) => i + 1).map(p => (
                      <option key={p} value={p}>
                        Prioriteit #{p} {p === 1 ? '(Hoogste prioriteit / Eerste keus)' : p === activeStrategiesDraft.length + 1 ? '(Onderaan toevoegen)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Hoe kopen? (Inleg):</label>
                  <select
                    value={newStratFundingMode}
                    onChange={(e) => setNewStratFundingMode(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-semibold text-gray-800 focus:ring-2 focus:ring-purple-500 outline-none"
                  >
                    <option value="available_cash">💰 Enkel beschikbaar vrij geld</option>
                    <option value="monthly_amount">📅 Vast bedrag per maand (€/mnd)</option>
                    <option value="cash_plus_rotation">🔄 Beschikbaar geld + Rotatie</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs items-end">
                {newStratFundingMode === 'monthly_amount' && (
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Maandbedrag (€/mnd):</label>
                    <input
                      type="number"
                      min="25"
                      step="25"
                      value={newStratMonthlyBudget}
                      onChange={(e) => setNewStratMonthlyBudget(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                  </div>
                )}

                <div className={newStratFundingMode === 'monthly_amount' ? '' : 'sm:col-span-2'}>
                  <label className="block font-bold text-gray-700 mb-1">Moeten er ook posities verkocht worden?</label>
                  <select
                    value={newStratAllowSelling}
                    onChange={(e) => setNewStratAllowSelling(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-semibold text-gray-800 focus:ring-2 focus:ring-purple-500 outline-none"
                  >
                    <option value="full_strategy">✅ Ja, volledige verkoop- & snoeiregels</option>
                    <option value="score_drop_only">🛡️ Enkel verkopen bij Score &lt; 5</option>
                    <option value="buy_only">🔒 Nee, nooit verkopen (100% Buy & Hold)</option>
                  </select>
                </div>

                <button
                  onClick={requestAddActiveStrategy}
                  disabled={savingConfigType === 'add-new'}
                  className="py-2.5 px-4 bg-purple-700 hover:bg-purple-800 text-white font-extrabold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <i className="ph-bold ph-check-circle"></i>
                  <span>Strategie Toevoegen (met bevestiging)</span>
                </button>
              </div>
            </div>
          )}

          {/* LIJST VAN ACTIEVE STRATEGIEËN OP VOLGORDE VAN PRIORITEIT */}
          {activeStrategiesDraft.length === 0 ? (
            <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-3">
              <p className="text-sm font-black text-amber-950">Je hebt momenteel geen actieve strategieën gekoppeld.</p>
              <p className="text-xs text-amber-800">
                Klik op <strong>"Extra Strategie Toevoegen"</strong> om 1 of meerdere strategieën (Losse Aandelen en/of ETF DCA) te activeren.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {activeStrategiesDraft.map((item, idx) => {
                const isEtf = item.strategy_type === 'ETF';
                return (
                  <div
                    key={item.entry_id || `draft-${idx}`}
                    className={`p-4 sm:p-5 rounded-2xl border-2 space-y-4 transition-all ${
                      isEtf
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-indigo-50/40 border-indigo-200'
                    }`}
                  >
                    {/* Header met Prioriteit-badge + Pijltjes om prioriteit te wisselen + Verwijderknop */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`px-2.5 py-1 rounded-xl font-black text-xs shadow-2xs flex items-center gap-1 ${
                          item.priority_order === 1
                            ? 'bg-amber-400 text-amber-950 border border-amber-500'
                            : 'bg-slate-800 text-white'
                        }`}>
                          {item.priority_order === 1 ? '🏆 Prioriteit #1' : `Prioriteit #${item.priority_order}`}
                        </span>
                        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black border ${
                          isEtf
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : 'bg-indigo-100 text-indigo-900 border-indigo-300'
                        }`}>
                          {isEtf ? '📈 ETF DCA' : '💎 Losse Aandelen'}
                        </span>
                      </div>

                      {/* Prioriteit hoger/lager knoppen */}
                      <div className="flex items-center gap-1">
                        {activeStrategiesDraft.length > 1 && (
                          <>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => requestChangePriority(item, item.priority_order - 1)}
                              title="Verhoog prioriteit (eerder aan de beurt voor cash/budget)"
                              className="px-2 py-1 rounded-lg bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 text-[11px] font-extrabold disabled:opacity-35 flex items-center gap-1"
                            >
                              ▲ Hoger
                            </button>
                            <button
                              type="button"
                              disabled={idx === activeStrategiesDraft.length - 1}
                              onClick={() => requestChangePriority(item, item.priority_order + 1)}
                              title="Verlaag prioriteit"
                              className="px-2 py-1 rounded-lg bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 text-[11px] font-extrabold disabled:opacity-35 flex items-center gap-1"
                            >
                              ▼ Lager
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => requestRemoveActiveStrategy(item)}
                          title="Verwijder / deactiveer deze actieve strategie (met bevestiging)"
                          className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-extrabold flex items-center gap-1 ml-1"
                        >
                          <i className="ph-bold ph-trash"></i>
                          <span>Verwijderen</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between text-[11px] text-gray-500">
                        <span>
                          {item.priority_order === 1
                            ? '🔥 Eerste recht op vrij beschikbaar geld / budget'
                            : `Volgt na Prioriteit #${item.priority_order - 1}`}
                        </span>
                        <span>
                          Actief sinds: {item.activated_at ? new Date(item.activated_at).toLocaleDateString('nl-BE') : 'Vandaag'}
                        </span>
                      </div>

                      <div>
                        <label className="block font-bold text-gray-700 mb-1">Gekozen Strategie (Aandelen of ETF):</label>
                        <select
                          value={item.strategy_id}
                          onChange={(e) => updateDraftField(idx, 'strategy_id', Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          {allStrategiesList.map(s => (
                            <option key={s.strategy_id} value={s.strategy_id}>
                              [{(s.strategy_type || 'STOCKS') === 'ETF' ? '📈 ETF' : '💎 Aandelen'}] {s.name} {s.is_system_default ? '(Standaard)' : `(${s.creator_username})`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-gray-700 mb-1">Hoe kopen? (Inlegmethode):</label>
                          <select
                            value={item.funding_mode}
                            onChange={(e) => updateDraftField(idx, 'funding_mode', e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-semibold text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            <option value="available_cash">💰 Enkel beschikbaar vrij geld</option>
                            <option value="monthly_amount">📅 Vast bedrag per maand (€/mnd)</option>
                            <option value="cash_plus_rotation">🔄 Beschikbaar geld + Rotatie</option>
                          </select>
                        </div>

                        {item.funding_mode === 'monthly_amount' ? (
                          <div>
                            <label className="block font-bold text-gray-700 mb-1">Maandbedrag (€/mnd):</label>
                            <input
                              type="number"
                              min="25"
                              step="25"
                              value={item.monthly_budget}
                              onChange={(e) => updateDraftField(idx, 'monthly_budget', e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="block font-bold text-gray-700 mb-1">Moeten posities verkocht worden?</label>
                            <select
                              value={item.allow_selling}
                              onChange={(e) => updateDraftField(idx, 'allow_selling', e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-semibold text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                              <option value="full_strategy">✅ Ja, volledige verkoop- & snoeiregels</option>
                              <option value="score_drop_only">🛡️ Enkel verkopen bij Score &lt; 5</option>
                              <option value="buy_only">🔒 Nee, nooit verkopen (100% Buy & Hold)</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {item.funding_mode === 'monthly_amount' && (
                        <div>
                          <label className="block font-bold text-gray-700 mb-1">Moeten posities verkocht worden?</label>
                          <select
                            value={item.allow_selling}
                            onChange={(e) => updateDraftField(idx, 'allow_selling', e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-semibold text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            <option value="full_strategy">✅ Ja, volledige verkoop- & snoeiregels</option>
                            <option value="score_drop_only">🛡️ Enkel verkopen bij Score &lt; 5</option>
                            <option value="buy_only">🔒 Nee, nooit verkopen (100% Buy & Hold)</option>
                          </select>
                        </div>
                      )}

                      <div className="pt-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => requestSaveActiveStrategy(item)}
                          disabled={savingConfigType === `save-${item.entry_id || item.priority_order}`}
                          className={`flex-1 py-2.5 px-4 text-white font-extrabold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                            isEtf ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'
                          }`}
                        >
                          <i className="ph-bold ph-floppy-disk"></i>
                          <span>Wijziging Opslaan (met bevestiging)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Historiek van Strategiewissels */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <i className="ph-fill ph-clock-counter-clockwise text-purple-600 text-lg"></i>
                <h3 className="text-sm font-black text-gray-900">
                  Historiek van Strategiewissels & Instellingen ({myStrategyConfig?.strategyHistory?.length || 0})
                </h3>
              </div>
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                ✓ Meldingen van oude of verwijderde strategieën blijven altijd bewaard
              </span>
            </div>

            {(!myStrategyConfig?.strategyHistory || myStrategyConfig.strategyHistory.length === 0) ? (
              <p className="text-xs text-gray-500">Nog geen strategiewissels geregistreerd.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {myStrategyConfig.strategyHistory.map((item) => (
                  <div
                    key={item.history_id}
                    className="p-3 bg-white rounded-xl border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded font-black text-[10px] ${
                          item.strategy_type === 'ETF'
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                            : 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                        }`}>
                          {item.strategy_type === 'ETF' ? '📈 ETF DCA' : '💎 Losse Aandelen'}
                        </span>
                        {!item.new_strategy_id && item.old_strategy_name ? (
                          <span className="font-bold text-red-700">
                            Actieve strategie verwijderd / stopgezet: <strong>{item.old_strategy_name}</strong>
                          </span>
                        ) : item.old_strategy_name && item.old_strategy_id !== item.new_strategy_id ? (
                          <span className="font-bold text-gray-800">
                            Gewisseld van <span className="text-amber-700 underline">{item.old_strategy_name}</span> ➔ <strong className="text-indigo-700">{item.new_strategy_name}</strong>
                          </span>
                        ) : (
                          <span className="font-bold text-gray-900">
                            Actieve Strategie: <strong className="text-indigo-700">{item.new_strategy_name}</strong>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 flex flex-wrap items-center gap-2">
                        <span>⚙️ Inleg: <strong>{item.funding_label}</strong></span>
                        <span>•</span>
                        <span>🛡️ Verkopen: <strong>{item.selling_label}</strong></span>
                      </div>
                      {item.notes && (
                        <p className="text-[11px] text-gray-600 italic">{item.notes}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0 font-mono text-[11px] text-gray-500 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-200">
                      {new Date(item.changed_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VERPLICHTE BEVESTIGINGSMODAL VOOR ELKE STRATEGIE-WIJZIGING, PRIORITEITSWISSEL OF VERWIJDERING */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border-2 border-gray-200 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-black shrink-0 ${
                  confirmModal.variant === 'red'
                    ? 'bg-red-100 text-red-700 border border-red-200'
                    : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                }`}>
                  {confirmModal.variant === 'red' ? '🗑️' : '🛡️'}
                </span>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Bevestiging Vereist
                  </span>
                  <h3 className="text-base font-black text-gray-900">
                    {confirmModal.title}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-400 hover:text-gray-700 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed font-medium">
              {confirmModal.description}
            </p>

            {confirmModal.details?.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs text-gray-700">
                {confirmModal.details.map((line, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-indigo-600 font-black">•</span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-extrabold transition-all"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={() => confirmModal.onConfirm && confirmModal.onConfirm()}
                className={`px-4 py-2.5 rounded-xl text-white text-xs font-extrabold shadow-md transition-all flex items-center gap-1.5 ${
                  confirmModal.variant === 'red'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                <i className="ph-bold ph-check"></i>
                <span>{confirmModal.confirmLabel}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {(strategyType === 'etf' || !canUseStocks) ? (
        <EtfStrategyAdvisor />
      ) : (
        <>
          {/* ACTIEVE LIVE STRATEGIE BANNER: Overduidelijke koppeling met de backtest live strategie */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-md border border-indigo-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-gradient-to-r from-amber-400 to-amber-300 text-slate-950 shadow-sm">
                  ⭐️ Gekoppelde Strategie: {data?.activeStrategyConfig?.name || 'Huidige Live Strategie'} ({data?.activeStrategyConfig?.backtestAlpha || '+212%'})
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-200 border border-blue-400/30">
                  📊 {data?.activeStrategyConfig?.universe || 'Score 5/5 Universum'}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                  {data?.activeStrategyConfig?.allowFractionalShares !== false 
                    ? `🧩 Deelaandelen (min. €${data?.activeStrategyConfig?.minOrderAmount || 100}, stap 0,1 stuks)` 
                    : '📦 Enkel Volledige Aandelen'}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                Deze assistent stuurt <strong>uitsluitend meldingen en transacties conform de gekozen strategie</strong> ({data?.activeStrategyConfig?.name || 'Huidige Live Strategie'}): automatische aankoop bij Score 5/5 en MACD Golden Cross herstel, {data?.activeStrategyConfig?.sellOnScoreDrop ? '100% verkoop bij Score < 5' : 'Score < 5 behouden'}, {data?.activeStrategyConfig?.useWaardeverdelingSell ? `deelverkoop bij kwartaaldaling waardeverdeling (ondergrens €${data?.activeStrategyConfig?.minOrderSkipThreshold || 50})` : 'geen deelverkoop op waardeverdeling'}, en actieve herbalancering bij nieuwe koopkansen.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap self-start md:self-center">
              <Link
                to="/analysis?tab=strategies"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all whitespace-nowrap shadow-sm"
              >
                <i className="ph-bold ph-compass text-amber-400 text-sm"></i>
                <span>Wissel Strategie</span>
              </Link>
              <Link
                to="/analysis?tab=backtest"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl border border-indigo-400/40 transition-all whitespace-nowrap shadow-md shadow-indigo-900/30"
              >
                <span>Bekijk Backtest ({data?.activeStrategyConfig?.backtestAlpha || '+212%'})</span>
                <i className="ph-bold ph-arrow-right text-sm"></i>
              </Link>
            </div>
          </div>

          {/* 1. HERO BANNER: Alignment Score & Actie Overzicht (Verborgen op mobiel voor maximale compactheid) */}
      <div className="hidden sm:block relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-7 text-white shadow-xl border border-indigo-900/40">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5 sm:space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider border border-indigo-500/30 flex items-center gap-1.5">
                <i className="ph-fill ph-sparkle text-amber-400"></i>
                Strategie Assistent
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold border flex items-center gap-1.5 ${dataFreshness.isUpdatedToday ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                <span className={`w-2 h-2 rounded-full ${dataFreshness.isUpdatedToday ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`}></span>
                <span>{dataFreshness.isUpdatedToday ? `🟢 Up-to-date (${dataFreshness.lastUpdatedDate})` : `⚠️ Laatste data: ${dataFreshness.lastUpdatedDate} (Update aanbevolen)`}</span>
              </span>
              {hideFormulas && (
                <span className="px-2.5 py-0.5 bg-purple-500/20 text-purple-200 rounded-full text-[10px] sm:text-xs font-bold border border-purple-400/30 flex items-center gap-1.5">
                  <i className="ph-fill ph-shield-check text-purple-300"></i>
                  <span>Arne's Strategie Advies</span>
                </span>
              )}
            </div>
            
            <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">
              Data-Gedreven Beslissingen & Tijdlijn
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed hidden sm:block">
              Beslissingen direct gebaseerd op <strong>MACD crossovers op exacte datums</strong>. Groene koopsignalen (ondergewaardeerd & sterke waardeverdeling) staan gescheiden van gele toezichtssignalen.
            </p>
          </div>

          {/* Quick Actions & Alignment Meter */}
          <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto bg-slate-800/80 backdrop-blur-md p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-700/60 shadow-inner">
            <div className="pr-3 sm:pr-4 border-r border-slate-700/60 text-left">
              <div className="text-[10px] sm:text-xs text-slate-400 font-semibold uppercase tracking-wider">Alignment</div>
              <div className="text-xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                {alignmentPercentage.toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-400 hidden sm:block">van vermogen in lijn</div>
            </div>

            <button
              onClick={handleTriggerUpdate}
              disabled={isUpdating}
              className="px-3 sm:px-4 py-2 sm:py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 active:scale-95 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm disabled:opacity-50"
            >
              <i className={`ph-bold ph-arrows-clockwise text-sm sm:text-lg ${isUpdating ? 'animate-spin' : ''}`}></i>
              <span>{isUpdating ? 'Bezig...' : 'Data Verversen'}</span>
            </button>
          </div>
        </div>

        {/* Status Breakdown Bar: 2x2 grid met compacte kaarten */}
        <div className="mt-4 sm:mt-8 pt-3 sm:pt-6 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <div className="bg-slate-800/40 p-2.5 sm:p-3.5 rounded-xl border border-slate-700/40">
            <div className="text-[10px] sm:text-xs text-slate-400 font-medium">Totale Waarde</div>
            <div className="text-sm sm:text-lg font-bold text-white mt-0.5 sm:mt-1 privacy-blur">
              {isIncognito ? '€ ••••••' : formatCurrency(totalPortfolioValue)}
            </div>
          </div>
          <div className="bg-emerald-950/30 p-2.5 sm:p-3.5 rounded-xl border border-emerald-800/40">
            <div className="text-[10px] sm:text-xs text-emerald-400 font-medium">🟢 Directe Koopkansen</div>
            <div className="text-sm sm:text-lg font-bold text-emerald-300 mt-0.5 sm:mt-1">
              {actionableCount} acties
            </div>
          </div>
          <div className="bg-amber-950/30 p-2.5 sm:p-3.5 rounded-xl border border-amber-800/40">
            <div className="text-[10px] sm:text-xs text-amber-400 font-medium">⚠️ Aandacht / Toezicht</div>
            <div className="text-sm sm:text-lg font-bold text-amber-300 mt-0.5 sm:mt-1">
              {cautionCount} signalen
            </div>
          </div>
          <div className="bg-rose-950/30 p-2.5 sm:p-3.5 rounded-xl border border-rose-800/40">
            <div className="text-[10px] sm:text-xs text-rose-400 font-medium">🔴 Verkoopsignalen</div>
            <div className="text-sm sm:text-lg font-bold text-rose-300 mt-0.5 sm:mt-1">
              {sellAlertsCount} orders
            </div>
          </div>
        </div>
      </div>

      {/* CASH ALLOCATIE & RESERVERING WIDGET (ETF's vs Losse Aandelen - Verborgen op mobiel) */}
      {data?.cashAllocation && (
        <div className="hidden sm:block bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-5 border border-slate-200/80 shadow-xs">
          <div 
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setIsCashWidgetOpen(prev => !prev)}
          >
            <div className="flex items-center gap-2 sm:gap-2.5">
              <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-sm sm:text-base font-black">
                <i className="ph-fill ph-wallet"></i>
              </span>
              <div>
                <h3 className="text-xs sm:text-sm font-black text-gray-900 tracking-tight flex items-center gap-1.5 flex-wrap">
                  <span>Cash Verdeling & Inleg</span>
                  <span className="text-[10px] sm:text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full privacy-blur">
                    Vrij voor aandelen: {isIncognito ? '€ •••' : formatCurrency(data.cashAllocation.stocksAvailableCash)}
                  </span>
                </h3>
                <p className="text-[10px] sm:text-[11px] text-gray-500 font-medium hidden sm:block">
                  Minimaal €450/mnd is gereserveerd voor ETF's. Extra spaargeld is direct beschikbaar voor losse kwaliteitsaandelen.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-indigo-600 font-bold hidden sm:inline">
                {isCashWidgetOpen ? 'Inklappen' : 'Details tonen'}
              </span>
              <i className={`ph-bold ${isCashWidgetOpen ? 'ph-caret-up' : 'ph-caret-down'} text-gray-400 text-sm`}></i>
            </div>
          </div>

          {/* Details (standaard ingeklapt op mobiel, uitklapbaar met 1 tik) */}
          {isCashWidgetOpen && (
            <div className="mt-3 pt-3 border-t border-gray-100 animate-fade-in space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                <div className="p-3 sm:p-3.5 bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-200 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-gray-500 text-[10px] sm:text-[11px] font-bold uppercase">
                    <span>Totale Broker Cash</span>
                    <i className="ph-bold ph-bank text-sm"></i>
                  </div>
                  <div className="text-lg sm:text-xl font-black text-gray-900 mt-1 privacy-blur">
                    {isIncognito ? '€ ••••••' : formatCurrency(data.cashAllocation.totalBrokerCash)}
                  </div>
                  <span className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">Saldo op Degiro & eToro</span>
                </div>

                <div className="p-3 sm:p-3.5 bg-emerald-50/70 rounded-xl sm:rounded-2xl border border-emerald-200/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-emerald-800 text-[10px] sm:text-[11px] font-bold uppercase">
                    <span>Gereserveerd voor ETF's</span>
                    <span className="text-[9px] sm:text-[10px] bg-emerald-200/60 px-1.5 py-0.5 rounded font-black text-emerald-900">€15/dag</span>
                  </div>
                  <div className="text-lg sm:text-xl font-black text-emerald-700 mt-1 privacy-blur">
                    {isIncognito ? '€ ••••••' : formatCurrency(data.cashAllocation.etfReservedCash)}
                  </div>
                  <span className="text-[9px] sm:text-[10px] text-emerald-800/80 mt-0.5">
                    Pot opgebouwd: €{data.cashAllocation.theoreticalEtfPotAccrued} (sinds 01-10-2026)
                  </span>
                </div>

                <div className="p-3 sm:p-3.5 bg-indigo-50/80 rounded-xl sm:rounded-2xl border border-indigo-200/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-indigo-900 text-[10px] sm:text-[11px] font-bold uppercase">
                    <span>Vrij voor Losse Aandelen</span>
                    <span className="text-[9px] sm:text-[10px] bg-indigo-200/70 px-1.5 py-0.5 rounded font-black text-indigo-900">Direct Inzetbaar</span>
                  </div>
                  <div className="text-lg sm:text-xl font-black text-indigo-700 mt-1 privacy-blur">
                    {isIncognito ? '€ ••••••' : formatCurrency(data.cashAllocation.stocksAvailableCash)}
                  </div>
                  <span className="text-[9px] sm:text-[10px] text-indigo-800/80 mt-0.5">
                    Beschikbaar voor 5/5 kwaliteitsaandelen
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. SUB-NAVIGATIE TUSSEN WEERGAVEN */}
      <div className="flex items-center justify-between gap-1.5 border-b border-gray-200 pb-2">
        <div className="flex items-center gap-1 sm:gap-1.5 bg-gray-100 p-0.5 sm:p-1 rounded-xl sm:rounded-2xl overflow-x-auto no-scrollbar flex-1 sm:flex-initial">
          <button
            onClick={() => setActiveViewMode('timeline')}
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeViewMode === 'timeline'
                ? 'bg-white text-emerald-800 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ph-fill ph-clock-counter-clockwise text-emerald-600 text-sm sm:text-base"></i>
            <span>Tijdlijn ({data?.timeline?.length || 0})</span>
          </button>
          <button
            onClick={() => setActiveViewMode('alerts')}
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeViewMode === 'alerts'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ph-fill ph-bell-ringing text-indigo-600 text-sm sm:text-base"></i>
            <span>Meldingen ({dataDrivenAlerts.length})</span>
          </button>
          <button
            onClick={() => setActiveViewMode('charts')}
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeViewMode === 'charts'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ph-fill ph-chart-pie text-blue-600 text-sm sm:text-base"></i>
            <span>Donut</span>
          </button>
          <button
            onClick={() => setActiveViewMode('matrix')}
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeViewMode === 'matrix'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ph-fill ph-table text-emerald-600 text-sm sm:text-base"></i>
            <span>Matrix ({holdings.length})</span>
          </button>
        </div>

        {/* Data Status Pill & Verversen Knop */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span 
            className={`px-2 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${
              dataFreshness?.isUpdatedToday
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
            title={`Laatste data: ${dataFreshness?.lastUpdatedDate || 'Onbekend'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dataFreshness?.isUpdatedToday ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></span>
            <span className="hidden sm:inline">{dataFreshness?.isUpdatedToday ? 'Up-to-date' : 'Update nodig'}</span>
            <span className="font-mono">({dataFreshness?.lastUpdatedDate ? dataFreshness.lastUpdatedDate.slice(5) : '-'})</span>
          </span>

          <button
            onClick={handleTriggerUpdate}
            disabled={isUpdating}
            className="px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 active:scale-95 text-white font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 text-xs shrink-0 disabled:opacity-50"
            title="Ververs actuele koersen & MACD berekeningen"
          >
            <i className={`ph-bold ph-arrows-clockwise text-xs sm:text-sm ${isUpdating ? 'animate-spin' : ''}`}></i>
            <span className="hidden xs:inline sm:inline">{isUpdating ? 'Bezig...' : 'Verversen'}</span>
          </button>
        </div>

        <button
          onClick={() => setShowTimingRules(!showTimingRules)}
          className="hidden sm:flex px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200/80 transition-all items-center gap-1.5 whitespace-nowrap shrink-0"
          title="Uitleg over regels en indicatoren"
        >
          <i className="ph-fill ph-info text-indigo-600"></i>
          <span>{showTimingRules ? 'Verberg Uitleg' : 'Uitleg'}</span>
        </button>
      </div>

      {/* 3. COLLAPSIBLE TIMING & REGELS HANDLEIDING */}
      {showTimingRules && (
        <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-purple-50/80 rounded-2xl p-6 border border-indigo-200/80 space-y-4 animate-fade-in shadow-xs">
          <div className="flex items-center gap-2 text-indigo-900 font-extrabold text-sm">
            <i className="ph-fill ph-book-open-text text-xl text-indigo-600"></i>
            Data-Gedreven Beslissingsregels: Hoe worden de meldingen gegenereerd?
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-700">
            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs space-y-2">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                <i className="ph-fill ph-check-circle text-emerald-600 text-base"></i>
                🟢 Kolom 1: Directe Koopkansen
              </div>
              <p className="leading-relaxed">
                {hideFormulas
                  ? 'Koopsignalen voor Super-Kwaliteit aandelen (Score 5/5) die gunstig gewaardeerd zijn binnen de strategie én een stabiele of stijgende kwaliteitstrend vertonen. Dit zijn de eerste keuzes voor nieuwe inleg.'
                  : 'MACD koopsignalen voor Score 5/5 aandelen die ondergewaardeerd zijn (≤ 1.3x intrinsieke waarde) én waarvan de Waardeverdeling stabiel is of stijgt. Dit zijn de eerste keuzes voor nieuwe inleg.'}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-2xs space-y-2">
              <div className="font-bold text-amber-900 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                <i className="ph-fill ph-warning text-amber-600 text-base"></i>
                ⚠️ Kolom 2: Aandacht / Overgewaardeerd
              </div>
              <p className="leading-relaxed">
                {hideFormulas
                  ? 'Signalen van aandelen die momenteel boven de waarderingsgrens noteren of waarvan de kwaliteitstrend recent gedaald is. Deze staan onder toezicht en worden niet aangekocht.'
                  : 'MACD crossovers van aandelen die overgewaardeerd zijn (> 1.3x) of waarvan de Waardeverdeling recent gedaald is. Deze staan onder toezicht en worden in de strategie defensief geremd.'}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-2xs space-y-2">
              <div className="font-bold text-rose-900 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                <i className="ph-fill ph-x-circle text-rose-600 text-base"></i>
                🔴 Kolom 3: Verplichte Verkooporders
              </div>
              <p className="leading-relaxed">
                Posities in portefeuille met <strong>Score &lt; 5/5</strong> (100% verkoop) of een <strong>dalende kwaliteitstrend</strong> (proportionele deelverkoop). Dienen verkocht te worden om kapitaal te beschermen en te heralloceren.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4. WEERGAVE 1: DATA-GEDREVEN MELDINGEN FEED (BESLISSINGEN OP DATUM) */}
      {activeViewMode === 'alerts' && (
        <div className="space-y-6">
          
          {/* Filter & Weergave Toggle */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-4 bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-200 shadow-2xs">
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5">
              {/* Layout Mode Toggle */}
              <div className="flex bg-slate-100 p-0.5 sm:p-1 rounded-lg sm:rounded-xl mr-1 shrink-0">
                <button
                  onClick={() => setAlertLayoutMode('COLUMNS')}
                  className={`px-2.5 sm:px-3 py-1 text-xs font-bold rounded-md sm:rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${
                    alertLayoutMode === 'COLUMNS'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Toon kolommen"
                >
                  <i className="ph-bold ph-columns text-sm"></i>
                  <span>Kolommen</span>
                </button>
                <button
                  onClick={() => setAlertLayoutMode('TIMELINE')}
                  className={`px-2.5 sm:px-3 py-1 text-xs font-bold rounded-md sm:rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${
                    alertLayoutMode === 'TIMELINE'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Toon lijst"
                >
                  <i className="ph-bold ph-list-dashes text-sm"></i>
                  <span>Lijst</span>
                </button>
              </div>

              {/* Status Filters */}
              <button
                onClick={() => setAlertFilter('ALL')}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${alertFilter === 'ALL' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Alles ({dataDrivenAlerts.length})
              </button>
              <button
                onClick={() => setAlertFilter('ACTIONABLE')}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${alertFilter === 'ACTIONABLE' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
              >
                🟢 Valide Koop ({actionableCount})
              </button>
              <button
                onClick={() => setAlertFilter('CAUTION')}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${alertFilter === 'CAUTION' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
              >
                ⚠️ Toezicht ({cautionCount})
              </button>
              <button
                onClick={() => setAlertFilter('SELL')}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${alertFilter === 'SELL' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
              >
                🔴 Verkoop ({sellAlertsCount})
              </button>
              <button
                onClick={() => setAlertFilter('OLD_STRATEGY')}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${alertFilter === 'OLD_STRATEGY' ? 'bg-purple-600 text-white shadow-xs' : 'bg-purple-50 text-purple-800 hover:bg-purple-100'}`}
                title="Toon bewaarde meldingen uit een vorige strategie (vóór een strategiewissel)"
              >
                🕰️ Vorige Strategie ({oldStrategyAlertsCount})
              </button>
            </div>

            <div className="w-full md:w-64 relative">
              <i className="ph-bold ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Zoek op ticker..."
                className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
              />
            </div>
          </div>

          {/* Meldingen Weergave */}
          {filteredAlerts.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-200 text-gray-500 space-y-2">
              <i className="ph-fill ph-bell-slash text-4xl text-gray-300"></i>
              <div className="font-bold text-base text-gray-700">Geen meldingen gevonden</div>
              <p className="text-xs text-gray-400">Er zijn momenteel geen signalen die voldoen aan de geselecteerde filters.</p>
            </div>
          ) : alertLayoutMode === 'COLUMNS' && alertFilter !== 'SELL' && alertFilter !== 'OLD_STRATEGY' ? (
            /* 3-KOLOMS WEERGAVE: GROEN | GEEL | ROOD */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
              
              {/* Kolom 1: 🟢 DIRECTE KOOPKANSEN */}
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200/90 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black text-emerald-900 flex items-center gap-2">
                      <i className="ph-fill ph-check-circle text-emerald-600 text-lg"></i>
                      🟢 Valide Koop ({actionableBuyAlerts.length})
                    </h2>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      Ondergewaardeerd & stabiele/stijgende WV
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-600 text-white font-black text-xs rounded-xl shadow-xs">
                    {actionableBuyAlerts.length}
                  </span>
                </div>

                {actionableBuyAlerts.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 border border-gray-200 text-center text-gray-400 text-xs">
                    Geen directe groene koopkansen in deze selectie.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {actionableBuyAlerts.map(renderAlertCard)}
                  </div>
                )}
              </div>

              {/* Kolom 2: ⚠️ ONDER TOEZICHT (GEEN AANKOOP CONFORM BACKTEST) */}
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black text-amber-900 flex items-center gap-2">
                      <i className="ph-fill ph-warning text-amber-600 text-lg"></i>
                      ⚠️ Onder Toezicht ({cautionBuyAlerts.length})
                    </h2>
                    <p className="text-[11px] text-amber-800 mt-0.5 font-semibold">
                      {hideFormulas ? '🛑 Géén aankoop • Boven waarderingsgrens of dalende trend' : '🛑 Géén aankoop • Overgewaardeerd (>1.3x) of dalende WV'}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-600 text-white font-black text-xs rounded-xl shadow-xs">
                    {cautionBuyAlerts.length}
                  </span>
                </div>

                {cautionBuyAlerts.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 border border-gray-200 text-center text-gray-400 text-xs">
                    Geen aandelen onder toezicht in deze selectie.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {cautionBuyAlerts.map(renderAlertCard)}
                  </div>
                )}
              </div>

              {/* Kolom 3: 🔴 VERPLICHTE VERKOOPORDERS */}
              <div className="space-y-4">
                <div className="bg-rose-50 border border-rose-200/90 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black text-rose-950 flex items-center gap-2">
                      <i className="ph-fill ph-x-circle text-rose-600 text-lg"></i>
                      🔴 Verplichte Verkoop ({sellAlerts.length})
                    </h2>
                    <p className="text-[11px] text-rose-800 mt-0.5">
                      Score &lt; 5/5 of dalende Waardeverdeling
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-rose-600 text-white font-black text-xs rounded-xl shadow-xs">
                    {sellAlerts.length}
                  </span>
                </div>

                {sellAlerts.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 border border-gray-200 text-center text-gray-400 text-xs">
                    Geen verplichte verkooporders in deze selectie.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sellAlerts.map(renderAlertCard)}
                  </div>
                )}
              </div>

            </div>
          ) : (
            /* Lijstweergave (Chronologisch) */
            <div className="space-y-4">
              {filteredAlerts.map(renderAlertCard)}
            </div>
          )}
        </div>
      )}

      {/* WEERGAVE: TIJDLIJN & HISTORIE VAN ACTIES (LOSSE AANDELEN) */}
      {activeViewMode === 'timeline' && (
        <StockStrategyTimeline
          timeline={data?.timeline || []}
          summary={data?.timelineSummary || {}}
          formatCurrency={formatCurrency}
        />
      )}

      {/* 5. WEERGAVE 2: DONUT GRAFIEKEN (HUIDIGE VS IDEALE PORTEFEUILLE) */}
      {activeViewMode === 'charts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Linker Donut: Huidig Portfolio */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-sm space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <i className="ph-fill ph-wallet text-blue-600"></i>
                      Huidige Portefeuille Verdeling
                    </h3>
                    <p className="text-xs text-gray-500">Actuele spreiding over {holdings.length} posities</p>
                  </div>
                  <span className="text-xs font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-full privacy-blur">
                    {isIncognito ? '€ ••••••' : formatCurrency(totalPortfolioValue)}
                  </span>
                </div>

                <div className="h-72 mt-4 relative">
                  {currentChartData && <Doughnut data={currentChartData} options={chartOptions} />}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-xs text-gray-600 flex items-center justify-between">
                <span>Alignment met Super-Kwaliteit:</span>
                <span className="font-extrabold text-indigo-700">{alignmentPercentage.toFixed(1)}%</span>
              </div>
            </div>

            {/* Rechter Donut: Ideaal Portfolio */}
            <div className="bg-gradient-to-br from-indigo-50/50 via-white to-emerald-50/50 rounded-3xl p-6 border border-indigo-200 shadow-sm space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-indigo-100">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <i className="ph-fill ph-sparkle text-amber-500"></i>
                      Ideale Portefeuille (Gewogen naar Waardeverdeling)
                    </h3>
                    <p className="text-xs text-gray-500">Top Super-Kwaliteit aandelen (Score 5/5) proportioneel verdeeld</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                    100% Super-Kwaliteit
                  </span>
                </div>

                <div className="h-72 mt-4 relative">
                  {idealChartData && <Doughnut data={idealChartData} options={chartOptions} />}
                </div>
              </div>

              <div className="p-3 bg-emerald-50/80 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
                <span>Verwachte Alpha Historisch:</span>
                <span className="font-extrabold text-emerald-700">+369% Outperformance</span>
              </div>
            </div>

          </div>

          {/* Ideale Portefeuille Doeltabel + Koopkans-Radar (MACD Rood->Groen, Onderwaardering, Stijgende Waardeverdeling) */}
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-900 border border-indigo-200 mb-1">
                    🎯 Doelverdeling &amp; 3-Pijler Koopkans-Radar
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-gray-900">
                    Doelverdeling &amp; Waar Zit een Koopkans Aan Te Komen?
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Controleer in één oogopslag per 5/5 aandeel: <strong>1. Is MACD rood geweest en draait hij naar groen?</strong> • <strong>2. Is het genoeg ondergewaardeerd (≤ 1.3x)?</strong> • <strong>3. Is er een stijgende waardeverdeling (laatste 8 kwartalen)?</strong>
                  </p>
                </div>

                {/* Sortering Toggle */}
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start lg:self-center shrink-0 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setIdealTableSort('WEIGHT')}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                      idealTableSort === 'WEIGHT'
                        ? 'bg-white text-indigo-800 shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <i className="ph-bold ph-chart-pie-slice"></i>
                    <span>Op Doelgewicht (%)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIdealTableSort('RADAR')}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                      idealTableSort === 'RADAR'
                        ? 'bg-white text-emerald-800 shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <i className="ph-bold ph-radar"></i>
                    <span>Op Koopkans-Radar</span>
                  </button>
                </div>
              </div>

              {/* Snel-filters voor de 3 Koopkans-pijlers */}
              {(() => {
                const watchOrBuyCount = idealPortfolio.filter(i =>
                  ['BUY_NOW', 'WATCH_TURNING_GREEN', 'WATCH_IN_RED'].includes(i.opportunityRadar?.status)
                ).length;
                const macdTurningCount = idealPortfolio.filter(i =>
                  i.macdStatus?.wasRedAndTurningGreen || i.macdStatus?.isGreenCrossover
                ).length;
                const undervaluedCount = idealPortfolio.filter(i =>
                  i.valuationStatus ? i.valuationStatus.isUndervaluedEnough : (i.priceToIntrinsicRatio <= 1.3)
                ).length;
                const risingWvCount = idealPortfolio.filter(i =>
                  i.wvTrendStatus ? i.wvTrendStatus.isRising : (!i.isWvDropping && i.wvDiff > 0)
                ).length;

                return (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setIdealTableFilter('ALL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                        idealTableFilter === 'ALL'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Alle 5/5 Aandelen ({idealPortfolio.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setIdealTableFilter('WATCH_OR_BUY')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1 ${
                        idealTableFilter === 'WATCH_OR_BUY'
                          ? 'bg-amber-500 text-amber-950 shadow-xs'
                          : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      <span>🔥 Opletten / Koopkans op Komst ({watchOrBuyCount})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIdealTableFilter('MACD_RED_TURNING')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1 ${
                        idealTableFilter === 'MACD_RED_TURNING'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100'
                      }`}
                    >
                      <span>🔄 MACD: Rood ➔ Draait Groen ({macdTurningCount})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIdealTableFilter('UNDERVALUED')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1 ${
                        idealTableFilter === 'UNDERVALUED'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      <span>🟢 Genoeg Ondergewaardeerd ≤ 1.3x ({undervaluedCount})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIdealTableFilter('RISING_WV')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1 ${
                        idealTableFilter === 'RISING_WV'
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100'
                      }`}
                    >
                      <span>📈 Stijgende Waardeverdeling ({risingWvCount})</span>
                    </button>
                  </div>
                );
              })()}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4">Aandeel</th>
                    <th className="py-3 px-3">🎯 Koopkans-Radar (Status)</th>
                    <th className="py-3 px-3">1. MACD (Was Rood ➔ Groen?)</th>
                    <th className="py-3 px-3">2. Genoeg Ondergewaardeerd?</th>
                    <th className="py-3 px-3 text-center">3. Stijgende Waardeverdeling? (Laatste 8 Kw.)</th>
                    <th className="py-3 px-3 text-center">Doel %</th>
                    <th className="py-3 px-3 text-right">Doelbedrag (€)</th>
                    <th className="py-3 px-3 text-right">Huidig Bezit</th>
                    <th className="py-3 px-3 text-center" title="Theoretisch verschil tussen 100% Doelbedrag en je huidige bezit">
                      Verschil tot 100% Doel
                    </th>
                    <th className="py-3 px-4 text-left bg-emerald-50/70 text-emerald-950" title="Exacte ordergrootte conform de strategie als de MACD morgen een groen koopsignaal geeft (incl. waarderingsfactor, 0,1 stuks afronding en check op je vrije cash)">
                      ⚡ Investeren bij Signaal Morgen
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {idealPortfolio
                    .filter((item) => {
                      if (idealTableFilter === 'WATCH_OR_BUY') {
                        return ['BUY_NOW', 'WATCH_TURNING_GREEN', 'WATCH_IN_RED'].includes(item.opportunityRadar?.status);
                      }
                      if (idealTableFilter === 'MACD_RED_TURNING') {
                        return item.macdStatus?.wasRedAndTurningGreen || item.macdStatus?.isGreenCrossover;
                      }
                      if (idealTableFilter === 'UNDERVALUED') {
                        return item.valuationStatus ? item.valuationStatus.isUndervaluedEnough : (item.priceToIntrinsicRatio <= 1.3);
                      }
                      if (idealTableFilter === 'RISING_WV') {
                        return item.wvTrendStatus ? item.wvTrendStatus.isRising : (!item.isWvDropping && item.wvDiff > 0);
                      }
                      return true;
                    })
                    .sort((a, b) => {
                      if (idealTableSort === 'RADAR') {
                        const rankA = a.opportunityRadar?.priorityRank ?? 5;
                        const rankB = b.opportunityRadar?.priorityRank ?? 5;
                        if (rankA !== rankB) return rankA - rankB;
                        const recA = a.macdStatus?.recoveryPct ?? 0;
                        const recB = b.macdStatus?.recoveryPct ?? 0;
                        if (recB !== recA) return recB - recA;
                      }
                      return (b.targetWeightPct || 0) - (a.targetWeightPct || 0);
                    })
                    .map((item) => {
                      const radarStatus = item.opportunityRadar?.status || 'WAIT_FOR_DIP';
                      const macd = item.macdStatus || {};
                      const isUndervaluedEnough = item.valuationStatus
                        ? item.valuationStatus.isUndervaluedEnough
                        : (item.priceToIntrinsicRatio !== null && item.priceToIntrinsicRatio <= 1.3);
                      const isDeeplyUndervalued = item.valuationStatus
                        ? item.valuationStatus.isDeeplyUndervalued
                        : (item.priceToIntrinsicRatio !== null && item.priceToIntrinsicRatio <= 1.0);
                      const isWvRising = item.wvTrendStatus
                        ? item.wvTrendStatus.isRising
                        : (!item.isWvDropping && item.wvDiff > 0);

                      const rowBgClass =
                        radarStatus === 'BUY_NOW'
                          ? 'bg-emerald-50/40 hover:bg-emerald-50/80'
                          : radarStatus === 'WATCH_TURNING_GREEN'
                          ? 'bg-amber-50/45 hover:bg-amber-50/80'
                          : 'hover:bg-slate-50/80';

                      return (
                        <tr key={item.stockId} className={`transition-colors ${rowBgClass}`}>
                          {/* 1. Aandeel & Score */}
                          <td className="py-3 px-4 font-bold text-gray-900">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-black text-gray-900">{item.ticker}</span>
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded font-black text-[10px]">
                                ⭐ {item.score}/5
                              </span>
                            </div>
                            <span className="text-gray-400 font-normal text-[11px] block truncate max-w-[150px]" title={item.name}>
                              {item.name}
                            </span>
                          </td>

                          {/* 2. Gecombineerde Koopkans-Radar */}
                          <td className="py-3 px-3 min-w-[195px]">
                            <div className="space-y-1">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black border ${
                                radarStatus === 'BUY_NOW'
                                  ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                                  : radarStatus === 'WATCH_TURNING_GREEN'
                                  ? 'bg-amber-100 text-amber-950 border-amber-300 shadow-2xs'
                                  : radarStatus === 'WATCH_IN_RED'
                                  ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                                  : radarStatus === 'BLOCKED'
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {item.opportunityRadar?.badge || '⏳ Wacht op Signaal'}
                              </span>
                              {item.opportunityRadar?.reason && (
                                <p className="text-[10px] text-gray-500 leading-tight max-w-[215px]">
                                  {item.opportunityRadar.reason}
                                </p>
                              )}
                            </div>
                          </td>

                          {/* 3. Pijler 1: MACD Status ("Is MACD rood geweest en kan het groen worden?") */}
                          <td className="py-3 px-3 min-w-[190px]">
                            <div className="space-y-1.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-extrabold border ${
                                macd.isGreenCrossover
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : macd.wasRedAndTurningGreen
                                  ? 'bg-amber-100 text-amber-950 border-amber-300'
                                  : macd.isRed
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : 'bg-blue-50 text-blue-800 border-blue-200'
                              }`}>
                                {macd.badge || '⚪ Geen MACD'}
                              </span>

                              {/* Visuele voortgangsbalk richting groene crossover wanneer MACD in het rood zit */}
                              {macd.isRed && (
                                <div className="space-y-0.5">
                                  <div className="flex items-center justify-between text-[10px] font-bold text-gray-600">
                                    <span>{macd.wasRedAndTurningGreen ? 'Draait naar groen:' : 'In rode fase:'}</span>
                                    <span className={macd.wasRedAndTurningGreen ? 'text-amber-800 font-black' : 'text-rose-700'}>
                                      {macd.recoveryPct || 0}% richting crossover
                                    </span>
                                  </div>
                                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        macd.wasRedAndTurningGreen ? 'bg-gradient-to-r from-amber-500 to-emerald-500' : 'bg-rose-400'
                                      }`}
                                      style={{ width: `${Math.max(8, Math.min(100, macd.recoveryPct || 0))}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              {macd.detail && (
                                <span className="text-[10px] text-gray-500 block leading-tight">
                                  {macd.detail}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 4. Pijler 2: Genoeg Ondergewaardeerd? (Koers vs Intrinsiek <= 1.3x) */}
                          <td className="py-3 px-3 min-w-[175px]">
                            <div className="space-y-1">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-extrabold border ${
                                isDeeplyUndervalued
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : isUndervaluedEnough
                                  ? 'bg-teal-50 text-teal-900 border-teal-200'
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                              }`}>
                                {hideFormulas
                                  ? (isUndervaluedEnough ? '🟢 Koopwaardig' : '🔴 Te Duur (Overgewaardeerd)')
                                  : (item.valuationStatus?.badge || (isUndervaluedEnough ? `🟢 Ja (${item.priceToIntrinsicRatio?.toFixed(2)}x ≤ 1.3x)` : `🔴 Nee (${item.priceToIntrinsicRatio?.toFixed(2)}x > 1.3x)`))}
                              </span>

                              <div className="text-[11px] text-gray-700 flex items-center gap-1.5 flex-wrap">
                                <span>Koers: <strong>{formatCurrency(item.currentPrice)}</strong></span>
                                {!hideFormulas && item.intrinsicValue && (
                                  <>
                                    <span className="text-gray-400">/</span>
                                    <span>Intr.: <strong className="text-emerald-700">{formatCurrency(item.intrinsicValue)}</strong></span>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 5. Pijler 3: Stijgende Waardeverdeling? (Gecorrigeerde Sparkline van de LAATSTE 8 Kwartalen) */}
                          <td className="py-2.5 px-3 text-center min-w-[165px]">
                            {hideFormulas ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                item.isWvDropping ? 'bg-rose-50 text-rose-700' : isWvRising ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {item.isWvDropping ? '🔴 Dalende Trend' : isWvRising ? '🟢 Stijgende Trend' : '🟢 Stabiele Trend'}
                              </span>
                            ) : (
                              <WvSparkline
                                history={item.wvHistory || []}
                                currentWv={item.waardeVerdeling}
                                prevWv={item.prevWaardeVerdeling}
                                wvDiff={item.wvDiff}
                                wvDiffPct={item.wvDiffPct}
                                isDropping={item.isWvDropping}
                                compact={true}
                              />
                            )}
                          </td>

                          {/* 6. Doel % */}
                          <td className="py-3 px-3 text-center">
                            <span className="font-extrabold text-indigo-700 text-xs">{item.targetWeightPct}%</span>
                            <span className="text-[10px] text-gray-400 block">{item.targetShares} stuks</span>
                          </td>

                          {/* 7. Doelbedrag (€) */}
                          <td className="py-3 px-3 text-right font-extrabold text-gray-900 privacy-blur">
                            {isIncognito ? '€ ••••••' : formatCurrency(item.targetValueEur)}
                          </td>

                          {/* 8. Huidig Bezit */}
                          <td className="py-3 px-3 text-right text-gray-600 privacy-blur">
                            {item.currentShares > 0 ? (
                              <div>
                                <span className="font-bold text-gray-900">{item.currentShares} stuks</span>
                                <span className="text-[10px] text-gray-500 block">({item.currentWeightPct}%)</span>
                              </div>
                            ) : (
                              <span className="text-gray-400">0 stuks</span>
                            )}
                          </td>

                          {/* 9. Verschil tot 100% Doel (Theoretische achterstand tot ideaal gewicht) */}
                          <td className="py-3 px-3 text-center">
                            {item.diffValueEur > 50 ? (
                              <div className="space-y-0.5">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 rounded-lg font-bold text-[11px] inline-block">
                                  + {item.diffShares} stuks
                                </span>
                                <span className="text-[10px] text-gray-500 block font-semibold privacy-blur">
                                  ({isIncognito ? '€ •••' : formatCurrency(item.diffValueEur)} tot doel)
                                </span>
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg font-bold text-[11px] inline-block">
                                ✓ Op doelniveau
                              </span>
                            )}
                          </td>

                          {/* 10. Exact Orderbedrag & Stuks als het Koopsignaal MORGEN valt (Conform Strategie) */}
                          <td className="py-3 px-4 min-w-[205px] bg-emerald-50/20">
                            {item.tomorrowOrder ? (
                              <div className="space-y-1">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black border privacy-blur ${
                                  item.tomorrowOrder.canBuyTomorrow
                                    ? item.tomorrowOrder.fundingStatus === 'DIRECT_CASH'
                                      ? 'bg-emerald-100 text-emerald-950 border-emerald-300 shadow-2xs'
                                      : 'bg-amber-100 text-amber-950 border-amber-300'
                                    : item.tomorrowOrder.fundingStatus === 'TARGET_REACHED'
                                    ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                    : 'bg-rose-50 text-rose-800 border-rose-200'
                                }`}>
                                  {isIncognito && item.tomorrowOrder.canBuyTomorrow
                                    ? `Koop ${item.tomorrowOrder.shares} stuks (€ •••)`
                                    : item.tomorrowOrder.badge}
                                </span>
                                {item.tomorrowOrder.detail && (
                                  <span className="text-[10px] text-gray-600 block leading-tight">
                                    {item.tomorrowOrder.detail}
                                  </span>
                                )}
                              </div>
                            ) : item.diffValueEur > 50 && isUndervaluedEnough && !item.isWvDropping ? (
                              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl font-black text-[11px] inline-block">
                                Koop {item.diffShares} stuks ({formatCurrency(item.diffValueEur)})
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-400 font-semibold">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. WEERGAVE 3: VOLLEDIGE POSITIES MATRIX */}
      {activeViewMode === 'matrix' && (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
          {/* Header & Filters */}
          <div className="p-6 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <i className="ph-fill ph-table text-indigo-600 text-xl"></i>
                Matrix: Huidige Posities & Strategie Beoordeling
              </h3>
              <p className="text-xs text-gray-500">
                Live status van al je posities met concrete exit-, winstneming- of bijkopingsadviezen.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Zoek aandeel..."
                  className="pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Filter Buttons */}
              <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl">
                {[
                  { id: 'ALL', label: `Alles (${holdings.length})` },
                  { id: 'BUY_MORE', label: `🟢 Kopen (${actionSummary.buyMoreCount})` },
                  { id: 'HOLD', label: `🟡 Houden (${actionSummary.holdCount})` },
                  { id: 'TAKE_PROFIT', label: `💰 Winst (${actionSummary.takeProfitCount})` },
                  { id: 'TRIM', label: `🔴 Afbouwen (${actionSummary.trimCount})` },
                  { id: 'ETF', label: `🌐 ETF` }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setMatrixFilter(tab.id)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                      matrixFilter === tab.id
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Aandeel</th>
                  <th className="py-3 px-3 text-right">Positie & Waarde</th>
                  <th className="py-3 px-3 text-right">Gewicht</th>
                  <th className="py-3 px-3 text-center">Waardeverdeling Trend</th>
                  <th className="py-3 px-3 text-right">Huidige Koers</th>
                  <th className="py-3 px-3 text-right">Intrinsieke Waarde</th>
                  <th className="py-3 px-3 text-center">Waardering (x)</th>
                  <th className="py-3 px-3 text-center">200 SMA</th>
                  <th className="py-3 px-3 text-center">Score</th>
                  <th className="py-3 px-4 text-center">Strategie Signaal</th>
                  <th className="py-3 px-4">Toelichting & Actie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredHoldings.map((h) => (
                  <tr
                    key={h.stockId}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Ticker & Name */}
                    <td className="py-3.5 px-4 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center font-black text-indigo-700 text-xs">
                          {h.ticker.slice(0, 3)}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 flex items-center gap-1.5">
                            {h.ticker}
                            {h.assetType === 'ETF' && (
                              <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded text-[10px] font-bold">ETF</span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-400 truncate max-w-[130px]" title={h.name}>
                            {h.name}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Positie & Waarde */}
                    <td className="py-3.5 px-3 text-right">
                      <div className="font-bold text-gray-900 privacy-blur">
                        {isIncognito ? '€ ••••••' : formatCurrency(h.holdingValue)}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {h.quantity.toFixed(2)} stuks
                      </div>
                    </td>

                    {/* Gewicht */}
                    <td className="py-3.5 px-3 text-right font-bold text-gray-700">
                      {h.weightPct.toFixed(1)}%
                    </td>

                    {/* Waardeverdeling Trend Sparkline */}
                    <td className="py-2 px-3 text-center min-w-[130px]">
                      {h.assetType === 'ETF' ? (
                        <span className="text-gray-400 text-[11px] italic">Index ETF</span>
                      ) : hideFormulas ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          h.isWvDropping ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {h.isWvDropping ? '📉 Dalende Trend' : '📈 Stabiel/Stijgend'}
                        </span>
                      ) : (
                        <WvSparkline
                          history={h.wvHistory || []}
                          currentWv={h.waardeVerdeling}
                          prevWv={h.prevWaardeVerdeling}
                          wvDiff={h.wvDiff}
                          wvDiffPct={h.wvDiffPct}
                          isDropping={h.isWvDropping}
                          compact={true}
                        />
                      )}
                    </td>

                    {/* Koers */}
                    <td className="py-3.5 px-3 text-right font-bold text-gray-900">
                      {formatCurrency(h.currentPrice)}
                    </td>

                    {/* Intrinsiek */}
                    <td className="py-3.5 px-3 text-right">
                      {hideFormulas ? (
                        <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">🔒 Beschermd</span>
                      ) : h.intrinsicValue ? (
                        <span className="font-bold text-emerald-700">
                          {formatCurrency(h.intrinsicValue)}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">n.v.t.</span>
                      )}
                    </td>

                    {/* Waardering x */}
                    <td className="py-3.5 px-3 text-center">
                      {hideFormulas ? (
                        <span className="text-[11px] font-semibold text-gray-500">🔒</span>
                      ) : h.priceToIntrinsicRatio ? (
                        <span className={`px-2 py-0.5 rounded-full font-bold text-xs ${
                          h.priceToIntrinsicRatio <= 1.0
                            ? 'bg-emerald-100 text-emerald-800'
                            : h.priceToIntrinsicRatio <= 1.3
                            ? 'bg-teal-100 text-teal-800'
                            : h.priceToIntrinsicRatio >= 2.0
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {h.priceToIntrinsicRatio.toFixed(2)}x
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* 200 SMA */}
                    <td className="py-3.5 px-3 text-center">
                      {h.sma200 ? (
                        <span className={`font-bold flex items-center justify-center gap-1 ${
                          h.isAbove200Sma ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          <i className={`ph-bold ${h.isAbove200Sma ? 'ph-arrow-up-right' : 'ph-arrow-down-right'}`}></i>
                          {h.isAbove200Sma ? 'Boven' : 'Onder'}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* Score */}
                    <td className="py-3.5 px-3 text-center">
                      {h.assetType === 'ETF' ? (
                        <span className="text-gray-400">ETF</span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded font-black text-xs ${
                          h.score === 5 ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {h.score}/5
                        </span>
                      )}
                    </td>

                    {/* Signaal Badge */}
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full font-bold text-xs whitespace-nowrap ${
                        h.actionSeverity === 'success'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : h.actionSeverity === 'warning'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : h.actionSeverity === 'danger'
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : h.actionSeverity === 'info'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {h.actionLabel}
                      </span>
                    </td>

                    {/* Toelichting */}
                    <td className="py-3.5 px-4 text-gray-600 max-w-[220px] text-[11px] leading-snug">
                      {h.actionReason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}

    </div>
  );
};

export default StrategyAdvisorTab;

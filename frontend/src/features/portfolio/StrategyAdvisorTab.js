import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import http from '../../http-common';
import toast from 'react-hot-toast';
import { useIncognito } from '../../hooks/useIncognito';
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend
);

const PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899',
  '#06B6D4', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
  '#A855F7', '#0EA5E9', '#22C55E', '#EAB308', '#64748B'
];

// Compacte Sparkline voor Waardeverdeling Trend (Laatste 8 Kwartalen)
const WvSparkline = ({ history = [], currentWv, prevWv, wvDiff, isDropping, compact = false }) => {
  if (!history || history.length === 0) {
    if (currentWv !== undefined && currentWv !== null) {
      return <span className="font-bold text-gray-700">{Number(currentWv).toFixed(1)}%</span>;
    }
    return <span className="text-gray-400">-</span>;
  }

  const sortedHistory = [...history]
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
    .slice(-8);

  const values = sortedHistory.map(h => Number(h.waardeVerdeling) || 0);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const min = Math.max(0, minVal * 0.85);
  const max = maxVal * 1.15 || 1;
  const range = max - min || 1;

  const width = compact ? 96 : 130;
  const height = compact ? 22 : 30;
  const padding = 3;

  const points = values.map((val, idx) => {
    const x = padding + (idx / Math.max(1, values.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((val - min) / range) * (height - 2 * padding);
    return { x, y, val, date: sortedHistory[idx]?.date };
  });

  const pathD = points.reduce((acc, p, idx) => (
    idx === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `${acc} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  ), '');

  const isRising = prevWv !== null && prevWv !== undefined && Number(currentWv) > Number(prevWv);
  const strokeColor = isDropping ? '#ef4444' : '#10b981';

  return (
    <div className="inline-flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className={`text-[11px] font-black ${isDropping ? 'text-rose-600' : 'text-emerald-700'}`}>
          {Number(currentWv ?? values[values.length - 1]).toFixed(1)}%
        </span>
        {prevWv !== null && prevWv !== undefined && (
          <span className={`text-[9px] font-bold px-1 py-0.2 rounded ${
            isDropping
              ? 'bg-rose-50 text-rose-700'
              : isRising
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {wvDiff > 0 ? `+${wvDiff.toFixed(1)}%` : `${wvDiff?.toFixed(1)}%`}
          </span>
        )}
      </div>
      <svg width={width} height={height} className="overflow-visible">
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x.toFixed(1)}
            cy={p.y.toFixed(1)}
            r={i === points.length - 1 ? '3' : '1.8'}
            fill={i === points.length - 1 ? strokeColor : '#ffffff'}
            stroke={strokeColor}
            strokeWidth="1.2"
          />
        ))}
      </svg>
    </div>
  );
};

// Compacte MACD & Signaallijn Mini-Sparkline (Laatste 30 Handelsdagen) voor in de Koopkans-Radar tabel
const MacdMiniSparkline = ({ series = [] }) => {
  if (!Array.isArray(series) || series.length < 5) return null;
  const slice = series.slice(-30);
  const allVals = [];
  slice.forEach(pt => {
    allVals.push(Number(pt.macd || 0), Number(pt.signal || 0), Number(pt.hist || 0), 0);
  });
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range = (maxVal - minVal) || 1;

  const width = 150;
  const height = 34;
  const pad = 3;

  const toY = (v) => height - pad - ((v - minVal) / range) * (height - 2 * pad);
  const toX = (i) => pad + (i / Math.max(1, slice.length - 1)) * (width - 2 * pad);
  const zeroY = toY(0);

  const macdPath = slice.reduce((acc, pt, i) => {
    const x = toX(i).toFixed(1);
    const y = toY(Number(pt.macd || 0)).toFixed(1);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  const sigPath = slice.reduce((acc, pt, i) => {
    const x = toX(i).toFixed(1);
    const y = toY(Number(pt.signal || 0)).toFixed(1);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  return (
    <div className="pt-0.5" title="Laatste 30 handelsdagen: Blauw = MACD, Oranje = Signaallijn, Balkjes = Histogram (Groen/Rood), Stippellijn = 0-lijn">
      <svg width={width} height={height} className="overflow-visible block">
        {/* 0-lijn */}
        <line
          x1={0}
          y1={zeroY.toFixed(1)}
          x2={width}
          y2={zeroY.toFixed(1)}
          stroke="#94a3b8"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        {/* Histogram balkjes */}
        {slice.map((pt, i) => {
          const hVal = Number(pt.hist || 0);
          const x = toX(i) - 1.2;
          const yVal = toY(hVal);
          const barTop = Math.min(zeroY, yVal);
          const barHeight = Math.max(1, Math.abs(yVal - zeroY));
          const isUp = i > 0 && hVal > Number(slice[i - 1].hist || 0);
          const fill = hVal >= 0
            ? (isUp ? '#10b981' : '#6ee7b7')
            : (isUp ? '#f59e0b' : '#fda4af');
          return (
            <rect
              key={i}
              x={x.toFixed(1)}
              y={barTop.toFixed(1)}
              width="2.2"
              height={barHeight.toFixed(1)}
              fill={fill}
              opacity="0.75"
              rx="0.5"
            />
          );
        })}
        {/* Signaallijn (Oranje) */}
        <path d={sigPath} fill="none" stroke="#f97316" strokeWidth="1.4" strokeLinecap="round" />
        {/* MACD-lijn (Blauw) */}
        <path d={macdPath} fill="none" stroke="#2563eb" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </div>
  );
};

// Volledige Interactieve MACD & Koop/Verkoopmoment Geschiedenis Grafiek (Laatste 60 Handelsdagen)
const MacdProgressionChart = ({ item, formatCurrency }) => {
  const [viewMode, setViewMode] = useState('macd'); // 'macd' | 'price'
  const series = item?.macdStatus?.historySeries || item?.historySeries || item?.sparkline || [];

  const metrics = useMemo(() => {
    if (!Array.isArray(series) || series.length < 3) return null;
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    const prev5 = series[Math.max(0, series.length - 6)];

    const gapNow = Number(last.macd || 0) - Number(last.signal || 0);
    const gapPrev = Number(prev.macd || 0) - Number(prev.signal || 0);
    const gap5dAgo = Number(prev5.macd || 0) - Number(prev5.signal || 0);
    const dailyClosingSpeed = gapNow - gapPrev;
    const fiveDayTrend = gapNow - gap5dAgo;

    const isBelowZero = Number(last.signal || 0) < 0;
    const isBullish = gapNow >= 0;
    const isConvergingToBuy = !isBullish && dailyClosingSpeed > 0;
    const isConvergingToSell = isBullish && dailyClosingSpeed < 0;

    // Schat aantal handelsdagen tot kruising als lijnen naar elkaar toe bewegen
    let estDaysToCross = null;
    if (isConvergingToBuy && dailyClosingSpeed > 0.001) {
      estDaysToCross = Math.max(1, Math.min(30, Math.ceil(Math.abs(gapNow) / dailyClosingSpeed)));
    } else if (isConvergingToSell && Math.abs(dailyClosingSpeed) > 0.001) {
      estDaysToCross = Math.max(1, Math.min(30, Math.ceil(Math.abs(gapNow) / Math.abs(dailyClosingSpeed))));
    }

    // Vind eventuele kruisingen in de afgelopen 60 dagen
    const crossovers = [];
    for (let i = 1; i < series.length; i++) {
      const hCur = Number(series[i].hist || 0);
      const hPrv = Number(series[i - 1].hist || 0);
      if (hPrv <= 0 && hCur > 0) {
        crossovers.push({ idx: i, date: series[i].date, type: 'BUY', price: series[i].close, underZero: Number(series[i].signal || 0) < 0 });
      } else if (hPrv >= 0 && hCur < 0) {
        crossovers.push({ idx: i, date: series[i].date, type: 'SELL', price: series[i].close, aboveZero: Number(series[i].signal || 0) > 0 });
      }
    }

    return {
      last,
      gapNow,
      dailyClosingSpeed,
      fiveDayTrend,
      isBelowZero,
      isBullish,
      isConvergingToBuy,
      isConvergingToSell,
      estDaysToCross,
      crossovers
    };
  }, [series]);

  const chartData = useMemo(() => {
    if (!Array.isArray(series) || series.length === 0) return null;
    const labels = series.map(pt => {
      const d = new Date(pt.date);
      return isNaN(d.getTime()) ? pt.date : d.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' });
    });

    if (viewMode === 'price') {
      return {
        labels,
        datasets: [
          {
            label: `${item?.ticker || ''} Slotkoers`,
            data: series.map(pt => Number(pt.close || 0)),
            borderColor: '#0f172a',
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            borderWidth: 2.2,
            pointRadius: series.map((_, i) => (i === series.length - 1 ? 4 : 0)),
            pointHoverRadius: 5,
            fill: true,
            tension: 0.25
          }
        ]
      };
    }

    return {
      labels,
      datasets: [
        {
          label: 'MACD Lijn (30,90)',
          data: series.map(pt => Number(pt.macd || 0)),
          borderColor: '#2563eb',
          backgroundColor: 'transparent',
          borderWidth: 2.3,
          pointRadius: series.map((_, i) => (i === series.length - 1 ? 4 : 0)),
          pointBackgroundColor: '#2563eb',
          pointHoverRadius: 5,
          tension: 0.25
        },
        {
          label: 'Signaallijn (9)',
          data: series.map(pt => Number(pt.signal || 0)),
          borderColor: '#f97316',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: series.map((_, i) => (i === series.length - 1 ? 3.5 : 0)),
          pointBackgroundColor: '#f97316',
          pointHoverRadius: 5,
          tension: 0.25
        },
        {
          label: 'Histogram (Afstand tot Kruising)',
          data: series.map(pt => Number(pt.hist || 0)),
          borderColor: series.map((pt, i) => {
            const h = Number(pt.hist || 0);
            const prevH = i > 0 ? Number(series[i - 1].hist || 0) : h;
            if (h >= 0) return '#10b981';
            return h > prevH ? '#f59e0b' : '#f43f5e';
          }),
          backgroundColor: series.map((pt, i) => {
            const h = Number(pt.hist || 0);
            const prevH = i > 0 ? Number(series[i - 1].hist || 0) : h;
            if (h >= 0) return 'rgba(16, 185, 129, 0.16)';
            return h > prevH ? 'rgba(245, 158, 11, 0.22)' : 'rgba(244, 63, 94, 0.14)';
          }),
          borderWidth: 1.5,
          pointRadius: 0,
          fill: 'origin',
          tension: 0.2
        },
        {
          label: '0-Lijn (Grens Onder/Boven 0)',
          data: series.map(() => 0),
          borderColor: '#64748b',
          borderWidth: 1.2,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false
        }
      ]
    };
  }, [series, viewMode, item]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          boxWidth: 10,
          font: { size: 11, weight: '700' },
          color: '#334155',
          padding: 10
        }
      },
      tooltip: {
        callbacks: {
          afterBody: (items) => {
            if (!items || !items.length) return '';
            const idx = items[0].dataIndex;
            const pt = series[idx];
            if (!pt) return '';
            return `Slotkoers: ${formatCurrency ? formatCurrency(pt.close) : pt.close} • Verschil (Hist): ${Number(pt.hist || 0).toFixed(3)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxTicksLimit: 10, font: { size: 10, weight: '600' }, color: '#64748b' }
      },
      y: {
        grid: { color: '#f1f5f9' },
        ticks: { font: { size: 10, weight: '600' }, color: '#64748b' }
      }
    }
  }), [series, formatCurrency]);

  if (!Array.isArray(series) || series.length < 5) {
    return (
      <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-500 text-center">
        Onvoldoende historische MACD-datapunten beschikbaar voor deze grafiek.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header & Mode Switch */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-black text-gray-900">
            📈 {item?.ticker} — Koop/Verkoopmoment Geschiedenis ({series.length} handelsdagen)
          </span>
          {metrics && (
            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${
              metrics.isBelowZero
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}>
              {metrics.isBelowZero ? '🟢 Onder de 0-lijn (Diepe Dip-Zone)' : '🟠 Boven de 0-lijn'}
            </span>
          )}
        </div>

        <div className="inline-flex bg-gray-100 p-0.5 rounded-xl text-[11px] font-bold">
          <button
            type="button"
            onClick={() => setViewMode('macd')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              viewMode === 'macd' ? 'bg-white text-blue-700 shadow-2xs font-black' : 'text-gray-600'
            }`}
          >
            📊 MACD &amp; Signaallijn
          </button>
          <button
            type="button"
            onClick={() => setViewMode('price')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              viewMode === 'price' ? 'bg-white text-slate-900 shadow-2xs font-black' : 'text-gray-600'
            }`}
          >
            💶 Koersverloop
          </button>
        </div>
      </div>

      {/* Kerncijfers van het Koop/Verkoopmoment */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-gray-200/80">
            <span className="text-[10px] font-bold text-gray-400 uppercase block">MACD vs. Signaal</span>
            <span className="font-black text-gray-900">
              {Number(metrics.last.macd).toFixed(2)} / {Number(metrics.last.signal).toFixed(2)}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-gray-200/80">
            <span className="text-[10px] font-bold text-gray-400 uppercase block">Afstand tot Kruising</span>
            <span className={`font-black ${metrics.gapNow >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {metrics.gapNow >= 0 ? '+' : ''}{metrics.gapNow.toFixed(3)} ({item?.macdStatus?.recoveryPct ?? 0}% herstel)
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-gray-200/80">
            <span className="text-[10px] font-bold text-gray-400 uppercase block">5-Daags Momentum</span>
            <span className={`font-black ${metrics.fiveDayTrend > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {metrics.fiveDayTrend > 0 ? '↗ Lijnen naderen koop' : '↘ Afzwakkend / Dalend'} ({metrics.fiveDayTrend > 0 ? '+' : ''}{metrics.fiveDayTrend.toFixed(3)})
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-gray-200/80">
            <span className="text-[10px] font-bold text-gray-400 uppercase block">Verwachte Kruising</span>
            <span className="font-black text-indigo-800">
              {metrics.isBullish
                ? (metrics.isConvergingToSell ? `~${metrics.estDaysToCross || '?'}d tot verkoopkruising` : '🟢 Reeds in Groene Fase')
                : metrics.isConvergingToBuy
                ? `🔥 ~${metrics.estDaysToCross || '?'} handelsdag(en) bij huidig tempo`
                : '⏳ Wacht op ommekeer omhoog'}
            </span>
          </div>
        </div>
      )}

      {/* De Chart.js Grafiek */}
      <div className="h-56 sm:h-64 w-full bg-white p-2.5 rounded-xl border border-gray-200">
        {chartData && <Line data={chartData} options={chartOptions} />}
      </div>

      {/* Recente Kruisingen in de afgelopen 60 handelsdagen */}
      {metrics?.crossovers?.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="font-bold text-gray-500">Kruisingen in laatste 60d:</span>
          {metrics.crossovers.map((c, idx) => (
            <span
              key={idx}
              className={`px-2 py-0.5 rounded-lg font-extrabold border ${
                c.type === 'BUY'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {c.type === 'BUY' ? '🟢 Koopkruising' : '🔴 Verkoopkruising'} op {c.date} ({formatCurrency ? formatCurrency(c.price) : c.price} • {c.type === 'BUY' ? (c.underZero ? 'onder 0' : 'boven 0') : (c.aboveZero ? 'boven 0' : 'onder 0')})
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const StrategyAdvisorTab = () => {
  const uid = localStorage.getItem('userID') || 1;
  const userRole = localStorage.getItem('role') || 'user';
  const isRealAdmin = Number(uid) === 1 || userRole === 'admin';
  const [previewRole, setPreviewRole] = useState(() => localStorage.getItem('admin_preview_role') || '');
  const isPreviewMode = isRealAdmin && Boolean(previewRole);
  const isAdmin = isRealAdmin && !isPreviewMode;
  const isIncognito = useIncognito();

  useEffect(() => {
    const syncPreview = () => setPreviewRole(localStorage.getItem('admin_preview_role') || '');
    window.addEventListener('adminPreviewChanged', syncPreview);
    window.addEventListener('permissionsUpdated', syncPreview);
    return () => {
      window.removeEventListener('adminPreviewChanged', syncPreview);
      window.removeEventListener('permissionsUpdated', syncPreview);
    };
  }, []);

  const userPermissions = useMemo(() => {
    if (isRealAdmin && localStorage.getItem('admin_preview_role')) {
      try {
        const p = localStorage.getItem('admin_preview_permissions');
        if (p) return JSON.parse(p);
      } catch {}
      return { canUseStockStrategy: false, canUseEtfStrategy: false, canViewFormulas: false };
    }
    if (isRealAdmin) {
      return { canUseStockStrategy: true, canUseEtfStrategy: true, canViewFormulas: true };
    }
    try {
      const saved = localStorage.getItem('user_permissions');
      return saved ? JSON.parse(saved) : { canUseStockStrategy: true, canUseEtfStrategy: true, canViewFormulas: false };
    } catch {
      return { canUseStockStrategy: true, canUseEtfStrategy: true, canViewFormulas: false };
    }
  }, [isRealAdmin, previewRole]);

  // Gecombineerde state voor Aandelen + ETF strategieën
  const [stockData, setStockData] = useState(() => {
    try {
      const cached = localStorage.getItem(`cached_strategy_advisor_stocks_v5_${uid}`);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [etfData, setEtfData] = useState(null);
  const [cryptoData, setCryptoData] = useState(null);
  const [myStrategyConfig, setMyStrategyConfig] = useState(null);
  const [loading, setLoading] = useState(() => !stockData);
  const [isUpdating, setIsUpdating] = useState(false);

  // Hoofdsectie op de pagina (gebaseerd op de stijl van Common tab):
  // 'notifications' (alle meldingen & acties samen) | 'donuts' (Donuts + Waar Zit een Koopkans Aan Te Komen?) | 'matrix' (Huidige Posities)
  const [activeSection, setActiveSection] = useState('notifications');

  // Filters voor Gecombineerde Meldingen
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTION_REQUIRED' | 'BUY' | 'SELL' | 'MATCHED' | 'SUPERVISION' | 'EXPIRED'
  const [strategyFilter, setStrategyFilter] = useState('ALL'); // 'ALL' of specifieke strategienaam
  const [searchQuery, setSearchQuery] = useState('');
  const [notifSort, setNotifSort] = useState({ key: 'date', direction: 'desc' });

  // Donuts & Koopkans-Radar states
  const [currentDonutGroupMode, setCurrentDonutGroupMode] = useState('holdings'); // 'holdings' | 'brokers'
  const [idealTableFilter, setIdealTableFilter] = useState('ALL'); // 'ALL' | 'WATCH_OR_BUY' | 'MACD_RED_TURNING' | 'UNDERVALUED' | 'RISING_WV' | 'ETF_ONLY' | 'CRYPTO_ONLY'
  const [idealTableSort, setIdealTableSort] = useState('RADAR'); // 'RADAR' | 'WEIGHT'
  const [matrixFilter, setMatrixFilter] = useState('ALL');

  // Detail Modals (voor klikken op een rij op desktop of mobiel, net als bij de holdingstabel op Common)
  const [selectedNotificationModal, setSelectedNotificationModal] = useState(null);
  const [selectedRadarModal, setSelectedRadarModal] = useState(null);
  const [selectedProgressionTicker, setSelectedProgressionTicker] = useState('');

  const formatCurrency = useCallback((val) => {
    if (val === null || val === undefined || isNaN(val)) return '€ 0,00';
    return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(val);
  }, []);

  const fetchAllAdvisorData = useCallback(async (force = false) => {
    if (force) setLoading(true);
    try {
      const budget = parseFloat(localStorage.getItem('etf_dca_monthly_budget')) || 450;
      const pot = parseFloat(localStorage.getItem('etf_dca_initial_pot')) || 0;
      const start = localStorage.getItem('etf_dca_start_date') || '2026-01-01';

      const [stocksRes, etfRes, cryptoRes, cfgRes] = await Promise.all([
        http.get(`/portfolio/strategy-advisor?userId=${uid}&currency=EUR${force ? '&forceRefresh=true' : ''}`).catch(() => ({ data: null })),
        http.get(`/portfolio/etf-strategy?userId=${uid}&monthlyBudget=${budget}&initialPot=${pot}&startDate=${start}${force ? '&forceRefresh=true' : ''}`).catch(() => ({ data: null })),
        http.get(`/portfolio/crypto-strategy?userId=${uid}${force ? '&forceRefresh=true' : ''}`).catch(() => ({ data: null })),
        http.get('/strategies/my-config').catch(() => ({ data: null }))
      ]);

      if (stocksRes?.data) {
        setStockData(stocksRes.data);
        try {
          localStorage.setItem(`cached_strategy_advisor_stocks_v5_${uid}`, JSON.stringify(stocksRes.data));
        } catch {
          // quota
        }
      }
      if (etfRes?.data) {
        setEtfData(etfRes.data);
      }
      if (cryptoRes?.data) {
        setCryptoData(cryptoRes.data);
      }
      if (cfgRes?.data) {
        setMyStrategyConfig(cfgRes.data);
      }
    } catch (err) {
      console.error('Fout bij ophalen Strategie Assistent data:', err);
      toast.error('Kon strategie-advies niet volledig laden.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    fetchAllAdvisorData();
  }, [fetchAllAdvisorData]);

  const handleTriggerUpdate = async () => {
    setIsUpdating(true);
    try {
      toast.loading('Bezig met bijwerken van koersen & strategie-signalen...', { id: 'sync-strat' });
      await http.post('/watchlist/update-data');
      await fetchAllAdvisorData(true);
      toast.success('Strategie-advies & koersen bijgewerkt!', { id: 'sync-strat' });
    } catch {
      toast.error('Update mislukt.', { id: 'sync-strat' });
    } finally {
      setIsUpdating(false);
    }
  };

  const hideFormulas = !isAdmin && (stockData?.isBlackBoxMode || !userPermissions.canViewFormulas);

  // Voor normale gebruikers: dwing altijd de eenvoudige 'notifications' sectie af (geen Donuts/Koopkans-Radar of Matrix)
  useEffect(() => {
    if (!isAdmin && activeSection !== 'notifications') {
      setActiveSection('notifications');
    }
  }, [isAdmin, activeSection]);

  // Actieve strategieën:
  // - Als er geen strategie geselecteerd is in myStrategyConfig.activeStrategies, blijft de lijst leeg voor normale gebruikers!
  const activeStrategiesList = useMemo(() => {
    if (Array.isArray(myStrategyConfig?.activeStrategies)) {
      if (myStrategyConfig.activeStrategies.length > 0) {
        return myStrategyConfig.activeStrategies;
      }
      // Voor normale gebruikers (of als er expliciet 0 strategieën geselecteerd zijn): toon niets
      if (!isAdmin) {
        return [];
      }
    }
    if (!isAdmin) {
      return [];
    }
    const fallback = [];
    if (stockData?.activeStrategyConfig?.name) {
      fallback.push({
        strategy_id: 'stocks-default',
        name: stockData.activeStrategyConfig.name,
        strategy_type: 'STOCKS',
        priority_order: 1
      });
    }
    if (etfData?.activeStrategyConfig?.name) {
      fallback.push({
        strategy_id: 'etf-default',
        name: etfData.activeStrategyConfig.name,
        strategy_type: 'ETF',
        priority_order: 2
      });
    }
    return fallback;
  }, [myStrategyConfig, stockData, etfData, isAdmin]);

  const hasSelectedStrategy = activeStrategiesList.length > 0;
  const selectedStrategyTypes = useMemo(() => {
    return new Set(activeStrategiesList.map(s => String(s.strategy_type || 'STOCKS').toUpperCase()));
  }, [activeStrategiesList]);

  // Exacte Euro-Kapitaalverdeling per Actieve Strategie (Waterval #1 -> #2 -> #3)
  // Vertaalt elke inlegmethode (vast maandbedrag, % van beschikbare cash, % van totale waarde, of vrije cash + rotatie)
  // naar concrete euro-bedragen vandaag zodat de gebruiker in één oogopslag ziet over welk bedrag het gaat per strategie.
  const strategyCapitalCards = useMemo(() => {
    const totalBrokerCash = Number(stockData?.cashAllocation?.totalBrokerCash ?? etfData?.cashAllocation?.totalBrokerCash ?? 0);
    const etfReservedPot = Number(etfData?.cashAllocation?.etfReservedCash ?? stockData?.cashAllocation?.etfReservedCash ?? 0);
    const stocksInvestedVal = Number(stockData?.totalPortfolioValue || 0);
    const etfInvestedVal = (etfData?.etfs || []).reduce((sum, e) => sum + Number(e.actualPortfolio?.currentValue || 0), 0);
    const cryptoCashPot = Number(cryptoData?.activeStrategyConfig?.availableCryptoCash || 450);
    const cryptoInvestedVal = (cryptoData?.coins || []).reduce((sum, c) => sum + Number(c.ownedValueEur || 0), 0);

    // Bereken rotatie-capaciteit voor losse aandelen (posities die gesnoeid kunnen worden bij een betere 5/5 kans)
    const rotatableHoldingsVal = (stockData?.holdings || [])
      .filter(h => h.assetType !== 'ETF' && (Number(h.score || 5) < 5 || h.isWvDropping || Number(h.waardeVerdeling || 0) < 25))
      .reduce((sum, h) => sum + (Number(h.score || 5) < 5 ? Number(h.holdingValue || 0) : Number(h.holdingValue || 0) * 0.35), 0);

    let remainingWaterfallCash = totalBrokerCash;

    return activeStrategiesList.map((strat, idx) => {
      const sType = String(strat.strategy_type || 'STOCKS').toUpperCase();
      const prio = Number(strat.priority_order || idx + 1);
      const mode = strat.funding_mode || (sType === 'ETF' ? 'monthly_amount' : sType === 'CRYPTO' ? 'available_cash' : 'available_cash');
      const budgetVal = Number(strat.monthly_budget ?? (sType === 'ETF' ? 450 : 500));

      if (sType === 'CRYPTO') {
        const trancheEur = Math.max(50, Math.min(cryptoCashPot, +(cryptoCashPot * 0.30).toFixed(2)));
        return {
          key: strat.active_entry_id || `cap-crypto-${idx}`,
          prio,
          name: strat.name,
          type: 'CRYPTO',
          icon: '🪙',
          modeLabel: `Gesloten Coinbase Pot (30% tranche • Min. €50)`,
          directBuyEur: cryptoCashPot,
          directBuyLabel: 'Vrije Coinbase Cash',
          investedEur: cryptoInvestedVal,
          extraEur: cryptoCashPot >= 50 ? trancheEur : 0,
          extraLabel: 'Eerstvolgende 1.0x order',
          summaryLine: `${formatCurrency(cryptoCashPot)} direct vrij op Coinbase • ${formatCurrency(cryptoInvestedVal)} belegd`
        };
      }

      if (sType === 'ETF') {
        const reservedNow = Math.min(remainingWaterfallCash > 0 ? remainingWaterfallCash : etfReservedPot, etfReservedPot);
        remainingWaterfallCash = Math.max(0, remainingWaterfallCash - reservedNow);
        const mBudget = budgetVal > 0 ? budgetVal : Number(etfData?.cashAllocation?.monthlyEtfBudget || 450);
        const dailyRate = +(mBudget / 30).toFixed(2);
        return {
          key: strat.active_entry_id || `cap-etf-${idx}`,
          prio,
          name: strat.name,
          type: 'ETF',
          icon: '📈',
          modeLabel: mode === 'monthly_amount'
            ? `📅 Vast bedrag (${formatCurrency(mBudget)}/mnd • €${dailyRate}/dag)`
            : mode === 'pct_total_portfolio'
            ? `📊 ${budgetVal}% van Totale Waarde`
            : `💰 ${budgetVal || 100}% van Vrije Cash`,
          directBuyEur: etfReservedPot,
          directBuyLabel: 'Opgebouwde ETF Kooppot',
          investedEur: etfInvestedVal,
          extraEur: mBudget,
          extraLabel: 'Maandbudget',
          summaryLine: `Pot vandaag: ${formatCurrency(etfReservedPot)} klaar voor aankoop (uit ${formatCurrency(mBudget)}/mnd) • Belegd: ${formatCurrency(etfInvestedVal)}`
        };
      }

      // LOSSE AANDELEN STRATEGIE (STOCKS)
      let directCashForStrat = remainingWaterfallCash;
      let modeLabel = '💵 100% van Resterende Vrije Cash';
      let extraEur = 0;
      let extraLabel = '';

      if (mode === 'monthly_amount') {
        const mBudget = budgetVal > 0 ? budgetVal : 500;
        directCashForStrat = Math.min(remainingWaterfallCash, mBudget);
        modeLabel = `📅 Vast Maandbudget (${formatCurrency(mBudget)}/mnd)`;
        extraEur = mBudget;
        extraLabel = 'Maandplafond';
      } else if (mode === 'pct_available_cash') {
        const pct = Math.max(1, Math.min(100, budgetVal || 100));
        directCashForStrat = +(remainingWaterfallCash * (pct / 100)).toFixed(2);
        modeLabel = `💰 ${pct}% van Beschikbare Vrije Cash`;
      } else if (mode === 'pct_total_portfolio') {
        const pct = Math.max(1, Math.min(100, budgetVal || 50));
        const totalWealth = stocksInvestedVal + etfInvestedVal + totalBrokerCash;
        const targetCap = +(totalWealth * (pct / 100)).toFixed(2);
        directCashForStrat = Math.min(remainingWaterfallCash, Math.max(0, +(targetCap - stocksInvestedVal).toFixed(2)));
        modeLabel = `📊 ${pct}% van Totale Waarde (Doel: ${formatCurrency(targetCap)})`;
        extraEur = targetCap;
        extraLabel = `Doelplafond (${pct}%)`;
      } else if (mode === 'cash_plus_rotation') {
        directCashForStrat = remainingWaterfallCash;
        modeLabel = '🔄 Vrije Cash + Actieve Rotatie (Snoeien)';
        extraEur = +rotatableHoldingsVal.toFixed(2);
        extraLabel = 'Extra via Rotatie/Snoei';
      }

      remainingWaterfallCash = Math.max(0, remainingWaterfallCash - directCashForStrat);

      return {
        key: strat.active_entry_id || `cap-stocks-${idx}`,
        prio,
        name: strat.name,
        type: 'STOCKS',
        icon: '💎',
        modeLabel,
        directBuyEur: directCashForStrat,
        directBuyLabel: 'Direct Vrije Koopcash',
        investedEur: stocksInvestedVal,
        extraEur,
        extraLabel,
        summaryLine: mode === 'cash_plus_rotation'
          ? `${formatCurrency(directCashForStrat)} direct vrij + tot ${formatCurrency(extraEur)} vrij te maken via rotatie • Belegd: ${formatCurrency(stocksInvestedVal)}`
          : `${formatCurrency(directCashForStrat)} direct vrij voor aankopen • Belegd: ${formatCurrency(stocksInvestedVal)}`
      };
    });
  }, [activeStrategiesList, stockData, etfData, cryptoData, formatCurrency]);

  // ============================================================================
  // GECOMBINEERDE MELDINGEN & TIJDLIJN (Aandelen + ETF's + Vorige Strategieën)
  // ============================================================================
  const unifiedNotifications = useMemo(() => {
    const items = [];
    const alertsByKey = new Map();

    // 1. Indexeer rijke details uit dataDrivenAlerts (Waardeverdeling sparkline, intrinsieke ratio, rotatie)
    const rawAlerts = stockData?.dataDrivenAlerts || [];
    rawAlerts.forEach(a => {
      const k = `${a.ticker}_${a.date}`;
      alertsByKey.set(k, a);
    });

    const defaultStockStratName = stockData?.activeStrategyConfig?.name || 'Live Aandelen Strategie';
    const defaultEtfStratName = etfData?.activeStrategyConfig?.name || 'Arne ETF DCA (€450/mnd)';

    // 2. Voeg Aandelen Tijdlijn & Meldingen toe
    const seenStockKeys = new Set();
    const stockTimeline = stockData?.timeline || [];

    stockTimeline.forEach((t, idx) => {
      const key = `${t.ticker}_${t.date}`;
      seenStockKeys.add(key);
      const richAlert = alertsByKey.get(key) || {};

      const isMatched = t.status === 'EXECUTED';
      const isExecutedSell = t.status === 'EXECUTED_SELL';
      const isOpen = t.status === 'OPEN_OPPORTUNITY';
      const isOpenSell = t.status === 'OPEN_SELL_ORDER';
      const isSkippedSmallSell = t.status === 'SKIPPED_SMALL_SELL' || t.isSkippedSmallSell;
      const isSupervision = t.status === 'UNDER_SUPERVISION' || t.isCautionStock;
      const isExpired = t.status === 'EXPIRED';
      const isSell = isOpenSell || isExecutedSell || isSkippedSmallSell || String(t.type || '').includes('SELL');

      const shares = Number(t.shares ?? richAlert.shares ?? 0);
      const amountEur = Number(t.totalAmount ?? richAlert.amountEur ?? 0);
      const isActionRequired = isOpenSell || (isOpen && !t.isCautionStock && !t.isTargetReached && shares > 0);

      let statusCategory = 'OTHER';
      if (isActionRequired) statusCategory = isSell ? 'SELL' : 'BUY';
      else if (isOpen && !t.isTargetReached) statusCategory = 'BUY';
      else if (isSell) statusCategory = 'SELL';
      else if (isMatched || isExecutedSell) statusCategory = 'MATCHED';
      else if (isSupervision || t.isTargetReached || isSkippedSmallSell) statusCategory = 'SUPERVISION';
      else if (isExpired) statusCategory = 'EXPIRED';

      let shortBadge = t.statusBadge || 'Signaal';
      let badgeTone = 'slate';
      if (isOpenSell) {
        shortBadge = '🔴 Verkooporder';
        badgeTone = 'rose';
      } else if (isActionRequired && !isSell) {
        shortBadge = '🟢 Koopkans';
        badgeTone = 'emerald';
      } else if (isMatched) {
        shortBadge = '✅ Gekocht';
        badgeTone = 'emerald';
      } else if (isExecutedSell) {
        shortBadge = '✅ Verkocht';
        badgeTone = 'rose';
      } else if (t.isTargetReached) {
        shortBadge = '🎯 Op Doel';
        badgeTone = 'indigo';
      } else if (isSupervision || isSkippedSmallSell) {
        shortBadge = '⚠️ Toezicht';
        badgeTone = 'amber';
      } else if (isExpired) {
        shortBadge = '⚪ Verlopen';
        badgeTone = 'slate';
      }

      const stratName = t.strategyName || richAlert.strategyName || defaultStockStratName;
      const summaryReason =
        t.note ||
        t.cautionReason ||
        t.expireReason ||
        richAlert.fundingSource?.message ||
        (isMatched
          ? `Gekocht op ${t.executionDate || t.date} (${t.daysBetweenSignalAndBuy || 0}d na signaal)`
          : isOpen
          ? 'Voldoet aan 5/5 criteria & MACD crossover'
          : '');

      items.push({
        id: t.id || `stock-tl-${idx}`,
        strategyType: 'STOCKS',
        strategyName: stratName,
        isFromOldStrategy: Boolean(t.isFromOldStrategy || richAlert.isFromOldStrategy),
        date: t.date,
        timestamp: t.timestamp || new Date(t.date).getTime(),
        ticker: t.ticker,
        name: t.name || richAlert.name || t.ticker,
        status: t.status,
        statusCategory,
        isActionRequired,
        isSell,
        isMatched: isMatched || isExecutedSell,
        shortBadge,
        badgeTone,
        shares,
        amountEur,
        signalPrice: Number(t.signalPrice ?? richAlert.priceAtAlert ?? 0),
        actualPrice: Number(t.actualPrice || 0),
        currentPrice: Number(t.currentPrice ?? richAlert.currentPrice ?? 0),
        priceDiff: Number(t.priceDiff || 0),
        priceDiffPct: Number(t.priceDiffPct ?? richAlert.priceDiffSinceAlertPct ?? 0),
        isCheaper: Boolean(t.isCheaper ?? richAlert.isCheaperNow),
        comparisonDetail: t.comparisonDetail || '',
        executionDate: t.executionDate || null,
        daysBetweenSignalAndBuy: t.daysBetweenSignalAndBuy,
        score: t.score || richAlert.score || 5,
        waardeVerdeling: t.waardeVerdeling ?? richAlert.waardeVerdeling,
        prevWaardeVerdeling: richAlert.prevWaardeVerdeling,
        wvDiff: richAlert.wvDiff,
        wvDiffPct: richAlert.wvDiffPct,
        isWvDropping: Boolean(richAlert.isWvDown || (richAlert.wvDiff < 0)),
        wvHistory: richAlert.wvHistory || [],
        priceToIntrinsicRatio: richAlert.priceToIntrinsicRatio,
        isOvervalued: richAlert.isOvervalued,
        targetWeightPct: richAlert.targetWeightPct,
        targetShares: richAlert.targetShares,
        targetValueEur: richAlert.targetValueEur,
        currentShares: t.currentOwnedShares ?? richAlert.currentShares,
        currentOwnedEur: t.currentOwnedEur ?? richAlert.currentOwnedEur,
        isTargetReached: Boolean(t.isTargetReached),
        fundingSource: t.fundingSource || richAlert.fundingSource || null,
        linkedSales: richAlert.linkedSales || [],
        warning: richAlert.warning || null,
        reportDate: richAlert.reportDate || null,
        summaryReason
      });
    });

    // Voeg eventuele alerts uit dataDrivenAlerts toe die niet in timeline zaten
    rawAlerts.forEach((a, idx) => {
      const key = `${a.ticker}_${a.date}`;
      if (seenStockKeys.has(key)) return;

      const isSell = a.signalType === 'Verkoopsignaal';
      const isActionable = Boolean(a.isActionableBuy);
      const isCaution = Boolean(a.isCautionBuy);
      const isTargetReached = a.fundingSource?.status === 'TARGET_REACHED' || a.shares === 0;
      const isActionRequired = isSell || (isActionable && !isTargetReached && Number(a.shares) > 0);

      let statusCategory = 'SUPERVISION';
      let shortBadge = '⚠️ Toezicht';
      let badgeTone = 'amber';

      if (isSell) {
        statusCategory = 'SELL';
        shortBadge = '🔴 Verkooporder';
        badgeTone = 'rose';
      } else if (isActionable && !isTargetReached) {
        statusCategory = 'BUY';
        shortBadge = '🟢 Koopkans';
        badgeTone = 'emerald';
      } else if (isTargetReached && !isCaution) {
        statusCategory = 'SUPERVISION';
        shortBadge = '🎯 Op Doel';
        badgeTone = 'indigo';
      }

      items.push({
        id: a.alertId || `stock-al-${idx}`,
        strategyType: 'STOCKS',
        strategyName: a.strategyName || defaultStockStratName,
        isFromOldStrategy: Boolean(a.isFromOldStrategy),
        date: a.date,
        timestamp: new Date(a.date).getTime(),
        ticker: a.ticker,
        name: a.name || a.ticker,
        status: isSell ? 'OPEN_SELL_ORDER' : isActionable ? 'OPEN_OPPORTUNITY' : 'UNDER_SUPERVISION',
        statusCategory,
        isActionRequired,
        isSell,
        isMatched: false,
        shortBadge,
        badgeTone,
        shares: Number(a.shares || 0),
        amountEur: Number(a.amountEur || 0),
        signalPrice: Number(a.priceAtAlert || 0),
        actualPrice: 0,
        currentPrice: Number(a.currentPrice || 0),
        priceDiff: 0,
        priceDiffPct: Number(a.priceDiffSinceAlertPct || 0),
        isCheaper: Boolean(a.isCheaperNow),
        comparisonDetail: '',
        executionDate: null,
        score: 5,
        waardeVerdeling: a.waardeVerdeling,
        prevWaardeVerdeling: a.prevWaardeVerdeling,
        wvDiff: a.wvDiff,
        wvDiffPct: a.wvDiffPct,
        isWvDropping: Boolean(a.isWvDown || (a.wvDiff < 0)),
        wvHistory: a.wvHistory || [],
        priceToIntrinsicRatio: a.priceToIntrinsicRatio,
        isOvervalued: a.isOvervalued,
        targetWeightPct: a.targetWeightPct,
        targetShares: a.targetShares,
        targetValueEur: a.targetValueEur,
        currentShares: a.currentShares,
        currentOwnedEur: a.currentOwnedEur,
        isTargetReached,
        fundingSource: a.fundingSource || null,
        linkedSales: a.linkedSales || [],
        warning: a.warning || null,
        reportDate: a.reportDate || null,
        summaryReason: a.fundingSource?.message || a.warning || ''
      });
    });

    // 3. Voeg ETF Strategie Meldingen toe in exact dezelfde lijst!
    const etfTimeline = etfData?.timeline || [];
    etfTimeline.forEach((eItem, idx) => {
      const isMatched = eItem.status === 'EXECUTED';
      const isOpen = eItem.status === 'OPEN_OPPORTUNITY';
      const isExpired = eItem.status === 'EXPIRED';

      let statusCategory = 'EXPIRED';
      let shortBadge = '⚪ Verlopen';
      let badgeTone = 'slate';

      if (isOpen) {
        statusCategory = 'BUY';
        shortBadge = '🟢 Koopkans';
        badgeTone = 'emerald';
      } else if (isMatched) {
        statusCategory = 'MATCHED';
        shortBadge = '✅ Gekocht';
        badgeTone = 'emerald';
      }

      const stratName = eItem.strategyName || defaultEtfStratName;
      const summaryReason = isOpen
        ? `DCA Koopkans: ${eItem.pctOfPot || 100}% van pot (restant: ${formatCurrency(eItem.remainingPot || 0)})`
        : isMatched
        ? `Aangekocht op ${eItem.executionDate || eItem.date} ${eItem.comparisonBadge || ''}`
        : 'Niet aangekocht binnen 30 dagen na MACD signaal';

      items.push({
        id: eItem.id || `etf-tl-${idx}`,
        strategyType: 'ETF',
        strategyName: stratName,
        isFromOldStrategy: false,
        date: eItem.date,
        timestamp: eItem.timestamp || new Date(eItem.date).getTime(),
        ticker: eItem.ticker,
        name: eItem.name || eItem.ticker,
        status: eItem.status,
        statusCategory,
        isActionRequired: isOpen && Number(eItem.shares) > 0,
        isSell: false,
        isMatched,
        shortBadge,
        badgeTone,
        shares: Number(eItem.shares || 0),
        amountEur: Number(eItem.totalAmount || 0),
        signalPrice: Number(eItem.signalPrice || 0),
        actualPrice: Number(eItem.actualPrice || 0),
        currentPrice: Number(eItem.actualPrice || eItem.signalPrice || 0),
        priceDiff: Number(eItem.priceDiff || 0),
        priceDiffPct: Number(eItem.priceDiffPct || 0),
        isCheaper: Boolean(eItem.isCheaper),
        comparisonDetail: eItem.comparisonBadge || '',
        executionDate: eItem.executionDate || null,
        daysBetweenSignalAndBuy: eItem.daysBetweenSignalAndBuy,
        pctOfPot: eItem.pctOfPot,
        remainingPot: eItem.remainingPot,
        summaryReason
      });
    });

    // 4. Voeg Crypto Strategie Meldingen (BTC, ETH, SOL) toe in exact dezelfde lijst!
    const defaultCryptoStratName = cryptoData?.activeStrategyConfig?.name || 'Arne Crypto MACD 2.0 (Min. €50)';
    const cryptoTimeline = cryptoData?.timeline || [];
    cryptoTimeline.forEach((cItem, idx) => {
      const isMatched = cItem.status === 'EXECUTED' || cItem.status === 'EXECUTED_SELL';
      const isOpenBuy = cItem.status === 'OPEN_OPPORTUNITY';
      const isOpenSell = cItem.status === 'OPEN_SELL_ORDER';
      const isSupervision = cItem.status === 'UNDER_SUPERVISION' || cItem.status === 'SKIPPED_SMALL_SELL';
      const isSell = cItem.signalType === 'SELL' || isOpenSell || cItem.status === 'EXECUTED_SELL';

      let statusCategory = 'EXPIRED';
      let badgeTone = 'slate';
      if (isOpenBuy) {
        statusCategory = 'BUY';
        badgeTone = 'emerald';
      } else if (isOpenSell || (isSell && !isMatched)) {
        statusCategory = 'SELL';
        badgeTone = 'rose';
      } else if (isMatched) {
        statusCategory = 'MATCHED';
        badgeTone = isSell ? 'rose' : 'emerald';
      } else if (isSupervision) {
        statusCategory = 'SUPERVISION';
        badgeTone = 'amber';
      }

      items.push({
        id: cItem.id || `crypto-tl-${idx}`,
        strategyType: 'CRYPTO',
        strategyName: cItem.strategyName || defaultCryptoStratName,
        isFromOldStrategy: false,
        date: cItem.date,
        timestamp: cItem.timestamp || new Date(cItem.date).getTime(),
        ticker: cItem.ticker,
        name: cItem.name || cItem.ticker,
        status: cItem.status,
        statusCategory,
        isActionRequired: Boolean(cItem.isActionRequired),
        isSell,
        isMatched,
        shortBadge: cItem.statusBadge || (isSell ? '🔴 Verkoop' : '🟢 Koopkans'),
        badgeTone,
        shares: Number(cItem.shares || 0),
        amountEur: Number(cItem.totalAmount || 0),
        signalPrice: Number(cItem.signalPrice || 0),
        actualPrice: Number(cItem.actualPrice || 0),
        currentPrice: Number(cItem.actualPrice || cItem.signalPrice || 0),
        priceDiff: Number(cItem.priceDiff || 0),
        priceDiffPct: Number(cItem.priceDiffPct || 0),
        isCheaper: Boolean(cItem.isCheaper),
        executionDate: cItem.executionDate || null,
        buyMultiplier: cItem.buyMultiplier,
        percentageToSell: cItem.percentageToSell,
        remainingPot: cItem.remainingPot,
        summaryReason: cItem.note || ''
      });
    });

    if (isAdmin) {
      return items;
    }

    // Voor normale gebruikers:
    // 1. Als er geen strategie geselecteerd is -> leeg
    if (!hasSelectedStrategy) return [];

    // 2. Toon ENKEL meldingen van de geselecteerde strategieën én enkel daadwerkelijke Koop-, Verkoop- of Uitgevoerde (Tijdlijn) meldingen
    //    (Geen complexe 'Onder Toezicht' debug-meldingen waar niets gekocht hoeft te worden)
    return items.filter(item => {
      if (!selectedStrategyTypes.has(String(item.strategyType || '').toUpperCase())) return false;
      if (item.statusCategory === 'SUPERVISION') return false;
      if (!item.isMatched && !item.isSell && item.shares <= 0) return false;
      return ['BUY', 'SELL', 'MATCHED', 'EXPIRED'].includes(item.statusCategory);
    });
  }, [stockData, etfData, cryptoData, formatCurrency, isAdmin, hasSelectedStrategy, selectedStrategyTypes]);

  // Beschikbare strategienamen voor de filterknoppen
  const distinctStrategies = useMemo(() => {
    const map = new Map();
    unifiedNotifications.forEach(item => {
      if (!item.strategyName) return;
      if (!map.has(item.strategyName)) {
        map.set(item.strategyName, {
          name: item.strategyName,
          type: item.strategyType,
          isOld: item.isFromOldStrategy,
          count: 0
        });
      }
      map.get(item.strategyName).count += 1;
    });
    return Array.from(map.values());
  }, [unifiedNotifications]);

  // Aantallen per status voor de filterbalk & samenvatting
  const notifCounts = useMemo(() => {
    const base = strategyFilter === 'ALL'
      ? unifiedNotifications
      : unifiedNotifications.filter(i => i.strategyName === strategyFilter);

    return {
      all: base.length,
      actionRequired: base.filter(i => i.isActionRequired).length,
      buy: base.filter(i => i.statusCategory === 'BUY').length,
      sell: base.filter(i => i.statusCategory === 'SELL').length,
      matched: base.filter(i => i.statusCategory === 'MATCHED').length,
      supervision: base.filter(i => i.statusCategory === 'SUPERVISION').length,
      expired: base.filter(i => i.statusCategory === 'EXPIRED').length
    };
  }, [unifiedNotifications, strategyFilter]);

  // Gefilterde en gesorteerde meldingen
  const displayedNotifications = useMemo(() => {
    let list = [...unifiedNotifications];

    if (strategyFilter !== 'ALL') {
      list = list.filter(i => i.strategyName === strategyFilter);
    }

    if (statusFilter === 'ACTION_REQUIRED') {
      list = list.filter(i => i.isActionRequired);
    } else if (statusFilter !== 'ALL') {
      list = list.filter(i => i.statusCategory === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(i =>
        (i.ticker || '').toLowerCase().includes(q) ||
        (i.name || '').toLowerCase().includes(q) ||
        (i.strategyName || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const dir = notifSort.direction === 'asc' ? 1 : -1;
      if (notifSort.key === 'ticker') {
        return String(a.ticker || '').localeCompare(String(b.ticker || '')) * dir;
      }
      if (notifSort.key === 'strategyName') {
        return String(a.strategyName || '').localeCompare(String(b.strategyName || '')) * dir;
      }
      if (notifSort.key === 'amountEur') {
        return ((a.amountEur || 0) - (b.amountEur || 0)) * dir;
      }
      return ((a.timestamp || 0) - (b.timestamp || 0)) * dir;
    });

    return list;
  }, [unifiedNotifications, strategyFilter, statusFilter, searchQuery, notifSort]);

  const handleNotifSort = (key) => {
    setNotifSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  // ============================================================================
  // DONUTS & KOOPKANS-RADAR DATA ("Waar Zit een Koopkans Aan Te Komen?")
  // ============================================================================
  const holdings = useMemo(() => stockData?.holdings || [], [stockData]);
  const totalPortfolioValue = Number(stockData?.totalPortfolioValue || 0);
  const alignmentPercentage = Number(stockData?.alignmentPercentage || 0);
  const freeStocksCash = Math.max(0, Number(stockData?.cashAllocation?.stocksAvailableCash || 0));

  const advisorBrokerBreakdown = useMemo(() => {
    const map = new Map();
    holdings.forEach(h => {
      const list = Array.isArray(h.brokers) && h.brokers.length > 0
        ? h.brokers
        : [{ broker_name: h.primaryBroker || 'Onbekend', holdingValue: h.holdingValue || 0, quantity: h.quantity || 0 }];
      list.forEach(b => {
        const bName = String(b.broker_name || 'Onbekend').trim();
        if (!map.has(bName)) map.set(bName, { broker_name: bName, value: 0, count: 0 });
        const entry = map.get(bName);
        entry.value += Number(b.holdingValue || 0);
        entry.count += 1;
      });
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [holdings]);

  const currentChartData = useMemo(() => {
    if (!holdings.length) return null;
    const totalCap = Math.max(1, totalPortfolioValue + freeStocksCash);

    if (currentDonutGroupMode === 'brokers') {
      const labels = [];
      const values = [];
      const bgColors = [];

      advisorBrokerBreakdown.forEach((b, idx) => {
        const pct = (b.value / totalCap) * 100;
        const lower = b.broker_name.toLowerCase();
        const color = lower.includes('etoro') ? '#10b981' : lower.includes('degiro') ? '#2563eb' : PALETTE[idx % PALETTE.length];
        labels.push(`${b.broker_name} (${pct.toFixed(1)}%)`);
        values.push(Number(b.value.toFixed(2)));
        bgColors.push(color);
      });

      if (freeStocksCash > 1) {
        const cashPct = (freeStocksCash / totalCap) * 100;
        labels.push(`Vrije Cash (${cashPct.toFixed(1)}%)`);
        values.push(freeStocksCash);
        bgColors.push('#8B5CF6');
      }

      return {
        labels,
        datasets: [{
          data: values,
          backgroundColor: bgColors,
          borderColor: '#ffffff',
          borderWidth: 2,
          hoverOffset: 6
        }]
      };
    }

    const topHoldings = [...holdings].sort((a, b) => b.holdingValue - a.holdingValue);
    const mainItems = topHoldings.slice(0, 9);
    const otherItems = topHoldings.slice(9);
    const otherValue = otherItems.reduce((acc, h) => acc + h.holdingValue, 0);

    const labels = mainItems.map(h => `${h.ticker} (${((h.holdingValue / totalCap) * 100).toFixed(1)}%)`);
    const values = mainItems.map(h => h.holdingValue);
    const bgColors = PALETTE.slice(0, labels.length);

    if (otherValue > 0) {
      labels.push(`Overige (${((otherValue / totalCap) * 100).toFixed(1)}%)`);
      values.push(otherValue);
      bgColors.push('#64748B');
    }

    if (freeStocksCash > 1) {
      labels.push(`Vrije Cash (${((freeStocksCash / totalCap) * 100).toFixed(1)}%)`);
      values.push(freeStocksCash);
      bgColors.push('#8B5CF6');
    }

    return {
      labels,
      datasets: [{
        data: values,
        backgroundColor: bgColors,
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 6
      }]
    };
  }, [holdings, totalPortfolioValue, freeStocksCash, currentDonutGroupMode, advisorBrokerBreakdown]);

  const idealChartData = useMemo(() => {
    const ideal = stockData?.idealPortfolio || [];
    if (!ideal.length) return null;
    return {
      labels: ideal.map(i => `${i.ticker} (${i.targetWeightPct}%)`),
      datasets: [{
        data: ideal.map(i => i.targetValueEur),
        backgroundColor: PALETTE.slice(0, ideal.length),
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 6
      }]
    };
  }, [stockData]);

  const doughnutOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '66%',
    plugins: {
      legend: {
        position: 'right',
        labels: {
          boxWidth: 10,
          font: { size: 11, weight: '600' },
          color: '#374151',
          padding: 8
        }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const val = ctx.raw || 0;
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
            return ` ${formatCurrency(val)} (${pct}%)`;
          }
        }
      }
    }
  }), [formatCurrency]);

  // Gecombineerde Koopkans-Radar (5/5 Aandelen + Kern-ETF's samen)
  const combinedRadarItems = useMemo(() => {
    const stockStratName = stockData?.activeStrategyConfig?.name || 'Live Aandelen Strategie';
    const etfStratName = etfData?.activeStrategyConfig?.name || 'Arne ETF DCA (€450/mnd)';

    const stockRadar = (stockData?.idealPortfolio || []).map(item => ({
      ...item,
      itemType: 'STOCKS',
      strategyName: stockStratName
    }));

    const etfRadar = (etfData?.etfs || []).map(etf => {
      const isBuyNow = Boolean(etf.isBuyCrossoverNow);
      const isRed = !etf.isMacdBullish;
      const isTurning = Boolean(etf.wasRedAndTurningGreen || (isRed && etf.isTurningUpInRed));
      const dynamicRecoveryPct = etf.recoveryPct !== undefined
        ? Number(etf.recoveryPct)
        : (isBuyNow || etf.isMacdBullish ? 100 : 0);
      const radarStatus = isBuyNow ? 'BUY_NOW' : isTurning ? 'WATCH_TURNING_GREEN' : isRed ? 'WATCH_IN_RED' : 'WAIT_FOR_DIP';

      return {
        stockId: `etf-${etf.ticker}`,
        itemType: 'ETF',
        strategyName: etfStratName,
        ticker: etf.ticker,
        name: etf.name,
        score: 'ETF',
        currentPrice: etf.currentPrice,
        targetWeightPct: etf.targetWeightPct,
        targetValueEur: etf.availablePot || 0,
        targetShares: etf.sharesToBuyNow || 0,
        currentShares: etf.actualPortfolio?.quantity || etf.ownedShares || 0,
        currentWeightPct: etf.targetWeightPct,
        diffValueEur: etf.availablePot || 0,
        diffShares: etf.sharesToBuyNow || 0,
        sparkline: etf.sparkline || [],
        opportunityRadar: {
          status: radarStatus,
          priorityRank: isBuyNow ? 1 : isTurning ? 2 : 3,
          badge: etf.statusBadge || (isBuyNow ? '🟢 Koopkans Nu' : isTurning ? `🔥 MACD Draait (${dynamicRecoveryPct}%)` : '⏳ Pot Groeit Aan'),
          reason: `DCA Pot: ${formatCurrency(etf.availablePot || 0)} (${etf.targetWeightPct}% weging)`
        },
        macdStatus: {
          isGreenCrossover: isBuyNow,
          wasRedAndTurningGreen: isTurning,
          isRed,
          daysInRed: etf.daysInRed || 0,
          recoveryPct: dynamicRecoveryPct,
          badge: isBuyNow
            ? '🟢 Net Groen Gekruist!'
            : isTurning
            ? `🔥 Rood ➔ Draait Groen (${dynamicRecoveryPct}%)`
            : isRed
            ? `🔴 MACD Rood (${etf.daysInRed || 0}d • ${dynamicRecoveryPct}%)`
            : '🔵 MACD Groen (Bullish)',
          detail: `MACD: ${Number(etf.macd ?? etf.macdLine ?? 0).toFixed(2)} / Signaal: ${Number(etf.signal ?? etf.signalLine ?? 0).toFixed(2)}`,
          historySeries: etf.sparkline || []
        },
        valuationStatus: {
          isUndervaluedEnough: true,
          isDeeplyUndervalued: true,
          badge: '🌐 Index DCA (100%)'
        },
        tomorrowOrder: {
          canBuyTomorrow: (etf.sharesToBuyNow || 0) > 0,
          fundingStatus: 'DIRECT_CASH',
          shares: etf.sharesToBuyNow || 0,
          badge: (etf.sharesToBuyNow || 0) > 0
            ? `Koop ${etf.sharesToBuyNow} st. (${formatCurrency(etf.actualInvestNow)})`
            : `Pot groeit (${formatCurrency(etf.availablePot || 0)})`,
          detail: `Opgebouwde ETF-pot: ${formatCurrency(etf.availablePot || 0)}`
        }
      };
    });

    const cryptoStratName = cryptoData?.activeStrategyConfig?.name || 'Arne Crypto MACD 2.0 (Min. €50)';
    const cryptoPot = Number(cryptoData?.activeStrategyConfig?.availableCryptoCash || 450);
    const cryptoRadar = (cryptoData?.coins || []).map(coin => {
      const isBuyNow = Boolean(coin.isBuyCrossoverNow);
      const isTurning = Boolean(coin.isUnderZero && coin.isTurningUpInRed);
      const radarStatus = isBuyNow
        ? 'BUY_NOW'
        : isTurning
        ? 'WATCH_TURNING_GREEN'
        : coin.isUnderZero
        ? 'WATCH_IN_RED'
        : 'WAIT_FOR_DIP';

      return {
        stockId: `crypto-${coin.ticker}`,
        itemType: 'CRYPTO',
        strategyName: cryptoStratName,
        ticker: coin.ticker,
        name: coin.name,
        score: coin.isPrimaryBuy ? 'BTC' : 'CRYPTO',
        currentPrice: coin.currentPrice,
        targetWeightPct: coin.isPrimaryBuy ? 100 : 0,
        targetValueEur: coin.isPrimaryBuy ? cryptoPot : coin.ownedValueEur,
        targetShares: coin.liveBuyShares || 0,
        currentShares: coin.ownedShares || 0,
        currentWeightPct: coin.isPrimaryBuy ? 100 : 0,
        diffValueEur: coin.liveBuyOrderEur || 0,
        diffShares: coin.liveBuyShares || 0,
        opportunityRadar: {
          status: radarStatus,
          priorityRank: isBuyNow ? 1 : isTurning ? 2 : 3,
          badge: isBuyNow
            ? (coin.isPrimaryBuy ? '🟢 Koopkans Nu!' : 'ℹ️ Koopsignaal')
            : isTurning
            ? '🔥 MACD Draait Groen'
            : coin.isUnderZero
            ? '🔴 MACD Onder 0'
            : `📈 Bullish (Sell bij cross: ${coin.liveSellPct}%)`,
          reason: coin.isPrimaryBuy
            ? `Koopfactor: ${coin.liveBuyMultiplier}x • Verkoop-% bij top: ${coin.liveSellPct}%`
            : `Alleen signalen & verkoop (${coin.liveSellPct}% bij crossunder)`
        },
        macdStatus: {
          isGreenCrossover: isBuyNow,
          wasRedAndTurningGreen: isTurning,
          isRed: !coin.isMacdBullish,
          recoveryPct: coin.recoveryPct || 0,
          badge: coin.isMacdBullish ? '🟢 MACD > Signaal' : isTurning ? '🔄 Draait omhoog' : '🔴 MACD < Signaal',
          detail: `MACD: ${coin.macdLine} / Signaal: ${coin.signalLine} (Hist: ${coin.histogram})`,
          historySeries: coin.historySeries || []
        },
        valuationStatus: {
          isUndervaluedEnough: true,
          isDeeplyUndervalued: coin.isUnderZero,
          badge: `🪙 Factor ${coin.liveBuyMultiplier}x (Sell: ${coin.liveSellPct}%)`
        },
        tomorrowOrder: {
          canBuyTomorrow: coin.isPrimaryBuy && coin.liveBuyOrderEur >= 50,
          fundingStatus: 'DIRECT_CASH',
          shares: coin.liveBuyShares,
          badge: coin.isPrimaryBuy
            ? `Koop ${formatCurrency(coin.liveBuyOrderEur)} (${coin.liveBuyShares} BTC)`
            : `Enkel BTC kopen (Signaal = ${formatCurrency(coin.liveBuyOrderEur)})`,
          detail: `Vrije Coinbase cash: ${formatCurrency(cryptoPot)} (Min. €50)`
        }
      };
    });

    return [...stockRadar, ...etfRadar, ...cryptoRadar];
  }, [stockData, etfData, cryptoData, formatCurrency]);

  const filteredRadarItems = useMemo(() => {
    return combinedRadarItems
      .filter(item => {
        if (idealTableFilter === 'ETF_ONLY') return item.itemType === 'ETF';
        if (idealTableFilter === 'CRYPTO_ONLY') return item.itemType === 'CRYPTO';
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
          return item.itemType === 'STOCKS' && (item.wvTrendStatus ? item.wvTrendStatus.isRising : (!item.isWvDropping && item.wvDiff > 0));
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
      });
  }, [combinedRadarItems, idealTableFilter, idealTableSort]);

  // ============================================================================
  // MATRIX DATA (Huidige Posities)
  // ============================================================================
  const filteredMatrixHoldings = useMemo(() => {
    return holdings.filter(h => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (!h.ticker.toLowerCase().includes(q) && !(h.name || '').toLowerCase().includes(q)) return false;
      }
      if (matrixFilter === 'ALL') return true;
      if (matrixFilter === 'BUY_MORE') return h.actionType === 'BUY_MORE';
      if (matrixFilter === 'HOLD') return h.actionType === 'HOLD' || h.actionType === 'ETF_INDEX';
      if (matrixFilter === 'TRIM') return String(h.actionType || '').startsWith('TRIM') || h.actionType === 'TAKE_PROFIT';
      if (matrixFilter === 'ETF') return h.actionType === 'ETF_INDEX' || h.assetType === 'ETF';
      return true;
    });
  }, [holdings, searchQuery, matrixFilter]);

  // ============================================================================
  // HELPER: Sorteerbare Tabel Header (identiek aan Common Tab!)
  // ============================================================================
  const renderSortHeader = (key, label, align = 'left') => {
    const isSorted = notifSort.key === key;
    const isAsc = notifSort.direction === 'asc';
    return (
      <th
        onClick={() => handleNotifSort(key)}
        className={`px-4 py-3 text-xs uppercase tracking-wider cursor-pointer transition-colors select-none ${
          align === 'right' ? 'text-right' : 'text-left'
        } ${
          isSorted
            ? 'font-black text-blue-600 bg-blue-50/90 border-b-2 border-blue-600'
            : 'font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-100/60'
        }`}
      >
        <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
          <span>{label}</span>
          {isSorted ? (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-blue-600 text-white text-[10px] font-black shadow-2xs">
              {isAsc ? '▲' : '▼'}
            </span>
          ) : (
            <span className="text-gray-300 opacity-40 text-[10px]">↕</span>
          )}
        </div>
      </th>
    );
  };

  if (loading && !stockData && !etfData) {
    return (
      <div className="bg-white rounded-2xl p-10 border border-gray-200 shadow-2xs flex flex-col items-center justify-center text-center space-y-3">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-gray-800 font-bold text-sm">Strategie Assistent Laden...</div>
      </div>
    );
  }

  // Als er geen actieve strategie is geselecteerd, blijft dit tabblad leeg (met directe link om een strategie te kiezen)
  if (!hasSelectedStrategy) {
    return (
      <div className="bg-white rounded-2xl p-12 border border-gray-200 shadow-2xs flex flex-col items-center justify-center text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center text-2xl">
          🔔
        </div>
        <h3 className="text-base font-black text-gray-800">Geen actieve strategie geselecteerd</h3>
        <p className="text-xs text-gray-500 max-w-md">
          Er is momenteel geen strategie gekoppeld aan je account. Selecteer een strategie in de Strategie Bibliotheek of stel je actieve strategieën &amp; prioriteit in om koop- en verkoopmeldingen te ontvangen.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Link
            to="/analysis?tab=strategies"
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-xs transition-all flex items-center gap-1.5"
          >
            <i className="ph-bold ph-compass text-sm"></i>
            <span>Zoek &amp; Selecteer Strategie (Analyse)</span>
          </Link>
          <Link
            to="/strategy-builder"
            state={{ tab: 'active' }}
            className="px-4 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-extrabold transition-all flex items-center gap-1.5"
          >
            <i className="ph-fill ph-target text-sm text-purple-600"></i>
            <span>Mijn Actieve Strategieën &amp; Prioriteit</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 🧭 TOP BALK (Voor beheerder: alle weergaven + builder link; Voor externe gebruikers: compact & rustig enkel meldingen) */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-gray-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {isAdmin ? (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="hidden sm:flex text-xs font-bold text-gray-400 uppercase tracking-wider mr-1 items-center gap-1">
                <i className="ph-bold ph-sparkle text-sm text-gray-500"></i>
                <span>Weergave:</span>
              </span>

              {[
                {
                  id: 'notifications',
                  label: 'Meldingen & Tijdlijn',
                  icon: '🔔',
                  badge: notifCounts.actionRequired > 0 ? `${notifCounts.actionRequired} actie` : unifiedNotifications.length
                },
                {
                  id: 'donuts',
                  label: 'Donuts & Koopkans-Radar',
                  icon: '🍩',
                  badge: combinedRadarItems.filter(i => ['BUY_NOW', 'WATCH_TURNING_GREEN'].includes(i.opportunityRadar?.status)).length || null
                },
                {
                  id: 'matrix',
                  label: 'Posities Matrix',
                  icon: '📋',
                  badge: holdings.length
                }
              ].map(tab => {
                const isActive = activeSection === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveSection(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shrink-0 ${
                      isActive
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-black'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                    {tab.badge !== null && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                        isActive
                          ? 'bg-blue-500 text-white'
                          : tab.id === 'notifications' && notifCounts.actionRequired > 0
                          ? 'bg-amber-500 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-base">🔔</span>
              <div>
                <h2 className="text-sm sm:text-base font-black text-gray-900 leading-tight">
                  Koop- &amp; Verkoopmeldingen
                </h2>
                <p className="text-xs text-gray-500">
                  Overzicht en tijdlijn van wanneer er gekocht of (deels) verkocht moet worden volgens je strategie.
                </p>
              </div>
            </div>
          )}

          {/* Rechts: Actieve Strategie Badges + (Alleen voor Beheerder) Link naar Strategie Builder */}
          <div className="flex items-center justify-between lg:justify-end gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeStrategiesList.map((strat, idx) => {
                const sType = (strat.strategy_type || '').toUpperCase();
                const isEtf = sType === 'ETF';
                const isCrypto = sType === 'CRYPTO';
                const badgeClass = `px-2.5 py-1 rounded-xl text-[11px] font-extrabold border flex items-center gap-1 ${
                  isCrypto
                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                    : isEtf
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-indigo-50 text-indigo-900 border-indigo-200'
                }`;
                return isAdmin ? (
                  <Link
                    key={strat.entry_id || idx}
                    to="/strategy-builder"
                    state={{ tab: 'active' }}
                    title="Klik om deze strategie te bekijken in de Strategie Builder"
                    className={`${badgeClass} transition-all hover:opacity-90`}
                  >
                    <span>{isCrypto ? '🪙' : isEtf ? '📈' : '💎'}</span>
                    <span className="truncate max-w-[155px]">{strat.name}</span>
                  </Link>
                ) : (
                  <span key={strat.entry_id || idx} className={badgeClass}>
                    <span>{isCrypto ? '🪙' : isEtf ? '📈' : '💎'}</span>
                    <span className="truncate max-w-[175px]">{strat.name}</span>
                  </span>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5">
              <Link
                to="/strategy-builder"
                state={{ tab: isAdmin ? 'builder' : 'active' }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-2xs flex items-center gap-1.5 shrink-0"
                title={isAdmin ? 'Bekijk en beheer je strategieën in de Strategie Builder' : 'Beheer je actieve strategieën, kapitaalverdeling en prioriteit'}
              >
                <i className={`ph-bold ${isAdmin ? 'ph-sliders-horizontal' : 'ph-target'} text-sm`}></i>
                <span>{isAdmin ? 'Strategie Builder' : 'Actieve Strategieën & Prioriteit'}</span>
              </Link>

              <button
                type="button"
                onClick={handleTriggerUpdate}
                disabled={isUpdating}
                className="p-1.5 px-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-all flex items-center gap-1 shrink-0 disabled:opacity-50"
                title="Ververs koersen & strategie-signalen"
              >
                <i className={`ph-bold ph-arrows-clockwise text-sm ${isUpdating ? 'animate-spin' : ''}`}></i>
                <span className="hidden sm:inline">{isUpdating ? 'Bezig...' : 'Ververs'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Rij 2: Duidelijk Euro-Bedrag & Kapitaal-Overzicht per Actieve Strategie (Waterval #1 ➔ #2 ➔ #3) */}
        {strategyCapitalCards.length > 0 && (
          <div className="pt-3 border-t border-gray-100 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <i className="ph-fill ph-coins text-amber-500 text-sm"></i>
                <span>Kapitaal &amp; Beschikbaar Bedrag per Strategie (100% Verdeeld op Prioriteit):</span>
              </span>
              {strategyFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setStrategyFilter('ALL')}
                  className="text-[11px] font-extrabold text-blue-600 hover:underline"
                >
                  Toon alle strategieën ({unifiedNotifications.length}) ✕
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {strategyCapitalCards.map((card) => {
                const isSelected = strategyFilter === card.name;
                const isEtf = card.type === 'ETF';
                const isCrypto = card.type === 'CRYPTO';
                return (
                  <div
                    key={card.key}
                    onClick={() => setStrategyFilter(isSelected ? 'ALL' : card.name)}
                    title="Klik om meldingen te filteren op deze strategie"
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                      isSelected
                        ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/15 shadow-2xs'
                        : isCrypto
                        ? 'bg-amber-50/40 hover:bg-amber-50/80 border-amber-200/90'
                        : isEtf
                        ? 'bg-emerald-50/40 hover:bg-emerald-50/80 border-emerald-200/90'
                        : 'bg-indigo-50/40 hover:bg-indigo-50/80 border-indigo-200/90'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black shrink-0 ${
                          card.prio === 1 ? 'bg-amber-400 text-amber-950' : 'bg-slate-800 text-white'
                        }`}>
                          #{card.prio}
                        </span>
                        <span className="text-sm shrink-0">{card.icon}</span>
                        <span className="font-black text-xs text-gray-900 truncate" title={card.name}>
                          {card.name}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-white/90 border border-black/10 text-[10px] font-extrabold text-gray-700 shrink-0">
                        {card.modeLabel}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1.5 border-t border-black/5 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-gray-500 block">{card.directBuyLabel}</span>
                        <span className="font-black text-emerald-700 text-xs sm:text-sm privacy-blur">
                          {isIncognito ? '€ •••' : formatCurrency(card.directBuyEur)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-500 block">Reeds Belegd</span>
                        <span className="font-black text-gray-900 text-xs sm:text-sm privacy-blur">
                          {isIncognito ? '€ •••' : formatCurrency(card.investedEur)}
                        </span>
                      </div>
                      {card.extraEur > 0 ? (
                        <div>
                          <span className="text-[10px] font-bold text-gray-500 block">{card.extraLabel}</span>
                          <span className="font-black text-indigo-700 text-xs sm:text-sm privacy-blur">
                            {isIncognito ? '€ •••' : formatCurrency(card.extraEur)}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-[10px] font-bold text-gray-500 block">Totaal Strategie</span>
                          <span className="font-black text-indigo-700 text-xs sm:text-sm privacy-blur">
                            {isIncognito ? '€ •••' : formatCurrency(card.directBuyEur + card.investedEur)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rij 3: Filters per Strategie (indien er ook historische/oude strategie-meldingen zijn) */}
        {activeSection === 'notifications' && distinctStrategies.length > 1 && (
          <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1 shrink-0">
                Strategie:
              </span>
              <button
                type="button"
                onClick={() => setStrategyFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all shrink-0 border ${
                  strategyFilter === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                }`}
              >
                Alle Strategieën ({unifiedNotifications.length})
              </button>
              {distinctStrategies.map(s => {
                const isSelected = strategyFilter === s.name;
                const isEtf = s.type === 'ETF';
                const isCrypto = s.type === 'CRYPTO';
                return (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setStrategyFilter(isSelected ? 'ALL' : s.name)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all shrink-0 border flex items-center gap-1 ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                        : s.isOld
                        ? 'bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-200'
                        : isCrypto
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                        : isEtf
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-200'
                    }`}
                  >
                    <span>{s.isOld ? '🕰️' : isCrypto ? '🪙' : isEtf ? '📈' : '💎'}</span>
                    <span className="truncate max-w-[180px]">{s.name}</span>
                    <span className={`text-[10px] px-1 rounded ${isSelected ? 'bg-white/20 text-white' : 'bg-black/5'}`}>
                      {s.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ==========================================================================
          SECTIE 1: GECOMBINEERDE MELDINGEN & TIJDLIJN (Desktop Tabel + GSM Lijst)
         ========================================================================== */}
      {activeSection === 'notifications' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header van Meldingen Sectie (Identiek aan Holdings Sectie op Common Tab!) */}
          <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col gap-3.5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-gray-900">
                  Strategie Meldingen
                </h3>
                <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">
                  {displayedNotifications.length} Meldingen
                </span>
              </div>

              {/* Compacte Cijfer-Samenvatting (Zoals Belegd | Cash | Totaal op Common) */}
              <div className="flex items-center gap-3 sm:gap-5 bg-slate-50 px-3.5 py-2 rounded-xl border border-gray-200/80 shrink-0 self-start md:self-auto overflow-x-auto max-w-full">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Actie Vereist</span>
                  <span className={`text-xs sm:text-sm font-black block leading-tight ${notifCounts.actionRequired > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                    {notifCounts.actionRequired} open
                  </span>
                </div>
                <div className="h-6 w-px bg-gray-200"></div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Koop / Verkoop</span>
                  <span className="text-xs sm:text-sm font-black text-emerald-600 block leading-tight">
                    {notifCounts.buy} koop <span className="text-gray-300">•</span> <span className="text-rose-600">{notifCounts.sell} verk.</span>
                  </span>
                </div>
                <div className="h-6 w-px bg-gray-200"></div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Gekoppeld</span>
                  <span className="text-xs sm:text-sm font-black text-indigo-600 block leading-tight">
                    {notifCounts.matched} orders
                  </span>
                </div>
                <div className="h-6 w-px bg-gray-200"></div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Vrije Aandelen Cash</span>
                  <span className="text-xs sm:text-sm font-black text-purple-600 privacy-blur block leading-tight">
                    {isIncognito ? '€ •••' : formatCurrency(freeStocksCash)}
                  </span>
                </div>
                {cryptoData?.activeStrategyConfig && (
                  <>
                    <div className="h-6 w-px bg-gray-200"></div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Coinbase Cash</span>
                      <span className="text-xs sm:text-sm font-black text-amber-600 privacy-blur block leading-tight">
                        {isIncognito ? '€ •••' : formatCurrency(cryptoData.activeStrategyConfig.availableCryptoCash)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Zoekveld */}
              <div className="relative self-stretch md:self-auto">
                <i className="ph-bold ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                <input
                  type="text"
                  placeholder="Zoek ticker of strategie..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full md:w-48 pl-8 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Status Filter Knoppen (Voor externe gebruikers zonder 'Onder Toezicht') */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'ALL', label: `Alles (${notifCounts.all})` },
                { id: 'ACTION_REQUIRED', label: `⚡ Actie Vereist (${notifCounts.actionRequired})`, highlight: notifCounts.actionRequired > 0 },
                { id: 'BUY', label: `🟢 Koopkansen (${notifCounts.buy})` },
                { id: 'SELL', label: `🔴 Verkoop (${notifCounts.sell})` },
                { id: 'MATCHED', label: `✅ Gekoppeld (${notifCounts.matched})` },
                ...(isAdmin ? [{ id: 'SUPERVISION', label: `⚠️ Toezicht / Op Doel (${notifCounts.supervision})` }] : []),
                { id: 'EXPIRED', label: `⚪ Verlopen (${notifCounts.expired})` }
              ].map(f => {
                const isActive = statusFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap shrink-0 border ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                        : f.highlight
                        ? 'bg-amber-100 text-amber-950 border-amber-300 hover:bg-amber-200'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 🖥️ DESKTOP TABEL WEERGAVE (Compact & Overzichtelijk zoals de Holdings Tabel) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {renderSortHeader('date', 'Datum', 'left')}
                  {renderSortHeader('ticker', 'Ticker', 'left')}
                  {renderSortHeader('strategyName', 'Strategie', 'left')}
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Signaal &amp; Status</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Signaal / Koers</th>
                  {renderSortHeader('amountEur', 'Advies / Order', 'right')}
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedNotifications.map((item) => {
                  const isEtf = item.strategyType === 'ETF';
                  const rowHighlight = item.isActionRequired
                    ? item.isSell
                      ? 'bg-rose-50/30 hover:bg-rose-50/70'
                      : 'bg-emerald-50/30 hover:bg-emerald-50/70'
                    : 'hover:bg-blue-50/40';

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedNotificationModal(item)}
                      className={`transition-colors cursor-pointer ${rowHighlight}`}
                    >
                      {/* 1. Datum */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-bold text-xs text-gray-900 block">
                          {new Date(item.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        {item.executionDate && (
                          <span className="text-[10px] font-bold text-emerald-700 block">
                            Gekocht: {new Date(item.executionDate).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' })}
                          </span>
                        )}
                      </td>

                      {/* 2. Ticker & Naam */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg font-black text-xs uppercase flex items-center justify-center border shrink-0 ${
                            isEtf
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-800 border-gray-200'
                          }`}>
                            {item.ticker ? item.ticker.substring(0, 2) : '•'}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-sm text-gray-900">{item.ticker}</span>
                              {item.isActionRequired && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500 text-white">
                                  ACTIE
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400 block truncate max-w-[160px]" title={item.name}>
                              {item.name}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 3. Strategie Badge (Overduidelijk bij welke strategie de melding hoort!) */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold border ${
                          item.isFromOldStrategy
                            ? 'bg-purple-50 text-purple-900 border-purple-200'
                            : item.strategyType === 'CRYPTO'
                            ? 'bg-amber-50 text-amber-900 border-amber-200'
                            : isEtf
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                            : 'bg-indigo-50 text-indigo-900 border-indigo-200'
                        }`}>
                          <span>{item.isFromOldStrategy ? '🕰️' : item.strategyType === 'CRYPTO' ? '🪙' : isEtf ? '📈' : '💎'}</span>
                          <span className="truncate max-w-[190px]">{item.strategyName}</span>
                        </span>
                      </td>

                      {/* 4. Signaal & Status */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-0.5">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${
                            item.badgeTone === 'emerald'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : item.badgeTone === 'rose'
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : item.badgeTone === 'amber'
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : item.badgeTone === 'indigo'
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                              : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}>
                            {item.shortBadge}
                          </span>
                          {item.summaryReason && (
                            <span className="text-[11px] text-gray-500 truncate max-w-[260px]" title={item.summaryReason}>
                              {item.summaryReason}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. Koers & Vergelijking */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="text-xs font-bold text-gray-900 block">
                          Signaal: {formatCurrency(item.signalPrice || item.currentPrice)}
                        </span>
                        {item.isMatched && item.actualPrice > 0 ? (
                          <span className={`text-[11px] font-extrabold block ${item.isCheaper ? 'text-emerald-600' : 'text-amber-600'}`}>
                            Gekocht: {formatCurrency(item.actualPrice)} ({item.priceDiffPct > 0 ? '+' : ''}{item.priceDiffPct.toFixed(1)}%)
                          </span>
                        ) : item.currentPrice > 0 ? (
                          <span className="text-[11px] text-gray-400 font-medium block">
                            Nu: {formatCurrency(item.currentPrice)}
                          </span>
                        ) : null}
                      </td>

                      {/* 6. Advies / Orderbedrag */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {item.shares > 0 ? (
                          <div>
                            <span className={`text-sm font-black block privacy-blur ${
                              item.isSell ? 'text-rose-600' : item.isActionRequired ? 'text-emerald-700' : 'text-gray-900'
                            }`}>
                              {isIncognito ? '€ ••••••' : formatCurrency(item.amountEur)}
                            </span>
                            <span className="text-xs font-bold text-gray-500 block">
                              {item.isSell ? 'Verkoop' : 'Koop'} {Number(item.shares).toLocaleString('nl-BE', { maximumFractionDigits: 2 })} st.
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-gray-400">Geen order</span>
                        )}
                      </td>

                      {/* 7. Details Knop */}
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedNotificationModal(item);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-blue-50 text-gray-600 hover:text-blue-600 text-xs font-bold transition-colors"
                        >
                          Details ➔
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {displayedNotifications.length === 0 && (
                  <tr>
                    <td colSpan="7" className="px-6 py-10 text-center text-sm text-gray-400 font-medium">
                      Geen meldingen gevonden voor deze filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 📱 MOBIELE COMPACTE MELDINGEN LIJST (Zoals de Holdings Tabel op GSM: tik om open te klikken!) */}
          <div className="block md:hidden divide-y divide-gray-100">
            <div className="p-3 bg-gray-50/80 flex items-center justify-between text-xs font-bold text-gray-500 border-b border-gray-100">
              <span>Meldingen ({displayedNotifications.length})</span>
              <span className="text-[11px] text-gray-400 font-semibold">Tik op melding voor details</span>
            </div>

            {displayedNotifications.length > 0 ? (
              displayedNotifications.map((item) => {
                const isEtf = item.strategyType === 'ETF';
                const eventDate = new Date(item.date);

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedNotificationModal(item)}
                    className={`p-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center justify-between cursor-pointer gap-2.5 ${
                      item.isActionRequired ? 'bg-emerald-50/25' : ''
                    }`}
                  >
                    {/* Links: Datum badge + Ticker + Strategie + Status */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center font-bold text-center shrink-0 border ${
                        item.badgeTone === 'emerald'
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                          : item.badgeTone === 'rose'
                          ? 'bg-rose-50 text-rose-900 border-rose-200'
                          : item.badgeTone === 'amber'
                          ? 'bg-amber-50 text-amber-900 border-amber-200'
                          : 'bg-slate-100 text-slate-700 border-gray-200'
                      }`}>
                        <span className="text-[8px] uppercase leading-none">
                          {eventDate.toLocaleDateString('nl-BE', { month: 'short' })}
                        </span>
                        <span className="text-xs font-black leading-tight">
                          {eventDate.getDate()}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-sm text-gray-900 tracking-tight">
                            {item.ticker}
                          </span>
                          <span className={`text-[10px] font-black px-1.5 py-0.2 rounded border ${
                            item.badgeTone === 'emerald'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : item.badgeTone === 'rose'
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : item.badgeTone === 'amber'
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                          }`}>
                            {item.shortBadge}
                          </span>
                        </div>

                        {/* Duidelijke Strategie Badge op mobiel */}
                        <div className="mt-0.5 flex items-center gap-1">
                          <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded truncate max-w-[195px] ${
                            item.isFromOldStrategy
                              ? 'bg-purple-50 text-purple-800'
                              : item.strategyType === 'CRYPTO'
                              ? 'bg-amber-50 text-amber-900'
                              : isEtf
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-indigo-50 text-indigo-800'
                          }`}>
                            {item.isFromOldStrategy ? '🕰️ ' : item.strategyType === 'CRYPTO' ? '🪙 ' : isEtf ? '📈 ' : '💎 '}
                            {item.strategyName}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Rechts: Bedrag, Stuks & Pijltje */}
                    <div className="flex items-center gap-1.5 shrink-0 text-right">
                      <div>
                        {item.shares > 0 ? (
                          <>
                            <span className={`font-black text-sm block privacy-blur ${
                              item.isSell ? 'text-rose-600' : 'text-gray-900'
                            }`}>
                              {isIncognito ? '€ •••' : formatCurrency(item.amountEur)}
                            </span>
                            <span className="text-[11px] font-bold text-gray-500 block">
                              {Number(item.shares).toLocaleString('nl-BE', { maximumFractionDigits: 2 })} st.
                            </span>
                          </>
                        ) : (
                          <span className="text-xs font-bold text-gray-400">
                            {formatCurrency(item.signalPrice)}
                          </span>
                        )}
                      </div>
                      <i className="ph-bold ph-caret-right text-gray-400 text-xs"></i>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-xs font-bold text-gray-400">
                Geen meldingen gevonden voor deze filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==========================================================================
          SECTIE 2: DONUTS & "WAAR ZIT EEN KOOPKANS AAN TE KOMEN?" (Koopkans-Radar)
         ========================================================================== */}
      {activeSection === 'donuts' && (
        <div className="space-y-5">
          {/* 1. DONUT KAARTEN (In de stijl van Common Tab!) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Linker Donut: Huidige Portefeuille */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-between h-[360px]">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-gray-900">
                    Huidige Portefeuille (incl. Vrije Cash)
                  </h3>
                  <p className="text-xs text-gray-400">
                    {holdings.length} posities + {isIncognito ? '€ •••' : formatCurrency(freeStocksCash)} vrije cash
                  </p>
                </div>
                <div className="flex items-center bg-gray-100 p-0.5 rounded-xl text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setCurrentDonutGroupMode('holdings')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      currentDonutGroupMode === 'holdings' ? 'bg-white text-gray-900 shadow-2xs font-black' : 'text-gray-600'
                    }`}
                  >
                    💎 Aandeel
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentDonutGroupMode('brokers')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      currentDonutGroupMode === 'brokers' ? 'bg-white text-gray-900 shadow-2xs font-black' : 'text-gray-600'
                    }`}
                  >
                    🏦 Broker
                  </button>
                </div>
              </div>

              <div className="flex-grow relative min-h-0 flex items-center justify-center my-2">
                {currentChartData ? (
                  <div className="w-full h-full relative">
                    <Doughnut data={currentChartData} options={doughnutOptions} />
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Geen posities beschikbaar.</div>
                )}
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                <span>Alignment met 5/5 Strategie:</span>
                <span className="font-black text-indigo-700">{alignmentPercentage.toFixed(1)}%</span>
              </div>
            </div>

            {/* Rechter Donut: Ideale Doelportefeuille */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-between h-[360px]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-gray-900">
                    Ideale Doelverdeling (Gewogen naar WV)
                  </h3>
                  <p className="text-xs text-gray-400">
                    Proportionele verdeling over 5/5 kwaliteitsaandelen
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                  100% Score 5/5
                </span>
              </div>

              <div className="flex-grow relative min-h-0 flex items-center justify-center my-2">
                {idealChartData ? (
                  <div className="w-full h-full relative">
                    <Doughnut data={idealChartData} options={doughnutOptions} />
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Geen doelverdeling beschikbaar.</div>
                )}
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                <span>Totale Kapitaalbasis (Aandelen + Vrije Cash):</span>
                <span className="font-black text-emerald-700 privacy-blur">
                  {isIncognito ? '€ ••••••' : formatCurrency(stockData?.totalDeployableStocksCapital || (totalPortfolioValue + freeStocksCash))}
                </span>
              </div>
            </div>
          </div>

          {/* 1B. INTERACTIEVE KOOP/VERKOOPMOMENT GESCHIEDENIS GRAFIEK (60 Handelsdagen MACD & Signaallijn Verloop) */}
          {filteredRadarItems.length > 0 && (() => {
            const activeProgItem =
              filteredRadarItems.find(i => i.ticker === selectedProgressionTicker) ||
              filteredRadarItems.find(i => (i.macdStatus?.historySeries || []).length >= 5) ||
              filteredRadarItems[0];
            return (
              <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-200 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                      <span>📈 Koop/Verkoopmoment Geschiedenis &amp; MACD Verloop</span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                        Laatste 60 Handelsdagen
                      </span>
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Volg visueel hoe de MACD-lijn (blauw) en Signaallijn (oranje) naar elkaar toegroeien en wanneer een kruising écht bijna plaatsvindt.
                    </p>
                  </div>

                  {/* Snelkeuze dropdown + pills voor de top koopkansen */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-gray-400 uppercase">Kies Asset:</span>
                    <select
                      value={activeProgItem?.ticker || ''}
                      onChange={(e) => setSelectedProgressionTicker(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-black border border-slate-900 focus:outline-none cursor-pointer"
                    >
                      {filteredRadarItems.map(rItem => (
                        <option key={rItem.stockId} value={rItem.ticker}>
                          {rItem.ticker} — {rItem.opportunityRadar?.badge || ''} ({rItem.macdStatus?.recoveryPct ?? 0}% MACD)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Snel-knoppen voor de meest interessante bijna-koopkansen */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {filteredRadarItems.slice(0, 12).map(rItem => {
                    const isSel = activeProgItem?.ticker === rItem.ticker;
                    const rStatus = rItem.opportunityRadar?.status;
                    return (
                      <button
                        key={rItem.stockId}
                        type="button"
                        onClick={() => setSelectedProgressionTicker(rItem.ticker)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-extrabold transition-all shrink-0 border flex items-center gap-1.5 ${
                          isSel
                            ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                            : rStatus === 'BUY_NOW'
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
                            : rStatus === 'WATCH_TURNING_GREEN'
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                        }`}
                      >
                        <span>{rItem.ticker}</span>
                        <span className={`text-[10px] px-1 rounded ${isSel ? 'bg-white/20 text-white' : 'bg-black/5'}`}>
                          {rItem.macdStatus?.recoveryPct ?? 0}%
                        </span>
                      </button>
                    );
                  })}
                </div>

                {activeProgItem && (
                  <MacdProgressionChart item={activeProgItem} formatCurrency={formatCurrency} />
                )}
              </div>
            );
          })()}

          {/* 2. "WAAR ZIT EEN KOOPKANS AAN TE KOMEN?" (Koopkans-Radar: Desktop Tabel + Mobiele Kliklijst) */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-gray-100 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                    <span>🎯 Waar Zit een Koopkans Aan Te Komen?</span>
                    <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                      {filteredRadarItems.length} Assets
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    3-Pijler Koopkans-Radar voor je actieve strategieën: MACD draait naar groen, Onderwaardering (≤ 1,3x) en Stijgende Waardeverdeling.
                  </p>
                </div>

                {/* Sortering Toggle */}
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs font-bold self-start md:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => setIdealTableSort('RADAR')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      idealTableSort === 'RADAR' ? 'bg-white text-emerald-800 shadow-2xs font-black' : 'text-gray-600'
                    }`}
                  >
                    🎯 Op Koopkans
                  </button>
                  <button
                    type="button"
                    onClick={() => setIdealTableSort('WEIGHT')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      idealTableSort === 'WEIGHT' ? 'bg-white text-indigo-800 shadow-2xs font-black' : 'text-gray-600'
                    }`}
                  >
                    📊 Op Doelgewicht (%)
                  </button>
                </div>
              </div>

              {/* Snel-filters voor de Koopkans-Radar */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  { id: 'ALL', label: `Alles (${combinedRadarItems.length})` },
                  { id: 'WATCH_OR_BUY', label: '🔥 Koopkans op Komst' },
                  { id: 'MACD_RED_TURNING', label: '🔄 MACD: Rood ➔ Groen' },
                  { id: 'UNDERVALUED', label: '🟢 Ondergewaardeerd ≤ 1.3x' },
                  { id: 'RISING_WV', label: '📈 Stijgende WV' },
                  { id: 'ETF_ONLY', label: "📈 Kern-ETF's" },
                  { id: 'CRYPTO_ONLY', label: '🪙 Crypto (BTC/ETH/SOL)' }
                ].map(f => {
                  const isActive = idealTableFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setIdealTableFilter(f.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap shrink-0 border ${
                        isActive
                          ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 🖥️ DESKTOP RADAR TABEL */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-gray-50/70 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="py-3 px-4">Ticker &amp; Strategie</th>
                    <th className="py-3 px-3">🎯 Koopkans-Radar</th>
                    <th className="py-3 px-3">1. MACD Status</th>
                    <th className="py-3 px-3">2. Waardering</th>
                    <th className="py-3 px-3 text-center">3. WV Trend (8 Kw.)</th>
                    <th className="py-3 px-3 text-right">Doel / Huidig</th>
                    <th className="py-3 px-4 text-left bg-emerald-50/50 text-emerald-950">⚡ Order bij Signaal Morgen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRadarItems.map((item) => {
                    const radarStatus = item.opportunityRadar?.status || 'WAIT_FOR_DIP';
                    const macd = item.macdStatus || {};
                    const isEtf = item.itemType === 'ETF';
                    const isUndervaluedEnough = item.valuationStatus
                      ? item.valuationStatus.isUndervaluedEnough
                      : (item.priceToIntrinsicRatio !== null && item.priceToIntrinsicRatio <= 1.3);

                    return (
                      <tr
                        key={item.stockId}
                        onClick={() => setSelectedRadarModal(item)}
                        className={`transition-colors cursor-pointer ${
                          radarStatus === 'BUY_NOW'
                            ? 'bg-emerald-50/40 hover:bg-emerald-50/80'
                            : radarStatus === 'WATCH_TURNING_GREEN'
                            ? 'bg-amber-50/40 hover:bg-amber-50/80'
                            : 'hover:bg-blue-50/40'
                        }`}
                      >
                        {/* 1. Ticker & Strategie */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-gray-900">{item.ticker}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-black ${
                              isEtf ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
                            }`}>
                              {isEtf ? '📈 ETF' : `★ ${item.score}/5`}
                            </span>
                          </div>
                          <span className="text-[11px] text-gray-400 block truncate max-w-[150px]">{item.name}</span>
                          <span className={`inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded ${
                            isEtf ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'
                          }`}>
                            {item.strategyName}
                          </span>
                        </td>

                        {/* 2. Koopkans-Radar Status */}
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black border ${
                            radarStatus === 'BUY_NOW'
                              ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                              : radarStatus === 'WATCH_TURNING_GREEN'
                              ? 'bg-amber-100 text-amber-950 border-amber-300'
                              : radarStatus === 'WATCH_IN_RED'
                              ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                          }`}>
                            {item.opportunityRadar?.badge || '⏳ Wacht op Signaal'}
                          </span>
                          {item.opportunityRadar?.reason && (
                            <span className="text-[10px] text-gray-500 block mt-0.5 max-w-[190px] truncate" title={item.opportunityRadar.reason}>
                              {item.opportunityRadar.reason}
                            </span>
                          )}
                        </td>

                        {/* 3. Pijler 1: MACD + Voortgangsbalk + 30d Sparkline */}
                        <td className="py-3 px-3 min-w-[185px]">
                          <div className="space-y-1">
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

                            {macd.isRed && (
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between text-[10px] font-bold text-gray-600">
                                  <span>Richting crossover:</span>
                                  <span className={macd.wasRedAndTurningGreen ? 'text-amber-800 font-black' : 'text-rose-700'}>
                                    {macd.recoveryPct || 0}%
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      macd.wasRedAndTurningGreen ? 'bg-gradient-to-r from-amber-500 to-emerald-500' : 'bg-rose-400'
                                    }`}
                                    style={{ width: `${Math.max(8, Math.min(100, macd.recoveryPct || 0))}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* 30-daagse MACD & Signaallijn mini-grafiek */}
                            {macd.historySeries?.length >= 5 && (
                              <MacdMiniSparkline series={macd.historySeries} />
                            )}
                          </div>
                        </td>

                        {/* 4. Pijler 2: Waardering */}
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-extrabold border ${
                            isUndervaluedEnough
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}>
                            {hideFormulas
                              ? (isUndervaluedEnough ? '🟢 Koopwaardig' : '🔴 Overgewaardeerd')
                              : (item.valuationStatus?.badge || (isUndervaluedEnough ? `🟢 ${item.priceToIntrinsicRatio?.toFixed(2)}x ≤ 1.3x` : `🔴 ${item.priceToIntrinsicRatio?.toFixed(2)}x > 1.3x`))}
                          </span>
                          <span className="text-[11px] text-gray-500 block mt-0.5">
                            Koers: <strong className="text-gray-800">{formatCurrency(item.currentPrice)}</strong>
                          </span>
                        </td>

                        {/* 5. Pijler 3: Waardeverdeling Sparkline */}
                        <td className="py-2.5 px-3 text-center">
                          {isEtf ? (
                            <span className="text-[11px] text-emerald-700 font-bold">Vast DCA ({item.targetWeightPct}%)</span>
                          ) : hideFormulas ? (
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              item.isWvDropping ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {item.isWvDropping ? '🔴 Dalend' : '🟢 Stijgend'}
                            </span>
                          ) : (
                            <WvSparkline
                              history={item.wvHistory || []}
                              currentWv={item.waardeVerdeling}
                              prevWv={item.prevWaardeVerdeling}
                              wvDiff={item.wvDiff}
                              isDropping={item.isWvDropping}
                              compact={true}
                            />
                          )}
                        </td>

                        {/* 6. Doel vs Huidig Bezit */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <span className="font-black text-gray-900 block privacy-blur">
                            Doel: {isIncognito ? '€ •••' : formatCurrency(item.targetValueEur)} ({item.targetWeightPct}%)
                          </span>
                          <span className="text-[11px] text-gray-500 block">
                            Bezit: {item.currentShares || 0} st.
                          </span>
                        </td>

                        {/* 7. Order bij Signaal Morgen */}
                        <td className="py-3 px-4 bg-emerald-50/20">
                          {item.tomorrowOrder ? (
                            <div>
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black border privacy-blur ${
                                item.tomorrowOrder.canBuyTomorrow
                                  ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                                  : 'bg-gray-100 text-gray-700 border-gray-200'
                              }`}>
                                {item.tomorrowOrder.badge}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 📱 MOBIELE RADAR LIJST (Tik op rij om alle 3 pijlers & sparkline te openen!) */}
            <div className="block md:hidden divide-y divide-gray-100">
              <div className="p-3 bg-gray-50/80 flex items-center justify-between text-xs font-bold text-gray-500 border-b border-gray-100">
                <span>Koopkans-Radar ({filteredRadarItems.length})</span>
                <span className="text-[11px] text-gray-400 font-semibold">Tik voor 3-pijler details</span>
              </div>

              {filteredRadarItems.map((item) => {
                const radarStatus = item.opportunityRadar?.status || 'WAIT_FOR_DIP';
                const macd = item.macdStatus || {};
                const isEtf = item.itemType === 'ETF';

                return (
                  <div
                    key={item.stockId}
                    onClick={() => setSelectedRadarModal(item)}
                    className={`p-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center justify-between cursor-pointer gap-2.5 ${
                      radarStatus === 'BUY_NOW'
                        ? 'bg-emerald-50/30'
                        : radarStatus === 'WATCH_TURNING_GREEN'
                        ? 'bg-amber-50/30'
                        : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-sm text-gray-900">{item.ticker}</span>
                        <span className={`px-2 py-0.2 rounded-md text-[10px] font-black border ${
                          radarStatus === 'BUY_NOW'
                            ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                            : radarStatus === 'WATCH_TURNING_GREEN'
                            ? 'bg-amber-100 text-amber-950 border-amber-300'
                            : 'bg-gray-100 text-gray-700 border-gray-200'
                        }`}>
                          {item.opportunityRadar?.badge || 'Wacht'}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                          isEtf ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'
                        }`}>
                          {isEtf ? '📈 ETF' : `💎 ${item.targetWeightPct}%`}
                        </span>
                      </div>

                      {macd.isRed && (
                        <div className="flex items-center gap-2 max-w-[210px]">
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                macd.wasRedAndTurningGreen ? 'bg-amber-500' : 'bg-rose-400'
                              }`}
                              style={{ width: `${Math.max(8, Math.min(100, macd.recoveryPct || 0))}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-gray-500 shrink-0">
                            {macd.recoveryPct || 0}% MACD
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 text-right">
                      <div>
                        <span className="text-xs font-black text-emerald-700 block privacy-blur">
                          {item.tomorrowOrder?.badge || formatCurrency(item.currentPrice)}
                        </span>
                        <span className="text-[10px] text-gray-400 font-semibold block">
                          Koers: {formatCurrency(item.currentPrice)}
                        </span>
                      </div>
                      <i className="ph-bold ph-caret-right text-gray-400 text-xs"></i>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================================
          SECTIE 3: POSITIES MATRIX (Compacte Tabel & Mobiele Lijst)
         ========================================================================== */}
      {activeSection === 'matrix' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-black text-gray-900">
                Huidige Posities &amp; Strategie Status ({filteredMatrixHoldings.length})
              </h3>
              <p className="text-xs text-gray-500">
                Overzicht van je huidige portefeuilleposities en hun actuele strategie-advies.
              </p>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'ALL', label: `Alles (${holdings.length})` },
                { id: 'BUY_MORE', label: `🟢 Bijkopen (${stockData?.actionSummary?.buyMoreCount || 0})` },
                { id: 'HOLD', label: `🟡 Houden (${stockData?.actionSummary?.holdCount || 0})` },
                { id: 'TRIM', label: `🔴 Afbouwen (${(stockData?.actionSummary?.trimCount || 0) + (stockData?.actionSummary?.takeProfitCount || 0)})` },
                { id: 'ETF', label: '📈 ETF' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMatrixFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-extrabold rounded-xl transition-all whitespace-nowrap shrink-0 border ${
                    matrixFilter === tab.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-gray-50/70 text-gray-500 font-bold uppercase tracking-wider border-b border-gray-100">
                <tr>
                  <th className="py-3 px-4">Ticker</th>
                  <th className="py-3 px-3 text-right">Waarde &amp; Stuks</th>
                  <th className="py-3 px-3 text-right">Gewicht</th>
                  <th className="py-3 px-3 text-center hidden md:table-cell">WV Trend</th>
                  <th className="py-3 px-3 text-right hidden sm:table-cell">Koers / Waardering</th>
                  <th className="py-3 px-3 text-center">Score</th>
                  <th className="py-3 px-4 text-center">Strategie Advies</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMatrixHoldings.map(h => (
                  <tr key={h.stockId} className="hover:bg-blue-50/40 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-black text-sm text-gray-900 block">{h.ticker}</span>
                      <span className="text-[11px] text-gray-400 truncate max-w-[140px] block">{h.name}</span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="font-black text-gray-900 block privacy-blur">
                        {isIncognito ? '€ •••' : formatCurrency(h.holdingValue)}
                      </span>
                      <span className="text-[11px] text-gray-400 block">{Number(h.quantity || 0).toFixed(2)} st.</span>
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-gray-700">
                      {Number(h.weightPct || 0).toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-center hidden md:table-cell">
                      {h.assetType === 'ETF' ? (
                        <span className="text-gray-400 text-[11px]">ETF</span>
                      ) : hideFormulas ? (
                        <span className="text-xs font-bold">{h.isWvDropping ? '📉 Dalend' : '📈 Stijgend'}</span>
                      ) : (
                        <WvSparkline
                          history={h.wvHistory || []}
                          currentWv={h.waardeVerdeling}
                          prevWv={h.prevWaardeVerdeling}
                          wvDiff={h.wvDiff}
                          isDropping={h.isWvDropping}
                          compact={true}
                        />
                      )}
                    </td>
                    <td className="py-3 px-3 text-right hidden sm:table-cell">
                      <span className="font-bold text-gray-900 block">{formatCurrency(h.currentPrice)}</span>
                      {!hideFormulas && h.priceToIntrinsicRatio && (
                        <span className="text-[11px] text-gray-500 block">{h.priceToIntrinsicRatio.toFixed(2)}x intr.</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 font-black text-xs border border-amber-200">
                        {h.assetType === 'ETF' ? 'ETF' : `${h.score}/5`}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full font-black text-[11px] border whitespace-nowrap ${
                        h.actionSeverity === 'success'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : h.actionSeverity === 'danger'
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : 'bg-gray-100 text-gray-800 border-gray-200'
                      }`}>
                        {h.actionLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==========================================================================
          📱 & 🖥️ DETAIL BOTTOM SHEET / MODAL VOOR EEN MELDING (Zoals op Common Tab)
         ========================================================================== */}
      {selectedNotificationModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedNotificationModal(null)}
          />
          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-5 space-y-4 z-10 animate-slide-up">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl font-black text-sm flex items-center justify-center border ${
                  selectedNotificationModal.strategyType === 'ETF'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                }`}>
                  {selectedNotificationModal.ticker?.substring(0, 2) || '•'}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black text-gray-900 leading-tight">
                      {selectedNotificationModal.ticker}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-gray-100 text-gray-800">
                      {selectedNotificationModal.shortBadge}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-gray-500 block">
                    {selectedNotificationModal.name}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNotificationModal(null)}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:text-gray-900 flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Strategie Herkomst Balk */}
            <div className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs ${
              selectedNotificationModal.isFromOldStrategy
                ? 'bg-purple-50 border-purple-200 text-purple-950'
                : selectedNotificationModal.strategyType === 'ETF'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-indigo-50 border-indigo-200 text-indigo-950'
            }`}>
              <div className="font-extrabold flex items-center gap-1.5">
                <span>{selectedNotificationModal.isFromOldStrategy ? '🕰️' : selectedNotificationModal.strategyType === 'ETF' ? '📈' : '💎'}</span>
                <span>Strategie: {selectedNotificationModal.strategyName}</span>
              </div>
              <Link
                to="/strategy-builder"
                className="text-[11px] font-black underline hover:opacity-80 shrink-0"
              >
                Bekijk in Builder ➔
              </Link>
            </div>

            {/* Order / Actie Box */}
            {selectedNotificationModal.shares > 0 && (
              <div className={`p-3.5 rounded-2xl text-white flex items-center justify-between ${
                selectedNotificationModal.isSell ? 'bg-rose-950' : 'bg-slate-900'
              }`}>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                    {selectedNotificationModal.isMatched ? 'Uitgevoerde Order' : selectedNotificationModal.isSell ? 'Verkoopadvies' : 'Aankoopadvies'}
                  </span>
                  <span className="text-base font-black text-emerald-400">
                    {selectedNotificationModal.isSell ? 'VERKOOP' : 'KOOP'} {selectedNotificationModal.shares} stuks
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                    Totaalbedrag
                  </span>
                  <span className="text-base font-black text-white privacy-blur">
                    {isIncognito ? '€ ••••••' : formatCurrency(selectedNotificationModal.amountEur)}
                  </span>
                </div>
              </div>
            )}

            {/* Kerncijfers Grid */}
            <div className="grid grid-cols-2 gap-2.5 text-left text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 block uppercase">Signaaldatum</span>
                <span className="text-sm font-black text-gray-900 block">
                  {selectedNotificationModal.date}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-gray-100">
                <span className="text-[10px] font-bold text-gray-400 block uppercase">Koers op Signaal</span>
                <span className="text-sm font-black text-gray-900 block">
                  {formatCurrency(selectedNotificationModal.signalPrice)}
                </span>
              </div>

              {selectedNotificationModal.isMatched && selectedNotificationModal.actualPrice > 0 ? (
                <>
                  <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-700 block uppercase">Jouw Aankoopprijs</span>
                    <span className="text-sm font-black text-emerald-950 block">
                      {formatCurrency(selectedNotificationModal.actualPrice)}
                    </span>
                  </div>
                  <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-700 block uppercase">Aankoopdatum</span>
                    <span className="text-sm font-black text-emerald-950 block">
                      {selectedNotificationModal.executionDate || selectedNotificationModal.date}
                    </span>
                  </div>
                </>
              ) : selectedNotificationModal.currentPrice > 0 ? (
                <>
                  <div className="bg-slate-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 block uppercase">Huidige Koers</span>
                    <span className="text-sm font-black text-gray-900 block">
                      {formatCurrency(selectedNotificationModal.currentPrice)}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 block uppercase">Verschil t.o.v. Signaal</span>
                    <span className={`text-sm font-black block ${selectedNotificationModal.isCheaper ? 'text-emerald-600' : 'text-gray-800'}`}>
                      {selectedNotificationModal.priceDiffPct > 0 ? '+' : ''}{Number(selectedNotificationModal.priceDiffPct || 0).toFixed(1)}%
                      {selectedNotificationModal.isCheaper ? ' (Goedkoper)' : ''}
                    </span>
                  </div>
                </>
              ) : null}

              {selectedNotificationModal.strategyType === 'STOCKS' && !hideFormulas && selectedNotificationModal.priceToIntrinsicRatio && (
                <div className="bg-slate-50 p-3 rounded-xl border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 block uppercase">Waardering (x Intr.)</span>
                  <span className={`text-sm font-black block ${selectedNotificationModal.priceToIntrinsicRatio <= 1.3 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {selectedNotificationModal.priceToIntrinsicRatio.toFixed(2)}x
                  </span>
                </div>
              )}

              {selectedNotificationModal.targetWeightPct !== undefined && selectedNotificationModal.targetWeightPct !== null && (
                <div className="bg-slate-50 p-3 rounded-xl border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 block uppercase">Streefdoel &amp; Bezit</span>
                  <span className="text-xs font-bold text-gray-900 block">
                    Doel: {selectedNotificationModal.targetWeightPct}% ({formatCurrency(selectedNotificationModal.targetValueEur)})
                  </span>
                  <span className="text-[11px] text-gray-500 block">
                    In bezit: {selectedNotificationModal.currentShares || 0} st.
                  </span>
                </div>
              )}
            </div>

            {/* Waardeverdeling Sparkline in Modal */}
            {selectedNotificationModal.strategyType === 'STOCKS' && !hideFormulas && selectedNotificationModal.wvHistory?.length > 0 && (
              <div className="p-3 bg-slate-50 rounded-xl border border-gray-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Waardeverdeling Trend (8 Kw.)</span>
                  <span className="text-xs font-bold text-gray-700">
                    Laatste kwartaal: {Number(selectedNotificationModal.waardeVerdeling || 0).toFixed(1)}%
                  </span>
                </div>
                <WvSparkline
                  history={selectedNotificationModal.wvHistory}
                  currentWv={selectedNotificationModal.waardeVerdeling}
                  prevWv={selectedNotificationModal.prevWaardeVerdeling}
                  wvDiff={selectedNotificationModal.wvDiff}
                  isDropping={selectedNotificationModal.isWvDropping}
                />
              </div>
            )}

            {/* Toelichting & Financiering / Rotatie */}
            {(selectedNotificationModal.summaryReason || selectedNotificationModal.fundingSource?.message || selectedNotificationModal.warning) && (
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase block">Strategie Toelichting</span>
                <p className="text-gray-800 font-medium leading-relaxed">
                  {selectedNotificationModal.fundingSource?.message || selectedNotificationModal.summaryReason || selectedNotificationModal.warning}
                </p>

                {selectedNotificationModal.linkedSales?.length > 0 && (
                  <div className="pt-2 space-y-1">
                    <span className="text-[10px] font-black text-amber-900 uppercase block">Rotatie-voorstel:</span>
                    {selectedNotificationModal.linkedSales.map(sale => (
                      <div key={sale.ticker} className="p-2 bg-white rounded-lg border border-amber-200 flex items-center justify-between text-[11px]">
                        <span><strong className="text-rose-600">VERKOOP</strong> {sale.ticker} ({sale.sharesToSell} st.)</span>
                        <span className="font-black">{formatCurrency(sale.amountToSellEur)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==========================================================================
          📱 & 🖥️ DETAIL MODAL VOOR KOOPKANS-RADAR RIJ
         ========================================================================== */}
      {selectedRadarModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedRadarModal(null)}
          />
          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-5 space-y-4 z-10 animate-slide-up">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-gray-900">{selectedRadarModal.ticker}</h3>
                  <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-indigo-50 text-indigo-900">
                    {selectedRadarModal.opportunityRadar?.badge}
                  </span>
                </div>
                <span className="text-xs text-gray-500 block">{selectedRadarModal.name}</span>
                <span className="text-[11px] font-bold text-indigo-700 block mt-0.5">
                  Strategie: {selectedRadarModal.strategyName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRadarModal(null)}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:text-gray-900 flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Order bij signaal morgen */}
            {selectedRadarModal.tomorrowOrder && (
              <div className="p-3.5 rounded-2xl bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold block">
                    Order bij Groen Signaal Morgen
                  </span>
                  <span className="text-sm font-black text-emerald-400">
                    {selectedRadarModal.tomorrowOrder.badge}
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-200">
                  Doel: {selectedRadarModal.targetWeightPct}%
                </span>
              </div>
            )}

            {/* De 3 Pijlers + Interactieve MACD Geschiedenis Grafiek */}
            <div className="space-y-2.5 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-gray-200 space-y-2">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">1. MACD Status &amp; Koop/Verkoopmoment Verloop</span>
                  <div className="font-black text-gray-900">{selectedRadarModal.macdStatus?.badge}</div>
                  {selectedRadarModal.macdStatus?.detail && (
                    <p className="text-[11px] text-gray-600">{selectedRadarModal.macdStatus.detail}</p>
                  )}
                </div>

                {selectedRadarModal.macdStatus?.historySeries?.length >= 5 && (
                  <div className="pt-2 border-t border-gray-200">
                    <MacdProgressionChart item={selectedRadarModal} formatCurrency={formatCurrency} />
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-gray-200 space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase block">2. Onderwaardering &amp; Koers</span>
                <div className="font-black text-gray-900">
                  Huidige koers: {formatCurrency(selectedRadarModal.currentPrice)}
                  {!hideFormulas && selectedRadarModal.intrinsicValue ? ` • Intrinsiek: ${formatCurrency(selectedRadarModal.intrinsicValue)}` : ''}
                </div>
              </div>

              {selectedRadarModal.itemType === 'STOCKS' && !hideFormulas && (
                <div className="p-3 bg-slate-50 rounded-xl border border-gray-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">3. Waardeverdeling (8 Kw.)</span>
                    <span className="font-bold text-gray-900">{Number(selectedRadarModal.waardeVerdeling || 0).toFixed(1)}%</span>
                  </div>
                  <WvSparkline
                    history={selectedRadarModal.wvHistory || []}
                    currentWv={selectedRadarModal.waardeVerdeling}
                    prevWv={selectedRadarModal.prevWaardeVerdeling}
                    wvDiff={selectedRadarModal.wvDiff}
                    isDropping={selectedRadarModal.isWvDropping}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 bg-slate-50 rounded-xl border border-gray-200">
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Doelbedrag ({selectedRadarModal.targetWeightPct}%)</span>
                  <span className="text-sm font-black text-gray-900 privacy-blur">
                    {isIncognito ? '€ •••' : formatCurrency(selectedRadarModal.targetValueEur)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-gray-200">
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Huidig Bezit</span>
                  <span className="text-sm font-black text-gray-900">
                    {selectedRadarModal.currentShares || 0} stuks
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StrategyAdvisorTab;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import http from '../../http-common';
import toast from 'react-hot-toast';

const formatDateTime = (val) => {
  if (!val) return 'Onbekend';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleString('nl-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDateOnly = (val) => {
  if (!val) return 'Onbekend';
  const str = String(val).split('T')[0];
  const parts = str.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return str;
};

const formatTimeShort = (val) => {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
};

const DataStatusIndicator = () => {
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const containerRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await http.get('/portfolio/data-status');
      if (res.data) {
        setStatus(res.data);
        if (typeof res.data.nextAutoSyncInSeconds === 'number') {
          setCountdown(res.data.nextAutoSyncInSeconds);
        }
      }
    } catch (err) {
      // Stille foutafhandeling zodat de header nooit crasht
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    const handleExternalUpdate = () => fetchStatus();
    window.addEventListener('dataStatusUpdated', handleExternalUpdate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('dataStatusUpdated', handleExternalUpdate);
    };
  }, [fetchStatus]);

  // Poll sneller terwijl een achtergrond-sync bezig is
  useEffect(() => {
    if (!status?.isSyncRunning && !manualSyncing) return;
    const fastPoll = setInterval(fetchStatus, 4000);
    return () => clearInterval(fastPoll);
  }, [status?.isSyncRunning, manualSyncing, fetchStatus]);

  // Aftelklokje voor geplande auto-sync na server wake-up
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          fetchStatus();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown, fetchStatus]);

  // Sluit dropdown bij klik buiten component
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleManualSync = async () => {
    if (manualSyncing || status?.isSyncRunning) return;
    setManualSyncing(true);
    const toastId = toast.loading('Bezig met bijwerken van eToro API, koersen, wisselkoers, MACD & SEC data...');
    try {
      await http.post('/watchlist/update-data');
      await fetchStatus();
      window.dispatchEvent(new Event('dataStatusUpdated'));
      window.dispatchEvent(new Event('availableBalanceUpdated'));
      toast.success('eToro API, koersen & meldingen zijn bijgewerkt!', { id: toastId });
    } catch (err) {
      toast.error('Fout bij synchroniseren van data.', { id: toastId });
    } finally {
      setManualSyncing(false);
    }
  };

  const isSyncing = manualSyncing || status?.isSyncRunning;
  const isUpToDate = status?.isUpdatedToday;
  const latestSyncTime = formatTimeShort(status?.lastPriceSyncAt || status?.lastMacdUpdate);

  const formatCountdown = (sec) => {
    if (sec === null || sec <= 0) return 'binnenkort';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          if (!open) fetchStatus();
          setOpen(!open);
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 ${
          isSyncing
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : isUpToDate
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/70'
            : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100/70'
        }`}
        title="Klik voor details over de laatste data-updates en cache-status"
      >
        {isSyncing ? (
          <>
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
            <span className="hidden sm:inline">Sync bezig...</span>
          </>
        ) : isUpToDate ? (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="hidden lg:inline">Actueel</span>
            {latestSyncTime && <span className="text-[11px] opacity-80">({latestSyncTime})</span>}
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="hidden sm:inline">
              {countdown && countdown <= 180 ? `Update over ${formatCountdown(countdown)}` : `Data: ${formatDateOnly(status?.lastPriceDate)}`}
            </span>
          </>
        )}
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-[99999] flex items-center justify-center p-3 sm:p-4 animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-5 w-full max-w-md max-h-[90vh] overflow-y-auto text-xs text-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100">
              <div>
                <h4 className="text-sm sm:text-base font-black text-gray-900">Data &amp; Synchronisatie Status</h4>
                <p className="text-[11px] text-gray-500">Overzicht van de brongegevens &amp; live platformkoppelingen</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    isSyncing
                      ? 'bg-blue-100 text-blue-700'
                      : isUpToDate
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {isSyncing ? 'Bezig met sync' : isUpToDate ? 'Vandaag bijgewerkt' : 'Wacht op update'}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 flex items-center justify-center font-bold text-sm transition-colors"
                  title="Sluiten"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between items-start bg-gray-50/80 p-2.5 rounded-xl">
                <div>
                  <span className="font-semibold text-gray-900 block">📈 Slotkoersen (Aandelen &amp; ETF's)</span>
                  <span className="text-[11px] text-gray-500">Laatste sync: {formatDateTime(status?.lastPriceSyncAt || status?.lastMacdUpdate)}</span>
                </div>
                <span className="font-bold text-gray-800 whitespace-nowrap ml-2">
                  {formatDateOnly(status?.lastPriceDate)}
                </span>
              </div>

              <div className="flex justify-between items-start bg-gray-50/80 p-2.5 rounded-xl">
                <div>
                  <span className="font-semibold text-gray-900 block">💱 EUR/USD Wisselkoers</span>
                  <span className="text-[11px] text-gray-500">Datum: {formatDateOnly(status?.lastFxDate)}</span>
                </div>
                <span className="font-bold text-gray-800 whitespace-nowrap ml-2">
                  {status?.lastFxRate ? `$ ${status.lastFxRate.toFixed(4)}` : 'Onbekend'}
                </span>
              </div>

              <div className="flex justify-between items-start bg-gray-50/80 p-2.5 rounded-xl">
                <div>
                  <span className="font-semibold text-gray-900 block">📊 MACD &amp; Koop/Verkoop-alerts</span>
                  <span className="text-[11px] text-gray-500">Signalen &amp; crossovers</span>
                </div>
                <span className="font-bold text-gray-800 whitespace-nowrap ml-2">
                  {formatDateTime(status?.lastMacdUpdate)}
                </span>
              </div>

              <div className="flex justify-between items-start bg-gray-50/80 p-2.5 rounded-xl">
                <div>
                  <span className="font-semibold text-gray-900 block">🏛️ DCF &amp; Fundamentele Berekening</span>
                  <span className="text-[11px] text-gray-500">Intrinsieke waarde &amp; Score (0–5)</span>
                </div>
                <span className="font-bold text-gray-800 whitespace-nowrap ml-2">
                  {formatDateTime(status?.lastCalcUpdate)}
                </span>
              </div>

              <div className="flex justify-between items-start bg-gray-50/80 p-2.5 rounded-xl">
                <div>
                  <span className="font-semibold text-gray-900 block">💼 Portefeuillegrafiek Historie</span>
                  <span className="text-[11px] text-gray-500">Laatst opgeslagen dag in grafiek</span>
                </div>
                <span className="font-bold text-gray-800 whitespace-nowrap ml-2">
                  {formatDateOnly(status?.lastPortfolioValueDate)}
                </span>
              </div>

              <div className="flex justify-between items-start bg-emerald-50/70 border border-emerald-200/80 p-2.5 rounded-xl">
                <div>
                  <span className="font-semibold text-emerald-950 block">🔄 eToro API (Transacties &amp; Cash)</span>
                  <span className="text-[11px] text-emerald-800">
                    Laatste auto-sync: {status?.lastEtoroSyncAt ? formatDateTime(status.lastEtoroSyncAt) : 'Nog niet gesynchroniseerd'}
                  </span>
                </div>
                <span className="font-bold text-emerald-800 whitespace-nowrap ml-2">
                  {status?.etoroCashUsd != null ? `🟢 $ ${status.etoroCashUsd.toFixed(2)}` : (status?.etoroSyncStatus === 'ok' ? '🟢 Actief' : '⚪ -')}
                </span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
              <span>⚡ Auto-sync: elke 30 min (incl. eToro API)</span>
              <span>Volgende check: {formatCountdown(countdown)}</span>
            </div>

            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="mt-3 w-full py-2.5 px-3 rounded-xl font-black text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <i className={`ph-bold ph-arrows-clockwise ${isSyncing ? 'animate-spin' : ''}`}></i>
              <span>{isSyncing ? 'Bezig met synchroniseren...' : 'Nu eToro, Prijzen & Meldingen Synchroniseren'}</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DataStatusIndicator;


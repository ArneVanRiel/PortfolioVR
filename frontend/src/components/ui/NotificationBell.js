import React, { useState, useEffect, useRef } from 'react';
import http from '../../http-common';

const NotificationBell = () => {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [filterTab, setFilterTab] = useState('ALL'); // 'ALL' | 'STOCKS' | 'ETF' | 'HISTORY'
  const dropdownRef = useRef(null);

  const fetchNotifications = async () => {
    try {
      const response = await http.get('/notifications');
      setNotifications(response.data || []);
    } catch (error) {
      console.error('Fout bij ophalen meldingen:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await http.put('/notifications/read', {});
      setNotifications([]);
      setIsOpen(false);
    } catch (error) {
      console.error('Fout bij markeren meldingen:', error);
    }
  };

  const markOneAsRead = async (id) => {
    try {
      await http.put('/notifications/read', { id });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (error) {
      console.error('Fout bij markeren melding:', error);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasActionRequired = notifications.some(n => n.action_required);
  const actionCount = notifications.filter(n => n.action_required).length;

  const filteredNotifications = notifications.filter(n => {
    if (filterTab === 'ALL') return true;
    if (filterTab === 'HISTORY') return n.is_from_old_strategy || n.action_type === 'STRATEGY_SWITCH';
    if (filterTab === 'ETF') return n.strategy_type === 'ETF' && !n.is_from_old_strategy;
    if (filterTab === 'STOCKS') return n.strategy_type !== 'ETF' && n.action_type !== 'STRATEGY_SWITCH' && !n.is_from_old_strategy;
    return true;
  });

  const renderStrategyBadge = (notif) => {
    if (notif.action_type === 'STRATEGY_SWITCH') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-300">
          🔄 Strategiewissel ({notif.strategy_type === 'ETF' ? 'ETF' : 'Aandelen'})
        </span>
      );
    }
    if (notif.is_from_old_strategy) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-950 border border-amber-300" title="Deze melding stamt van een vorige strategie vóór je strategiewissel en blijft bewaard.">
          🕰️ Vorige Strategie: {notif.strategy_name || 'Oude Strategie'}
        </span>
      );
    }
    if (notif.strategy_type === 'ETF' || notif.action_type === 'ETF_BUY_OPPORTUNITY') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-teal-100 text-teal-900 border border-teal-300">
          📈 ETF Strategie: {notif.strategy_name || 'Arne ETF DCA'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900 border border-indigo-300">
        🎯 Aandelen Strategie: {notif.strategy_name || 'Huidige Live Strategie'}
      </span>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          if (!isOpen) fetchNotifications();
          setIsOpen(!isOpen);
        }}
        className="relative p-2 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-full transition-all duration-200 focus:outline-none"
        title={hasActionRequired ? `${actionCount} actie(s) vereist!` : 'Meldingen'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {notifications.length > 0 && (
          <span className={`absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white rounded-full ${hasActionRequired ? 'bg-red-600 animate-pulse ring-2 ring-red-300' : 'bg-red-500'}`}>
            {hasActionRequired && <span className="mr-0.5">⚡</span>}
            {notifications.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-88 sm:w-[420px] max-w-[94vw] bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden transform origin-top-right transition-all duration-200">
          <div className="p-3.5 border-b border-gray-100 bg-gray-50/90 space-y-2.5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-gray-900 text-sm">Persoonlijke Meldingen ({notifications.length})</h4>
                {actionCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse border border-red-200">
                    ⚡ {actionCount} {actionCount === 1 ? 'actie' : 'acties'}
                  </span>
                )}
              </div>
              {notifications.length > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold"
                >
                  Alles gelezen
                </button>
              )}
            </div>

            {/* Filter tabs per strategie */}
            <div className="flex items-center gap-1 bg-gray-200/70 p-1 rounded-xl text-[10px] font-bold">
              <button
                onClick={() => setFilterTab('ALL')}
                className={`flex-1 py-1 px-2 rounded-lg transition-all ${filterTab === 'ALL' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Alle ({notifications.length})
              </button>
              <button
                onClick={() => setFilterTab('STOCKS')}
                className={`flex-1 py-1 px-2 rounded-lg transition-all ${filterTab === 'STOCKS' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-gray-600 hover:text-gray-900'}`}
              >
                💎 Aandelen
              </button>
              <button
                onClick={() => setFilterTab('ETF')}
                className={`flex-1 py-1 px-2 rounded-lg transition-all ${filterTab === 'ETF' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-gray-600 hover:text-gray-900'}`}
              >
                📈 ETF DCA
              </button>
              <button
                onClick={() => setFilterTab('HISTORY')}
                className={`flex-1 py-1 px-2 rounded-lg transition-all ${filterTab === 'HISTORY' ? 'bg-purple-600 text-white shadow-2xs' : 'text-gray-600 hover:text-gray-900'}`}
              >
                🕰️ Wissels
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-100">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                <p className="font-semibold text-gray-500">Geen meldingen in deze weergave</p>
                <span className="text-xs text-gray-400 mt-1 block">Jouw gekozen strategieën zijn volledig gesynchroniseerd.</span>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                if (notif.action_type === 'STRATEGY_SWITCH') {
                  return (
                    <div
                      key={notif.id}
                      className="p-3.5 bg-gradient-to-br from-purple-50/90 to-indigo-50/50 border-l-4 border-l-purple-600 hover:bg-purple-50 transition-colors flex justify-between gap-3 items-start"
                    >
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {renderStrategyBadge(notif)}
                        </div>
                        <div className="text-xs font-extrabold text-purple-950">
                          {notif.action_title || '🔄 Strategie Gewijzigd'}
                        </div>
                        <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                          {notif.message}
                        </p>
                        <span className="text-[10px] text-purple-600/80 font-bold mt-1.5 block font-mono">
                          Gewijzigd op: {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <button
                        onClick={() => markOneAsRead(notif.id)}
                        className="text-gray-400 hover:text-gray-600 p-1 hover:bg-white rounded transition-colors shrink-0"
                        title="Markeer als gelezen"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                }

                const isBuyAction = notif.action_type === 'BUY_OPPORTUNITY' || notif.action_type === 'ETF_BUY_OPPORTUNITY';
                const isSellAction = notif.action_required && !isBuyAction;
                const isSmallSell = notif.action_type === 'PARTIAL_SELL_TOO_SMALL';
                const isHold = notif.action_type === 'HOLD';

                if (isBuyAction && !isHold) {
                  return (
                    <div
                      key={notif.id}
                      className={`p-3.5 border-l-4 transition-colors flex justify-between gap-3 items-start ${
                        notif.is_from_old_strategy
                          ? 'bg-amber-50/40 border-l-amber-500 hover:bg-amber-50/70'
                          : 'bg-gradient-to-br from-emerald-50/90 to-teal-50/50 border-l-emerald-500 hover:bg-emerald-50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="mb-1.5">
                          {renderStrategyBadge(notif)}
                        </div>
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className="text-xs font-bold px-2 py-0.5 bg-white border border-emerald-300 text-emerald-800 rounded shadow-xs">
                            {notif.ticker}
                          </span>
                          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                            {notif.action_title || '🟢 Koopkans'}
                          </span>
                        </div>

                        <div className="my-2 p-2 bg-white rounded-lg border border-emerald-200 shadow-xs">
                          <div className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                            <span className="text-sm">⚡</span>
                            <span>
                              KOOP {notif.action_shares} {notif.action_shares === 1 ? 'STUK' : 'STUKS'} ({notif.ticker})
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                          {notif.message}
                        </p>

                        <span className="text-[10px] text-gray-400 mt-2 block font-mono">
                          {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <button
                        onClick={() => markOneAsRead(notif.id)}
                        className="text-gray-400 hover:text-gray-600 p-1 hover:bg-white rounded transition-colors shrink-0"
                        title="Markeer als gelezen"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                }

                if (isSellAction && !isHold) {
                  return (
                    <div
                      key={notif.id}
                      className={`p-3.5 border-l-4 transition-colors flex justify-between gap-3 items-start ${
                        notif.is_from_old_strategy
                          ? 'bg-amber-50/40 border-l-amber-500 hover:bg-amber-50/70'
                          : 'bg-gradient-to-br from-red-50/90 to-amber-50/50 border-l-red-500 hover:bg-red-50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="mb-1.5">
                          {renderStrategyBadge(notif)}
                        </div>
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className="text-xs font-bold px-2 py-0.5 bg-white border border-red-300 text-red-700 rounded shadow-xs">
                            {notif.ticker}
                          </span>
                          <span className="text-[11px] font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                            {notif.action_title || '⚡ Verkoop Actie Vereist'}
                          </span>
                        </div>

                        <div className="my-2 p-2 bg-white rounded-lg border border-red-200 shadow-xs">
                          <div className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                            <span className="text-sm">⚡</span>
                            <span>
                              VERKOOP {notif.action_shares} STUKS ({notif.action_pct}%)
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                          {notif.message}
                        </p>

                        <span className="text-[10px] text-gray-400 mt-2 block font-mono">
                          {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <button
                        onClick={() => markOneAsRead(notif.id)}
                        className="text-gray-400 hover:text-gray-600 p-1 hover:bg-white rounded transition-colors shrink-0"
                        title="Markeer als gelezen"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                }

                if (isSmallSell && !isHold) {
                  return (
                    <div
                      key={notif.id}
                      className="p-3.5 bg-amber-50/50 border-l-4 border-l-amber-400 hover:bg-amber-50/80 transition-colors flex justify-between gap-3 items-start"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="mb-1.5">
                          {renderStrategyBadge(notif)}
                        </div>
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className="text-xs font-bold px-2 py-0.5 bg-white border border-amber-300 text-amber-900 rounded shadow-xs">
                            {notif.ticker}
                          </span>
                          <span className="text-[11px] font-semibold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                            {notif.action_title || '🟡 Deelverkoop Te Klein (< €50)'}
                          </span>
                        </div>

                        <div className="my-1.5 p-2 bg-white/90 rounded-lg border border-amber-200 text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                          <span>🟡</span>
                          <span>ADVIES: NIET VERKOPEN (bedrag &lt; € 50)</span>
                        </div>

                        <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                          {notif.message}
                        </p>

                        <span className="text-[10px] text-gray-400 mt-2 block font-mono">
                          {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <button
                        onClick={() => markOneAsRead(notif.id)}
                        className="text-gray-400 hover:text-gray-600 p-1 hover:bg-white rounded transition-colors shrink-0"
                        title="Markeer als gelezen"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={notif.id}
                    className="p-3.5 bg-emerald-50/30 border-l-4 border-l-emerald-400 hover:bg-emerald-50/60 transition-colors flex justify-between gap-3 items-start"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="mb-1.5">
                        {renderStrategyBadge(notif)}
                      </div>
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <span className="text-xs font-bold px-2 py-0.5 bg-white border border-emerald-300 text-emerald-800 rounded shadow-xs">
                          {notif.ticker}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                          {notif.action_title || '✅ Positie Behouden'}
                        </span>
                      </div>

                      <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                        {notif.message}
                      </p>

                      <span className="text-[10px] text-gray-400 mt-2 block font-mono">
                        {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <button
                      onClick={() => markOneAsRead(notif.id)}
                      className="text-gray-400 hover:text-gray-600 p-1 hover:bg-white rounded transition-colors shrink-0"
                      title="Markeer als gelezen"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;

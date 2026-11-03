import React, { useState, useEffect, useRef } from 'react';
import http from '../../http-common';

const NotificationBell = () => {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const fetchNotifications = async () => {
    try {
      const response = await http.get('/notifications');
      setNotifications(response.data);
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
    // Vraag elke 5 minuten opnieuw de status op
    const interval = setInterval(fetchNotifications, 300000);
    return () => clearInterval(interval);
  }, []);

  // Sluit het dropdown menu bij een klik buiten de component
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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-full transition-all duration-200 focus:outline-none"
        title={hasActionRequired ? `${actionCount} actie(s) vereist!` : 'Meldingen'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {notifications.length > 0 && (
          <span className={`absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white rounded-full ${hasActionRequired ? 'bg-red-600 animate-pulse ring-2 ring-red-300' : 'bg-red-500'
            }`}>
            {hasActionRequired && <span className="mr-0.5">⚡</span>}
            {notifications.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-84 sm:w-96 max-w-[92vw] bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden transform origin-top-right transition-all duration-200">
          <div className="p-3.5 border-b border-gray-100 flex justify-between items-center bg-gray-50/90">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-gray-800 text-sm">Meldingen ({notifications.length})</h4>
              {actionCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse border border-red-200">
                  ⚡ {actionCount} {actionCount === 1 ? 'actie vereist' : 'acties vereist'}
                </span>
              )}
            </div>
            {notifications.length > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Markeer alles als gelezen
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                <p>Geen nieuwe meldingen</p>
                <span className="text-xs text-gray-300 mt-1 block">Alles is up-to-date</span>
              </div>
            ) : (
              notifications.map((notif) => {
                const isBuyAction = notif.action_type === 'BUY_OPPORTUNITY' || notif.action_type === 'ETF_BUY_OPPORTUNITY';
                const isSellAction = notif.action_required && !isBuyAction;
                const isSmallSell = notif.action_type === 'PARTIAL_SELL_TOO_SMALL';
                const isHold = notif.action_type === 'HOLD';

                if (isBuyAction) {
                  if (isHold) {
                    return (
                      <div
                        key={notif.id}
                        className="p-3.5 bg-emerald-50/30 border-l-4 border-l-emerald-400 hover:bg-emerald-50/60 transition-colors flex justify-between gap-3 items-start"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                            <span className="text-xs font-bold px-2 py-0.5 bg-white border border-emerald-300 text-emerald-800 rounded shadow-xs">
                              {notif.ticker}
                            </span>
                            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                              {notif.action_title || '✅ Positie Behouden'}
                            </span>
                          </div>

                          <div className="my-1.5 p-2 bg-white/90 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                            <span>✅</span>
                            <span>POSITIE BEHOUDEN (Score 5/5 & Waardeverdeling stabiel/stijgend)</span>
                          </div>

                          <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                            {notif.message}
                          </p>

                          <span className="text-[10px] text-gray-400 mt-2 block font-mono">
                            {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
                      className="p-3.5 bg-gradient-to-br from-emerald-50/90 to-teal-50/50 border-l-4 border-l-emerald-500 hover:bg-emerald-50 transition-colors flex justify-between gap-3 items-start"
                    >
                      <div className="flex-1 min-w-0">
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
                          {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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

                if (isSellAction) {
                  if (isHold) {
                    return (
                      <div
                        key={notif.id}
                        className="p-3.5 bg-emerald-50/30 border-l-4 border-l-emerald-400 hover:bg-emerald-50/60 transition-colors flex justify-between gap-3 items-start"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                            <span className="text-xs font-bold px-2 py-0.5 bg-white border border-emerald-300 text-emerald-800 rounded shadow-xs">
                              {notif.ticker}
                            </span>
                            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                              {notif.action_title || '✅ Positie Behouden'}
                            </span>
                          </div>

                          <div className="my-1.5 p-2 bg-white/90 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                            <span>✅</span>
                            <span>POSITIE BEHOUDEN (Score 5/5 & Waardeverdeling stabiel/stijgend)</span>
                          </div>

                          <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                            {notif.message}
                          </p>

                          <span className="text-[10px] text-gray-400 mt-2 block font-mono">
                            {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
                      className="p-3.5 bg-gradient-to-br from-red-50/90 to-amber-50/50 border-l-4 border-l-red-500 hover:bg-red-50 transition-colors flex justify-between gap-3 items-start"
                    >
                      <div className="flex-1 min-w-0">
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
                          {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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

                if (isSmallSell) {
                  if (isHold) {
                    return (
                      <div
                        key={notif.id}
                        className="p-3.5 bg-emerald-50/30 border-l-4 border-l-emerald-400 hover:bg-emerald-50/60 transition-colors flex justify-between gap-3 items-start"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                            <span className="text-xs font-bold px-2 py-0.5 bg-white border border-emerald-300 text-emerald-800 rounded shadow-xs">
                              {notif.ticker}
                            </span>
                            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                              {notif.action_title || '✅ Positie Behouden'}
                            </span>
                          </div>

                          <div className="my-1.5 p-2 bg-white/90 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                            <span>✅</span>
                            <span>POSITIE BEHOUDEN (Score 5/5 & Waardeverdeling stabiel/stijgend)</span>
                          </div>

                          <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                            {notif.message}
                          </p>

                          <span className="text-[10px] text-gray-400 mt-2 block font-mono">
                            {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
                      className="p-3.5 bg-amber-50/50 border-l-4 border-l-amber-400 hover:bg-amber-50/80 transition-colors flex justify-between gap-3 items-start"
                    >
                      <div className="flex-1 min-w-0">
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
                          {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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

                if (isHold) {
                  if (isHold) {
                    return (
                      <div
                        key={notif.id}
                        className="p-3.5 bg-emerald-50/30 border-l-4 border-l-emerald-400 hover:bg-emerald-50/60 transition-colors flex justify-between gap-3 items-start"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                            <span className="text-xs font-bold px-2 py-0.5 bg-white border border-emerald-300 text-emerald-800 rounded shadow-xs">
                              {notif.ticker}
                            </span>
                            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                              {notif.action_title || '✅ Positie Behouden'}
                            </span>
                          </div>

                          <div className="my-1.5 p-2 bg-white/90 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                            <span>✅</span>
                            <span>POSITIE BEHOUDEN (Score 5/5 & Waardeverdeling stabiel/stijgend)</span>
                          </div>

                          <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                            {notif.message}
                          </p>

                          <span className="text-[10px] text-gray-400 mt-2 block font-mono">
                            {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
                      className="p-3.5 bg-emerald-50/20 border-l-4 border-l-emerald-400 hover:bg-emerald-50/40 transition-colors flex justify-between gap-3 items-start"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className="text-xs font-bold px-2 py-0.5 bg-white border border-emerald-300 text-emerald-800 rounded shadow-xs">
                            {notif.ticker}
                          </span>
                          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                            {notif.action_title || '✅ Positie Behouden'}
                          </span>
                        </div>

                        <div className="my-1.5 p-2 bg-white/90 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                          <span>✅</span>
                          <span>POSITIE BEHOUDEN (Score 5/5 & Waardeverdeling stabiel/stijgend)</span>
                        </div>

                        <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                          {notif.message}
                        </p>

                        <span className="text-[10px] text-gray-400 mt-2 block font-mono">
                          {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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

                if (isHold) {
                  return (
                    <div
                      key={notif.id}
                      className="p-3.5 bg-emerald-50/30 border-l-4 border-l-emerald-400 hover:bg-emerald-50/60 transition-colors flex justify-between gap-3 items-start"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className="text-xs font-bold px-2 py-0.5 bg-white border border-emerald-300 text-emerald-800 rounded shadow-xs">
                            {notif.ticker}
                          </span>
                          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                            {notif.action_title || '✅ Positie Behouden'}
                          </span>
                        </div>

                        <div className="my-1.5 p-2 bg-white/90 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                          <span>✅</span>
                          <span>POSITIE BEHOUDEN (Score 5/5 & Waardeverdeling stabiel/stijgend)</span>
                        </div>

                        <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                          {notif.message}
                        </p>

                        <span className="text-[10px] text-gray-400 mt-2 block font-mono">
                          {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
                    className="p-3.5 hover:bg-gray-50 transition-colors flex justify-between gap-3 items-start"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="text-xs font-bold text-blue-600">{notif.ticker}</span>
                        {notif.action_title && (
                          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {notif.action_title}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 leading-snug whitespace-pre-line">{notif.message}</p>
                      <span className="text-[10px] text-gray-400 mt-1.5 block font-mono">
                        {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <button
                      onClick={() => markOneAsRead(notif.id)}
                      className="text-gray-300 hover:text-gray-500 p-1 hover:bg-gray-100 rounded transition-colors shrink-0"
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

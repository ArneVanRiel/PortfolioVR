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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-full transition-all duration-200 focus:outline-none"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {notifications.length > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] font-bold leading-none text-white bg-red-500 rounded-full">
            {notifications.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden transform origin-top-right transition-all duration-200">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h4 className="font-semibold text-gray-800 text-sm">Meldingen ({notifications.length})</h4>
            {notifications.length > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium"
              >
                Markeer alles als gelezen
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                Geen nieuwe meldingen
              </div>
            ) : (
              notifications.map((notif) => (
                <div key={notif.id} className="p-4 hover:bg-blue-50/20 transition-colors flex justify-between gap-3 items-start">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-blue-600 mb-0.5">{notif.ticker}</p>
                    <p className="text-sm text-gray-600 leading-snug">{notif.message}</p>
                    <span className="text-[10px] text-gray-400 mt-1 block">
                      {new Date(notif.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <button
                    onClick={() => markOneAsRead(notif.id)}
                    className="text-gray-300 hover:text-gray-500 p-0.5"
                    title="Markeer als gelezen"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;

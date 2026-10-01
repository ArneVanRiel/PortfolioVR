import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import http from '../../http-common';
import { useIncognito } from '../../hooks/useIncognito';

const HeaderBalanceDisplay = () => {
  const [balance, setBalance] = useState(0);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [balanceTypes, setBalanceTypes] = useState([]);
  const [currentInputBalances, setCurrentInputBalances] = useState({});
  const [brokerCash, setBrokerCash] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isIncognito = useIncognito();
  const userRole = localStorage.getItem('role') || 'user';
  const isDemo = userRole === 'demo';

  // Haal live broker cash saldi op
  const fetchBrokerCash = useCallback(async () => {
    try {
      const res = await http.get('/balance/available/broker-cash');
      if (res.data) {
        setBrokerCash(res.data);
        return res.data;
      }
    } catch (err) {
      console.warn('Kon broker cash niet ophalen:', err);
    }
    return null;
  }, []);

  const fetchLatestBalance = useCallback(async (bCash = brokerCash) => {
    try {
      const [balRes, cashData] = await Promise.all([
        http.get('/balance/available/latest-balance'),
        bCash ? Promise.resolve(bCash) : fetchBrokerCash()
      ]);

      const { totalAmount, balances } = balRes.data;
      setBalance(totalAmount || 0);
      
      // Voorbereiden input velden voor modal
      const initialInput = {};
      if (balanceTypes.length > 0) {
        balanceTypes.forEach(type => {
          const tName = type.type_name.toLowerCase();
          if (tName.includes('etoro')) {
            // eToro Cash automatisch invullen uit broker cash (in EUR)
            initialInput[type.balance_type_id] = (cashData?.suggestedBalances?.[1] ?? cashData?.etoro?.amountEur ?? balances?.[type.type_name] ?? 0);
          } else if (tName.includes('degiro')) {
            // DeGiro Cash automatisch invullen uit broker cash (in EUR)
            initialInput[type.balance_type_id] = (cashData?.suggestedBalances?.[2] ?? cashData?.degiro?.amountEur ?? balances?.[type.type_name] ?? 0);
          } else {
            initialInput[type.balance_type_id] = balances?.[type.type_name] !== undefined ? balances[type.type_name] : '';
          }
        });
        setCurrentInputBalances(initialInput);
      }
    } catch (err) {
      console.error("Failed to fetch available balance:", err);
    }
  }, [balanceTypes, brokerCash, fetchBrokerCash]);

  const fetchBalanceTypes = useCallback(async () => {
    try {
      const response = await http.get('/balance/available/balance-types');
      setBalanceTypes(response.data);
    } catch (err) {
      console.error('Fout bij ophalen saldo types:', err);
    }
  }, []);

  useEffect(() => {
    fetchBalanceTypes();
  }, [fetchBalanceTypes]);

  useEffect(() => {
    fetchLatestBalance();
  }, [fetchLatestBalance]);

  useEffect(() => {
    const handleRefresh = () => fetchLatestBalance();
    window.addEventListener('availableBalanceUpdated', handleRefresh);
    return () => window.removeEventListener('availableBalanceUpdated', handleRefresh);
  }, [fetchLatestBalance]);

  const handleDoubleClick = async () => {
    if (isDemo) return;
    const latestCash = await fetchBrokerCash();
    await fetchLatestBalance(latestCash);
    setShowUpdateModal(true);
  };

  const handleCloseModal = () => {
    setShowUpdateModal(false);
    setError('');
  };

  const handleInputChange = (balanceTypeId, value) => {
    const numericValue = value.replace(/[^0-9.]/g, '');
    setCurrentInputBalances(prev => ({
      ...prev,
      [balanceTypeId]: numericValue,
    }));
  };

  // Bereken live totaal in de modal
  const modalLiveTotal = Object.values(currentInputBalances).reduce((sum, val) => {
    const num = parseFloat(val);
    return sum + (isNaN(num) ? 0 : num);
  }, 0);

  const handleSubmitUpdate = async () => {
    setLoading(true);
    try {
      const balancesToUpdate = balanceTypes.map(type => ({
        balance_type_id: type.balance_type_id,
        amount: parseFloat(currentInputBalances[type.balance_type_id] || 0)
      }));

      await http.post('/balance/available/update-balance', { balances: balancesToUpdate });
      handleCloseModal();
      await fetchLatestBalance();
      window.dispatchEvent(new Event('availableBalanceUpdated'));
    } catch (err) {
      console.error('Fout bij bijwerken vermogen:', err);
      setError('Fout bij het bijwerken. Probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div onDoubleClick={handleDoubleClick} onClick={handleDoubleClick} className={`${isDemo ? '' : 'cursor-pointer'} select-none`} title={isDemo ? '' : 'Klik om aan te passen'}>
        <span className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider block">Beschikbaar</span>
        <p className="text-sm sm:text-lg font-bold text-green-600 privacy-blur leading-tight">
          {isIncognito ? '€ ••••••' : `€${balance.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </p>
      </div>

      {/* Modal voor aanpassen */}
      {showUpdateModal && createPortal(
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-3xl shadow-2xl w-full max-w-md border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3 border-b pb-3">
              <div>
                <h3 className="text-lg font-black text-gray-900">Pas Beschikbaar Vermogen Aan</h3>
                <p className="text-xs text-gray-500">Platform cash wordt automatisch gekoppeld</p>
              </div>
              <button onClick={handleCloseModal} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center font-bold">
                ✕
              </button>
            </div>

            {error && <p className="text-rose-600 text-xs font-semibold mb-3 p-2 bg-rose-50 rounded-lg">{error}</p>}

            {/* Live Totaal Banner */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl mb-4 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Totaal Vermogen:</span>
              <span className="text-lg font-black text-emerald-600">
                € {modalLiveTotal.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="space-y-3.5">
              {balanceTypes.map(type => {
                const tName = type.type_name.toLowerCase();
                const isEtoro = tName.includes('etoro');
                const isDegiro = tName.includes('degiro');
                const isBroker = isEtoro || isDegiro;

                return (
                  <div key={type.balance_type_id} className={isBroker ? 'p-2.5 rounded-2xl bg-emerald-50/50 border border-emerald-100' : ''}>
                    <div className="flex items-center justify-between mb-1">
                      <label className={`block text-xs font-bold ${isBroker ? 'text-emerald-950' : 'text-gray-700'}`}>
                        {type.type_name}
                      </label>
                      {isBroker && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          🔒 Auto (Gekoppeld)
                        </span>
                      )}
                    </div>

                    {isEtoro && brokerCash && (
                      <span className="text-[11px] text-emerald-700 block mb-1">
                        Live op eToro: ${brokerCash.etoro?.amount?.toFixed(2)} USD (omgerekend naar EUR)
                      </span>
                    )}
                    {isDegiro && brokerCash && (
                      <span className="text-[11px] text-emerald-700 block mb-1">
                        Live op DeGiro: € {brokerCash.degiro?.amount?.toFixed(2)} EUR
                      </span>
                    )}

                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 font-bold text-xs">€</span>
                      <input
                        type="text"
                        readOnly={isBroker}
                        disabled={isBroker}
                        className={`block w-full pl-8 pr-3 py-2 rounded-xl text-sm border font-semibold ${
                          isBroker 
                            ? 'bg-emerald-100/40 border-emerald-200 text-emerald-950 cursor-not-allowed' 
                            : 'bg-white border-gray-200 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                        }`}
                        value={currentInputBalances[type.balance_type_id] || ''}
                        onChange={(e) => !isBroker && handleInputChange(type.balance_type_id, e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t pt-4">
              <button onClick={handleCloseModal} className="px-4 py-2.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200 transition-colors">
                Annuleren
              </button>
              <button onClick={handleSubmitUpdate} disabled={loading} className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-extrabold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-md">
                {loading ? 'Bezig...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default HeaderBalanceDisplay;

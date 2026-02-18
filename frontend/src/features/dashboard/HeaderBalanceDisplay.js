import React, { useState, useEffect, useCallback } from 'react';
import http from '../../http-common';
import Modal from '../../components/ui/modal'; // Zorg dat je een Modal component hebt of gebruik bootstrap classes

const HeaderBalanceDisplay = () => {
  const [balance, setBalance] = useState(0);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [balanceTypes, setBalanceTypes] = useState([]);
  const [currentInputBalances, setCurrentInputBalances] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchLatestBalance = useCallback(async () => {
    try {
      // Correct endpoint: /balance/available/latest-balance
      const response = await http.get('/balance/available/latest-balance');
      const { totalAmount, balances } = response.data;
      setBalance(totalAmount);
      
      // Voorbereiden input velden voor modal
      const initialInput = {};
      if (balanceTypes.length > 0) {
          balanceTypes.forEach(type => {
            initialInput[type.balance_type_id] = balances[type.type_name] || '';
          });
          setCurrentInputBalances(initialInput);
      }
    } catch (err) {
      console.error("Failed to fetch available balance:", err);
    }
  }, [balanceTypes]);

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
  }, [fetchLatestBalance]); // Fetch balance when types are loaded or component mounts

  const handleDoubleClick = () => {
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

  const handleSubmitUpdate = async () => {
    setLoading(true);
    try {
      const balancesToUpdate = balanceTypes.map(type => ({
        balance_type_id: type.balance_type_id,
        amount: parseFloat(currentInputBalances[type.balance_type_id] || 0)
      }));

      await http.post('/balance/available/update-balance', { balances: balancesToUpdate });
      handleCloseModal();
      fetchLatestBalance(); // Refresh display
    } catch (err) {
      console.error('Fout bij bijwerken vermogen:', err);
      setError('Fout bij het bijwerken. Probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div onDoubleClick={handleDoubleClick} className="cursor-pointer select-none" title="Dubbelklik om aan te passen">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Beschikbaar</span>
      <p className="text-lg font-bold text-green-600">
        €{balance.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>

      {/* Modal voor aanpassen */}
      {showUpdateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="bg-white p-5 rounded-lg shadow-xl w-96">
            <h3 className="text-lg font-bold mb-4">Pas Beschikbaar Vermogen Aan</h3>
            {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
            <div className="space-y-3">
              {balanceTypes.map(type => (
                <div key={type.balance_type_id}>
                  <label className="block text-sm font-medium text-gray-700">{type.type_name}</label>
                  <input
                    type="text"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    value={currentInputBalances[type.balance_type_id] || ''}
                    onChange={(e) => handleInputChange(type.balance_type_id, e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end space-x-2">
              <button onClick={handleCloseModal} className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400">Annuleren</button>
              <button onClick={handleSubmitUpdate} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Opslaan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HeaderBalanceDisplay;

import React, { useState, useEffect } from 'react';

const InvestedBalanceDisplay = () => {
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    // Pas dit endpoint aan naar je eigen API voor geïnvesteerd vermogen
    fetch('http://localhost:5000/api/balance/invested')
      .then(res => res.json())
      .then(data => setBalance(data.investedBalance))
      .catch(err => console.error("Failed to fetch invested balance:", err));
  }, []);

  return (
    <div className="pl-4">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Geïnvesteerd</span>
      <p className="text-lg font-bold text-blue-600">
        €{balance.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
};

export default InvestedBalanceDisplay;

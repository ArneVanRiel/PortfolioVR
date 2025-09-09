import React, { useState, useEffect } from 'react';

const HeaderBalanceDisplay = () => {
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    // Pas dit endpoint aan naar je eigen API voor beschikbaar vermogen
    fetch('http://localhost:5000/api/balance/available')
      .then(res => res.json())
      .then(data => setBalance(data.availableBalance))
      .catch(err => console.error("Failed to fetch available balance:", err));
  }, []);

  return (
    <div>
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Beschikbaar</span>
      <p className="text-lg font-bold text-green-600">
        €{balance.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
};

export default HeaderBalanceDisplay;

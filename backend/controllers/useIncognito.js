import { useState, useEffect } from 'react';

export const useIncognito = () => {
  const [isIncognito, setIsIncognito] = useState(
    localStorage.getItem('role') === 'demo' || localStorage.getItem('incognito') === 'true'
  );

  useEffect(() => {
    const handlePrivacyChange = () => {
      setIsIncognito(localStorage.getItem('role') === 'demo' || localStorage.getItem('incognito') === 'true');
    };

    window.addEventListener('privacyToggle', handlePrivacyChange);
    return () => window.removeEventListener('privacyToggle', handlePrivacyChange);
  }, []);

  return isIncognito;
};
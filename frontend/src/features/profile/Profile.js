import React, { useState, useEffect, useCallback } from 'react';
import http from '../../http-common';
import toast from 'react-hot-toast';

const Profile = () => {
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [currency, setCurrency] = useState('EUR');
  const [exchangeRate, setExchangeRate] = useState(1.0);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [linkedProviders, setLinkedProviders] = useState([]);
  const [preferredMethod, setPreferredMethod] = useState('password');
  const [strategyMode, setStrategyMode] = useState(localStorage.getItem('strategy_mode') || 'arne_advies');
  const [role, setRole] = useState(localStorage.getItem('role') || 'user');
  const [allowFractionalShares, setAllowFractionalShares] = useState(true);
  const [minOrderAmount, setMinOrderAmount] = useState(100);
  const [minOrderSkipThreshold, setMinOrderSkipThreshold] = useState(50);
  const [transactionFee, setTransactionFee] = useState(1.0);
  const [taxRatePct, setTaxRatePct] = useState(0.35);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const userId = localStorage.getItem('userID') || 1; // Haal de ingelogde userID op
  const isAdmin = Number(userId) === 1 || role === 'admin';

  const fetchProfile = useCallback(async () => {
    try {
      const res = await http.get(`/auth/profile/${userId}`);
      setUsername(res.data.username || '');
      setCurrency(res.data.default_currency || 'EUR');
      setExchangeRate(res.data.manual_exchange_rate || 1.0);
      setPreferredMethod(res.data.preferred_login_method || 'password');
      setLinkedProviders(res.data.linkedProviders || []);
      if (res.data.allow_fractional_shares !== undefined) {
        setAllowFractionalShares(res.data.allow_fractional_shares !== false);
      }
      if (res.data.min_order_amount !== undefined && res.data.min_order_amount !== null) {
        setMinOrderAmount(res.data.min_order_amount);
      }
      if (res.data.min_order_skip_threshold !== undefined && res.data.min_order_skip_threshold !== null) {
        setMinOrderSkipThreshold(res.data.min_order_skip_threshold);
      }
      if (res.data.transaction_fee !== undefined && res.data.transaction_fee !== null) {
        setTransactionFee(res.data.transaction_fee);
      }
      if (res.data.tax_rate_pct !== undefined && res.data.tax_rate_pct !== null) {
        setTaxRatePct(res.data.tax_rate_pct);
      }
      if (res.data.strategy_mode) {
        setStrategyMode(res.data.strategy_mode);
        localStorage.setItem('strategy_mode', res.data.strategy_mode);
      }
      if (res.data.role) {
        setRole(res.data.role);
        localStorage.setItem('role', res.data.role);
      }
      if (res.data.permissions) {
        localStorage.setItem('user_permissions', JSON.stringify(res.data.permissions));
      }
    } catch (err) {
      console.error('Fout bij laden profiel:', err);
      toast.error('Fout bij laden profiel.', { id: 'profile-load-error' });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const handleModeSwitch = async (newMode) => {
    if (isAdmin || newMode === strategyMode) return;
    setUpdating(true);
    try {
      const res = await http.put('/auth/mode', { strategy_mode: newMode });
      setStrategyMode(res.data.strategy_mode);
      localStorage.setItem('strategy_mode', res.data.strategy_mode);
      if (res.data.permissions) {
        localStorage.setItem('user_permissions', JSON.stringify(res.data.permissions));
      }
      window.dispatchEvent(new Event('authChanged'));
      toast.success(res.data.message || 'Gebruiksmodus bijgewerkt!');
    } catch (err) {
      console.error('Fout bij wijzigen gebruiksmodus:', err);
      toast.error(err.response?.data?.message || 'Kon gebruiksmodus niet wijzigen.');
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Google SDK initialisatie voor koppelen
  useEffect(() => {
    if (loading) return;
    
    const isGoogleLinked = linkedProviders.includes('google');
    if (!isGoogleLinked && window.google) {
      try {
        window.google.accounts.id.initialize({
          client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID || 'your_google_client_id.apps.googleusercontent.com',
          callback: handleGoogleLinkResponse
        });
        
        setTimeout(() => {
          const container = document.getElementById("google-link-btn-container");
          if (container) {
            window.google.accounts.id.renderButton(
              container,
              { 
                theme: "outline", 
                size: "medium", 
                text: "continue_with",
                shape: "rectangular" 
              }
            );
          }
        }, 100);
      } catch (err) {
        console.error("Fout bij initialiseren Google SDK:", err);
      }
    }
  }, [linkedProviders, loading]);

  const handleGoogleLinkResponse = async (response) => {
    if (!response.credential) return;
    setUpdating(true);
    try {
      const res = await http.post(`/auth/google/link`, { token: response.credential });
      toast.success(res.data.message || 'Google-account gekoppeld.');
      await fetchProfile();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Fout bij koppelen Google-account.');
    } finally {
      setUpdating(false);
    }
  };

  const handleMicrosoftLink = () => {
    const clientId = process.env.REACT_APP_MICROSOFT_CLIENT_ID || 'your_microsoft_client_id';
    const redirectUri = encodeURIComponent(window.location.origin + '/microsoft-callback');
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}&scope=openid%20profile%20User.Read`;
    
    const width = 600;
    const height = 650;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    const popup = window.open(
      authUrl,
      'MicrosoftLinkPopup',
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
    );
    
    if (!popup) {
      toast.error('Popup blocker is actief. Sta popups toe voor deze website.');
      return;
    }

    const handleMessage = async (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === 'microsoft-token') {
        const token = event.data.token;
        window.removeEventListener('message', handleMessage);
        
        setUpdating(true);
        try {
          const res = await http.post(`/auth/microsoft/link`, { token });
          toast.success(res.data.message || 'Microsoft-account gekoppeld.');
          await fetchProfile();
        } catch (err) {
          console.error(err);
          toast.error(err.response?.data?.message || 'Fout bij koppelen Microsoft-account.');
        } finally {
          setUpdating(false);
        }
      } else if (event.data && event.data.type === 'microsoft-error') {
        window.removeEventListener('message', handleMessage);
        toast.error(event.data.description || 'Koppelen geannuleerd.');
      }
    };

    window.addEventListener('message', handleMessage);
  };

  const handleUnlink = async (provider) => {
    if (!window.confirm(`Weet je zeker dat je jouw ${provider === 'google' ? 'Google' : 'Microsoft'}-account wilt ontkoppelen?`)) {
      return;
    }
    setUpdating(true);
    try {
      const res = await http.delete(`/auth/provider/${provider}`);
      toast.success(res.data.message || 'Account ontkoppeld.');
      await fetchProfile();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Fout bij ontkoppelen.');
    } finally {
      setUpdating(false);
    }
  };

  const handlePreferenceChange = async (method) => {
    setUpdating(true);
    try {
      await http.put(`/auth/preference`, { preferredMethod: method });
      toast.success('Inlogvoorkeur bijgewerkt.');
      localStorage.setItem('preferredLoginMethod', method);
      setPreferredMethod(method);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Fout bij bijwerken voorkeur.');
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    try {
      await http.put(`/auth/profile/${userId}`, {
        username,
        default_currency: currency,
        manual_exchange_rate: exchangeRate,
        allow_fractional_shares: allowFractionalShares,
        min_order_amount: Number(minOrderAmount),
        min_order_skip_threshold: Number(minOrderSkipThreshold),
        transaction_fee: Number(transactionFee),
        tax_rate_pct: Number(taxRatePct)
      });
      localStorage.setItem('username', username); // Update lokale opslag zodat de header klopt
      toast.success('Algemene & broker instellingen succesvol opgeslagen!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Fout bij opslaan profiel.');
    }
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    try {
      await http.put(`/auth/password/${userId}`, { currentPassword, newPassword });
      toast.success('Wachtwoord succesvol gewijzigd!');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Fout bij wijzigen wachtwoord.');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Profiel laden...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Mijn Profiel</h1>

      {/* Gebruiksmodus (Modus 1 vs Modus 2) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4 border-b pb-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Mijn Gebruiksmodus</h2>
            <p className="text-sm text-gray-500">
              Kies hoe je PortfolioVR wilt gebruiken: puur als overzichtelijke portfolio tracker, of inclusief automatische koop-, verkoop- en herbalanceermeldingen.
            </p>
          </div>
          {isAdmin && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 self-start md:self-center">
              👑 Ontwikkelaar (User 1 — Volledige Toegang)
            </span>
          )}
        </div>

        {isAdmin ? (
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-sm text-amber-900">
            Als hoofdbeheerder (<strong>User 1</strong>) heb je altijd toegang tot alle modules, inclusief onderliggende DCF-formules, waardeverdelingen, de Screener en systeeminstellingen. Via <strong>Instellingen &rarr; Gebruikers &amp; Toegangsbeheer</strong> kun je voor andere gebruikers instellen of zij Modus 1 of Modus 2 gebruiken.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Modus 1: Enkel Portfolio Tracking */}
            <button
              type="button"
              disabled={updating}
              onClick={() => handleModeSwitch('portfolio_only')}
              className={`text-left p-5 rounded-xl border-2 transition-all flex flex-col justify-between ${
                strategyMode === 'portfolio_only'
                  ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-bold text-gray-900">📊 Modus 1: Enkel Portfolio Bijhouden</span>
                  {strategyMode === 'portfolio_only' && (
                    <span className="text-xs font-bold bg-blue-600 text-white px-2.5 py-0.5 rounded-full">Actief</span>
                  )}
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Gebruik de app puur om je eigen aandelen, rendement (incl. S&amp;P 500 vergelijking), dividenden, spreiding, transacties en Belgische belastingen (TOB &amp; Meerwaardebelasting 2026) overzichtelijk bij te houden — zonder strategie-advies of meldingen.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-1.5">
                <span className="text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">✓ Eigen Portefeuille &amp; Kas</span>
                <span className="text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">✓ Rendement &amp; Dividenden</span>
                <span className="text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">✓ Belastingen &amp; Transacties</span>
              </div>
            </button>

            {/* Modus 2: Arne's Strategie als Black-Box */}
            <button
              type="button"
              disabled={updating}
              onClick={() => handleModeSwitch('arne_advies')}
              className={`text-left p-5 rounded-xl border-2 transition-all flex flex-col justify-between ${
                strategyMode === 'arne_advies'
                  ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-bold text-gray-900">⚡ Modus 2: Portfolio + Strategie Advies</span>
                  {strategyMode === 'arne_advies' && (
                    <span className="text-xs font-bold bg-indigo-600 text-white px-2.5 py-0.5 rounded-full">Actief</span>
                  )}
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Alles uit Modus 1, aangevuld met objectieve, datagedreven koop-, verkoop- en herbalanceeradviezen berekend op jouw eigen portefeuille en beschikbare cash — zodat je zonder emotie beslissingen kunt nemen.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-1.5">
                <span className="text-[11px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-medium">✓ Concrete Koop/Verkoop Acties</span>
                <span className="text-[11px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-medium">✓ Persoonlijk Advies op Eigen Cash</span>
                <span className="text-[11px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-medium">✓ Strategie Meldingen</span>
              </div>
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Algemene Instellingen */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">Algemene Instellingen</h2>
          <form onSubmit={handleSaveGeneral} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gebruikersnaam</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Standaard Valuta</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              >
                <option value="EUR">EUR (€)</option>
                <option value="USD">USD ($)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">Deze valuta wordt als standaard gebruikt in de gehele applicatie.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Handmatige Wisselkoers (Conversiefactor)</label>
              <input
                type="number"
                step="0.0001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
              <p className="text-xs text-gray-500 mt-1">Vul in hoeveel de ene munt waard is in de andere (bijv. 1 USD = 0.86 EUR &rarr; vul 0.86 in).</p>
            </div>

            {/* Broker & Order Instellingen (Fractionele Aandelen) */}
            <div className="pt-4 border-t border-gray-200/80 space-y-4">
              <div>
                <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <span>🏦 Broker &amp; Order Instellingen</span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">Nieuw</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Stel in hoe de Strategie Assistent orders voor jou berekent. Dit verschilt per broker (bijv. Trade Republic/eToro bieden deelaandelen, Degiro/Bolero vaak enkel hele aandelen).
                </p>
              </div>

              {/* Checkbox Deelaandelen */}
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allowFractionalShares}
                    onChange={(e) => setAllowFractionalShares(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                  />
                  <div>
                    <span className="text-sm font-bold text-gray-800 block">
                      Deelaandelen (Fractionele Orders) Toestaan
                    </span>
                    <span className="text-xs text-gray-500 leading-relaxed block mt-0.5">
                      Wanneer ingeschakeld, worden aankoop- en verkooporders automatisch <strong>afgerond op 0,1 stuks</strong> (geen gekke kommagetallen). Zo blijft cash minder lang onbenut en kun je ook met kleinere bedragen instappen in dure aandelen.
                    </span>
                  </div>
                </label>
              </div>

              {/* Order Drempels */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum Orderbedrag (€)
                  </label>
                  <input
                    type="number"
                    min="10"
                    step="10"
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Standaard <strong>€ 100</strong>. Bedragen net boven de ondergrens worden afgerond naar dit bedrag om effectieve transacties te behouden.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ondergrens / Niet Kopen onder (€)
                  </label>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={minOrderSkipThreshold}
                    onChange={(e) => setMinOrderSkipThreshold(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Standaard <strong>€ 50</strong>. Orders onder deze drempel worden overgeslagen zodat transactiekosten niet te zwaar doorwegen.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Transactiekost per Order (€)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={transactionFee}
                    onChange={(e) => setTransactionFee(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Vast tarief van je broker (bv. <strong>€ 1.00</strong> bij Trade Republic, <strong>€ 2.50</strong> bij Degiro, <strong>€ 7.50</strong> bij Bolero).
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Beurstaks / TOB Tarief (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.05"
                    value={taxRatePct}
                    onChange={(e) => setTaxRatePct(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Standaard <strong>0,35%</strong> (Belgische taks op beursverrichtingen voor aandelen, 0% voor NL beleggers).
                  </p>
                </div>
              </div>
            </div>

            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium">
              Wijzigingen Opslaan
            </button>
          </form>
        </div>

        {/* Gekoppelde Accounts */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">Externe Inlogmethodes</h2>
          <p className="text-sm text-gray-500 mb-6">
            Koppel externe accounts om direct in te loggen zonder verificatiemail.
          </p>

          <div className="space-y-6">
            {/* Google */}
            <div className="flex flex-col gap-2 p-3 border border-gray-100 rounded-lg bg-gray-50/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Google</span>
                  {linkedProviders.includes('google') ? (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">Gekoppeld</span>
                  ) : (
                    <span className="text-xs bg-gray-200 text-gray-800 px-2 py-0.5 rounded-full font-medium">Niet gekoppeld</span>
                  )}
                </div>
                {linkedProviders.includes('google') && (
                  <button 
                    disabled={updating}
                    onClick={() => handleUnlink('google')}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Ontkoppelen
                  </button>
                )}
              </div>
              {!linkedProviders.includes('google') && (
                <div id="google-link-btn-container" className="mt-1"></div>
              )}
            </div>

            {/* Microsoft */}
            <div className="flex flex-col gap-2 p-3 border border-gray-100 rounded-lg bg-gray-50/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Microsoft</span>
                  {linkedProviders.includes('microsoft') ? (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">Gekoppeld</span>
                  ) : (
                    <span className="text-xs bg-gray-200 text-gray-800 px-2 py-0.5 rounded-full font-medium">Niet gekoppeld</span>
                  )}
                </div>
                {linkedProviders.includes('microsoft') && (
                  <button 
                    disabled={updating}
                    onClick={() => handleUnlink('microsoft')}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Ontkoppelen
                  </button>
                )}
              </div>
              {!linkedProviders.includes('microsoft') && (
                <button
                  type="button"
                  disabled={updating}
                  onClick={handleMicrosoftLink}
                  className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 font-semibold py-1.5 rounded hover:bg-gray-50 transition-colors shadow-sm text-xs mt-1"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 23 23">
                    <path fill="#f3f2f1" d="M0 0h23v23H0z"/>
                    <path fill="#f25022" d="M1 1h10v10H1z"/>
                    <path fill="#7fba00" d="M12 1h10v10H12z"/>
                    <path fill="#01a4eff" d="M1 12h10v10H1z"/>
                    <path fill="#ffb900" d="M12 12h10v10H12z"/>
                  </svg>
                  Koppel Microsoft
                </button>
              )}
            </div>

            {/* Voorkeur Selectie */}
            {(linkedProviders.length > 0 || preferredMethod !== 'password') && (
              <div className="border-t pt-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Voorkeur inlogmethode</label>
                <select
                  value={preferredMethod}
                  disabled={updating}
                  onChange={(e) => handlePreferenceChange(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                >
                  <option value="password">Wachtwoord + E-mail OTP</option>
                  {linkedProviders.includes('google') && <option value="google">Google</option>}
                  {linkedProviders.includes('microsoft') && <option value="microsoft">Microsoft</option>}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Wachtwoord Wijzigen */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">Beveiliging</h2>
          <form onSubmit={handleSavePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Huidig Wachtwoord</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nieuw Wachtwoord</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium">
              Wachtwoord Bijwerken
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Profile;

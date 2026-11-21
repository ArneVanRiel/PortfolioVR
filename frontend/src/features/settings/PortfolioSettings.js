import React, { useState, useEffect, useCallback } from 'react';
import http from '../../http-common';
import toast from 'react-hot-toast';
import AvailableBalance from '../dashboard/AvailableBalance';

const PortfolioSettings = () => {
  const [currency, setCurrency] = useState('EUR');
  const [exchangeRate, setExchangeRate] = useState(1.0);
  const [allowFractionalShares, setAllowFractionalShares] = useState(true);
  const [minOrderAmount, setMinOrderAmount] = useState(100);
  const [minOrderSkipThreshold, setMinOrderSkipThreshold] = useState(50);
  const [transactionFee, setTransactionFee] = useState(1.0);
  const [taxRatePct, setTaxRatePct] = useState(0.35);
  const [strategyMode, setStrategyMode] = useState(localStorage.getItem('strategy_mode') || 'arne_advies');
  const [role, setRole] = useState(localStorage.getItem('role') || 'user');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingMode, setUpdatingMode] = useState(false);

  const userId = localStorage.getItem('userID') || 1;
  const isAdmin = Number(userId) === 1 || role === 'admin';

  const fetchSettings = useCallback(async () => {
    try {
      const res = await http.get(`/auth/profile/${userId}`);
      setCurrency(res.data.default_currency || 'EUR');
      setExchangeRate(res.data.manual_exchange_rate || 1.0);
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
    } catch (err) {
      console.error('Fout bij laden van portfolio-instellingen:', err);
      toast.error('Kon portfolio-instellingen niet laden.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSavePortfolioSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await http.put(`/auth/profile/${userId}`, {
        default_currency: currency,
        manual_exchange_rate: exchangeRate,
        allow_fractional_shares: allowFractionalShares,
        min_order_amount: Number(minOrderAmount),
        min_order_skip_threshold: Number(minOrderSkipThreshold),
        transaction_fee: Number(transactionFee),
        tax_rate_pct: Number(taxRatePct)
      });
      localStorage.setItem('preferred_currency', currency);
      toast.success('Portfolio- en brokerinstellingen succesvol opgeslagen!');
    } catch (err) {
      console.error('Fout bij opslaan:', err);
      toast.error(err.response?.data?.message || 'Fout bij opslaan instellingen.');
    } finally {
      setSaving(false);
    }
  };

  const handleModeSwitch = async (newMode) => {
    if (isAdmin || newMode === strategyMode) return;
    setUpdatingMode(true);
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
      setUpdatingMode(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Portfolio-instellingen laden...</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Pagina Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2.5">
            <i className="ph-fill ph-sliders text-blue-600"></i>
            Portfolio-instellingen
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Beheer hier jouw persoonlijke valuta, broker- &amp; orderinstellingen en beschikbaar cash vermogen.
          </p>
        </div>
      </div>

      {/* 1. Financiën & Beschikbaar Vermogen (Persoonlijk Cashbeheer) */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <AvailableBalance />
      </div>

      {/* 2. Valuta, Broker & Order Instellingen Formulier */}
      <form onSubmit={handleSavePortfolioSettings} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Valuta & Wisselkoers */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                <i className="ph-fill ph-currency-circle-dollar text-blue-600 text-xl"></i>
                <h2 className="text-lg font-bold text-gray-900">Standaardvaluta &amp; Wisselkoers</h2>
              </div>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                Stel de basisvaluta in voor je portefeuilleoverzichten en analyses.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Standaard Valuta
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white font-semibold text-gray-800"
                  >
                    <option value="EUR">EUR (€) — Euro</option>
                    <option value="USD">USD ($) — Amerikaanse Dollar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Handmatige Wisselkoers (Conversiefactor)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Bijv. 1 USD = 0.86 EUR &rarr; vul 0.86 in. Wordt gebruikt voor historische wisselkoersomrekeningen.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Broker Regels: Deelaandelen */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                <i className="ph-fill ph-chart-pie-slice text-indigo-600 text-xl"></i>
                <h2 className="text-lg font-bold text-gray-900">Orderberekening &amp; Deelaandelen</h2>
              </div>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                Kies of de Strategie Assistent hele of deelaandelen moet voorstellen op basis van jouw broker.
              </p>

              {/* Checkbox Deelaandelen */}
              <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-200">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allowFractionalShares}
                    onChange={(e) => setAllowFractionalShares(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                  />
                  <div>
                    <span className="text-sm font-bold text-gray-900 block">
                      Deelaandelen (Fractionele Orders) Toestaan
                    </span>
                    <span className="text-xs text-gray-500 leading-relaxed block mt-1">
                      Wanneer ingeschakeld, worden aankoop- en verkooporders automatisch <strong>afgerond op 0,1 stuks</strong> (bv. bij Trade Republic of eToro). Zet dit uit als je broker enkel hele aandelen toestaat (bv. DEGIRO of Bolero).
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Drempels & Kosten */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
            <i className="ph-fill ph-calculator text-emerald-600 text-xl"></i>
            <h2 className="text-lg font-bold text-gray-900">Orderdrempels &amp; Transactiekosten</h2>
          </div>
          <p className="text-xs text-gray-500 mb-5">
            Deze parameters zorgen ervoor dat er geen oneconomisch kleine orders worden berekend.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Minimum Orderbedrag (€)
              </label>
              <input
                type="number"
                min="10"
                step="10"
                value={minOrderAmount}
                onChange={(e) => setMinOrderAmount(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Standaard <strong>€ 100</strong>. Orders net boven de ondergrens worden afgerond naar dit bedrag.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Ondergrens / Niet Kopen onder (€)
              </label>
              <input
                type="number"
                min="5"
                step="5"
                value={minOrderSkipThreshold}
                onChange={(e) => setMinOrderSkipThreshold(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Standaard <strong>€ 50</strong>. Orders onder deze drempel worden overgeslagen.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Transactiekost per Order (€)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={transactionFee}
                onChange={(e) => setTransactionFee(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Vast tarief van je broker (bv. € 1 bij Trade Republic, € 2.50 bij DEGIRO).
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Beurstaks / TOB Tarief (%)
              </label>
              <input
                type="number"
                min="0"
                step="0.05"
                value={taxRatePct}
                onChange={(e) => setTaxRatePct(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Standaard <strong>0,35%</strong> (Belgische beurstaks voor aandelen).
              </p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <i className="ph-bold ph-floppy-disk"></i>
              {saving ? 'Opslaan...' : 'Instellingen Opslaan'}
            </button>
          </div>
        </div>
      </form>

      {/* 3. Gebruiksmodus (Modus 1 vs Modus 2) */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4 border-b pb-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Mijn Gebruiksmodus</h2>
            <p className="text-sm text-gray-500">
              Kies hoe je PortfolioVR wilt gebruiken: puur als portfolio tracker of inclusief datagedreven advies.
            </p>
          </div>
          {isAdmin && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 self-start md:self-center">
              👑 Beheerder (User 1 — Volledige Toegang)
            </span>
          )}
        </div>

        {isAdmin ? (
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-sm text-amber-900">
            Als beheerder (<strong>User 1</strong>) heb je altijd toegang tot alle modules en formules. Voor overige gebruikers beheer je de rechten centraal via het <strong>Beheerderspaneel</strong> in de zijbalk.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Modus 1: Enkel Portfolio Tracking */}
            <button
              type="button"
              disabled={updatingMode}
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
                  Gebruik de app puur om je eigen aandelen, rendement, dividenden, spreiding, transacties en Belgische belastingen overzichtelijk bij te houden — zonder strategie-advies of koop/verkoopmeldingen.
                </p>
              </div>
            </button>

            {/* Modus 2: Portfolio + Advies */}
            <button
              type="button"
              disabled={updatingMode}
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
                  Alles uit Modus 1, aangevuld met objectieve, datagedreven koop-, verkoop- en herbalanceeradviezen berekend op jouw eigen portefeuille en cash.
                </p>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioSettings;

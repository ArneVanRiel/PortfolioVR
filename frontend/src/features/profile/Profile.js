import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const Profile = () => {
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [currency, setCurrency] = useState('EUR');
  const [exchangeRate, setExchangeRate] = useState(1.0);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [loading, setLoading] = useState(true);
  const userId = localStorage.getItem('userID'); // Haal de ingelogde userID op

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/auth/profile/${userId}`);
        setUsername(res.data.username || '');
        setCurrency(res.data.default_currency || 'EUR');
        setExchangeRate(res.data.manual_exchange_rate || 1.0);
      } catch (err) {
        toast.error('Fout bij laden profiel.');
      } finally {
        setLoading(false);
      }
    };
    if (userId) fetchProfile();
  }, [userId]);

  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`http://localhost:5000/api/auth/profile/${userId}`, {
        username,
        default_currency: currency,
        manual_exchange_rate: exchangeRate
      });
      localStorage.setItem('username', username); // Update lokale opslag zodat de header klopt
      toast.success('Algemene instellingen succesvol opgeslagen!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Fout bij opslaan profiel.');
    }
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`http://localhost:5000/api/auth/password/${userId}`, { currentPassword, newPassword });
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Algemene Instellingen */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
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
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium">
              Wijzigingen Opslaan
            </button>
          </form>
        </div>

        {/* Wachtwoord Wijzigen */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
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

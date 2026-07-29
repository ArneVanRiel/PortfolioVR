import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const Profile = () => {
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [currency, setCurrency] = useState('EUR');
  const [exchangeRate, setExchangeRate] = useState(1.0);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [linkedProviders, setLinkedProviders] = useState([]);
  const [preferredMethod, setPreferredMethod] = useState('password');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const userId = localStorage.getItem('userID'); // Haal de ingelogde userID op

  const fetchProfile = async () => {
    try {
      const res = await axios.get(`${API_URL}/auth/profile/${userId}`);
      setUsername(res.data.username || '');
      setCurrency(res.data.default_currency || 'EUR');
      setExchangeRate(res.data.manual_exchange_rate || 1.0);
      setPreferredMethod(res.data.preferred_login_method || 'password');
      setLinkedProviders(res.data.linkedProviders || []);
    } catch (err) {
      toast.error('Fout bij laden profiel.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) fetchProfile();
  }, [userId]);

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
                text: "signup_with",
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
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/auth/google/link`, 
        { token: response.credential },
        { headers: { Authorization: `Bearer ${token}` } }
      );
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
          const jwtToken = localStorage.getItem('token');
          const res = await axios.post(`${API_URL}/auth/microsoft/link`, 
            { token },
            { headers: { Authorization: `Bearer ${jwtToken}` } }
          );
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
      const token = localStorage.getItem('token');
      const res = await axios.delete(`${API_URL}/auth/provider/${provider}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/auth/preference`, 
        { preferredMethod: method },
        { headers: { Authorization: `Bearer ${token}` } }
      );
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
      await axios.put(`${API_URL}/auth/profile/${userId}`, {
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
      await axios.put(`${API_URL}/auth/password/${userId}`, { currentPassword, newPassword });
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

import React, { useState, useEffect, useCallback } from 'react';
import http from '../../http-common';
import toast from 'react-hot-toast';

const Profile = () => {
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [email, setEmail] = useState('');
  const [activeAccountTab, setActiveAccountTab] = useState('gegevens'); // 'gegevens' | 'taal' | 'abonnement'
  const [editingField, setEditingField] = useState(null); // 'name' | 'email' | null
  const [tempVal, setTempVal] = useState('');
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [linkedProviders, setLinkedProviders] = useState([]);
  const [preferredMethod, setPreferredMethod] = useState('password');
  const [role, setRole] = useState(localStorage.getItem('role') || 'user');
  
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const userId = localStorage.getItem('userID') || 1;
  const isAdmin = Number(userId) === 1 || role === 'admin';

  const fetchProfile = useCallback(async () => {
    try {
      const res = await http.get(`/auth/profile/${userId}`);
      setUsername(res.data.username || '');
      setEmail(res.data.email || '');
      setPreferredMethod(res.data.preferred_login_method || 'password');
      setLinkedProviders(res.data.linkedProviders || []);
      if (res.data.role) {
        setRole(res.data.role);
        localStorage.setItem('role', res.data.role);
      }
    } catch (err) {
      console.error('Fout bij laden profiel:', err);
      toast.error('Fout bij laden van profielgegevens.', { id: 'profile-load-error' });
    } finally {
      setLoading(false);
    }
  }, [userId]);

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

  const handleQuickSaveField = async (field) => {
    setUpdating(true);
    try {
      const updatedUsername = field === 'name' ? tempVal.trim() : username;
      const updatedEmail = field === 'email' ? tempVal.trim() : email;
      
      await http.put(`/auth/profile/${userId}`, {
        username: updatedUsername,
        email: updatedEmail
      });
      if (field === 'name') {
        setUsername(updatedUsername);
        localStorage.setItem('username', updatedUsername);
        window.dispatchEvent(new Event('authChanged'));
      }
      if (field === 'email') {
        setEmail(updatedEmail);
      }
      setEditingField(null);
      toast.success(`${field === 'name' ? 'Naam' : 'E-mailadres'} succesvol bijgewerkt!`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Fout bij opslaan.');
    } finally {
      setUpdating(false);
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
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <h1 className="text-3xl font-bold text-gray-900">Mijn Profiel</h1>

      {/* Account & Basisgegevens (Screenshot 4 stijl) */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-2xl font-extrabold text-gray-900 mb-4">Account</h2>

        {/* Tabs: Gegevens | Taal & regio | Abonnement */}
        <div className="flex border-b border-gray-200 mb-6 gap-6 text-sm font-semibold">
          <button
            onClick={() => setActiveAccountTab('gegevens')}
            className={`pb-3 border-b-2 transition-colors ${
              activeAccountTab === 'gegevens'
                ? 'border-blue-600 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Gegevens
          </button>
          <button
            onClick={() => setActiveAccountTab('taal')}
            className={`pb-3 border-b-2 transition-colors ${
              activeAccountTab === 'taal'
                ? 'border-blue-600 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Taal &amp; regio
          </button>
          <button
            onClick={() => setActiveAccountTab('abonnement')}
            className={`pb-3 border-b-2 transition-colors ${
              activeAccountTab === 'abonnement'
                ? 'border-blue-600 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Abonnement
          </button>
        </div>

        {activeAccountTab === 'gegevens' && (
          <div className="space-y-6">
            {/* Profielfoto rij */}
            <div className="flex items-center gap-5 pb-6 border-b border-gray-100">
              <div className="relative">
                <img
                  className="h-20 w-20 rounded-full object-cover shadow-inner ring-4 ring-blue-100"
                  src={`https://ui-avatars.com/api/?name=${(username || 'Arne').replace(' ', '+')}&background=1e40af&color=fff&size=128&bold=true`}
                  alt="Avatar"
                />
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => toast('Profielfoto uploaden wordt binnenkort ondersteund.', { icon: '📸' })}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-semibold rounded-xl transition-colors shadow-sm"
                >
                  Profielfoto uploaden
                </button>
                <p className="text-xs text-gray-400 mt-1">Aanbevolen: JPG of PNG, minimaal 200x200px</p>
              </div>
            </div>

            {/* Naam */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div className="flex-grow mr-4">
                <div className="text-xs font-medium text-gray-500">Naam</div>
                {editingField === 'name' ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="text"
                      value={tempVal}
                      onChange={e => setTempVal(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-blue-400 rounded-lg outline-none ring-2 ring-blue-100 bg-white"
                    />
                    <button
                      disabled={updating}
                      onClick={() => handleQuickSaveField('name')}
                      className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Opslaan
                    </button>
                    <button
                      onClick={() => setEditingField(null)}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                    >
                      Annuleren
                    </button>
                  </div>
                ) : (
                  <div className="text-base font-semibold text-gray-900 mt-0.5">{username || 'Niet ingesteld'}</div>
                )}
              </div>
              {editingField !== 'name' && (
                <button
                  onClick={() => { setEditingField('name'); setTempVal(username); }}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Bewerken
                </button>
              )}
            </div>

            {/* E-mailadres */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div className="flex-grow mr-4">
                <div className="text-xs font-medium text-gray-500">E-mailadres</div>
                {editingField === 'email' ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="email"
                      value={tempVal}
                      onChange={e => setTempVal(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-blue-400 rounded-lg outline-none ring-2 ring-blue-100 bg-white"
                    />
                    <button
                      disabled={updating}
                      onClick={() => handleQuickSaveField('email')}
                      className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Opslaan
                    </button>
                    <button
                      onClick={() => setEditingField(null)}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                    >
                      Annuleren
                    </button>
                  </div>
                ) : (
                  <div className="text-base font-semibold text-gray-900 mt-0.5">{email || 'Nog geen e-mailadres ingesteld'}</div>
                )}
              </div>
              {editingField !== 'email' && (
                <button
                  onClick={() => { setEditingField('email'); setTempVal(email); }}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Bewerken
                </button>
              )}
            </div>

            {/* Wachtwoord */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <div className="text-xs font-medium text-gray-500">Wachtwoord</div>
                <div className="text-base font-semibold text-gray-900 mt-0.5 tracking-widest">••••••••</div>
              </div>
              <a
                href="#security-password-section"
                className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
              >
                Bewerken
              </a>
            </div>

            {/* 2FA (Werkt momenteel nog niet) */}
            <div className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Tweefactorauthenticatie (2FA)</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Beveilig je account extra met een authenticatie code.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 italic">
                  Binnenkort beschikbaar
                </span>
                <button
                  type="button"
                  onClick={() => toast('Tweefactorauthenticatie (2FA) is momenteel nog in ontwikkeling en wordt binnenkort geactiveerd.', { icon: 'ℹ️' })}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Activeren
                </button>
              </div>
            </div>
          </div>
        )}

        {activeAccountTab === 'taal' && (
          <div className="py-4 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Applicatietaal</label>
              <select className="px-4 py-2 border border-gray-300 rounded-xl text-sm bg-white" defaultValue="nl-BE">
                <option value="nl-BE">Nederlands (België)</option>
                <option value="nl-NL">Nederlands (Nederland)</option>
                <option value="en-US">English (US)</option>
              </select>
            </div>
            <p className="text-xs text-gray-400">
              Je valuta en getalnotatie kun je instellen onder <strong>Portfolio-instellingen</strong>.
            </p>
          </div>
        )}

        {activeAccountTab === 'abonnement' && (
          <div className="py-4">
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Huidig Plan</span>
                <h4 className="text-lg font-extrabold text-gray-900 mt-0.5">
                  {isAdmin ? 'PortfolioVR Beheerder & Ontwikkelaar' : 'PortfolioVR Pro Belegger'}
                </h4>
                <p className="text-xs text-gray-600 mt-1">Volledige functionaliteit inclusief realtime updates en alerts.</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-600 text-white shadow-sm">
                Actief
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Inloggen & Beveiliging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Externe Inlogmethodes */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2 border-b pb-2">Externe Inlogmethodes</h2>
            <p className="text-sm text-gray-500 mb-6">
              Koppel externe accounts om direct in te loggen via Single Sign-On.
            </p>

            <div className="space-y-4">
              {/* Google */}
              <div className="flex flex-col gap-2 p-3 border border-gray-100 rounded-xl bg-gray-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-800">Google</span>
                    {linkedProviders.includes('google') ? (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">Gekoppeld</span>
                    ) : (
                      <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-medium">Niet gekoppeld</span>
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
              <div className="flex flex-col gap-2 p-3 border border-gray-100 rounded-xl bg-gray-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-800">Microsoft</span>
                    {linkedProviders.includes('microsoft') ? (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">Gekoppeld</span>
                    ) : (
                      <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-medium">Niet gekoppeld</span>
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
                    className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 font-semibold py-2 rounded-xl hover:bg-gray-50 transition-colors shadow-sm text-xs mt-1"
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
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Voorkeur inlogmethode</label>
                  <select
                    value={preferredMethod}
                    disabled={updating}
                    onChange={(e) => handlePreferenceChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                  >
                    <option value="password">Wachtwoord</option>
                    {linkedProviders.includes('google') && <option value="google">Google</option>}
                    {linkedProviders.includes('microsoft') && <option value="microsoft">Microsoft</option>}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Wachtwoord Wijzigen */}
        <div id="security-password-section" className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2 border-b pb-2">Wachtwoord Wijzigen</h2>
            <p className="text-sm text-gray-500 mb-6">
              Werk hier jouw inlogwachtwoord bij.
            </p>
            <form onSubmit={handleSavePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Huidig Wachtwoord</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Nieuw Wachtwoord</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="pt-2">
                <button type="submit" className="bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shadow-sm font-bold text-sm">
                  Wachtwoord Bijwerken
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;

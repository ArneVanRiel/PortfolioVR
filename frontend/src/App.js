import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';

// Feature-gebaseerde component imports
import http from './http-common';
import Dashboard from './features/dashboard/Dashboard.js';
import Analysis from './features/analysis/Analysis.js';
import StrategyStudioPage from './features/strategy/StrategyStudioPage.js';
import PortfolioManager from './features/portfolio/PortfolioManager.js';
import Settings from './features/settings/settings.js';
import PortfolioSettings from './features/settings/PortfolioSettings.js';
import Profile from './features/profile/Profile.js';
import LoginPageTest from './features/auth/components/loginTest.js';
import MicrosoftCallback from './features/auth/components/MicrosoftCallback.js';

import SearchModal from './components/ui/SearchModal.js';
import FeedbackModal from './components/ui/FeedbackModal.js';
import HeaderBalanceDisplay from './features/dashboard/HeaderBalanceDisplay.js';
import NotificationBell from './components/ui/NotificationBell.js';
import DataStatusIndicator from './components/ui/DataStatusIndicator.js';

// Protected Route Component om onbevoegde toegang te blokkeren
const ProtectedRoute = ({ children }) => {
  // Controleer of de gebruiker is ingelogd d.m.v. het token
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const SidebarLink = ({ to, iconClass, children, isActive, onClick, isSidebarPinned }) => {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`group relative flex items-center transition-all duration-300 ease-in-out ${isActive
        ? 'bg-blue-600 text-white shadow-md'
        : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'
        } ${isSidebarPinned
          ? 'justify-start px-4 py-3 mx-4 rounded-xl'
          : 'justify-center w-12 h-12 mx-auto rounded-xl'
        }`}
    >
      <i className={`${iconClass} text-2xl flex-shrink-0 flex items-center justify-center`}></i>

      {isSidebarPinned ? (
        <span className="ml-3 font-medium whitespace-nowrap">{children}</span>
      ) : (
        <span className="absolute left-14 bg-white text-gray-700 border border-gray-200 shadow-md px-3 py-1 rounded-md text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none">
          {children}
        </span>
      )}
    </Link>
  );
};

const MobileBottomLink = ({ to, iconClass, children, isActive, onClick }) => {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center flex-1 h-full py-1 ${isActive ? 'text-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50 hover:text-blue-600'
        }`}
    >
      <div className={`absolute top-0 left-0 right-0 h-1 bg-blue-600 ${isActive ? 'block' : 'hidden'}`}></div>
      <i className={`${iconClass} text-2xl mb-1 flex-shrink-0 flex items-center justify-center`}></i>
      <span className="text-[10px] font-medium leading-none">{children}</span>
    </Link>
  );
};

const getStoredPermissions = () => {
  const uid = Number(localStorage.getItem('userID'));
  const role = localStorage.getItem('role') || 'user';
  if (uid === 1 || role === 'admin') {
    return {
      canViewDashboard: true,
      canViewPortfolio: true,
      canUseStockStrategy: true,
      canUseEtfStrategy: true,
      canViewAnalysis: true,
      canViewScreener: true,
      canViewFormulas: true,
      canEditSystemData: true,
      canReceiveStrategyAlerts: true,
    };
  }
  try {
    const raw = localStorage.getItem('user_permissions');
    if (raw) return JSON.parse(raw);
  } catch (e) { }
  return {
    canViewDashboard: true,
    canViewPortfolio: true,
    canUseStockStrategy: true,
    canUseEtfStrategy: true,
    canViewAnalysis: true,
    canViewScreener: false,
    canViewFormulas: false,
    canEditSystemData: false,
    canReceiveStrategyAlerts: true,
  };
};

function App() {
  const [userID, setUserID] = useState(() => Number(localStorage.getItem('userID')) || 0);
  const [userRole, setUserRole] = useState(() => localStorage.getItem('role') || 'user');
  const [permissions, setPermissions] = useState(getStoredPermissions);

  const isDemo = userRole === 'demo';
  const isAdmin = userID === 1 || userRole === 'admin';

  const [activeTab, setActiveTab] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [isIncognito, setIsIncognito] = useState(isDemo || localStorage.getItem('incognito') === 'true');
  const location = useLocation();
  const navigate = useNavigate();

  // Synchroniseer bij laden van de app altijd de actuele rechten van de gebruiker vanaf de server
  useEffect(() => {
    const syncAuthSession = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      try {
        const res = await http.get('/auth/me');
        if (res.data) {
          const { userID: uid, role, strategy_mode, permissions: perms, username, default_currency } = res.data;
          localStorage.setItem('userID', uid);
          localStorage.setItem('role', role);
          if (username) localStorage.setItem('username', username);
          if (strategy_mode) localStorage.setItem('strategy_mode', strategy_mode);
          if (default_currency) localStorage.setItem('preferred_currency', default_currency);
          if (perms) localStorage.setItem('user_permissions', JSON.stringify(perms));
          setUserID(Number(uid));
          setUserRole(role);
          setPermissions(getStoredPermissions());
          window.dispatchEvent(new Event('permissionsUpdated'));
        }
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem('token');
          navigate('/login');
        }
      }
    };

    syncAuthSession();
    const onAuthChanged = () => {
      setUserID(Number(localStorage.getItem('userID')) || 0);
      setUserRole(localStorage.getItem('role') || 'user');
      setPermissions(getStoredPermissions());
      syncAuthSession();
    };
    window.addEventListener('authChanged', onAuthChanged);
    return () => window.removeEventListener('authChanged', onAuthChanged);
  }, [navigate]);

  // Functies voor zoekmodal
  const handleOpenSearchModal = () => setShowSearchModal(true);
  const handleCloseSearchModal = () => setShowSearchModal(false);

  // Functie om de actieve tab in te stellen op basis van de URL
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/dashboard')) setActiveTab('Dashboard');
    else if (path.startsWith('/analysis')) setActiveTab('Analysis');
    else if (path.startsWith('/strategy-builder')) setActiveTab('StrategyBuilder');
    else if (path.startsWith('/portfolio-settings')) setActiveTab('PortfolioSettings');
    else if (path.startsWith('/portfolio')) setActiveTab('Portfolio');
    else if (path.startsWith('/settings') || path.startsWith('/admin')) setActiveTab('AdminSettings');
    else if (path.startsWith('/profile')) setActiveTab('Profile');
    else setActiveTab('/dashboard');
  }, [location]);

  // Functie om de gebruiker uit te loggen
  const handleLogout = async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userID');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('strategy_mode');
    localStorage.removeItem('user_permissions');
    setDropdownOpen(false);
    navigate('/login');
  };

  // Nieuwe functie om incognito te togglen en een signaal uit te zenden naar de hele app
  const toggleIncognito = () => {
    const newValue = !isIncognito;
    setIsIncognito(newValue);
    if (!isDemo) {
      localStorage.setItem('incognito', String(newValue));
    }
    window.dispatchEvent(new Event('privacyToggle'));
  };

  // Incognito modus CSS klasse toepassen op de body
  useEffect(() => {
    if (isIncognito || isDemo) {
      document.body.classList.add('incognito-active');
    } else {
      document.body.classList.remove('incognito-active');
    }
  }, [isIncognito, isDemo]);

  const isLoginPage = location.pathname === '/login';
  const user = { name: localStorage.getItem('username') || 'Arne' }; // Ophalen uit auth data

  return (
    <div className="flex flex-col h-screen bg-gray-50/50 font-sans text-gray-900 overflow-hidden">
      {/* Globale CSS voor de incognito modus en scrollbars */}
      <style>{`
        .incognito-active .privacy-blur {
          opacity: 0.6;
          pointer-events: none;
          user-select: none;
          transition: opacity 0.3s ease;
        }
        .incognito-active .incognito-hide {
          display: none !important;
        }
        .incognito-active .incognito-show {
          display: flex !important;
        }
        .incognito-show {
          display: none;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      <Toaster position="top-center" reverseOrder={false} />

      {!isLoginPage && (
        /* Header */
        <header className="flex-shrink-0 z-50 w-full bg-white/90 backdrop-blur-md border-b border-gray-200 transition-all duration-300">
          <div className="w-full flex h-14 items-center justify-between px-3 sm:px-6">
            {/* Linkerzone: Mobiel = ☰ (Deeltabs) + 🔍 | Desktop = Hoofdtabbladen */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Mobiele Hamburger Knop (opent deelmenu) */}
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('togglePortfolioDrawer'))}
                className="md:hidden p-2 text-gray-700 hover:text-blue-600 hover:bg-gray-100 rounded-xl transition-colors"
                title="Deelmenu openen"
                aria-label="Deelmenu"
              >
                <i className="ph-bold ph-list text-2xl"></i>
              </button>

              {/* Mobiele Zoekknop (logo) */}
              <button
                type="button"
                onClick={handleOpenSearchModal}
                className="md:hidden p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-xl transition-colors"
                title="Zoeken"
                aria-label="Zoeken"
              >
                <i className="ph-bold ph-magnifying-glass text-xl"></i>
              </button>

              {/* Desktop Hoofdtabbladen */}
              <nav className="hidden md:flex items-center gap-1 lg:gap-2" aria-label="Hoofdnavigatie">
                {(isAdmin || permissions.canViewPortfolio !== false) && (
                  <Link
                    to="/portfolio"
                    className={`px-3.5 py-1.5 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${
                      location.pathname.startsWith('/portfolio')
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <i className="ph-fill ph-briefcase text-base"></i>
                    <span>Portfolio</span>
                  </Link>
                )}
                {(isAdmin || permissions.canUseStockStrategy !== false || permissions.canViewScreener !== false) && (
                  <Link
                    to="/strategy-builder"
                    className={`px-3.5 py-1.5 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${
                      location.pathname.startsWith('/strategy-builder')
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <i className="ph-fill ph-sliders-horizontal text-base"></i>
                    <span>Strategie builder</span>
                  </Link>
                )}
                {(isAdmin || permissions.canViewAnalysis !== false) && (
                  <Link
                    to="/analysis"
                    className={`px-3.5 py-1.5 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${
                      location.pathname.startsWith('/analysis')
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <i className="ph-fill ph-chart-line-up text-base"></i>
                    <span>Analyse</span>
                  </Link>
                )}
                {(isAdmin || permissions.canViewDashboard !== false) && (
                  <Link
                    to="/dashboard"
                    className={`px-3.5 py-1.5 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${
                      location.pathname === '/dashboard' || location.pathname === '/'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <i className="ph-fill ph-squares-four text-base"></i>
                    <span>Dashboard</span>
                  </Link>
                )}
              </nav>
            </div>

            {/* Middenzone: PortfolioVR Logo (Desktop) */}
            <div className="hidden md:flex items-center justify-center">
              <Link to="/dashboard" className="flex items-center gap-2 group">
                <i className="ph-fill ph-chart-polar text-blue-600 text-2xl lg:text-3xl transition-transform group-hover:scale-110"></i>
                <span className="text-gray-900 font-extrabold text-lg lg:text-xl tracking-tight">
                  Portfolio<span className="text-blue-600">VR</span>
                </span>
              </Link>
            </div>

            {/* Rechterzone: Zoekfunctie, Vermogensdisplay, Meldingen, Gebruikersprofiel */}
            <div className="flex items-center gap-1.5 sm:gap-3 md:gap-4">
              {/* Desktop Zoekfunctie (Logo / compact veld) */}
              <button
                type="button"
                onClick={handleOpenSearchModal}
                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 bg-gray-100 hover:bg-gray-200/80 text-gray-500 hover:text-gray-700 text-xs font-medium transition-all"
                title="Zoeken"
              >
                <i className="ph-bold ph-magnifying-glass text-sm"></i>
                <span>Zoeken</span>
              </button>

              {/* Incognito Knop */}
              {!isDemo && (
                <button
                  onClick={toggleIncognito}
                  className={`p-1.5 sm:p-2 rounded-full transition-colors duration-200 ${
                    isIncognito ? 'bg-blue-100 text-blue-600 shadow-inner' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                  }`}
                  title={isIncognito ? "Privacy modus uitschakelen" : "Privacy modus inschakelen"}
                >
                  <i className={`ph-fill ${isIncognito ? 'ph-eye-slash' : 'ph-eye'} text-lg`}></i>
                </button>
              )}

              {/* Belegd bedrag + Beschikbare cash (mobiel: boven elkaar gestapeld) */}
              <div className="flex items-center space-x-1 sm:space-x-3">
                <HeaderBalanceDisplay />
              </div>

              {/* Data & Sync Status Indicator (op desktop in de header, op mobiel in de zijbalk bij Synchroniseer) */}
              {!isDemo && (
                <div className="hidden lg:flex items-center">
                  <DataStatusIndicator />
                </div>
              )}

              {/* Meldingen element */}
              {!isDemo && (isAdmin || permissions.canReceiveStrategyAlerts !== false) && <NotificationBell />}

              {/* Gebruikersprofiel en dropdown */}
              <div className="relative">
                {/* Onzichtbare overlay om het menu te sluiten als je ernaast klikt */}
                {dropdownOpen && (
                  <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)}></div>
                )}

                {/* Knop met gebruikersnaam en avatar */}
                <div
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDropdownOpen(!dropdownOpen); }}
                  className="relative z-50 flex cursor-pointer items-center space-x-1.5 sm:space-x-2 py-1 sm:py-1.5 px-2 sm:px-3 rounded-full hover:bg-gray-100 border border-gray-200 bg-white shadow-2xs transition-all duration-200 select-none"
                  role="button"
                  id="userDropdown"
                  aria-expanded={dropdownOpen}
                  title="Accountmenu & instellingen"
                >
                  <img
                    className="h-6 w-6 sm:h-7 sm:w-7 rounded-full object-cover ring-2 ring-blue-500/20 shadow-xs"
                    src={`https://ui-avatars.com/api/?name=${user.name.replace(' ', '+')}&background=2563eb&color=fff&bold=true`}
                    alt="User avatar"
                  />
                  <span className="hidden sm:inline font-semibold text-gray-800 text-sm tracking-tight">{user.name}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" className={`bi bi-chevron-down text-gray-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180 text-blue-600' : ''}`} viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
                  </svg>
                </div>

                {/* Dropdown menu */}
                <div
                  className={`absolute right-0 mt-2 w-64 sm:w-72 origin-top-right rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 divide-y divide-gray-100 focus:outline-none transition-all duration-200 transform z-50 overflow-hidden ${
                    dropdownOpen ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 -translate-y-2 scale-95 pointer-events-none'
                  }`}
                  aria-labelledby="userDropdown"
                >
                  {/* Header: Gebruikersnaam + snelle uitloglink zoals op screenshot */}
                  <div className="px-4 py-3 bg-gray-50/70 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-gray-900 text-sm leading-tight">{user.name}</div>
                      <div className="text-[11px] text-gray-500 font-medium mt-0.5">
                        {isAdmin ? '👑 Beheerder' : isDemo ? 'Demo-account' : 'Belegger'}
                      </div>
                    </div>
                    <button
                      onClick={() => { setDropdownOpen(false); handleLogout(); }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                    >
                      Uitloggen
                    </button>
                  </div>

                  {/* Menu Items */}
                  <div className="p-2 space-y-1">
                    {/* Persoonlijk */}
                    <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      Persoonlijk
                    </div>
                    <Link
                      to="/profile"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-gray-700 hover:bg-gray-100 transition-colors text-xs sm:text-sm font-medium"
                    >
                      <i className="ph-fill ph-user text-gray-500 text-base flex-shrink-0"></i>
                      <span>Profiel</span>
                    </Link>

                    {/* Portfolio */}
                    <div className="pt-2 px-2.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-t border-gray-100 mt-1">
                      Portfolio
                    </div>
                    <Link
                      to="/portfolio-settings"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-gray-700 hover:bg-gray-100 transition-colors text-xs sm:text-sm font-medium"
                    >
                      <i className="ph-fill ph-sliders text-gray-500 text-base flex-shrink-0"></i>
                      <span>Instellingen</span>
                    </Link>

                    {/* Tools */}
                    <div className="pt-2 px-2.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-t border-gray-100 mt-1">
                      Tools
                    </div>
                    <div
                      onClick={() => {
                        toast('De pagina Meerwaardebelasting (2026) wordt binnenkort toegevoegd.', {
                          icon: 'ℹ️',
                          id: 'tax-tool-info'
                        });
                        setDropdownOpen(false);
                      }}
                      className="flex items-center justify-between px-2.5 py-2 rounded-xl text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors text-xs sm:text-sm font-medium"
                    >
                      <div className="flex items-center gap-3">
                        <i className="ph-fill ph-calculator text-gray-400 text-base flex-shrink-0"></i>
                        <span>Meerwaardebelasting</span>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
                        Binnenkort
                      </span>
                    </div>

                    {/* Help & feedback */}
                    <div className="pt-2 px-2.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-t border-gray-100 mt-1">
                      Help &amp; Feedback
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        setShowFeedbackModal(true);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-blue-700 hover:bg-blue-50/80 transition-colors text-xs sm:text-sm font-semibold text-left"
                    >
                      <div className="flex items-center gap-3">
                        <i className="ph-fill ph-lightbulb text-amber-500 text-base flex-shrink-0"></i>
                        <span>Feedback &amp; Roadmap</span>
                      </div>
                      <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">
                        Ideeën
                      </span>
                    </button>

                    {/* Beheerderspaneel (Enkel zichtbaar voor Arne / Admin) */}
                    {isAdmin && (
                      <>
                        <div className="pt-2 px-2.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-500 border-t border-gray-100 mt-1">
                          Beheer
                        </div>
                        <Link 
                          to="/admin" 
                          onClick={() => setDropdownOpen(false)} 
                          className="flex items-center gap-3 px-2.5 py-2 rounded-xl text-indigo-700 hover:bg-indigo-50 transition-colors text-xs sm:text-sm font-semibold"
                        >
                          <i className="ph-fill ph-shield-check text-indigo-600 text-base flex-shrink-0"></i>
                          <span>Beheerderspaneel</span>
                        </Link>
                      </>
                    )}

                    {/* Uitloggen onderaan */}
                    <div className="pt-1.5 border-t border-gray-100 mt-1">
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors text-xs sm:text-sm font-medium text-left"
                      >
                        <i className="ph-fill ph-sign-out text-red-500 text-base flex-shrink-0"></i>
                        <span>Uitloggen</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Hoofdinhoud Layout (Geen desktop aside meer, hoofdnavigatie staat nu in de header) */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Main Content Scroll Area - compactere padding zodat navigatiemenu hoger en strak links staat */}
        <main className="flex-1 overflow-y-auto min-h-0 bg-gray-50/50">
          <div className="px-2 sm:px-3 md:px-4 py-2 max-w-[1680px] mx-auto w-full">
            <Routes>
              <Route path='/login' element={<LoginPageTest />} />
              <Route path='/microsoft-callback' element={<MicrosoftCallback />} />
              <Route path='/dashboard' element={<ProtectedRoute>{(isAdmin || permissions.canViewDashboard !== false) ? <Dashboard /> : <Navigate to="/portfolio" replace />}</ProtectedRoute>} />
              <Route path='/analysis/*' element={<ProtectedRoute>{(isAdmin || permissions.canViewAnalysis !== false) ? <Analysis /> : <Navigate to="/portfolio" replace />}</ProtectedRoute>} />
              <Route path='/strategy-builder/*' element={<ProtectedRoute><StrategyStudioPage /></ProtectedRoute>} />
              <Route path='/portfolio' element={<ProtectedRoute><PortfolioManager /></ProtectedRoute>} />
              <Route path='/portfolio-settings' element={<ProtectedRoute><PortfolioSettings /></ProtectedRoute>} />
              <Route path='/admin' element={<ProtectedRoute>{isAdmin ? <Settings /> : <Navigate to="/portfolio-settings" replace />}</ProtectedRoute>} />
              <Route path='/settings' element={<ProtectedRoute>{isAdmin ? <Settings /> : <Navigate to="/portfolio-settings" replace />}</ProtectedRoute>} />
              <Route path='/profile' element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              {/* Fallback route voor onbekende urls */}
              <Route path='*' element={<Navigate to={(isAdmin || permissions.canViewDashboard !== false) ? "/dashboard" : "/portfolio"} replace />} />
            </Routes>
          </div>
        </main>

        {/* Mobile Bottom Navigation: [Portfolio] [Strategie builder] [Analyse] [Dashboard] */}
        {!isLoginPage && (
          <nav className="md:hidden bg-white border-t border-gray-200 flex flex-row justify-around z-50 w-full h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] shadow-xs">
            {(isAdmin || permissions.canViewPortfolio !== false) && (
              <MobileBottomLink to="/portfolio" iconClass="ph-fill ph-briefcase" isActive={location.pathname.startsWith('/portfolio')}>
                Portfolio
              </MobileBottomLink>
            )}
            {(isAdmin || permissions.canUseStockStrategy !== false || permissions.canViewScreener !== false) && (
              <MobileBottomLink to="/strategy-builder" iconClass="ph-fill ph-sliders-horizontal" isActive={location.pathname.startsWith('/strategy-builder')}>
                Strategie builder
              </MobileBottomLink>
            )}
            {(isAdmin || permissions.canViewAnalysis !== false) && (
              <MobileBottomLink to="/analysis" iconClass="ph-fill ph-chart-line-up" isActive={location.pathname.startsWith('/analysis')}>
                Analyse
              </MobileBottomLink>
            )}
            {(isAdmin || permissions.canViewDashboard !== false) && (
              <MobileBottomLink to="/dashboard" iconClass="ph-fill ph-squares-four" isActive={location.pathname === '/dashboard' || location.pathname === '/'}>
                Dashboard
              </MobileBottomLink>
            )}
          </nav>
        )}
      </div>

      {/* Zoekmodal component */}
      {showSearchModal && <SearchModal onClose={handleCloseSearchModal} />}

      {/* Feedback & Roadmap Modal */}
      {showFeedbackModal && (
        <FeedbackModal
          show={showFeedbackModal}
          onCancel={() => setShowFeedbackModal(false)}
        />
      )}
    </div>
  );
}

export default App;

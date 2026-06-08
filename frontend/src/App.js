import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Feature-gebaseerde component imports
import Dashboard from './features/dashboard/Dashboard.js';
import Analysis from './features/analysis/Analysis.js';
import PortfolioManager from './features/portfolio/PortfolioManager.js';
import Settings from './features/settings/settings.js';
import Profile from './features/profile/Profile.js';
import LoginPageTest from './features/auth/components/loginTest.js';

import SearchModal from './components/ui/SearchModal.js';
import HeaderBalanceDisplay from './features/dashboard/HeaderBalanceDisplay.js';
import InvestedBalanceDisplay from './features/dashboard/InvestedBalanceDisplay.js';

// Protected Route Component om onbevoegde toegang te blokkeren
const ProtectedRoute = ({ children }) => {
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
      className={`group relative flex flex-col md:flex-row items-center justify-center transition-all duration-300 ease-in-out flex-1 md:flex-none h-full md:h-auto py-1 md:py-0 ${
        isActive
          ? 'text-blue-600 md:bg-blue-600 md:text-white md:shadow-md'
          : 'text-gray-500 hover:bg-gray-50 md:hover:bg-gray-100 hover:text-blue-600'
      } ${
        isSidebarPinned 
          ? 'md:justify-start md:px-4 md:py-3 md:mx-4 md:rounded-xl' 
          : 'md:justify-center md:w-12 md:h-12 md:mx-auto md:rounded-xl'
      }`}
    >
      {/* Mobiele actieve indicator (blauw streepje bovenaan het icoon) */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-blue-600 md:hidden ${isActive ? 'block' : 'hidden'}`}></div>
      
      <i className={`${iconClass} text-2xl md:text-2xl mb-1 md:mb-0 flex-shrink-0 flex items-center justify-center`}></i>
      
      {/* Tekst voor Mobiel (klein, onder het icoon) */}
      <span className="text-[10px] md:hidden font-medium leading-none">{children}</span>

      {isSidebarPinned ? (
        <span className="hidden md:block ml-3 font-medium whitespace-nowrap">{children}</span>
      ) : (
        <span className="hidden md:block absolute left-14 bg-white text-gray-700 border border-gray-200 shadow-md px-3 py-1 rounded-md text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none">
          {children}
        </span>
      )}
    </Link>
  );
};

function App() {
  const userRole = localStorage.getItem('role') || 'user';
  const isDemo = userRole === 'demo';
  const isAdmin = userRole === 'admin';

  const [activeTab, setActiveTab] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [isIncognito, setIsIncognito] = useState(isDemo || localStorage.getItem('incognito') === 'true');
  const location = useLocation();
  const navigate = useNavigate();

  // Functies voor zoekmodal
  const handleOpenSearchModal = () => setShowSearchModal(true);
  const handleCloseSearchModal = () => setShowSearchModal(false);

  // Functie om de actieve tab in te stellen op basis van de URL
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/dashboard')) setActiveTab('Dashboard');
    else if (path.startsWith('/analysis')) setActiveTab('Analysis');
    else if (path.startsWith('/portfolio')) setActiveTab('Portfolio');
    else if (path.startsWith('/settings')) setActiveTab('Settings');
    else if (path.startsWith('/profile')) setActiveTab('Profile');
    else setActiveTab('/dashboard');
  }, [location]);

  // Functie om de gebruiker uit te loggen
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userID');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
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
      {/* Globale CSS voor de incognito modus */}
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
      `}</style>

      <Toaster position="top-center" reverseOrder={false} />

      {!isLoginPage && (
        /* Header */
        <header className="flex-shrink-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-gray-200 transition-all duration-300">
          <div className="container mx-auto flex h-16 items-center justify-between px-4">
            {/* Logo/Merknaam */}
            <Link to="/dashboard" className="flex-shrink-0 flex items-center gap-2">
                <i className="ph-fill ph-chart-polar text-blue-500 text-3xl"></i>
                <span className="text-gray-800 font-bold text-xl tracking-tight">Portfolio<span className="text-blue-500">VR</span></span>
            </Link>

            {/* Filler in het midden */}
            <div className="flex-grow"></div>

            {/* Rechtergroep: Zoekveld, Vermogensdisplays, Gebruikersprofiel */}
            <div className="flex items-center gap-3 md:gap-6">
              {/* Klein zoekveld dat de modal opent */}
              <input
                type="text"
                readOnly
                placeholder="Zoek..."
                onClick={handleOpenSearchModal}
                className="hidden md:block w-32 focus:w-64 transition-all duration-300 ease-in-out cursor-pointer rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              />

              {/* Incognito Knop */}
              {!isDemo && (
                <button
                  onClick={toggleIncognito}
                  className={`p-2 rounded-full transition-colors duration-200 ${
                    isIncognito ? 'bg-blue-100 text-blue-600 shadow-inner' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                  }`}
                  title={isIncognito ? "Privacy modus uitschakelen" : "Privacy modus inschakelen"}
                >
                  <i className={`ph-fill ${isIncognito ? 'ph-eye-slash' : 'ph-eye'} text-xl`}></i>
                </button>
              )}

              {/* Beschikbaar en Geïnvesteerd Vermogen Displays */}
              <div className="flex items-center space-x-4 divide-x divide-gray-200">
                <HeaderBalanceDisplay />
                <InvestedBalanceDisplay />
              </div>

              {/* Gebruikersprofiel en dropdown */}
              <div
                className="relative"
              >
                {/* Onzichtbare overlay om het menu te sluiten als je ernaast klikt */}
                {dropdownOpen && (
                  <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)}></div>
                )}
                <div 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDropdownOpen(!dropdownOpen); }} 
                  className="relative z-50 flex cursor-pointer items-center space-x-2 p-1 rounded-full hover:bg-gray-100 transition-colors duration-200" 
                  role="button" 
                  id="userDropdown" 
                  aria-expanded={dropdownOpen}
                >
                  <img className="h-8 w-8 rounded-full object-cover ring-2 ring-white shadow-sm" src={`https://ui-avatars.com/api/?name=${user.name.replace(' ', '+')}&background=3b82f6&color=fff`} alt="User avatar" />
                  <span className="hidden md:inline mr-1 font-semibold text-gray-800">{user.name}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className={`bi bi-chevron-down text-gray-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
                  </svg>
                </div>
                <ul className={`absolute right-0 mt-2 w-48 origin-top-right rounded-xl bg-white py-2 shadow-xl ring-1 ring-black ring-opacity-5 focus:outline-none transition-all duration-200 transform z-50 ${dropdownOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95 pointer-events-none'}`} aria-labelledby="userDropdown">
                  <li><Link to="/profile" onClick={() => setDropdownOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900">Mijn Profiel</Link></li>
                  <li className="border-t border-gray-100 my-1"></li>
                  <li><button onClick={handleLogout} className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 font-medium transition-colors">Uitloggen</button></li>
                </ul>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Zijbalk + Hoofdinhoud Layout */}
      <div className="flex flex-col-reverse md:flex-row flex-1 overflow-hidden">
        {/* Sidebar Navigatie */}
        {!isLoginPage && (
          <aside
            className={`bg-white border-t md:border-t-0 md:border-r border-gray-200 transition-all duration-300 ease-in-out flex flex-row md:flex-col z-40 w-full h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] md:h-auto md:pb-0 md:py-4 ${
              isSidebarPinned ? 'w-64' : 'w-20'
            }`}
          >
            {/* Menu knop om zijbalk vast te zetten */}
            <div className="hidden md:flex items-center justify-center mb-6">
              <button
                onClick={() => setIsSidebarPinned(!isSidebarPinned)}
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors focus:outline-none"
                title={isSidebarPinned ? 'Maak zijbalk inklapbaar' : 'Zet zijbalk vast'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className={`transition-transform duration-300 ${isSidebarPinned ? 'rotate-90 text-blue-600' : ''}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
            
            <nav className="flex flex-row md:flex-col flex-1 gap-1 md:gap-2 justify-around md:justify-start px-2 md:px-0">
              <SidebarLink to="/dashboard" iconClass="ph-fill ph-squares-four" isActive={activeTab === 'Dashboard'} onClick={() => setActiveTab('Dashboard')} isSidebarPinned={isSidebarPinned}>Dashboard</SidebarLink>
              <SidebarLink to="/analysis" iconClass="ph-fill ph-chart-line-up" isActive={activeTab === 'Analysis'} onClick={() => setActiveTab('Analysis')} isSidebarPinned={isSidebarPinned}>Analysis</SidebarLink>
              <SidebarLink to="/portfolio" iconClass="ph-fill ph-briefcase" isActive={activeTab === 'Portfolio'} onClick={() => setActiveTab('Portfolio')} isSidebarPinned={isSidebarPinned}>Portfolio</SidebarLink>
              
              {isAdmin && (
                <div className="flex flex-1 md:flex-none md:mt-auto md:mb-2">
                  <SidebarLink to="/settings" iconClass="ph-fill ph-gear" isActive={activeTab === 'Settings'} onClick={() => setActiveTab('Settings')} isSidebarPinned={isSidebarPinned}>Settings</SidebarLink>
                </div>
              )}
            </nav>
          </aside>
        )}

        {/* Main Content Scroll Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <Routes>
              <Route path='/login' element={<LoginPageTest/>} />
              <Route path='/dashboard' element={<ProtectedRoute><Dashboard/></ProtectedRoute>} />
              <Route path='/analysis/*' element={<ProtectedRoute><Analysis /></ProtectedRoute>} />
              <Route path='/portfolio' element={<ProtectedRoute><PortfolioManager/></ProtectedRoute>} />
              <Route path='/settings' element={<ProtectedRoute>{isAdmin ? <Settings/> : <Navigate to="/dashboard" replace />}</ProtectedRoute>} />
              <Route path='/profile' element={<ProtectedRoute><Profile/></ProtectedRoute>} />
              {/* Fallback route voor onbekende urls -> verwijst naar dashboard wat dan de token check doet */}
              <Route path='*' element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </main>
      </div>

      {/* Zoekmodal component */}
      {showSearchModal && <SearchModal onClose={handleCloseSearchModal} />}
    </div>
  );
}

export default App;

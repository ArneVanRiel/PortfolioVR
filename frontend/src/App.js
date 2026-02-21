import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Feature-gebaseerde component imports
import Dashboard from './features/dashboard/Dashboard.js';
import Analysis from './features/analysis/Analysis.js';
import PortfolioManager from './features/portfolio/PortfolioManager.js';
import Settings from './features/settings/settings.js';
import LoginPageTest from './features/auth/components/loginTest.js';

import SearchModal from './components/ui/SearchModal.js';
import HeaderBalanceDisplay from './features/dashboard/HeaderBalanceDisplay.js';
import InvestedBalanceDisplay from './features/dashboard/InvestedBalanceDisplay.js';

function App() {
  const [activeTab, setActiveTab] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const user = { name: 'Arne' };
  const location = useLocation();

  // Functies voor dropdown hover
  const handleMouseEnter = () => setDropdownOpen(true);
  const handleMouseLeave = () => setDropdownOpen(false);

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
    else setActiveTab('');
  }, [location]);

  const NavLink = ({ to, children }) => {
    const tabName = children;
    return (
      <Link
        to={to}
        className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ease-in-out ${
          activeTab === tabName
            ? 'bg-blue-600 text-white shadow-md transform scale-105'
            : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'
        }`}
        onClick={() => setActiveTab(tabName)}
      >
        {children}
      </Link>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50/50 font-sans text-gray-900">
      <Toaster position="top-center" reverseOrder={false} />

      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-gray-200 transition-all duration-300">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          {/* Logo/Merknaam */}
          <Link to="/dashboard" className="text-2xl font-bold text-blue-600">Portfolio VR</Link>

          {/* Navigatie links (centraal geplaatst) */}
          <nav className="hidden flex-grow items-center justify-center space-x-2 md:flex">
            <NavLink to='/dashboard'>Dashboard</NavLink>
            <NavLink to='/analysis'>Analysis</NavLink>
            <NavLink to='/portfolio'>Portfolio</NavLink>
          </nav>

          {/* Rechtergroep: Zoekveld, Vermogensdisplays, Gebruikersprofiel */}
          <div className="flex items-center space-x-6">
            {/* Klein zoekveld dat de modal opent */}
            <input
              type="text"
              readOnly
              placeholder="Zoek..."
              onClick={handleOpenSearchModal}
              className="w-32 focus:w-64 transition-all duration-300 ease-in-out cursor-pointer rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            />

            {/* Beschikbaar en Geïnvesteerd Vermogen Displays */}
            <div className="flex items-center space-x-4 divide-x divide-gray-200">
              <HeaderBalanceDisplay />
              <InvestedBalanceDisplay />
            </div>

            {/* Gebruikersprofiel en dropdown */}
            <div
              className="relative"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <div className="flex cursor-pointer items-center space-x-2 p-1 rounded-full hover:bg-gray-100 transition-colors duration-200" role="button" id="userDropdown" aria-expanded={dropdownOpen}>
                <img className="h-8 w-8 rounded-full object-cover ring-2 ring-white shadow-sm" src={`https://ui-avatars.com/api/?name=${user.name.replace(' ', '+')}&background=3b82f6&color=fff`} alt="User avatar" />
                <span className="mr-1 font-semibold text-gray-800">{user.name}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className={`bi bi-chevron-down text-gray-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 16 16">
                  <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
                </svg>
              </div>
              <ul className={`absolute right-0 mt-2 w-48 origin-top-right rounded-xl bg-white py-2 shadow-xl ring-1 ring-black ring-opacity-5 focus:outline-none transition-all duration-200 transform ${dropdownOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95 pointer-events-none'}`} aria-labelledby="userDropdown">
                <li><Link to="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900">Mijn Profiel</Link></li>
                <li><Link to="/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900">Instellingen</Link></li>
              </ul>
            </div>
          </div>
        </div>
      </header>

      {/* Hoofdinhoud sectie */}
      <main className="flex-grow">
        <div className="container mx-auto p-4">
          <Routes>
            <Route path='/login' element={<LoginPageTest/>} />
            <Route path='/dashboard' element={<Dashboard/>} />
                        <Route path='/analysis/*' element={<Analysis />} />
            <Route path='/portfolio' element={<PortfolioManager/>} />
            <Route path='/settings' element={<Settings/>} />
          </Routes>
 
        </div>
      </main>

      {/* Zoekmodal component */}
      {showSearchModal && <SearchModal onClose={handleCloseSearchModal} />}
    </div>
  );
}

export default App;

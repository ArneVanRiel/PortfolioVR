import React, { useState, useEffect } from 'react';
import { Routes, Route, Link } from 'react-router-dom';

// Importeer al je componenten. De .js extensie is weer toegevoegd aan de imports.
// Controleer AUB nauwkeurig of de BESTANDSNAMEN op je schijf (inclusief hoofdletters/kleine letters)
// exact overeenkomen met deze import statements. Dit is de meest voorkomende oorzaak van
// "Could not resolve" fouten.
import Dashboard from './components/Dashboard.js';
import AandelenList from './components/aandelenList.js';
import IdealePortfolio from './components/huidigeIdealePortfolio.js';
import AandelenData from './components/AandelenData.js';
import UpdateData from './components/updateData.js';
import GetUsers from './components/users.js';
import LoginPageTest from './components/login_register/loginTest.js';
import Settings from './components/content/settings.js';
import ToDo from './components/ToDo.js';
import AvailableBalance from './components/AvailableBalance.js';
import HeaderBalanceDisplay from './components/HeaderBalanceDisplay.js';
import InvestedBalanceDisplay from './components/InvestedBalanceDisplay.js';
import SearchModal from './components/SearchModal.js';

function App() {
  const [activeTab, setActiveTab] = useState('Ideale Portfolio');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const user = { name: 'Arne' };

  // Functies voor dropdown hover
  const handleMouseEnter = () => setDropdownOpen(true);
  const handleMouseLeave = () => setDropdownOpen(false);

  // Functies voor zoekmodal
  const handleOpenSearchModal = () => setShowSearchModal(true);
  const handleCloseSearchModal = () => setShowSearchModal(false);

  // Functie om de actieve tab in te stellen op basis van de URL
  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes('/IdealePortfolio')) setActiveTab('Ideale Portfolio');
    else if (path.includes('/aandelen')) setActiveTab('Aandelen');
    else if (path.includes('/data')) setActiveTab('Data');
    else if (path.includes('/updateData')) setActiveTab('Update');
    else if (path.includes('/dashboard')) setActiveTab('Dashboard');
    else if (path.includes('/settings')) setActiveTab('Settings');
    else setActiveTab('');
  }, []);

  return (
    <div className="d-flex flex-column min-vh-100 bg-light" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Hoofdheader sectie: alles op één lijn */}
      {/* d-flex: maakt een flexbox container
          align-items-center: centreert items verticaal
          justify-content-between: verdeelt items met ruimte ertussen */}
      <header className="navbar navbar-expand-lg navbar-light bg-white shadow-sm rounded-bottom-3 py-3 px-4">
        <div className="container-fluid d-flex align-items-center justify-content-between">
          {/* Logo/Merknaam */}
          <Link to="/IdealePortfolio" className="navbar-brand fw-bold fs-4 text-primary">Portfolio VR</Link>

          {/* Navigatie links (centraal geplaatst) */}
          {/* d-flex flex-row: maakt nav items op één rij */}
          <ul className="navbar-nav d-flex flex-row flex-grow-1 justify-content-center">
            <li className="nav-item">
              <Link to='/IdealePortfolio' className={`nav-link px-3 py-1 ${activeTab === 'Ideale Portfolio' ? 'text-primary fw-bold border-bottom border-primary border-3' : 'text-dark'}`} onClick={() => setActiveTab('Ideale Portfolio')}>Ideale Portfolio</Link>
            </li>
            <li className="nav-item">
              <Link to='/aandelen' className={`nav-link px-3 py-1 ${activeTab === 'Aandelen' ? 'text-primary fw-bold border-bottom border-primary border-3' : 'text-dark'}`} onClick={() => setActiveTab('Aandelen')}>Aandelen</Link>
            </li>
            <li className="nav-item">
              <Link to='/data' className={`nav-link px-3 py-1 ${activeTab === 'Data' ? 'text-primary fw-bold border-bottom border-primary border-3' : 'text-dark'}`} onClick={() => setActiveTab('Data')}>Fundamentele data</Link>
            </li>
            <li className="nav-item">
              <Link to='/updateData' className={`nav-link px-3 py-1 ${activeTab === 'Update' ? 'text-primary fw-bold border-bottom border-primary border-3' : 'text-dark'}`} onClick={() => setActiveTab('Update')}>Bereken</Link>
            </li>
            <li className="nav-item">
              <Link to='/dashboard' className={`nav-link px-3 py-1 ${activeTab === 'Dashboard' ? 'text-primary fw-bold border-bottom border-primary border-3' : 'text-dark'}`} onClick={() => setActiveTab('Dashboard')}>Dashboard</Link>
            </li>
          </ul>

          {/* Rechtergroep: Zoekveld, Vermogensdisplays, Gebruikersprofiel */}
          <div className="d-flex align-items-center">
            {/* Klein zoekveld dat de modal opent */}
            <input
              type="text"
              readOnly
              placeholder="Zoek..."
              onClick={handleOpenSearchModal}
              className="form-control form-control-sm me-3"
              style={{ width: '100px', cursor: 'pointer' }}
            />

            {/* Beschikbaar en Geïnvesteerd Vermogen Displays */}
            <HeaderBalanceDisplay />
            <InvestedBalanceDisplay />

            {/* Gebruikersprofiel en dropdown */}
            <div
              className="dropdown"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <div className="d-flex align-items-center dropdown-toggle" role="button" id="userDropdown" aria-expanded={dropdownOpen}>
                <div className="bg-secondary rounded-circle me-2" style={{ width: '30px', height: '30px' }} />
                <span className="fw-semibold text-dark me-1">{user.name}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-chevron-down" viewBox="0 0 16 16">
                  <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
                </svg>
              </div>
              <ul className={`dropdown-menu ${dropdownOpen ? 'show' : ''}`} aria-labelledby="userDropdown">
                <li><Link to="/profile" className="dropdown-item text-dark">Mijn Profiel</Link></li>
                <li><Link to="/settings" className="dropdown-item text-dark">Instellingen</Link></li>
              </ul>
            </div>
          </div>
        </div>
      </header>

      {/* Hoofdinhoud sectie */}
      <main className="flex-grow-1">
        <div className="container">
          <Routes>
            <Route path='/login' element={<LoginPageTest/>} />
            <Route path='/IdealePortfolio' element={<IdealePortfolio/>} />
            <Route path='/aandelen' element={<AandelenList/>} />
            <Route path='/data' element={<AandelenData />} />
            <Route path='/updateData' element={<UpdateData/>} />
            <Route path='/dashboard' element={<Dashboard/>} />
            <Route path='/settings' element={<Settings/>} />
          </Routes>
          <ToDo/>
        </div>
      </main>

      {/* Zoekmodal component */}
      {showSearchModal && <SearchModal onClose={handleCloseSearchModal} />}
    </div>
  );
}

export default App;

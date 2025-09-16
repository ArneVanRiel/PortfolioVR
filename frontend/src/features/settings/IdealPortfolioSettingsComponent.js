// components/IdealPortfolioSettingsComponent.js
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api/ideal-portfolio'; // Pas dit aan indien nodig

const IdealPortfolioSettingsComponent = () => {
  const [settings, setSettings] = useState({ gewenst_rendement: null, terminal_rate: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  // States voor inputvelden houden nu de decimale waarden vast (e.g., 0.15)
  const [inputGewenstRendement, setInputGewenstRendement] = useState('');
  const [inputTerminalRate, setInputTerminalRate] = useState('');

  // Functie om de instellingen op te halen
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/settings`);
      setSettings(response.data);
      // Vul de inputvelden in met de huidige waarden, omgezet naar decimale weergave voor de gebruiker
      // Bijv. als database 15.00 bevat, toon 0.15 in de input
      setInputGewenstRendement((response.data.gewenst_rendement / 100).toFixed(2));
      setInputTerminalRate((response.data.terminal_rate / 100).toFixed(2));
    } catch (err) {
      console.error('Fout bij ophalen ideale portfolio instellingen:', err);
      setError('Kon instellingen niet ophalen.');
      setSettings({ gewenst_rendement: 0.00, terminal_rate: 0.00 }); // Standaardwaarden bij fout
      setInputGewenstRendement('0.00'); // Zet inputvelden ook op standaard
      setInputTerminalRate('0.00');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleOpenEditModal = () => {
    // Vul de modal inputvelden met de *huidige* weergegeven instellingen, omgezet naar decimale input
    // Doe dit alleen als settings.gewenst_rendement niet null is, anders blijft het leeg of 0
    setInputGewenstRendement(settings.gewenst_rendement !== null ? (settings.gewenst_rendement / 100).toFixed(2) : '');
    setInputTerminalRate(settings.terminal_rate !== null ? (settings.terminal_rate / 100).toFixed(2) : '');
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setError(''); // Reset foutmeldingen in de modal
  };

  const handleSubmitUpdate = async () => {
    setError(''); // Reset foutmelding
    // Validatie van input
    const gewenstInput = parseFloat(inputGewenstRendement);
    const terminalInput = parseFloat(inputTerminalRate);

    if (isNaN(gewenstInput) || isNaN(terminalInput)) {
      setError('Voer geldige numerieke waarden in.');
      return;
    }

    // Converteer de decimale input naar percentage-waarden voor de backend (bijv. 0.15 -> 15)
    const gewenstVoorBackend = gewenstInput * 100;
    const terminalVoorBackend = terminalInput * 100;

    try {
      await axios.post(`${API_BASE_URL}/settings`, {
        gewenst_rendement: gewenstVoorBackend,
        terminal_rate: terminalVoorBackend
      });
      alert('Instellingen succesvol bijgewerkt!'); // Gebruik een custom modal in productie
      handleCloseEditModal();
      fetchSettings(); // Herlaad de data na een succesvolle update
    } catch (err) {
      console.error('Fout bij bijwerken instellingen:', err);
      setError('Fout bij het bijwerken van instellingen. Probeer opnieuw.');
    }
  };

  if (loading) {
    return (
      <div className="card shadow-sm p-4 mt-4">
        <h5 className="card-title">Ideale Portfolio Instellingen</h5>
        <div>Laden instellingen...</div>
      </div>
    );
  }

  return (
    <div className="card shadow-sm p-4 mt-4 mb-4"> {/* mb-4 voor wat ruimte eronder */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="card-title mb-0">Ideale Portfolio Instellingen</h5>
        <button className="btn btn-primary btn-sm" onClick={handleOpenEditModal}>
          Bewerken
        </button>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className="row">
        <div className="col-md-6">
          {/* Weergegeven waardes blijven in percentage vorm, bijv. 15.00% */}
          <p className="mb-1"><strong>Gewenst Rendement:</strong> {settings.gewenst_rendement !== null ? settings.gewenst_rendement.toFixed(2) : '--.--'}%</p>
        </div>
        <div className="col-md-6">
          <p className="mb-1"><strong>Terminal Rate:</strong> {settings.terminal_rate !== null ? settings.terminal_rate.toFixed(2) : '--.--'}%</p>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Instellingen Bewerken</h5>
                <button type="button" className="btn-close" aria-label="Sluiten" onClick={handleCloseEditModal}></button>
              </div>
              <div className="modal-body">
                {error && <div className="alert alert-danger" role="alert">{error}</div>}
                <div className="mb-3">
                  <label htmlFor="gewenstRendement" className="form-label">Gewenst Rendement (bijv. 0.15 voor 15%)</label>
                  <input
                    type="number"
                    className="form-control"
                    id="gewenstRendement"
                    value={inputGewenstRendement}
                    onChange={(e) => setInputGewenstRendement(e.target.value)}
                    step="0.01" // Toestaan van decimalen
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="terminalRate" className="form-label">Terminal Rate (bijv. 0.02 voor 2%)</label>
                  <input
                    type="number"
                    className="form-control"
                    id="terminalRate"
                    value={inputTerminalRate}
                    onChange={(e) => setInputTerminalRate(e.target.value)}
                    step="0.01" // Toestaan van decimalen
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseEditModal}>Annuleren</button>
                <button type="button" className="btn btn-primary" onClick={handleSubmitUpdate}>Opslaan</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IdealPortfolioSettingsComponent;

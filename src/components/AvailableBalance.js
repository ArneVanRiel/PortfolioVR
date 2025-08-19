// components/AvailableBalance.js
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api/available-balance'; // Pas dit aan indien nodig

const AvailableBalance = () => {
  const [totalAmount, setTotalAmount] = useState(0);
  const [lastUpdateDate, setLastUpdateDate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [balanceTypes, setBalanceTypes] = useState([]);
  const [currentInputBalances, setCurrentInputBalances] = useState({}); // Voor de input velden in de modal
  const [showReminderPopup, setShowReminderPopup] = useState(false);

  // Functie om de laatste saldo's op te halen
  const fetchLatestBalance = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/latest-balance`);
      const { totalAmount, lastUpdateDate, balances } = response.data;
      setTotalAmount(totalAmount);
      setLastUpdateDate(lastUpdateDate ? new Date(lastUpdateDate) : null);
      // Vul currentInputBalances met de opgehaalde waardes
      const initialInput = {};
      balanceTypes.forEach(type => {
        initialInput[type.balance_type_id] = balances[type.type_name] || '';
      });
      setCurrentInputBalances(initialInput);

      // Controleer voor popupmelding
      if (lastUpdateDate) {
        const lastUpdate = new Date(lastUpdateDate);
        const now = new Date();
        const diffTime = Math.abs(now - lastUpdate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 30) {
          setShowReminderPopup(true);
        }
      } else {
        // Als er nog geen data is, toon ook een herinnering om data in te voeren
        setShowReminderPopup(true);
      }

    } catch (err) {
      console.error('Fout bij ophalen laatste saldo:', err);
      setError('Kon het beschikbare vermogen niet ophalen.');
    } finally {
      setLoading(false);
    }
  }, [balanceTypes]); // Voeg balanceTypes toe als afhankelijkheid

  // Functie om beschikbare saldo types op te halen (eenmalig bij laden component)
  const fetchBalanceTypes = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/balance-types`);
      setBalanceTypes(response.data);
    } catch (err) {
      console.error('Fout bij ophalen saldo types:', err);
      setError('Kon de saldo types niet ophalen.');
    }
  }, []);

  useEffect(() => {
    fetchBalanceTypes();
  }, [fetchBalanceTypes]);

  useEffect(() => {
    if (balanceTypes.length > 0) { // Pas nadat balanceTypes geladen zijn, de saldo's ophalen
      fetchLatestBalance();
    }
  }, [balanceTypes, fetchLatestBalance]);

  const handleOpenUpdateModal = () => {
    setShowUpdateModal(true);
  };

  const handleCloseUpdateModal = () => {
    setShowUpdateModal(false);
    setError(''); // Reset error message
  };

  const handleInputChange = (balanceTypeId, value) => {
    // Zorg ervoor dat de input alleen numerieke waarden accepteert
    const numericValue = value.replace(/[^0-9.]/g, ''); // Verwijder alles behalve cijfers en punten
    setCurrentInputBalances(prev => ({
      ...prev,
      [balanceTypeId]: numericValue,
    }));
  };

  const handleSubmitUpdate = async () => {
    try {
      const balancesToUpdate = balanceTypes.map(type => ({
        balance_type_id: type.balance_type_id,
        amount: parseFloat(currentInputBalances[type.balance_type_id] || 0) // Parse naar float, standaard 0 indien leeg
      }));

      await axios.post(`${API_BASE_URL}/update-balance`, { balances: balancesToUpdate });
      alert('Vermogen succesvol bijgewerkt!');
      handleCloseUpdateModal();
      fetchLatestBalance(); // Herlaad de data na een succesvolle update
    } catch (err) {
      console.error('Fout bij bijwerken vermogen:', err);
      setError('Fout bij het bijwerken van het vermogen. Probeer opnieuw.');
    }
  };

  // Functie om de dagen sinds de laatste update te berekenen
  const getDaysSinceLastUpdate = () => {
    if (!lastUpdateDate) return 'Nooit';
    const now = new Date();
    const diffTime = Math.abs(now - lastUpdateDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} dagen geleden`;
  };

  if (loading) {
    return <div className="available-balance-container">Laden...</div>;
  }

  if (error && !showUpdateModal) { // Toon error alleen als modal niet open is, anders toont modal zijn eigen error
    return <div className="available-balance-container error-message">Fout: {error}</div>;
  }

  return (
    <div className="available-balance-container card shadow-sm p-4 mt-4">
      <h2 className="card-title mb-4">Beschikbaar Vermogen</h2>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="text-center">
          <p className="mb-0 text-muted">Huidig Totaal:</p>
          <h3 className="fw-bold text-primary">€ {totalAmount.toFixed(2)}</h3>
        </div>
        <div className="text-center">
          <p className="mb-0 text-muted">Laatste Update:</p>
          <p className="fw-bold">{getDaysSinceLastUpdate()}</p>
        </div>
      </div>
      <button className="btn btn-primary w-100" onClick={handleOpenUpdateModal}>
        Vermogen Bewerken
      </button>

      {/* Reminder Pop-up */}
      {showReminderPopup && (
        <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-warning text-white">
                <h5 className="modal-title">Herinnering: Update Vermogen</h5>
                <button type="button" className="btn-close btn-close-white" aria-label="Close" onClick={() => setShowReminderPopup(false)}></button>
              </div>
              <div className="modal-body">
                <p>Het is langer dan 30 dagen geleden dat je het beschikbare vermogen hebt bijgewerkt.</p>
                <p>Wil je dit nu bijwerken?</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowReminderPopup(false)}>Later</button>
                <button type="button" className="btn btn-primary" onClick={() => { setShowReminderPopup(false); handleOpenUpdateModal(); }}>Nu Bijwerken</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Modal */}
      {showUpdateModal && (
        <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Beschikbaar Vermogen Bewerken</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={handleCloseUpdateModal}></button>
              </div>
              <div className="modal-body">
                {error && <div className="alert alert-danger" role="alert">{error}</div>}
                <div className="row">
                  {balanceTypes.map(type => (
                    <div className="col-md-6 mb-3" key={type.balance_type_id}>
                      <label htmlFor={`input-${type.balance_type_id}`} className="form-label">{type.type_name}</label>
                      <input
                        type="text" // Gebruik text om handmatige input controle te doen
                        className="form-control"
                        id={`input-${type.balance_type_id}`}
                        value={currentInputBalances[type.balance_type_id] || ''}
                        onChange={(e) => handleInputChange(type.balance_type_id, e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseUpdateModal}>Annuleren</button>
                <button type="button" className="btn btn-primary" onClick={handleSubmitUpdate}>Opslaan</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AvailableBalance;
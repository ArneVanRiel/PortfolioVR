// components/AvailableBalance.js
import React, { useState, useEffect, useCallback } from 'react';
import http from '../../http-common';

const AvailableBalance = () => {
  const [totalAmount, setTotalAmount] = useState(0);
  const [lastUpdateDate, setLastUpdateDate] = useState(null);
  const [balancesMap, setBalancesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [balanceTypes, setBalanceTypes] = useState([]);
  const [currentInputBalances, setCurrentInputBalances] = useState({}); // Voor de input velden in de modal
  const [brokerCash, setBrokerCash] = useState(null);
  const [isSyncingBroker, setIsSyncingBroker] = useState(false);
  const [showReminderPopup, setShowReminderPopup] = useState(false);
  const userRole = localStorage.getItem('role') || 'user';
  const isDemo = userRole === 'demo';

  // Functie om broker/platform cash op te halen
  const fetchBrokerCash = useCallback(async () => {
    try {
      const res = await http.get('/balance/available/broker-cash');
      if (res.data) {
        setBrokerCash(res.data);
      }
    } catch (err) {
      console.warn('Kon broker cash niet ophalen:', err);
    }
  }, []);

  // Functie om de laatste saldo's op te halen
  const fetchLatestBalance = useCallback(async (bCash = brokerCash) => {
    setLoading(true);
    setError('');
    try {
      const [balRes, cashData] = await Promise.all([
        http.get(`/balance/available/latest-balance`),
        bCash ? Promise.resolve(bCash) : fetchBrokerCash()
      ]);

      const { totalAmount, lastUpdateDate, balances } = balRes.data;
      setTotalAmount(totalAmount || 0);
      setBalancesMap(balances || {});
      setLastUpdateDate(lastUpdateDate ? new Date(lastUpdateDate) : null);
      
      // Vul currentInputBalances met de opgehaalde waardes
      const initialInput = {};
      balanceTypes.forEach(type => {
        const tName = type.type_name.toLowerCase();
        if (tName.includes('etoro')) {
          initialInput[type.balance_type_id] = (cashData?.suggestedBalances?.[1] ?? cashData?.etoro?.amountEur ?? balances?.[type.type_name] ?? 0);
        } else if (tName.includes('degiro')) {
          initialInput[type.balance_type_id] = (cashData?.suggestedBalances?.[2] ?? cashData?.degiro?.amountEur ?? balances?.[type.type_name] ?? 0);
        } else {
          initialInput[type.balance_type_id] = balances && balances[type.type_name] !== undefined ? balances[type.type_name] : '';
        }
      });
      setCurrentInputBalances(initialInput);

      // Controleer voor popupmelding
      if (lastUpdateDate) {
        const lastUpdate = new Date(lastUpdateDate);
        const now = new Date();
        const diffTime = Math.abs(now - lastUpdate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 30 && !isDemo) {
          setShowReminderPopup(true);
        }
      } else {
        if (!isDemo) setShowReminderPopup(true);
      }

    } catch (err) {
      console.error('Fout bij ophalen laatste saldo:', err);
      setError('Kon het beschikbare vermogen niet ophalen.');
    } finally {
      setLoading(false);
    }
  }, [balanceTypes, isDemo, brokerCash, fetchBrokerCash]);

  // Functie om beschikbare saldo types op te halen (eenmalig bij laden component)
  const fetchBalanceTypes = useCallback(async () => {
    try {
      const response = await http.get(`/balance/available/balance-types`);
      setBalanceTypes(response.data);
    } catch (err) {
      console.error('Fout bij ophalen saldo types:', err);
      setError('Kon de saldo types niet ophalen.');
    }
  }, []);

  useEffect(() => {
    fetchBalanceTypes();
    fetchBrokerCash();
  }, [fetchBalanceTypes, fetchBrokerCash]);

  useEffect(() => {
    if (balanceTypes.length > 0) {
      fetchLatestBalance();
    }
  }, [balanceTypes, fetchLatestBalance]);

  const handleOpenUpdateModal = () => {
    // Ververs ook de live broker cash bij het openen van de modal
    fetchBrokerCash();
    setShowUpdateModal(true);
  };

  const handleCloseUpdateModal = () => {
    setShowUpdateModal(false);
    setError('');
    setSuccessMsg('');
  };

  const handleInputChange = (balanceTypeId, value) => {
    const numericValue = value.replace(/[^0-9.]/g, '');
    setCurrentInputBalances(prev => ({
      ...prev,
      [balanceTypeId]: numericValue,
    }));
  };

  // Automatisch invullen van de input velden met platform cash waarden
  const handleAutoFillPlatformCash = () => {
    if (!brokerCash || !brokerCash.suggestedBalances) return;

    setCurrentInputBalances(prev => {
      const updated = { ...prev };
      balanceTypes.forEach(type => {
        const tName = type.type_name.toLowerCase();
        if (tName.includes('etoro')) {
          updated[type.balance_type_id] = brokerCash.suggestedBalances[1] ?? brokerCash.etoro?.amountEur ?? '0';
        } else if (tName.includes('degiro')) {
          updated[type.balance_type_id] = brokerCash.suggestedBalances[2] ?? brokerCash.degiro?.amountEur ?? '0';
        }
      });
      return updated;
    });

    setSuccessMsg('Platform cash saldi zijn automatisch ingevuld in de formuliervelden!');
  };

  // Directe one-click synchronisatie naar database
  const handleDirectSyncBrokers = async () => {
    setIsSyncingBroker(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await http.post('/balance/available/auto-sync-brokers');
      setSuccessMsg(res.data.message || 'Platform cash succesvol gesynchroniseerd!');
      await fetchLatestBalance();
      await fetchBrokerCash();
    } catch (err) {
      console.error('Fout bij auto-syncen brokers:', err);
      setError('Kon platform cash niet automatisch synchroniseren.');
    } finally {
      setIsSyncingBroker(false);
    }
  };

  const handleSubmitUpdate = async () => {
    try {
      const balancesToUpdate = balanceTypes.map(type => ({
        balance_type_id: type.balance_type_id,
        amount: parseFloat(currentInputBalances[type.balance_type_id] || 0)
      }));

      await http.post(`/balance/available/update-balance`, { balances: balancesToUpdate });
      alert('Beschikbaar vermogen succesvol bijgewerkt!');
      handleCloseUpdateModal();
      fetchLatestBalance();
    } catch (err) {
      console.error('Fout bij bijwerken vermogen:', err);
      setError('Fout bij het bijwerken van het vermogen. Probeer opnieuw.');
    }
  };

  const getDaysSinceLastUpdate = () => {
    if (!lastUpdateDate) return 'Nooit';
    const now = new Date();
    const diffTime = Math.abs(now - lastUpdateDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} dagen geleden`;
  };

  if (loading && balanceTypes.length === 0) {
    return <div className="card shadow-sm p-4 mt-4 text-muted">Beschikbaar vermogen laden...</div>;
  }

  return (
    <div className="card shadow-sm p-4 mt-4 border-0 rounded-4" style={{ backgroundColor: '#ffffff' }}>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="fw-bold mb-1 text-dark d-flex align-items-center gap-2">
            <span style={{ fontSize: '1.25rem' }}>💰</span> Beschikbaar Vermogen & Cash
          </h4>
          <span className="text-muted small">
            Vrij besteedbaar saldo over je gekoppelde brokers en spaarrekeningen
          </span>
        </div>
        <span className="badge bg-light text-secondary border px-2.5 py-1.5 rounded-pill font-monospace small">
          Laatste update: {getDaysSinceLastUpdate()}
        </span>
      </div>

      {successMsg && (
        <div className="alert alert-success alert-dismissible fade show py-2 px-3 small" role="alert">
          <strong>Gelukt!</strong> {successMsg}
          <button type="button" className="btn-close py-2" onClick={() => setSuccessMsg('')}></button>
        </div>
      )}

      {error && !showUpdateModal && (
        <div className="alert alert-danger py-2 px-3 small" role="alert">
          {error}
        </div>
      )}

      {/* Main Totals & Broker Cash Bar */}
      <div className="row g-3 mb-3">
        {/* Totaal Vermogen Card */}
        <div className="col-12 col-md-5">
          <div className="p-3.5 rounded-3 h-100 d-flex flex-col justify-content-between" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div>
              <span className="text-muted small fw-semibold text-uppercase tracking-wider">Totaal Vrij Vermogen</span>
              <div className="fs-3 fw-bold text-primary mt-1">
                € {totalAmount.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="d-flex gap-2 mt-3">
              {!isDemo && (
                <button className="btn btn-sm btn-primary rounded-pill px-3 fw-semibold flex-grow-1" onClick={handleOpenUpdateModal}>
                  ✏️ Vermogen Bewerken
                </button>
              )}
              <button 
                className="btn btn-sm btn-outline-secondary rounded-pill px-3 fw-semibold" 
                onClick={handleDirectSyncBrokers}
                disabled={isSyncingBroker}
                title="Synchroniseer platform cash automatisch"
              >
                {isSyncingBroker ? '⏳ Sync...' : '⚡ Auto-Sync'}
              </button>
            </div>
          </div>
        </div>

        {/* Gekoppelde Platformen Cash Breakdown Card */}
        <div className="col-12 col-md-7">
          <div className="p-3.5 rounded-3 h-100" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="fw-bold text-success small text-uppercase tracking-wider d-flex align-items-center gap-1.5">
                <span>⚡</span> Platform Cash (Grootboek / API)
              </span>
              <span className="badge bg-success bg-opacity-25 text-success border border-success-subtle rounded-pill fw-bold">
                Totaal: € {(brokerCash?.totalCashEur || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="row g-2 pt-1">
              {/* DeGiro Cash */}
              <div className="col-6">
                <div className="bg-white p-2.5 rounded-2 border border-success border-opacity-25">
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="fw-semibold text-dark small">DeGiro Cash</span>
                    <span className="badge bg-light text-dark border rounded-pill small">EUR</span>
                  </div>
                  <div className="fw-bold text-success fs-5 mt-1">
                    € {(brokerCash?.degiro?.amount || balancesMap['Degiro Cash'] || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-muted text-[11px] block mt-0.5">
                    {brokerCash?.degiro?.isLinked ? '✓ Rekeningoverzicht' : 'Handmatig'}
                  </span>
                </div>
              </div>

              {/* eToro Cash */}
              <div className="col-6">
                <div className="bg-white p-2.5 rounded-2 border border-success border-opacity-25">
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="fw-semibold text-dark small">eToro Cash</span>
                    <span className="badge bg-light text-dark border rounded-pill small">USD</span>
                  </div>
                  <div className="fw-bold text-success fs-5 mt-1">
                    $ {(brokerCash?.etoro?.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-muted text-[11px] block mt-0.5">
                    ≈ € {(brokerCash?.etoro?.amountEur || balancesMap['Etoro Cash'] || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (FX {brokerCash?.fxRate?.toFixed(2) || '1.13'})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Saldo Breakdown Pills */}
      <div className="pt-2 border-top">
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <span className="text-muted small fw-semibold me-1">Verdeling:</span>
          {balanceTypes.map(type => {
            const val = parseFloat(balancesMap[type.type_name] || 0);
            if (val <= 0) return null;
            const isBroker = type.type_name.toLowerCase().includes('etoro') || type.type_name.toLowerCase().includes('degiro');
            return (
              <span 
                key={type.balance_type_id} 
                className={`badge px-2.5 py-1.5 rounded-pill font-monospace small ${isBroker ? 'bg-primary-subtle text-primary border border-primary-subtle' : 'bg-light text-dark border'}`}
              >
                {type.type_name}: € {val.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            );
          })}
        </div>
      </div>

      {/* Reminder Pop-up */}
      {showReminderPopup && (
        <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4">
              <div className="modal-header bg-warning text-dark border-0">
                <h5 className="modal-title fw-bold">⏰ Herinnering: Update Beschikbaar Vermogen</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setShowReminderPopup(false)}></button>
              </div>
              <div className="modal-body p-4">
                <p>Het is langer dan 30 dagen geleden dat je het beschikbare vermogen hebt gecontroleerd.</p>
                <p className="text-muted mb-0">Houd je vermogen actueel zodat de Strategie Assistent en Koopsignalen altijd rekenen met je exacte vrije cash!</p>
              </div>
              <div className="modal-footer border-0">
                <button type="button" className="btn btn-light rounded-pill px-3" onClick={() => setShowReminderPopup(false)}>Later</button>
                <button type="button" className="btn btn-primary rounded-pill px-4" onClick={() => { setShowReminderPopup(false); handleOpenUpdateModal(); }}>Nu Bijwerken</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Modal */}
      {showUpdateModal && (
        <div className="modal d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-primary text-white border-0 py-3">
                <h5 className="modal-title fw-bold">💼 Beschikbaar Vermogen & Platform Cash</h5>
                <button type="button" className="btn-close btn-close-white" aria-label="Close" onClick={handleCloseUpdateModal}></button>
              </div>

              <div className="modal-body p-4">
                {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
                {successMsg && <div className="alert alert-success py-2" role="alert">{successMsg}</div>}

                {/* Auto-Fill Banner */}
                {brokerCash && (
                  <div className="p-3 rounded-3 mb-4 d-flex justify-content-between align-items-center" style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC' }}>
                    <div>
                      <div className="fw-bold text-success small text-uppercase tracking-wider">
                        ⚡ Gevonden Platform Saldi (DeGiro & eToro)
                      </div>
                      <div className="small text-muted mt-0.5">
                        DeGiro: <strong>€ {brokerCash.degiro?.amount?.toFixed(2)}</strong> &bull; eToro: <strong>${brokerCash.etoro?.amount?.toFixed(2)}</strong> (≈ € {brokerCash.etoro?.amountEur?.toFixed(2)})
                      </div>
                    </div>
                    <button 
                      type="button" 
                      className="btn btn-sm btn-success rounded-pill px-3 fw-bold shadow-sm"
                      onClick={handleAutoFillPlatformCash}
                    >
                      📥 Vul Platform Cash Automatisch In
                    </button>
                  </div>
                )}

                {/* Gekoppelde Platformen Sectie */}
                <h6 className="fw-bold text-primary border-bottom pb-2 mb-3">
                  1. Gekoppelde Beleggingsplatformen (Automatisch / API)
                </h6>
                <div className="row g-3 mb-4">
                  {balanceTypes.filter(t => t.type_name.toLowerCase().includes('etoro') || t.type_name.toLowerCase().includes('degiro')).map(type => {
                    const isEtoro = type.type_name.toLowerCase().includes('etoro');
                    const isDegiro = type.type_name.toLowerCase().includes('degiro');
                    return (
                      <div className="col-md-6" key={type.balance_type_id}>
                        <div className="p-3 rounded-3 border bg-emerald-50/50 border-emerald-100">
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <label htmlFor={`input-${type.balance_type_id}`} className="form-label fw-bold mb-0 text-emerald-950">
                              {type.type_name}
                            </label>
                            <span className="badge bg-emerald-100 text-emerald-800 rounded-pill small font-semibold">
                              🔒 Auto (Gekoppeld)
                            </span>
                          </div>
                          {isEtoro && brokerCash && (
                            <span className="text-emerald-700 text-[11px] d-block mb-1">
                              Live op eToro: ${brokerCash.etoro?.amount?.toFixed(2)} USD (omgerekend naar EUR)
                            </span>
                          )}
                          {isDegiro && brokerCash && (
                            <span className="text-emerald-700 text-[11px] d-block mb-1">
                              Live op DeGiro: € {brokerCash.degiro?.amount?.toFixed(2)} EUR
                            </span>
                          )}
                          <div className="input-group mt-1">
                            <span className="input-group-text bg-emerald-100 border-emerald-200 text-emerald-900 font-bold">€</span>
                            <input
                              type="text"
                              readOnly
                              disabled
                              className="form-control fw-bold bg-emerald-100/40 border-emerald-200 text-emerald-950 cursor-not-allowed"
                              id={`input-${type.balance_type_id}`}
                              value={currentInputBalances[type.balance_type_id] || ''}
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Handmatige Rekeningen & Spaarpotten */}
                <h6 className="fw-bold text-secondary border-bottom pb-2 mb-3">
                  2. Handmatige Rekeningen & Overige Spaarpotten
                </h6>
                <div className="row g-3">
                  {balanceTypes.filter(t => !t.type_name.toLowerCase().includes('etoro') && !t.type_name.toLowerCase().includes('degiro')).map(type => (
                    <div className="col-md-6" key={type.balance_type_id}>
                      <label htmlFor={`input-${type.balance_type_id}`} className="form-label fw-semibold text-secondary small mb-1">
                        {type.type_name}
                      </label>
                      <div className="input-group">
                        <span className="input-group-text bg-light">€</span>
                        <input
                          type="text"
                          className="form-control"
                          id={`input-${type.balance_type_id}`}
                          value={currentInputBalances[type.balance_type_id] || ''}
                          onChange={(e) => handleInputChange(type.balance_type_id, e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-footer bg-light border-0 py-3">
                <button type="button" className="btn btn-outline-secondary rounded-pill px-4" onClick={handleCloseUpdateModal}>Annuleren</button>
                <button type="button" className="btn btn-primary rounded-pill px-4 fw-bold shadow-sm" onClick={handleSubmitUpdate}>Opslaan & Bijwerken</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AvailableBalance;
// components/HeaderBalanceDisplay.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api/available-balance'; // Pas dit aan indien nodig

const HeaderBalanceDisplay = () => {
  const [totalAmount, setTotalAmount] = useState(null); // Gebruik null om aan te geven dat data nog niet geladen is
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTotalBalance = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await axios.get(`${API_BASE_URL}/latest-balance`);
        setTotalAmount(response.data.totalAmount);
      } catch (err) {
        console.error('Fout bij ophalen totaal saldo voor header:', err);
        setError('Laden mislukt'); // Korte foutmelding voor de header
      } finally {
        setLoading(false);
      }
    };

    fetchTotalBalance();

    // Optioneel: Refresh de data periodiek als je realtime updates wilt
    // const intervalId = setInterval(fetchTotalBalance, 60000); // Elke minuut updaten
    // return () => clearInterval(intervalId); // Cleanup bij unmount
  }, []); // Lege dependency array betekent dat dit maar één keer wordt uitgevoerd bij mount

  return (
    // Het 'kadertje' voor het beschikbare vermogen
    // p-2: padding van 0.5rem rondom
    // rounded: licht afgeronde hoeken
    // border: een lichte rand
    // me-3: margin-end (rechts) voor afstand tot het volgende element (gebruikersprofiel)
    <div className="p-2 rounded border border-light bg-white text-center me-3" style={{ minWidth: '120px' }}>
      {/* Titel boven het bedrag */}
      {/* small: kleinere tekstgrootte
          text-muted: gedempte tekstkleur
          mb-1: margin-bottom van 0.25rem */}
      <div className="small text-muted mb-1">Beschikbaar Vermogen</div>
      {loading ? (
        // Laadstatus
        <span className="text-muted small">Laden...</span>
      ) : error ? (
        // Foutstatus
        <span className="text-danger small" title={error}>€ --.--</span>
      ) : (
        // Toon het totale bedrag, geformatteerd naar twee decimalen
        // fw-bold: vetgedrukt
        // text-success: groene tekstkleur (Bootstrap succes kleur)
        <span className="fw-bold text-success">
          € {totalAmount !== null ? totalAmount.toFixed(2) : '--.--'}
        </span>
      )}
    </div>
  );
};

export default HeaderBalanceDisplay;

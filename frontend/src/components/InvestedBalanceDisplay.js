// components/InvestedBalanceDisplay.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

// LET OP: Deze API_BASE_URL moet nog worden aangepast naar het daadwerkelijke backend endpoint
// voor geïnvesteerd vermogen zodra deze is geïmplementeerd.
// Voor nu zal het een standaardwaarde tonen of een foutmelding geven als het endpoint niet bestaat.
const API_BASE_URL = 'http://localhost:5000/api/invested-balance'; // Voorbeeld, pas aan naar jouw route

const InvestedBalanceDisplay = () => {
  const [investedAmount, setInvestedAmount] = useState(null); // Gebruik null om aan te geven dat data nog niet geladen is
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchInvestedBalance = async () => {
      try {
        setLoading(true);
        setError('');
        // Hier zou je een API-oproep doen naar je backend
        // die het totale geïnvesteerde vermogen ophaalt.
        // Bijvoorbeeld: const response = await axios.get(`${API_BASE_URL}/latest-invested-balance`);
        // Voor nu simuleren we even data, of vangen we de fout op als het endpoint niet bestaat.

        // Simulatie van data voor ontwikkeling:
        // const simulatedData = 25489.75;
        // setInvestedAmount(simulatedData);
        // console.log("LET OP: Geïnvesteerd vermogen is gesimuleerd. Implementeer backend-route voor actuele data.");

        // Echte API-aanroep (zal een fout geven als de route niet bestaat)
        const response = await axios.get(`${API_BASE_URL}/latest-invested-balance`);
        setInvestedAmount(response.data.totalAmount); // Gaat ervan uit dat de backend 'totalAmount' teruggeeft

      } catch (err) {
        console.error('Fout bij ophalen totaal geïnvesteerd saldo voor header:', err);
        // Stel een placeholder in bij een fout
        setInvestedAmount(0.00); // Of 'null' om '--.--' te tonen
        setError('Laden mislukt'); // Korte foutmelding voor de header
      } finally {
        setLoading(false);
      }
    };

    fetchInvestedBalance();

    // Optioneel: Refresh de data periodiek als je realtime updates wilt
    // const intervalId = setInterval(fetchInvestedBalance, 60000); // Elke minuut updaten
    // return () => clearInterval(intervalId); // Cleanup bij unmount
  }, []); // Lege dependency array betekent dat dit maar één keer wordt uitgevoerd bij mount

  return (
    // Het 'kadertje' voor het geïnvesteerde vermogen
    // p-2: padding van 0.5rem rondom
    // rounded: licht afgeronde hoeken
    // border: een lichte rand
    // me-3: margin-end (rechts) voor afstand tot het volgende element (gebruikersprofiel of ander kader)
    <div className="p-2 rounded border border-light bg-white text-center me-3" style={{ minWidth: '120px' }}>
      {/* Titel boven het bedrag */}
      {/* small: kleinere tekstgrootte
          text-muted: gedempte tekstkleur
          mb-1: margin-bottom van 0.25rem */}
      <div className="small text-muted mb-1">Geïnvesteerd Vermogen</div>
      {loading ? (
        // Laadstatus
        <span className="text-muted small">Laden...</span>
      ) : error ? (
        // Foutstatus
        <span className="text-danger small" title={error}>€ --.--</span>
      ) : (
        // Toon het totale bedrag, geformatteerd naar twee decimalen
        // fw-bold: vetgedrukt
        // text-info: blauwe tekstkleur (Bootstrap info kleur, kan aangepast worden)
        <span className="fw-bold text-info">
          € {investedAmount !== null ? investedAmount.toFixed(2) : '--.--'}
        </span>
      )}
    </div>
  );
};

export default InvestedBalanceDisplay;

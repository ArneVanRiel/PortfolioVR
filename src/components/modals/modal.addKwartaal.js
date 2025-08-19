import React, { useState, useEffect } from 'react';

function AddKwartaal() {
  const [tickers, setTickers] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [lastQuarter, setLastQuarter] = useState(null);
  const [newRow, setNewRow] = useState(null);


  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');
  const [fy, setFy] = useState('');
  const [fp, setFp] = useState('');
  const [form, setForm] = useState('');
  const [error, setError] = useState(""); // Voor foutmeldingen
  const [isFormValid, setIsFormValid] = useState(false); // Voor form validatie


  // Fetch tickers on load
  useEffect(() => {
    fetch('/api/tickers')
      .then(res => res.json())
      .then(data => setTickers(data.tickers))
      .catch(err => console.error('Error fetching tickers:', err));
  }, []);

  // Fetch last quarter when ticker is selected
  useEffect(() => {
    if (selectedTicker) {
      fetch(`/api/lastQuarter/${selectedTicker}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.lastQuarter) {
            setLastQuarter(data.lastQuarter);
            initializeNewRow(data.lastQuarter);
          }
        })
        .catch((err) => console.error("Error fetching last quarter:", err));
    }
  }, [selectedTicker]);

  const initializeNewRow = (lastQuarter) => {
    const { period_end_date, period_start_date, fy: lastFy, fp: lastFp } = lastQuarter;

    const newStartDate =
      lastFp === "FY"
        ? new Date(new Date(period_end_date).getTime() + 86400000) // +1 dag
        : new Date(period_start_date);

    let newFy = lastFy;
    let newFp = getNextFp(lastFp);
    let newForm = lastFp === "Q3" ? "10-K" : "10-Q";

    if (lastFp === "FY") {
      newFy += 1;
    }

    setPeriodStartDate(newStartDate.toISOString().split("T")[0]);
    setPeriodEndDate(""); // Leeg laten
    setFy(newFy);
    setFp(newFp);
    setForm(newForm);
  };

  const getNextFp = (currentFp) => {
    switch (currentFp) {
      case "Q1":
        return "Q2";
      case "Q2":
        return "Q3";
      case "Q3":
        return "FY";
      case "FY":
        return "Q1";
      default:
        return "";
    }
  };

  const validateEndDate = (startDate, endDate) => {
    if (!startDate || !endDate) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const oneYearLater = new Date(start);
    oneYearLater.setFullYear(start.getFullYear() + 1);

    if (end < start) {
      setError("Einddatum mag niet eerder zijn dan de startdatum.");
      return false;
    } else if (end > oneYearLater) {
      setError("Einddatum mag niet meer dan 1 jaar na de startdatum zijn.");
      return false;
    }

    setError(""); // Geen fouten
    return true;
  };

  const handleEndDateChange = (e) => {
    const value = e.target.value;
    setPeriodEndDate(value);

    // Valideer de einddatum
    validateEndDate(periodStartDate, value);
  };
  const validateForm = () => {
    // Alle velden moeten ingevuld zijn en er mag geen foutmelding zijn
    const isValid =
      selectedTicker &&
      periodStartDate &&
      periodEndDate &&
      fy &&
      fp &&
      form &&
      !error;
    setIsFormValid(isValid);
  };

  const postData = async () => {
    // Valideer einddatum voor het verzenden
    if (!validateEndDate(periodStartDate, periodEndDate)) {
      alert("Controleer de ingevulde gegevens.");
      return;
    }

    try {
      const response = await fetch("/api/addKwartaal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: selectedTicker,
          period_start_date: periodStartDate,
          period_end_date: periodEndDate,
          fy,
          fp,
          form,
        }),
      });

      if (response.ok) {
        alert("Kwartaal succesvol toegevoegd!");
      } else {
        const errorData = await response.json();
        alert("Er is een fout opgetreden: " + errorData.message);
      }
    } catch (error) {
      console.error("Error sending data:", error);
      alert("Serverfout. Probeer het later opnieuw.");
    }
  };

  useEffect(() => {
    // Hercontroleer of het formulier geldig is bij elke wijziging
    validateForm();
  }, [selectedTicker, periodStartDate, periodEndDate, fy, fp, form, error]);

  return (
    <div className="modal-content modal-zoom">
      <div className="modal-header" style={{ fontSize: '14px' }}>
        Ontbrekende kwartalen toevoegen
      </div>
      <div className="modal-body" style={{ padding: '10px' }}>
        <label>Ticker:</label>
        <select onChange={(e) => setSelectedTicker(e.target.value)} value={selectedTicker}>
          <option value="">Selecteer een ticker</option>
          {tickers.map((ticker) => (
            <option key={ticker} value={ticker}>{ticker}</option>
          ))}
        </select>
        {lastQuarter && (
          <>
            <h4>Laatste kwartaal</h4>
            <table className="modal-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Start Datum</th>
                  <th>Eind Datum</th>
                  <th>Jaar</th>
                  <th>Kwartaal</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{lastQuarter.ticker}</td>
                  <td>{lastQuarter.period_start_date}</td>
                  <td>{lastQuarter.period_end_date}</td>
                  <td>{lastQuarter.fy}</td>
                  <td>{lastQuarter.fp}</td>
                  <td>{lastQuarter.form}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
        {selectedTicker && (
          <>
            <h4>Nieuw kwartaal (bewerkbaar)</h4>
            <table className="modal-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Start Datum</th>
                  <th>Eind Datum</th>
                  <th>Jaar</th>
                  <th>Kwartaal</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{selectedTicker}</td>
                  <td>
                    <input
                      type="date"
                      className="input-cell"
                      value={periodStartDate}
                      onChange={(e) => setPeriodStartDate(e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="input-cell"
                      value={periodEndDate}
                      onChange={handleEndDateChange}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="input-cell"
                      value={fy}
                      onChange={(e) => setFy(e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="input-cell"
                      value={fp}
                      onChange={(e) => setFp(e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="input-cell"
                      value={form}
                      onChange={(e) => setForm(e.target.value)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            {error && <p className="error-message">{error}</p>}


            <button
              onClick={postData}
              className={`modal-button ${isFormValid ? "" : "disabled"}`}
              disabled={!isFormValid}
            >
              Voeg kwartaal toe
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default AddKwartaal;

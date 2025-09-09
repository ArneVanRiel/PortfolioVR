import React, { useState, useEffect } from "react";

const UpdateClosingPrices = () => {
  const [stocks, setStocks] = useState([]); // Aandelenlijst uit de database
  const [selectedStock, setSelectedStock] = useState(""); // Geselecteerde aandeel_id
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [updates, setUpdates] = useState([]);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [lastPriceUpdate, setLastPriceUpdate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Ophalen van aandelen uit de API
    const fetchStocks = async () => {
      try {
        const response = await fetch("/api/SelectStock");
        if (!response.ok) {
          throw new Error("Error fetching stocks");
        }
        const data = await response.json();
        setStocks(data);
      } catch (error) {
        console.error("Error fetching stocks:", error);
      }
    };
    fetchStocks();
  }, []);

  useEffect(() => {
    // Ophalen van aandelen uit de API
    const fetchStocks = async () => {
      try {
        const response = await fetch("/api/portfolio");
        if (!response.ok) throw new Error("Error fetching stocks");
        const data = await response.json();
        setStocks(data);
      } catch (error) {
        console.error("Error fetching stocks:", error);
      }
    };
    fetchStocks();
  }, []);

  useEffect(() => {
    const fetchLastUpdate = async () => {
      try {
        const response = await fetch("/api/lastPriceUpdate");
        if (!response.ok) throw new Error("Error fetching last update");

        const data = await response.json();
        setLastPriceUpdate(data.lastUpdatedAt);
      } catch (error) {
        console.error("Fout bij ophalen laatste update:", error);
      }
    };

    const checkAndUpdate = async () => {
      try {
        const response = await fetch("/api/checkUpdates");
        if (!response.ok) throw new Error("Error checking updates");

        const data = await response.json();
        setUpdates(data);

        if (data.length > 0) {
          await fetch("/api/updatePricesTest", { method: "POST" });
          await fetchLastUpdate(); // Update de laatste update-tijd na de update
        }
      } catch (error) {
        console.error("Fout bij checken of update nodig is:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLastUpdate();
    checkAndUpdate();
  }, []);

  const handleCheckUpdates = async () => {
    /*setIsCheckingUpdates(true);
    try {
      const response = await fetch("/api/checkUpdates");
      if (!response.ok) throw new Error("Error checking updates");
      const data = await response.json();
      
      setUpdates(data);
      
      if (data.length > 0) {
        await handleUpdatePrices();
      }
    } catch (error) {
      console.error("Error checking updates:", error);
    } finally {
      setIsCheckingUpdates(false);
    }*/
    setIsCheckingUpdates(true);
    try {
      const response = await fetch("/api/checkUpdates");
      if (!response.ok) throw new Error("Error checking updates");
      const data = await response.json();
      setUpdates(data);
    } catch (error) {
      console.error("Error checking updates:", error);
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleUpdatePrices = async () => {
    setIsUpdatingPrices(true);
    try {
      const response = await fetch("/api/updatePrices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        alert("Prijzen succesvol bijgewerkt.");
        setUpdates([]);
      } else {
        throw new Error("Fout bij het bijwerken van prijzen.");
      }
    } catch (error) {
      console.error("Error updating prices:", error);
      alert("Er is een fout opgetreden bij het bijwerken van prijzen.");
    } finally {
      setIsUpdatingPrices(false);
    }
  };

  const handleDailyAndWeeklyUpdate = async () => {
    if (!selectedStock) {
      alert("Selecteer een aandeel.");
      return;
    }

    try {
      const response = await fetch("/api/updateDailyAndWeeklyPrices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aandeel_id: selectedStock }),
      });

      if (response.ok) {
        alert("Dagelijkse en wekelijkse prijzen succesvol bijgewerkt.");
      } else {
        throw new Error("Fout bij het bijwerken van dagelijkse en wekelijkse prijzen.");
      }
    } catch (error) {
      console.error("Error updating daily and weekly prices:", error);
      alert("Er is een fout opgetreden bij het bijwerken van dagelijkse en wekelijkse prijzen.");
    }
  };

  const handleMonthlyUpdate = async () => {
    if (!selectedStock || !startDate || !endDate) {
      alert("Selecteer een aandeel en vul de start- en einddatum in.");
      return;
    }

    try {
      const response = await fetch("/api/updateMonthlyPrices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aandeel_id: selectedStock, startDate, endDate }),
      });

      if (response.ok) {
        alert("Maandelijkse prijzen succesvol bijgewerkt.");
      } else {
        throw new Error("Fout bij het bijwerken van maandelijkse prijzen.");
      }
    } catch (error) {
      console.error("Error updating monthly prices:", error);
      alert("Er is een fout opgetreden bij het bijwerken van maandelijkse prijzen.");
    }
  };

  return (
    <div>
      <h1>Prijzen bijwerken</h1>
      <div>
      <h2>Dagelijkse Koersupdates</h2>
        {loading ? (
          <p>Bezig met controleren op updates...</p>
        ) : (
          <p>Laatst bijgewerkt: {lastPriceUpdate ? new Date(lastPriceUpdate).toLocaleString() : "Nog niet bijgewerkt"}</p>
        )}
      </div>
      <button onClick={handleCheckUpdates} disabled={isCheckingUpdates}>
        {isCheckingUpdates ? "Controleren..." : "Check Updates"}
      </button>
      {updates.length > 0 && (
        <>
          <h3>Te updaten aandelen:</h3>
          <ul>
            {updates.map((update) => (
              <li key={update.aandeel_id}>
                {update.stock_name} ({update.ticker_symbol}): Laatste prijs op{" "}
                {update.last_closing_date}
              </li>
            ))}
          </ul>
          <button onClick={handleUpdatePrices} disabled={isUpdatingPrices}>
            {isUpdatingPrices ? "Bijwerken..." : "Update Prices"}
          </button>
        </>
      )}
      <h1>Update Prijzen</h1>
      <form>
        <label>
          Aandeel:
          <select
            value={selectedStock}
            onChange={(e) => setSelectedStock(e.target.value)}
            required
          >
            <option value="" disabled>
              Kies een aandeel
            </option>
            {stocks.map((stock) => (
              <option key={stock.aandeel_id} value={stock.aandeel_id}>
                {stock.name} ({stock.ticker_symbol})
              </option>
            ))}
          </select>
        </label>
        <div>
          <h3>Dagelijkse en Wekelijkse Prijzen</h3>
          <button type="button" onClick={handleDailyAndWeeklyUpdate}>
            Update Dagelijkse en Wekelijkse Prijzen
          </button>
        </div>
        <div>
          <h3>Maandelijkse Prijzen</h3>
          <label>
            Startdatum:
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </label>
          <label>
            Einddatum:
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </label>
          <button type="button" onClick={handleMonthlyUpdate}>
            Update Maandelijkse Prijzen
          </button>
        </div>
      </form>
    </div>
  );
};

export default UpdateClosingPrices;

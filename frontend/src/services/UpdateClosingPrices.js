import { useState, useEffect } from "react";

const UpdateClosingPrices = () => {
  const [lastUpdate, setLastUpdate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLastUpdate = async () => {
      try {
        const response = await fetch("/api/lastPriceUpdate");
        if (!response.ok) throw new Error("Error fetching last update");

        const data = await response.json();
        setLastUpdate(data.lastUpdatedAt);
      } catch (error) {
        console.error("Fout bij ophalen laatste update:", error);
      }
    };

    const checkAndUpdate = async () => {
      try {
        const response = await fetch("/api/checkAndUpdatePrices", { method: "POST" });
        if (!response.ok) throw new Error("Error checking and updating prices");

        const data = await response.json();
        if (data.updated) {
          fetchLastUpdate(); // Update de UI als er een update was
        }
      } catch (error) {
        console.error("Fout bij updaten van prijzen:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLastUpdate();
    checkAndUpdate();
  }, []);

  return (
    <div>
      <h2>Dagelijkse Koersupdates</h2>
      {loading ? (
        <p>Bezig met controleren op updates...</p>
      ) : (
        <p>Laatst bijgewerkt: {lastUpdate ? new Date(lastUpdate).toLocaleString() : "Nog niet bijgewerkt"}</p>
      )}
    </div>
  );
};

export default UpdateClosingPrices;

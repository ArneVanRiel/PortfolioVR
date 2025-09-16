import React, { useState } from "react";
import axios from "axios";

const StoreEarningsCalendar = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleStoreEarnings = async () => {
    setLoading(true);
    setMessage("");

    try {
      const response = await axios.post("/api/store-earnings-calendar");
      setMessage(response.data.message);
    } catch (error) {
      setMessage("Fout bij opslaan earnings calendar.");
      console.error(error);
    }

    setLoading(false);
  };

  return (
    <div>
      <h2>Earnings Calendar Updaten</h2>
      <button onClick={handleStoreEarnings} disabled={loading}>
        {loading ? "Laden..." : "Earnings Calendar Opslaan"}
      </button>
      {message && <p>{message}</p>}
    </div>
  );
};

export default StoreEarningsCalendar;

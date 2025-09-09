import React, { useState, useEffect } from "react";
import axios from "axios";

const dataPeriods = {
  StockholdersEquity: 45 * 3, // 45 kwartalen
  NetCashProvidedByUsedInOperatingActivities: 44 * 3,
  PurchasesOfPropertyAndEquipment: 44 * 3,
  LiabilitiesCurrent: 8 * 3,
  Liabilities: 8 * 3,
  NetIncomeLoss: 44 * 3,
  /*period_end_date: 52 * 3,*/
};

function TickerOverview() {
  const [tickers, setTickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortedTickers, setSortedTickers] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [tickerData, setTickerData] = useState([]);
  const [openIndex, setOpenIndex] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: "ticker", direction: "asc" });

  useEffect(() => {
    fetchTickers();
  }, []);

  const fetchTickers = async () => {
    try {
      const response = await axios.post("http://localhost:5000/api/tickers", { dataPeriods });
      setTickers(response.data);
      setSortedTickers(response.data);
    } catch (error) {
      setError("Fout bij ophalen van tickers");
      console.error("Fout bij ophalen van tickers:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p>Data laden...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  const fetchTickerData = async (ticker, index) => {
    if (selectedTicker === ticker) {
      setSelectedTicker(null);
      setOpenIndex(null);
      return;
    }
    try {
      const response = await axios.get(`http://localhost:5000/api/ticker-data/${ticker}`);
      setTickerData(response.data);
      setSelectedTicker(ticker);
      setOpenIndex(index);
    } catch (error) {
      console.error("Fout bij ophalen van ticker data:", error);
    }
  };

  const getBatteryColor = (percentage) => {
    if (percentage >= 75) return "green";
    if (percentage >= 50) return "yellow";
    if (percentage >= 25) return "orange";
    return "red";
  };

  const sortData = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    const sorted = [...tickers].sort((a, b) => {
      if (key === "ticker") {
        return direction === "asc" ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker);
      }
      if (key === "percentage") {
        return direction === "asc" ? a.count - b.count : b.count - a.count;
      }
      return 0;
    });

    setSortedTickers(sorted);
    setSortConfig({ key, direction });
  };

  return (
    <div>
      <h2>Ticker Overzicht</h2>
      <table border="1" cellPadding="5">
        <thead>
          <tr>
            <th onClick={() => sortData("ticker")} style={{ cursor: "pointer" }}>
              Ticker {sortConfig.key === "ticker" ? (sortConfig.direction === "asc" ? "🔼" : "🔽") : ""}
            </th>
            <th>Aantal records</th>
            <th onClick={() => sortData("percentage")} style={{ cursor: "pointer" }}>
              Completeness {sortConfig.key === "percentage" ? (sortConfig.direction === "asc" ? "🔼" : "🔽") : ""}
            </th>
            <th>fast check 1: NetCashProvidedByUsedInOperatingActivities - PurchasesOfPropertyAndEquipment van de FY's (2 opties: vinkje, kruisje + datum laatste kruisje)</th>
            <th>fast check 2: (Liabilities - LiabilitiesCurrent)/ StockholdersEquity van de laatste 3 maanden (3 opties: niet beschikbaar, vinkje of kruisje + waarde van de bewerking)</th>
            <th>criteria 1: alle FCF (jaar) &gt;0</th>
            <th>criteria 2: FCF gemiddelde groei &gt;0</th>
            <th>criteria 3: gem ROE (10Y) &gt;15</th>
            <th>criteria 4: ROE waardefactor &gt;0</th>
            <th>criteria 5: LTD waardefactor &lt; 0.5</th>
          </tr>
        </thead>
        <tbody>
          {sortedTickers.map(({ ticker, count, fastCheck1, lastNegativeDate, fastCheck2, fastCheck2Value }, index) => {
            const maxCount = 193; // Aangepaste max records
            const percentage = ((count / maxCount) * 100).toFixed(1);
            const batteryColor = getBatteryColor(percentage);

            return (
              <React.Fragment key={ticker.ticker}>
                <tr onClick={() => fetchTickerData(ticker, index)} style={{ cursor: "pointer", background: openIndex === index ? "#ddd" : "white" }}>
                  <td>{ticker}</td>
                  <td>{count} / {maxCount}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <div
                        style={{
                          width: "50px",
                          height: "20px",
                          border: "2px solid black",
                          borderRadius: "4px",
                          position: "relative",
                          background: "#ccc",
                          overflow: "hidden",
                          marginRight: "10px",
                        }}
                      >
                        <div
                          style={{
                            width: `${percentage}%`,
                            height: "100%",
                            background: batteryColor,
                          }}
                        />
                      </div>
                      {percentage}%
                    </div>
                  </td>
                  <td>{fastCheck1} + {lastNegativeDate}</td>
                  <td>{fastCheck2} + {fastCheck2Value}</td>

                </tr>
                {openIndex === index && (
                  <tr>
                    <td colSpan="3">
                      <table border="1" cellPadding="5" width="100%">
                        <thead>
                          <tr>
                            <th>Period End Date</th>
                            <th>Quarter</th>
                            <th>Data Type</th>
                            <th>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tickerData.map((data, i) => (
                            <tr key={i}>
                              <td>{data.period_end_date.split("T")[0]}</td>
                              <td>Q{data.form_id}</td>
                              <td>{data.data_type}</td>
                              <td>{data.value !== null ? data.value : "N/A"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default TickerOverview;

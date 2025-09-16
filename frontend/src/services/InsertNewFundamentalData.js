import React, { useState, useEffect } from "react";
import axios from "axios";

const InsertNewFundamentalData = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
  
    useEffect(() => {
      async function fetchData() {
        const response = await axios.get('/api/latestData'); // Endpoint voor tickers en period_end_date
        setData(response.data);
      }
      fetchData();
    }, []);
  
    const handleFetchMissingData = async (ticker) => {
      setLoading(true);
      try {
        const response = await axios.post('/api/fetch-missing-data', { ticker });
        console.log(`Ontbrekende data voor ${ticker}:`, response.data);
      } catch (error) {
        console.error('Fout bij ophalen data:', error);
      }
      setLoading(false);
    };

    const formatDate = (date) => {
        const d = new Date(date);
        return d.toISOString().split('T')[0]; // Formatteer als YYYY-MM-DD
      };
    
    const isOlderThanFourMonths = (date) => {
    const fourMonthsAgo = new Date();
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
    return new Date(date) < fourMonthsAgo;
    };
  
    return (
      <table border="1">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Laatste fiscale einddatum in db</th>
            <th>Laatst gewijzigd (nog toe te voegen)</th>
            <th>Volgend rapport datum - fiscale einddatum</th>
            <th>Actie</th>
          </tr>
        </thead>
        <tbody>
          {data.map( row => (
            <tr key={row.ticker}>
              <td>{row.ticker}</td>
              <td style={{ color: isOlderThanFourMonths(row.period_end_date) ? 'red' : 'black' }}>
                {formatDate(row.period_end_date)}
              </td>
              <td>{formatDate(row.period_end_date)}</td>
              <td>{`${formatDate(row.next_report_date)} - ${formatDate(row.fiscalDateEnding)}`}</td>
              <td>
                <button onClick={() => handleFetchMissingData(row.ticker)} disabled={loading}>
                  {loading ? 'Laden...' : 'Ontbrekende data toevoegen'}
                </button>
                <button>
                    Check alle data opnieuw
                </button>
                <button>
                    Handmatig toevoegen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

export default InsertNewFundamentalData;

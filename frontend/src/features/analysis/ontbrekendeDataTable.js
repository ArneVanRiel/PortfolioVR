// DataDisplay.js
import React, { useState, useEffect } from 'react';

function OntbrekendeDataTable(props) {
  const [data, setData] = useState([]);

  const ticker = props.tickerUpdated
  const loadData = props.loadData

  const fetchSingleData = () => {
    if (loadData) {
    fetch(`/api/data/${ticker}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then((data) => setData(data))
      .catch((error) => console.error('Error fetcshing data:', error));
    }
  };

  useEffect(() => {
    fetchSingleData()
  }, [loadData]);

  return (
      <>
      <table style={{ fontSize: "12px" }}>
      <thead>
        <tr>
          <th>ticker</th>
          <th># Onvolledige data</th>
          <th>Onvolledige data (%)</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item) => (
          <tr key={item.id}>
            <td>{item.ticker}</td>
            <td>100</td>
            <td>12,3%</td>

          </tr>
        ))}
      </tbody>
    </table></>
  );
}

export default OntbrekendeDataTable;
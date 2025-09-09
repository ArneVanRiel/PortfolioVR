// DataDisplay.js
import React, { useState, useEffect } from 'react';

function DataDisplay() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch('/api/tickersInDb')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then((data) => setData(data))
      .catch((error) => console.error('Error fetching data:', error));
  });

  return (
    <div>
      <h1>Data from Azure SQL Database</h1>
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>laatst geupdated</th>
            {/* Add other columns here */}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id}>
              <td>{item.ticker}</td>
              <td>update</td>
              {/* Add other cells here */ }
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataDisplay;
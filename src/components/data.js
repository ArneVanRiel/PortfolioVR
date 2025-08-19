// DataDisplay.js
import React, { useState, useEffect } from 'react';

function AandelenData() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch('/api/aandelenData')
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
      <h1>Data</h1>
      <table>
        <thead>
          <tr>
            <th>period_start_date</th>
            <th>period_end_date</th>
            <th>fp</th>
            <th>form</th>
            <th>Ticker symbol</th>
            <th>LiabilitiesCurrent</th>
            <th>Liabilities</th>
            <th>StockholdersEquity</th>
            <th>NetIncomeLoss</th>
            <th>NetCashProvidedByUsedInOperatingActivities</th>
            <th>PurchasesOfPropertyAndEquipment</th>
            <th>Revenues</th>
            <th>WeightedAverageNumberOfDilutedSharesOutstanding</th>
            <th>Dividend</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id}>
              <td>{item.period_start_date}</td>
              <td>{item.period_end_date}</td>
              <td>{item.fp}</td>
              <td>{item.form}</td>
              <td>{item.ticker}</td>
              <td>{item.LiabilitiesCurrent}</td>
              <td>{item.Liabilities}</td>
              <td>{item.StockholdersEquity}</td>
              <td>{item.NetIncomeLoss}</td>
              <td>{item.NetCashProvidedByUsedInOperatingActivities}</td>
              <td>{item.PurchasesOfPropertyAndEquipment}</td>
              <td>{item.Revenues}</td>
              <td>{item.WeightedAverageNumberOfDilutedSharesOutstanding}</td>
              <td>{item.Dividend}</td>
              {/* Add other cells here */ }
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AandelenData;
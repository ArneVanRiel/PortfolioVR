// DataDisplay.js
import React, { useState, useEffect } from 'react';

function DataTable(props) {
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
      <><h2>{ticker}</h2>
      <table style={{ fontSize: "12px" }}>
      <thead>
        <tr>
          <th>period_start_date</th>
          <th>period_end_date</th>
          <th>fy</th>
          <th>fp</th>
          <th>form</th>
          <th>ticker</th>
          <th>LiabilitiesCurrent</th>
          <th>Liabilities</th>
          <th>StockholdersEquity</th>
          <th>NetIncomeLoss</th>
          <th>NetCashProvidedByUsedInOperatingActivities</th>
          <th>PurchasesOfPropertyAndEquipment</th>
          <th>Revenues</th>
          <th>WeightedAverageNumberOfDilutedSharesOutstanding</th>
          <th>Dividend</th>
          <th>toegevoegd door?</th>
          <th>toevoegingstype</th>
          <th>wijzigingsdatum</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item) => (
          <tr key={item.id}>
            <td>{item.period_start_date}</td>
            <td>{item.period_end_date}</td>
            <td>{item.fy}</td>
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
            <td>ArneVanRiel</td>
            <td>SEC</td>
            <td>24/02/2024</td>

          </tr>
        ))}
      </tbody>
    </table></>
  );
}

export default DataTable;
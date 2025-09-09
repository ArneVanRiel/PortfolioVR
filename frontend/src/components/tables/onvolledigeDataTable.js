// DataDisplay.js
import React, { useState, useEffect } from 'react';

function OnvolledigeDataTable({childToParent}) {
  const [data, setData] = useState([]);



  const fetchSingleData = () => {
    fetch(`/api/getOnvolledigeData`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then((data) => setData(data))
      .catch((error) => console.error('Error fetcshing data:', error));
    
  };

  useEffect(() => {
    fetchSingleData()
  });

  const [selectedRow, setSelectedRow] = useState(-1);



  return (
      <>
      <p>{selectedRow}</p>
      <table style={{ fontSize: "12px" }}>
      <thead>
        <tr>
          <th>ticker</th>
          <th># Onvolledige data</th>
          <th>Onvolledige data (%)</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item, index) => (
          <tr key={index} onClick={() => childToParent(item.ticker)}>
            <td>{item.ticker}</td>
            <td>{item.hoeveelheidOntbrekendeDataCels}</td>
            <td>{item.percOntbrekendeDataCels}</td>

          </tr>
        ))}
      </tbody>
    </table></>
  );
}

export default OnvolledigeDataTable;
// DataDisplay.js
import React, { useState, useEffect } from 'react';
import '../App.css';

function AandelenData() {
  const [data, setData] = useState([]);
  const [open, setOpen] = React.useState(false);

  const handleClickOpen = () => {
    //setOpen(true);
    //const x = document.getElementById("showFullStockTable");
    const x = document.getElementById("showFullStockTable");
    if (x.style.display === "none") {
      x.style.display = "block";
    } else {
      x.style.display = "none";
    }
  };

  const handleClose = () => {
    setOpen(false);
  };
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
      <table>
        <thead>
          <tr>
            <td><input type='checkbox'></input></td>
            <th><p>Ticker symbol <i class="arrow right" onClick={handleClickOpen} ></i></p></th>
            <th className="showFullStockTable" style={{display:"none"}} >Laatst geupdated</th>
            <th className="showFullStockTable" style={{display:"none"}} id='showFullStockTable'>compleetheid (%)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id}>
              <td><input type='checkbox'></input></td>
              <td>{item.ticker}</td>
              <td className='to-do showFullStockTable' style={{display:"none"}} id='showFullStockTable'>bv.: 24/02/2024 22:34</td>
              <td className='to-do showFullStockTable' style={{display:"none"}} id='showFullStockTable'>98%</td>
            </tr>
          ))}
        </tbody>
      </table>
  );
}

export default AandelenData;
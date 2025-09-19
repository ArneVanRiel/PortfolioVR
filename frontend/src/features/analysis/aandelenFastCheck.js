// DataDisplay.js
import React, { useState, useEffect } from 'react';
import '../../App.css';

function TickersFastCheck() {
  const [tickersFastCheckNotOk, settickersFastCheckNotOk] = useState([]);
  const [tickers, settickers] = useState([]);

  useEffect(() => {
    fetch('/api/tickersFastCheckNotOk')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then((tickersFastCheckNotOk) => settickersFastCheckNotOk(tickersFastCheckNotOk))
      .catch((error) => console.error('Error fetching data:', error));
  });

  useEffect(() => {
    fetch('/api/tickersInDb')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then((tickers) => settickers(tickers))
      .catch((error) => console.error('Error fetching data:', error));
  });
  const tickersFastCheckOk = tickers.filter((value) =>
  !tickersFastCheckNotOk.some((otherValue) => value.ticker === otherValue.ticker)
);

  return (
      <table>
        <thead>
          <tr>
            <td><input type='checkbox'></input></td>
            <th><p>Ticker symbol</p></th>
          </tr>
        </thead>
        <tbody>
          {tickersFastCheckOk.map((item) => (
            <tr key={item.id}>
              <td><input type='checkbox'></input></td>
              <td>{item.ticker}</td>
              {/* Add other cells here */ }
            </tr>
          ))}
        </tbody>
      </table>
  );
}

export default TickersFastCheck;
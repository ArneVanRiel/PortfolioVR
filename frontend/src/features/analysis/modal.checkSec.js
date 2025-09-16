// DataDisplay.js
import React, { useState, useEffect } from 'react';

function CheckSec(props) {
  //const ticker = props.tickerUpdated
  const [ticker, setTicker] = useState('AAPL'); // Voorbeeld ticker

  const [filteredData, setFilteredData] = useState([]);
  const [filteredData2, setFilteredData2] = useState([]);


  const [secData, setSecData] = useState(null);

  useEffect(() => {
    // Functie om SEC-data op te halen
    const fetchSecData = async () => {
      try {
        const response = await fetch(`/api/getSecData/${ticker}`);
        const data = await response.json();
        setSecData(data); // Update de staat met de opgehaalde data
      } catch (error) {
        console.error('Fout bij het ophalen van SEC-data:', error);
      }
    };

    if (ticker) {
      fetchSecData();
    }
  }, [ticker]); // Deze functie wordt opnieuw uitgevoerd wanneer 'ticker' verandert

  useEffect(() => {
    const result = secData.filter(item => item.in_database === 'True');
    setFilteredData(result);
  }, [secData]);

  useEffect(() => {
    const result = secData.filter(item => item.in_database === 'False');
    setFilteredData2(result);
  }, [secData]);

  const postData = () => {
    fetch('/api/updateDataWithSec', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(filteredData2)
        })
        .then((response) => response.json())
        .then((data) => {
            console.log('Data sent successfully:', data);
        })
        .catch((error) => {
            console.error('Error sending data:', error);
        });
}

  return (
    <>
      <div className='modal-content modal-zoom'>
        <div className='modal-header' style={{ fontSize: "14px"}}>Check Sec</div>
        <h2>{ticker}</h2>
        <p># kwartalen gevonden</p>
        <p># ontbrekende kwartalen de laatste 10 jaar</p>
        <p className='to-do'>showt de data die wordt toegevoegd in database, opsplitsen: data die al correct is en data die geupdated kan worden.
        met kleur werken?, bv groen zit al in database, rood kan geupdate worden</p>
        <div className='row'>
        <div className='col-6'>
        <h2>Correcte data in database</h2>
          <p>filter:</p>
          <button className="button" name='button'>AssetsCurrent</button>
          <button className="button" name='button'>Assets</button>
          <button className="button" name='button'>LiabilitiesCurrent</button>
          <button className="button" name='button'>Liabilities</button>
          <button className="button" name='button'>LiabilitiesCurrent</button>
          <button className="button" name='button'>LiabilitiesCurrent</button>
          <button className="button" name='button'>LiabilitiesCurrent</button>

                <table class="table tablesorter scrollbar">
                  <thead class="text-primary">
                    <tr>
                      <th>Ticker</th>
                      <th>Period end date</th>
                      <th>Fundamental name</th>
                      <th>Fundamental value</th>
                    </tr>
                  </thead>
                  <tbody id="ontbrekendeData">
                  {filteredData.map((item) => (
                    <tr key={item.id}>
                      <td >{item.ticker}</td>
                      <td>{item.period_end_date}</td>
                      <td>{item.fundamental_name}</td>
                      <td>{item.fundamental_value}</td>
                    </tr>
                    ))}

                  </tbody>
                </table>
                </div>
                <div className='col-6'>
          <h2>data Sec komt niet overeen met data in database</h2>
          <button className="button" name='button' onClick={postData}>Change data</button>
          <button className="button" name='button' onClick="">Add data</button>

          <table class="table tablesorter scrollbar ">
                  <thead class="text-primary">
                    <tr>
                      <th>Ticker</th>
                      <th>Period end date</th>
                      <th>Fundamental name</th>
                      <th>Fundamental value</th>
                      <th>Fundamental value DB</th>
                    </tr>
                  </thead>
                  <tbody id="ontbrekendeData">
                  {filteredData2.map((item) => (
                    <tr key={item.id}>
                      <td >{item.ticker}</td>
                      <td>{item.period_end_date}</td>
                      <td>{item.fundamental_name}</td>
                      <td>{item.fundamental_value}</td>
                      <td>{item.fundamental_value_db}</td>
                    </tr>
                    ))}

                  </tbody>
                </table>
                </div>
              </div>
              <div className='row'>
              <h2>kwartalen die niet gevonden zijn bij Sec, wel in database</h2>

              </div>
        </div>
        <div>
      {/* Render logica voor je component */}
      {secData && (
        <div>
          {/* Map over je secData en render de data */}
          {secData && secData.map((item, index) => (
            <div key={index}>
              <p>{item.ticker}: {item.fundamental_name} - {item.fundamental_value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
</>
  );
}

export default CheckSec;
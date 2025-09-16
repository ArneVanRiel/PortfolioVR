// DataDisplay.js
import React, { useState, useEffect } from 'react';

function TransactionsTable() {

  return (
      <table style={{fontSize:"12px"}}>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Ticker</th>
            <th>Naam</th>
            <th>Actie</th>
            <th>Hoeveelheid</th>
            <th>prijs</th>
            <th>Totaal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr className='to-do'>
            <td style={{padding:"4px"}}>24/02/2024</td>
            <td>NVDA</td>
            <td>Nvidia</td>
            <td>Sell</td>
            <td>0,71</td>
            <td>750</td>
            <td>532,5</td>
            <td><button className="btn-danger">delete</button></td>
          </tr>
          <tr className='to-do'>
            <td>24/02/2024</td>
            <td>NVDA</td>
            <td>Nvidia</td>
            <td>Sell</td>
            <td>0,71</td>
            <td>750</td>
            <td>532,5</td>
            <td><button className="btn-danger">delete</button></td>
          </tr>
        </tbody>
      </table>
  );
}

export default TransactionsTable;
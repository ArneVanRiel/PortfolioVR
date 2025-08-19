// DataDisplay.js
import React, { useState, useEffect } from 'react';

function TeInvesterenTable() {

  return (
      <table style={{fontSize:"12px"}}>
        <thead>
          <tr>
            <th>datum</th>
            <th>Ticker</th>
            <th>Koopmarge</th>
            <th>Ideale verdeling</th>
            <th>prijs</th>
            <th>Te investeren</th>
          </tr>
        </thead>
        <tbody>
          <tr className='to-do'>
            <td>19/03/2024</td>
            <td>GOOGL</td>
            <td>-55,00%</td>
            <td>4,00%</td>
            <td>147 $</td>
            <td>20 $</td>
          </tr>
          <tr className='to-do'>
            <td>01/03/2024</td>
            <td>GOOGL</td>
            <td>-55,00%</td>
            <td>4,00%</td>
            <td>147 $</td>
            <td>20 $</td>
          </tr>
          <tr className='to-do'>
            <td>01/02/2024</td>
            <td>GOOGL</td>
            <td>-55,00%</td>
            <td>4,00%</td>
            <td>147 $</td>
            <td>20 $</td>
          </tr>
          <tr className='to-do'>
            <td>01/01/2024</td>
            <td>GOOGL</td>
            <td>-55,00%</td>
            <td>4,00%</td>
            <td>147 $</td>
            <td>20 $</td>
          </tr>
          <tr className='to-do'>
            <td>01/12/2023</td>
            <td>GOOGL</td>
            <td>-55,00%</td>
            <td>4,00%</td>
            <td>147 $</td>
            <td>20 $</td>
          </tr>
          <tr className='to-do'>
            <td>01/11/2023</td>
            <td>GOOGL</td>
            <td>-55,00%</td>
            <td>4,00%</td>
            <td>147 $</td>
            <td>20 $</td>
          </tr>
          <tr className='to-do'>
            <td>01/10/2023</td>
            <td>GOOGL</td>
            <td>-55,00%</td>
            <td>4,00%</td>
            <td>147 $</td>
            <td>20 $</td>
          </tr>

        </tbody>
      </table>
  );
}

export default TeInvesterenTable;
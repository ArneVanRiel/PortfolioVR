// DataDisplay.js
import React, { useState, useEffect } from 'react';

function UpdateHandmatig() {

  return (
    <>
      <div className='modal-content modal-zoom'>
        <div className='modal-header' style={{ fontSize: "14px"}}>Update handmatig</div>
        <div className='modal-body' style={{ padding: "10px" }}>
              <label id='tickerSearchBox'>Datum: (showt als ticker wordt gevonden in database)</label>
              <input type="text" id='tickerSearchBox' placeholder='YYYY-MM-DD (input met keuzemenu)'></input>
              <label id='type'>Type: (showt als ticker en datum wordt gevonden in database)</label>
              <input type="text" id='type' placeholder='Net Income, ... (keuzemenu)'></input>
              <select value="test" onChange="test">
                <option value="LiabilitiesCurrent">LiabilitiesCurrent</option>
                <option value="Liabilities">Liabilities</option>
                <option value="StockholdersEquity">StockholdersEquity</option>
              </select>
              <label id='waarde'>Waarde:</label>
              <input type="text" id='waarde' placeholder='waarde (als er al data in database zit, showt de data die in de database zit)'></input>
              <button className="button" name='button' onClick="">Change data</button>
        </div>
        <div className='modal-footer'>

        </div>
      </div>
</>
  );
}

export default UpdateHandmatig;
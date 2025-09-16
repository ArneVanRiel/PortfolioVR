// DataDisplay.js
import React, { useState, useEffect } from 'react';

function AddAvailableCash() {


  return (
    <div className='x-window' style={{width:"350px", fontSize:"12px", borderColor:"#4079ac", borderWidth:"2px", borderStyle:"solid", backgroundColor:"#ffffff"}}>
      <div className='x-window-header' style={{fontSize:"14px", backgroundColor:"#4079ac"}}>Update beschikbaar te investeren (popup)</div>
      <div className='x-window-body' style={{padding:"10px"}}>
        <div className='x-window-form-item' style={{paddingBottom:"5px"}}>
          <label id='tickerSearchBox' style={{width:"105px"}}>beschikbare cash te investeren saldo:</label>
          <input id='tickerSearchBox' style={{width:"170px"}} value={'bv.: 1000 - kan niet aangepast worden, wordt berekend'}></input>
        </div>
        <div className='x-window-form-item' style={{paddingBottom:"5px"}}>
          <label id='dateSearchBox' style={{width:"105px"}}>Datum:</label>
          <input id='dateSearchBox' style={{width:"170px"}} value={"automatisch datum van vandaag invullen"}></input>
        </div>
        <div className='x-window-form-item' style={{paddingBottom:"5px"}}>
          <label id='typeSearchBox' style={{width:"105px"}}>Type:</label>
          <input id='typeSearchBox' value="Toevoegen, Verminderen, nieuwe input" style={{width:"170px"}}></input>
        </div>
        <div className='x-window-form-item' style={{paddingBottom:"5px"}}>
          <label id='quantitySearchBox' style={{width:"105px"}}>Hoeveelheid:</label>
          <input id='quantitySearchBox' style={{width:"170px"}}></input>
        </div>
      </div>
      <div className='x-window-footer' style={{backgroundColor:"#ececec"}}>
        <p style={{fontSize:"14px", margin:"10px", minWidth:"75px", backgroundColor:"#4079ac"}}>OK</p>
        <p style={{fontSize:"14px", margin:"10px", minWidth:"75px", backgroundColor:"#4079ac"}}>cancel</p>
      </div>
    </div>
  );
}

export default AddAvailableCash;
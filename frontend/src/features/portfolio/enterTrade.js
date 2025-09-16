// DataDisplay.js
import React, { useState, useEffect } from 'react';

function EnterTrade() {


  return (
    <div className='x-window' style={{width:"350px", fontSize:"12px", borderColor:"#4079ac", borderWidth:"2px", borderStyle:"solid", backgroundColor:"#ffffff"}}>
      <div className='x-window-header' style={{fontSize:"14px", backgroundColor:"#4079ac"}}>Enter trade (popup)</div>
      <div className='x-window-body' style={{padding:"10px"}}>
        <div className='x-window-form-item' style={{paddingBottom:"5px"}}>
          <label id='tickerSearchBox' style={{width:"105px"}}>Ticker:</label>
          <input type="text" id='tickerSearchBox'></input>
        </div>
        <div className='x-window-form-item' style={{paddingBottom:"5px"}}>
          <label id='dateSearchBox' style={{width:"105px"}}>Datum:</label>
          <input type="text" id='dateSearchBox'></input>
        </div>
        <div className='x-window-form-item' style={{paddingBottom:"5px"}}>
          <label id='typeSearchBox' style={{width:"105px"}}>Type:</label>
          <input type="text" id='typeSearchBox' value="Buy"></input>
        </div>
        <div className='x-window-form-item' style={{paddingBottom:"5px"}}>
          <label id='quantitySearchBox' style={{width:"105px"}}>Hoeveelheid:</label>
          <input id='quantitySearchBox'></input>
        </div>
        <div className='x-window-form-item' style={{paddingBottom:"5px"}}>
          <label id='priceSearchBox' style={{width:"105px"}}>Prijs:</label>
          <input id='priceSearchBox' style={{width:"170px"}}></input>
        </div>
        <div className='x-window-form-item' style={{paddingBottom:"5px"}}>
          <label id='totalSearchBox' style={{width:"105px"}}>Totaal:</label>
          <input id='totalSearchBox' style={{width:"170px"}} value={"kan niet aangepast worden, wordt berekend"}></input>
        </div>
      </div>
      <div className='x-window-footer' style={{backgroundColor:"#ececec"}}>
        <a style={{fontSize:"14px", margin:"10px", minWidth:"75px", backgroundColor:"#4079ac"}}>Add</a>
        <p style={{fontSize:"14px", margin:"10px", minWidth:"75px", backgroundColor:"#4079ac"}}>Add and finish</p>
        <p style={{fontSize:"14px", margin:"10px", minWidth:"75px", backgroundColor:"#4079ac"}}>cancel</p>
      </div>
    </div>
  );
}

export default EnterTrade;
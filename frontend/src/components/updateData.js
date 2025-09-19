// DataDisplay.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AandelenData from '../features/analysis/aandelenList';
import CheckSec from '../features/analysis/modal.checkSec';
import UpdateHandmatig from './modals/modal.updateHandmatig';
import TransactionsTable from '../features/dashboard/transactionsTable.dashboard';
import AddKwartaal from '../features/analysis/modal.addKwartaal';
import DataTable from './ui/dataTable';
import OnvolledigeDataTable from '../features/analysis/onvolledigeDataTable';
import OntbrekendeDataTable from '../features/analysis/ontbrekendeDataTable';
import SaveClosingPrices from '../services/SaveClosingPrices';
import MonthlyClosingPrices from '../services/MonthlyClosingPrices';
import InsertNewFundamentalData from '../services/InsertNewFundamentalData';
import StoreEarningsCalendar from '../services/StoreEarningsCalendar';
import TickerOverview from '../features/analysis/TickerOverview';
import IntrinsicValueCalculator from '../features/analysis/IntrinsicValueCalculator';

function UpdateData() {
  const [ticker, setTicker] = useState('');
  const [tickerUpdated, setTickerUpdated] = useState(ticker);
  const [datum, setDatum] = useState('');
  const [type, setType] = useState('');
  const [waarde, setWaarde] = useState('');
  const [loadData, setLoadData] = useState(false);
  const [stocks, setStocks] = useState([]);

  const [checkSecModal, setCheckSecModal] = useState(false);
  const handleSecModal = () => {
    setCheckSecModal(!checkSecModal);
}
const [updateHandmatigModal, setUpdateHandmatigModal] = useState(false);
const handleUpdateHandmatigModal = () => {
  setUpdateHandmatigModal(!updateHandmatigModal);
}
const [addKwartaalModal, setAddKwartaalModal] = useState(false);
const handleAddKwartaalModal = () => {
  setAddKwartaalModal(!addKwartaalModal);
}

  const searchTicker = (e) => {
    setTicker(e.target.value);
    setLoadData(false);
  }

  const handleTickerButton = () => {
    setTickerUpdated(ticker);
    setLoadData(true);
  }
  useEffect(() => {
    
  })
  const childToParent = (ticker) => {
    setLoadData(false);
    setTickerUpdated(ticker)
    setLoadData(true);
  }

  const loadDataToFalse = () => {
    setLoadData(false);
  }

  useEffect(() => {
      const fetchStocks = async () => {
          try {
              const response = await axios.get('/api/selectStocks');
              setStocks(response.data);
          } catch (error) {
              console.error('Fout bij ophalen van aandelen:', error);
          }
      };

      fetchStocks();
  }, []);

  const postData = async () => {
    try {
        const response = await fetch('/api/changeSingleValue', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(
            { ticker: ticker, userEmail:"3" } // iets mis met userEmail, mssn ook rest van datacolommen, kan maar 1 karakter opslagen
            )
        });

        const data = await response.json();
        //setResponseMessage(data.message);
    } catch (error) {
        console.error('Error sending POST request:', error);
    }
    };

  return (
    <>
    <div className="row">
      <div className="tab-bar">
          <a className="tab tab-active" >Enkele ticker</a>
          <a className="tab" onClick="">Tickers van ideale portfolio</a>
          <a className="tab" onClick="">Tickers die bijna voldoen aan ideale portfolio</a>
          <a className="tab" onClick="">Alle tickers</a>
      </div>
    </div>
    <div className="content">
        <div className="row">
            <IntrinsicValueCalculator/>
            <TickerOverview/>
            <StoreEarningsCalendar/>
            <InsertNewFundamentalData/>
            <SaveClosingPrices/>
            {/*<MonthlyClosingPrices stocks={stocks}/>*/}
            <div className="col-3">
                <div className="content-block">
                    <div className="toolbar">
                        <div className='row'>
                            <p>Onvolledige data</p>
                        </div>
                    </div>
                    <OnvolledigeDataTable childToParent = {childToParent} loadData= {loadData}/>
                </div>
                <div className="content-block">
                    <div className="toolbar">
                        <div className='row'>
                            <p>Ontbrekende data</p>
                        </div>
                    </div>
                    <OntbrekendeDataTable tickerUpdated = {tickerUpdated} loadData= {loadData}/>
                </div>
            </div>
          <div className="col-9">
            <div className="content-block">
                <div className="toolbar">
                <div className='input-field-toolbar'>
                            <label id='tickerSearch'>Ticker:</label>
                            <input value={ticker} type="text" id='tickerSearch' onChange={searchTicker}></input>
                        </div>
                        <button className="button" name='button' primary onClick={() => handleTickerButton()}>Search</button>
                  <input type='checkbox'></input>
                  <a>Show volledige data van selectie</a>
                  <button className="button" name='button' onClick={handleSecModal}>Check SEC</button>
                  <button className="button" name='button' onClick={handleUpdateHandmatigModal}>Update handmatig</button>
                  <button className="button" name='button' onClick={handleAddKwartaalModal}>Add kwartaal</button>
                  <button className="button" name='button' onClick="">bereken tickers</button>
                </div>
                <div className='row'><h2 onChange={loadDataToFalse}>{tickerUpdated}</h2></div>
                <div className='row'><p>#kwartalen gevonden</p></div>
                <div className='row'><p>compleetheid (%)</p></div>
                <div className='row'>
                  <DataTable tickerUpdated = {tickerUpdated} loadData= {loadData}/>
                </div>
              </div>
          </div>
        </div>
        </div>

    {checkSecModal && (
    <div className='modal'>
      <button onClick={handleSecModal}>Close</button>
      <CheckSec tickerUpdated = {tickerUpdated}/>
    </div>)}
    {updateHandmatigModal && (
    <div className='modal'>
      <button onClick={handleUpdateHandmatigModal}>Close</button>
      <UpdateHandmatig/>
    </div>)}
    {addKwartaalModal && (
    <div className='modal'>
      <button onClick={handleAddKwartaalModal}>Close</button>
      <AddKwartaal/>
    </div>)}
      </>
  )
}

export default UpdateData;

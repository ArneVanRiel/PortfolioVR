import React, { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
// import AandelenData from "./aandelenList";
import axios from 'axios';
import { Line } from 'react-chartjs-2';



function Home() {

    const [activeTicker, setActiveTicker] = useState("AAPL");
    const [tickersInDB, setTickersInDB] = useState([]);
    const [selectionFilter, setSelectionFilter] = useState('ALL');
    const [tickerSearchTerm, setTickerSearchTerm] = useState('');
    const [inportChartData, setInportChartData] = useState([]);
    const [calculatedInportChartData, setcalculatedInportChartData] = useState([]);
    const [formatOption, setFormatOption] = useState("Kwartaal");
    const [financialOption, setFinancialOption] = useState("NetIncomeLoss");
    const [calculatedFinancialOption, setCalculatedFinancialOption] = useState("waarde_verdeling");

    const normalizeString = (str) => {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    };

    const filteredTickers = tickersInDB.filter(ticker => 
        normalizeString(ticker.ticker).includes(normalizeString(tickerSearchTerm))
    );

    useEffect(() => {
        fetch('/api/tickersInDb')
          .then((response) => {
            if (!response.ok) {
              throw new Error('Network response was not ok');
            }
            return response.json();
          })
          .then((data) => setTickersInDB(data))
          .catch((error) => console.error('Error fetching data:', error));
    }, []);

    useEffect(() => {
        const inputChartData = async () => {
            try {
                const response = await axios.get(`/api/inputChartData`, {
                    params: { ticker: activeTicker, financialOption: financialOption }
                });
                const data = response.data;

                // Verwerk de data
                const processedData = data.map((item, index, array) => {
                    if (item.fp === 'Q1' || index === 0 || financialOption === 'Assets' || financialOption === 'AssetsCurrent' || financialOption === 'Liabilities' || financialOption === 'LiabilitiesCurrent' || financialOption === 'StockholdersEquity') {
                        return { ...item, financial: item.financial };
                    } else {
                        return { ...item, financial: item.financial - array[index - 1].financial };
                    }
                });
    
                console.log(processedData); // Log de verwerkte data om te controleren
                setInportChartData(processedData);
            } catch (error) {
                console.error('Error fetching points history:', error);
            }
        };
        inputChartData();
    }, [activeTicker, financialOption]);

    useEffect(() => {
        const calculatedInputChartData = async () => {
            try {
                const response = await axios.get(`/api/calculatedInputChartData`, {
                    params: { ticker: activeTicker, calculatedFinancialOption: calculatedFinancialOption }
                });
                setcalculatedInportChartData(response.data);
            } catch (error) {
                console.error('Error fetching points history:', error);
            }
        };
        calculatedInputChartData();
    }, [activeTicker, calculatedFinancialOption]);

    const financialOptions = [
        "AssetsCurrent",
        "Assets",
        "LiabilitiesCurrent",
        "Liabilities",
        "StockholdersEquity",
        "NetIncomeLoss",
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByUsedInInvestingActivities",
        "NetCashProvidedByUsedInFinancingActivities",
        "PurchasesOfPropertyAndEquipment",
        "Revenues",
        "WeightedAverageNumberOfDilutedSharesOutstanding",
        "Dividend"
    ];

    const calculatedFinancialOptions = [
        "waardefactor_FCF", 
        "waardefactor_ROE", 
        "waardefactor_LTD_equity", 
        "waardefactor_winstmarge",
        "waardefactor_dividend", 
        "intrinsieke_waarde", 
        "selectiecriteria", 
        "waarde_verdeling"
    ];

    const formatOptions = [
        "Kwartaal",
        "Jaar",
    ];

    const data = {
        labels: inportChartData.map(item => item.period_end_date),
        datasets: [
            {
                label: financialOption,
                data: inportChartData.map(item => item.financial),
                fill: false,
                backgroundColor: 'rgba(75,192,192,0.2)',
                borderColor: 'rgba(75,192,192,1)',
                pointBackgroundColor: inportChartData.map(item => item.financial < 0 ? 'red' : 'green'),
                pointBorderColor: inportChartData.map(item => item.financial < 0 ? 'red' : 'green'),
            },
        ],
    };

    const data2 = {
        labels: calculatedInportChartData.map(item => item.period_end_date),
        datasets: [
            {
                label: financialOption,
                data: calculatedInportChartData.map(item => item.financial),
                fill: false,
                backgroundColor: 'rgba(75,192,192,0.2)',
                borderColor: 'rgba(75,192,192,1)',
                pointBackgroundColor: calculatedInportChartData.map(item => item.financial < 0 ? 'red' : 'green'),
                pointBorderColor: calculatedInportChartData.map(item => item.financial < 0 ? 'red' : 'green'),
            },
        ],
    };

    const options = {
        responsive: true,
        plugins: {
            legend: {
                position: 'top',
            },
        },
    };

    return (
        <>
        <div className="row">
            <div className='col-3'>
                <h3>Selecteer ticker</h3>
                <div className="content-block1">
                    <input type="text" placeholder="Zoek ticker" onChange={e => {setTickerSearchTerm(e.target.value)}}/>
                    <p>filter</p>
                    <select style={{ width: '25%' }} value={selectionFilter} onChange={e => setSelectionFilter(e.target.value)}>
                        <option value="ALL">ALL</option>
                        <option value="100%">100%</option>
                        <option value="IP">IP</option>
                        <option value="SC6/7">SC6/7</option>
                    </select>
                    <p>sorteer</p>
                    <select style={{ width: '25%' }}>
                        <option value="A-Z">A-Z</option>
                        <option value="100%">selectiecriteria</option>
                        <option value="%">%</option>
                    </select>
                  <div className='team-select-box'>
                      Tickers
                  </div>
                  {filteredTickers.map((item) => (
                    <div className='rider-box'>
                        <div className='rider-box-content' onClick={() => setActiveTicker(item.ticker)}>
                            <div>
                                <p><strong>{item.ticker}</strong><span className="percentage">{/*item.percentage*/} 100%</span></p>
                            </div>
                        </div>
                    </div>
                  ))}
              </div>
          </div>
          <div className="col-9">
              <h3>Data: {activeTicker}</h3>
              <div className="content-block1">
                  <div className='team-select-box'>
                      <p>Als je op update klikt, ga je naar update/add page</p>
                      <div>
                            <select value={formatOption} onChange={(e) => setFormatOption(e.target.value)}>
                                {formatOptions.map((option, index) => (
                                    <option key={index} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </div>                      
                        VOLLEDIGHEIDCHECK aandat gevonden gegevens
                  </div>
              </div>
            <h3>input data</h3>
            <div className="content-block1">
                <div>
                    <select value={financialOption} onChange={(e) => setFinancialOption(e.target.value)}>
                        {financialOptions.map((option, index) => (
                            <option key={index} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                    filter: ALL - 10Y - 5Y - 1Y
                </div>
                <Line data={data} options={options} />                        
            </div>
            <h3>berekende data</h3>
            <div className="content-block1">
                <div>
                    <select value={calculatedFinancialOption} onChange={(e) => setCalculatedFinancialOption(e.target.value)}>
                        {calculatedFinancialOptions.map((option, index) => (
                            <option key={index} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                </div>
                <Line data={data2} options={options} /> 
                </div>
          </div>
        </div>
        <div className='row'>
            
        </div>
        <div className='row'>
        <div className="col-md-6">
          <div className="input-group mb-3">

            <div className="input-group-append">

            </div>
          </div>
        </div>
      <div className="row">
        <div className="navbar-nav mr-auto">
          <li className="nav-item"><a className="nav-link">Overzicht</a></li>
          <li className="nav-item"><a className="nav-link">Ideale portfolio</a></li>
          <li className="nav-item"><a className="nav-link">voldoet bijna</a></li>
        </div>
        <hr></hr>
      </div>
        </div>
        </>
    )
}


export default Home;


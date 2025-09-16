import React, { useState, useEffect } from "react";
import axios from "axios";
import TransactionsTable from "./transactionsTable.dashboard";
import AddAvailableCash from "./addAvailableCash";
import LineChart from "./dashboardChartLine";
import PieChart from "./dashboardChartPie";
import TeInvesterenTable from "./teInvesteren.dashboard";
import StockPriceComponent from "./tickerPrice";
import UpdatePortfolioValueButton from "./portfolio/UpdatePortfolioValueButton";
import PortfolioTable from "./portfolio/PortfolioTable";
import PortfolioDonutChart from "./charts/PortfolioDonutChart";
import PortfolioManager from "./portfolio/PortfolioManager";
import DailyPortfolioLineChart from "./charts/DailyPortfolioLineChart";
import PortfolioReturns from "./charts/PortfolioReturns";



function PortfolioTab() {
    const [selectedFilter, setSelectedFilter] = useState('1Y');
    const [portfolioValues, setPortfolioValues] = useState([]);
    const [portfolioReturns, setPortfolioReturns] = useState([]);

    const userId = 1; // Voorbeeld: Haal userId op uit een sessie of JWT

    const handleFilterClick = (period) => {
        setSelectedFilter(period);
    };

    const fetchPortfolioData = async (period) => {
        try {
            const valuesResponse = await axios.get(`/api/calculatePortfolioValues?userId=${userId}&period=${period}`);
            setPortfolioValues(valuesResponse.data);

            const returnsResponse = await axios.get(`/api/calculateReturns?userId=${userId}&period=${period}`);
            setPortfolioReturns(returnsResponse.data.calculatedReturns);
        } catch (error) {
            console.error("Fout bij het ophalen van portfolio-data:", error);
        }
    };

    useEffect(() => {
        fetchPortfolioData(selectedFilter);
    }, [selectedFilter]);

    return (
        <div className="content">
        <div className="row">
            <div className="col-8">
                <div className="content-block">
                    <div className="toolbar">
                        <p>portfolio waarde</p>
                        {['1M', '3M', '6M', '1Y', '2Y', '5Y', 'All'].map((period) => (
                            <button
                                key={period}
                                className={`filter-button ${selectedFilter === period ? 'active' : ''}`}
                                onClick={() => handleFilterClick(period)}
                            >
                                {period}
                            </button>
                        ))}
                        <PortfolioManager/>
                    </div>
                    <DailyPortfolioLineChart portfolioValues={portfolioValues} />
                    <PortfolioReturns portfolioReturns={portfolioReturns} />
                </div>
            </div>
            <div className="col-4">
                <div className="content-block">
                    <div className="toolbar">

                        <p>Koopkansen - </p>
                        <div className='input-field-toolbar'>
                            <label id='tickerSearch'>Ticker:</label>
                            <input type="text" id='tickerSearch'></input>
                        </div>
                        <button className="button" name='button'>Search</button>
                    </div>

                    <TeInvesterenTable />
                </div>
            </div>
        </div>
        <div className="row">
            <div className="col-8">
                <div className="content-block">
                    <div className="toolbar">

                        <p>assets/activa</p>
                    </div>

                    <PortfolioTable/>
                </div>
            </div>
            <div className="col-4">
                <div className="content-block">
                    <div className="toolbar">
                        <p>portfolio verdeling</p>
                        <p>Datum:</p>
                        <input className="input-field-toolbar" value={"datum"}></input>
                    </div>
                    <PortfolioDonutChart/>
                </div>
            </div>
        </div>

    </div>
    )
}

export default PortfolioTab;

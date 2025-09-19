import React, { useState, useEffect } from "react";
import axios from 'axios';
import EnterTrade from "../portfolio/enterTrade";
import AddAvailableCash from "../settings/addAvailableCash";
import Dialog from '@mui/material/Dialog';
import LineChart from "./dashboardChartLine";
import PieChart from "./dashboardChartPie";
import { Routes, Route } from 'react-router';
import TickersFastCheck from "../analysis/aandelenFastCheck";
import TeInvesterenTable from "./teInvesteren.dashboard";
import LoginPageTest from "../auth/components/loginTest";
import TransactiesTab from "./dashboard.transacties";
import PortfolioTab from "./dashboard.portfolio";
import UserCash from "../settings/userCash";


function Dashboard() {
    const [open, setOpen] = React.useState(false);
    const [activeSubTab, setActiveSubTab] = useState('Portfolio');
    const userID = 1; // Voorbeeld userID

    const [showTransactionTab, setShowTransationTab] = useState(true);
    const [showPortfolioTab, setShowPortfolioTab] = useState(false);

    const handleClickOpen = () => {
      setOpen(true);
    };
  
    const handleClose = () => {
      setOpen(false);
    };
    
    const handleTransactionTab = () => {
        setShowTransationTab(true);
        setShowPortfolioTab(false);
    }

    const handlePortfolioTab = () => {
        setShowPortfolioTab(true);
        setShowTransationTab(false);
    }
        return (
            <>
            <div className="row">
                <div className="tab-bar">
                    <a className={`tab ${activeSubTab === 'Portfolio' ? 'active' : ''}`}onClick={() => setActiveSubTab('Portfolio')}>Overzicht</a>
                    <a className={`tab ${activeSubTab === 'Transacties' ? 'active' : ''}`}onClick={() => setActiveSubTab('Transacties')}>Transacties</a>
                    <a className={`tab ${activeSubTab === 'Aandeleninzichten' ? 'active' : ''}`}onClick={() => setActiveSubTab('Aandeleninzichten')}>Aandelen inzichten</a>
                </div>
            </div>
            {activeSubTab === 'Transacties' && <TransactiesTab/>}
            {activeSubTab === 'Portfolio' && <PortfolioTab />}
            </>
        )
}
    
export default Dashboard;

            /*{showTransactionTab && (
                <><div className="toolbar">
                    <button id="openEnterTradeModal" className="button" onClick={handleClickOpen}>Enter trade</button>
                    <button className="button">change cash</button>
                    <p>sinds:</p>
                    <input className="input-field-toolbar" value={"datum"}></input>
                    <button className="button">1M</button>
                    <button className="button">3M</button>
                    <button className="button">6M</button>
                    <button className="button">1Y</button>
                    <button className="button">2Y</button>
                    <button className="button">5Y</button>
                    <button className="button">All</button>
                    <input className="input-field-toolbar" value={5476 + 556 + 2600 + 400 + 500}></input>
                </div><Dialog
                    open={open}
                    onClose={handleClose}
                    PaperProps={{
                        component: 'form',
                        onSubmit: (event) => {
                            event.preventDefault();
                            const formData = new FormData(event.currentTarget);
                            const formJson = Object.fromEntries(formData.entries());
                            const email = formJson.email;
                            console.log(email);
                            handleClose();
                        },
                    }}>
                        <EnterTrade />
                        <button onClick={handleClose}>Cancel</button>
                    </Dialog><TransactionsTable />
                    <AddAvailableCash />
                    )}
                    {showPortfolioTab && (

                        <div className="content">
                            <div className="row">
                                <div className="col-8">
                                    <div className="content-block">
                                        <div className="toolbar">
                                            <p>portfolio waarde</p>
                                            <button className="button">1M</button>
                                            <button className="button">3M</button>
                                            <button className="button">6M</button>
                                            <button className="button">1Y</button>
                                            <button className="button">2Y</button>
                                            <button className="button">5Y</button>
                                            <button className="button">All</button>
                                        </div>
                                        <LineChart />
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

                                        <PortfolioTable />
                                    </div>
                                </div>
                                <div className="col-4">
                                    <div className="content-block">
                                        <div className="toolbar">
                                            <p>portfolio verdeling</p>
                                            <p>Datum:</p>
                                            <input className="input-field-toolbar" value={"datum"}></input>
                                        </div>
                                        <PieChart />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                */
import React, { useState, useEffect } from "react";
import axios from "axios";
import UserCash from "./userCash";
import BrokersTable from "./BrokersTable";
import StockExchangeTable from "./StockExchangeTable";
import AddStockForm from "./AddStockForm";
import AvailableBalance from "../dashboard/AvailableBalance";

function Settings() {
    const userID = 1; // Voorbeeld userID (voorlopig op mezelf)


    return (
        <>
            <AvailableBalance/>
            <p>valuta</p>
            <br></br>
            <h3>Instellingen Portfolio VR (enkel beschikbaar voor bevoegden)</h3>
            <BrokersTable/>
            <button className="filter-button">
                Add Broker
            </button>
            <StockExchangeTable/>
            <button className="filter-button">
                Add Stock Exchange
            </button>
            <AddStockForm/>
            <p>sector en industry toevoegen</p>
        </>
    )
}

export default Settings;

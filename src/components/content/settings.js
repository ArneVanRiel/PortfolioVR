import React, { useState, useEffect } from "react";
import axios from "axios";
import UserCash from "../userCash";
import BrokersTable from "./settings/BrokersTable";
import StockExchangeTable from "./settings/StockExchangeTable";
import AddStockForm from "./settings/AddStockForm";
import AvailableBalance from "../AvailableBalance";

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

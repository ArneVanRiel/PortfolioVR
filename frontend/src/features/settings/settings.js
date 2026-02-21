import React, { useState, useEffect } from "react";
import axios from "axios";
import UserCash from "./userCash";
import BrokersTable from "./BrokersTable";
import StockExchangeTable from "./StockExchangeTable";
import AddStockForm from "./AddStockForm";
import AvailableBalance from "../dashboard/AvailableBalance";

function Settings() {
    const userID = 1; // Voorbeeld userID (voorlopig op mezelf)

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleGenerateSellAlerts = async () => {
        if (!window.confirm("Weet je zeker dat je alle verkoopsignalen opnieuw wilt genereren op basis van de huidige waardeverdelingen? Dit overschrijft bestaande verkoopsignalen.")) {
            return;
        }

        setLoading(true);
        setMessage('');
        setError('');

        try {
            const response = await axios.post('/api/calculations/generate-sell-alerts');
            setMessage(response.data.message);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Er is een fout opgetreden bij het genereren van de signalen.');
        } finally {
            setLoading(false);
        }
    };

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

            <br />
            <h3>Geavanceerde Acties</h3>
            <div style={{ border: "1px solid #ddd", padding: "20px", borderRadius: "8px", marginBottom: "20px", backgroundColor: "#fff" }}>
                <h4>Verkoopsignalen Genereren</h4>
                <p style={{ fontSize: "0.9em", color: "#666" }}>
                    Deze actie loopt door de volledige historie van alle aandelenberekeningen. 
                    Als de waardeverdeling van een kwartaal lager is dan het voorgaande kwartaal, 
                    wordt er een 'Verkoopsignaal' aangemaakt in de database met het dalingpercentage.
                </p>
                <button 
                    className="filter-button" 
                    onClick={handleGenerateSellAlerts} 
                    disabled={loading}
                    style={{ backgroundColor: "#f0ad4e", color: "white", border: "none" }}
                >
                    {loading ? 'Bezig met genereren...' : 'Genereer Verkoopsignalen uit Historie'}
                </button>
                
                {message && <div style={{ color: "green", marginTop: "10px" }}>{message}</div>}
                {error && <div style={{ color: "red", marginTop: "10px" }}>{error}</div>}
            </div>
        </>
    )
}

export default Settings;

import React, { useState, useEffect } from "react";
import axios from "axios";
import UserCash from "./userCash";
import BrokersTable from "./BrokersTable";
import StockExchangeTable from "./StockExchangeTable";
import AddStockForm from "./AddStockForm";
import AvailableBalance from "../dashboard/AvailableBalance";
import StocksManagementTable from "./StocksManagementTable";

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
        <div className="space-y-8 pb-10">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Instellingen</h1>
                <span className="text-sm font-medium text-blue-800 bg-blue-100 px-4 py-1.5 rounded-full shadow-sm">Beheerderspaneel (Admin)</span>
            </div>

            {/* Financiën Sectie */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <AvailableBalance />
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <UserCash userID={userID} />
                </div>
            </div>

            {/* Brokers & Beurzen Sectie */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <BrokersTable />
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <StockExchangeTable />
                </div>
            </div>

            {/* Aandelen Database Beheer */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800">Aandelen Database</h3>
                        <p className="text-sm text-gray-500">Beheer alle gekende aandelen, tickers en ISIN codes.</p>
                    </div>
                    <AddStockForm />
                </div>
                <StocksManagementTable />
            </div>

            {/* Geavanceerde Acties */}
            <div className="bg-red-50 p-6 rounded-xl shadow-sm border border-red-200">
                <h3 className="text-lg font-semibold text-red-800 mb-2">Geavanceerde Acties</h3>
                <div className="bg-white p-5 rounded-lg border border-red-100 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex-1">
                        <h4 className="font-bold text-gray-800">Verkoopsignalen Genereren (Historie)</h4>
                        <p className="text-sm text-gray-600 mt-1">
                            Deze actie loopt door de volledige historie van alle aandelenberekeningen. Als de waardeverdeling van een kwartaal lager is dan het voorgaande kwartaal, wordt er een 'Verkoopsignaal' aangemaakt in de database. Overschrijft bestaande signalen.
                        </p>
                    </div>
                    <button 
                        onClick={handleGenerateSellAlerts} 
                        disabled={loading}
                        className="whitespace-nowrap px-5 py-2.5 bg-red-600 text-white font-medium rounded-lg shadow-sm hover:bg-red-700 disabled:opacity-50 transition-colors focus:ring-4 focus:ring-red-200"
                    >
                        {loading ? 'Bezig met genereren...' : 'Genereer Signalen'}
                    </button>
                </div>
                {message && <div className="mt-3 p-3 bg-green-100 text-green-800 rounded text-sm">{message}</div>}
                {error && <div className="mt-3 p-3 bg-red-200 text-red-900 rounded text-sm">{error}</div>}
            </div>
        </div>
    )
}

export default Settings;

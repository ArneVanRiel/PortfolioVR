import React, { useState, useEffect } from "react";
import http from "../../http-common";
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

    const [users, setUsers] = useState([]);
    const [regUsername, setRegUsername] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regRole, setRegRole] = useState('user');
    const [regMessage, setRegMessage] = useState('');
    const [regError, setRegError] = useState('');

    // Genereren van verkoopsignalen
    const handleGenerateSellAlerts = async () => {
        if (!window.confirm("Weet je zeker dat je alle verkoopsignalen opnieuw wilt genereren op basis van de huidige waardeverdelingen? Dit overschrijft bestaande verkoopsignalen.")) {
            return;
        }

        setLoading(true);
        setMessage('');
        setError('');

        try {
            const response = await http.post('/calculations/generate-sell-alerts');
            setMessage(response.data.message);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Er is een fout opgetreden bij het genereren van de signalen.');
        } finally {
            setLoading(false);
        }
    };

    // --- Gebruikersbeheer Functionaliteit ---
    const fetchUsers = async () => {
        try {
            const res = await http.get('/auth/users');
            setUsers(res.data);
        } catch (err) {
            console.error("Fout bij ophalen gebruikers:", err);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleRegisterUser = async (e) => {
        e.preventDefault();
        setRegMessage('');
        setRegError('');
        
        try {
            const response = await http.post('/auth/register', { 
                username: regUsername, 
                email: regEmail, 
                password: regPassword,
                role: regRole
            });
            setRegMessage(response.data.message);
            setRegUsername(''); setRegEmail(''); setRegPassword(''); setRegRole('user');
            fetchUsers(); // Ververs de lijst
        } catch (err) {
            setRegError(err.response?.data?.message || 'Fout bij het registreren.');
        }
    };

    const handleRoleChange = async (userId, newRole) => {
        try {
            await http.put(`/auth/users/${userId}/role`, { role: newRole });
            fetchUsers();
        } catch (err) {
            alert('Er ging iets mis bij het wijzigen van de rol.');
        }
    };

    return (
        <div className="space-y-8 pb-10">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Instellingen</h1>
                <span className="text-sm font-medium text-blue-800 bg-blue-100 px-4 py-1.5 rounded-full shadow-sm">Beheerderspaneel (Admin)</span>
            </div>

            {/* Gebruikersbeheer Sectie */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Lijst met bestaande gebruikers */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-full flex flex-col">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Geregistreerde Gebruikers</h3>
                    
                    {/* Herinnering Demo Account */}
                    <div className="mb-5 p-4 bg-blue-50 text-blue-900 rounded-lg text-sm border border-blue-100 shadow-sm">
                        <p className="font-bold mb-2 flex items-center text-blue-800">
                            <i className="ph-fill ph-info mr-2 text-lg"></i>
                            Demo Account Gegevens (Om te delen met anderen)
                        </p>
                        <ul className="list-disc list-inside pl-2 space-y-1 text-blue-700">
                            <li>Gebruikersnaam: <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-blue-200">demo</span></li>
                            <li>Wachtwoord: <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-blue-200">Demo1234!</span></li>
                            <li>Verificatiecode (OTP): <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-blue-200">000000</span></li>
                        </ul>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Naam</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">E-mail</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Rol</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {users.map(user => (
                                    <tr key={user.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 text-sm text-gray-800">{user.username}</td>
                                        <td className="px-4 py-2 text-sm text-gray-500">{user.email}</td>
                                        <td className="px-4 py-2">
                                            <select 
                                                value={user.role || 'user'} 
                                                onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                className="text-sm bg-gray-50 border border-gray-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                                            >
                                                <option value="user">User (Standaard)</option>
                                                <option value="admin">Admin</option>
                                                <option value="demo">Demo (Alleen-lezen)</option>
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Registratie Formulier */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-full">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Nieuwe Gebruiker Registreren</h3>
                    <form onSubmit={handleRegisterUser} className="space-y-4">
                        {regMessage && <div className="p-3 bg-green-100 text-green-700 rounded text-sm font-medium">{regMessage}</div>}
                        {regError && <div className="p-3 bg-red-100 text-red-700 rounded text-sm font-medium">{regError}</div>}
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Gebruikersnaam</label>
                            <input type="text" required value={regUsername} onChange={(e) => setRegUsername(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">E-mailadres</label>
                            <input type="email" required value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Wachtwoord</label>
                            <input type="password" required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Minimaal 8 tekens" minLength="8" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                            <select value={regRole} onChange={(e) => setRegRole(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="user">User (Standaard)</option>
                                <option value="admin">Admin</option>
                                <option value="demo">Demo (Alleen-lezen, data van ArneVR)</option>
                            </select>
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">Gebruiker Aanmaken</button>
                    </form>
                </div>
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

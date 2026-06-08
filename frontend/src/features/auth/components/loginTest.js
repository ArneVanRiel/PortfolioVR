import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const LoginPageTest = () => {
    const [step, setStep] = useState(1); // 1 = inloggegevens, 2 = OTP
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState(''); 
    const [otp, setOtp] = useState('');
    const [rememberMe, setRememberMe] = useState(true);
    
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState(null);
    
    const navigate = useNavigate();

    // Verwijder de alert automatisch na 4 seconden
    useEffect(() => {
        if (alert) {
            const timer = setTimeout(() => setAlert(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [alert]);

    // STAP 1: Controleer gegevens en stuur e-mail
    const handleLoginStep1 = async (e) => {
        e.preventDefault();
        if (!username || !password) {
            setAlert({ type: 'error', message: 'Vul gebruikersnaam en wachtwoord in.' });
            return;
        }
        setLoading(true);
        try {
            const response = await axios.post(`${API_URL}/auth/login-step1`, { username, password });
            setAlert({ type: 'success', message: response.data.message });
            setStep(2);
        } catch (error) {
            setAlert({ type: 'error', message: error.response?.data?.message || 'Fout bij inloggen.' });
        } finally {
            setLoading(false);
        }
    };

    // STAP 2: Verifieer OTP code en log in
    const handleLoginStep2 = async (e) => {
        e.preventDefault();
        if (!otp) {
            setAlert({ type: 'error', message: 'Vul de verificatiecode in.' });
            return;
        }
        setLoading(true);
        try {
            const response = await axios.post(`${API_URL}/auth/login-step2`, { username, otp, rememberMe });
            const { token, userID, role } = response.data;

            // Bewaar in de localStorage voor de Protected Routes in App.js
            localStorage.setItem('token', token);
            localStorage.setItem('userID', userID);
            localStorage.setItem('role', role);
            localStorage.setItem('username', username);

            // Zet privacymodus standaard aan voor demo accounts
            if (role === 'demo') {
                localStorage.setItem('incognito', 'true');
            }

            // Navigeer succesvol naar dashboard
            navigate('/dashboard');
        } catch (error) {
            setAlert({ type: 'error', message: error.response?.data?.message || 'Onjuiste verificatiecode.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-50/50 -mt-16">
            <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 border border-gray-100 relative">
                
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-gray-800">
                        Portfolio<span className="text-blue-500">VR</span>
                    </h2>
                    <p className="text-gray-500 mt-2">
                        {step === 1 ? 'Log in op je account' : 'Voer je verificatiecode in'}
                    </p>
                </div>

                {alert && (
                    <div className={`mb-6 p-3 rounded-lg text-sm border font-medium ${alert.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                        {alert.message}
                    </div>
                )}

                {step === 1 && (
                    <form onSubmit={handleLoginStep1} className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Gebruikersnaam</label>
                            <input 
                                type="text" 
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Jouw gebruikersnaam"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Wachtwoord</label>
                            <input 
                                type="password" 
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>
                        <div className="flex items-center">
                            <input 
                                type="checkbox" 
                                id="rememberMe"
                                className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                            />
                            <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-600 cursor-pointer">
                                Blijf 30 dagen ingelogd
                            </label>
                        </div>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                        >
                            {loading ? 'Bezig...' : 'Inloggen'}
                        </button>
                    </form>
                )}

                {step === 2 && (
                    <form onSubmit={handleLoginStep2} className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Verificatiecode (OTP)</label>
                            <input 
                                type="text" 
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-center tracking-[1em] text-xl font-mono"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                placeholder="123456"
                                maxLength="6"
                            />
                            <p className="text-xs text-gray-500 mt-3 text-center">
                                We hebben een code gestuurd naar je e-mailadres. Deze is 10 minuten geldig.
                            </p>
                        </div>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Bezig met verifiëren...' : 'Bevestigen & Inloggen'}
                        </button>
                        <div className="text-center mt-4">
                            <button 
                                type="button" 
                                onClick={() => setStep(1)}
                                className="text-sm text-blue-500 font-medium hover:text-blue-700"
                            >
                                Terug naar inloggen
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default LoginPageTest;

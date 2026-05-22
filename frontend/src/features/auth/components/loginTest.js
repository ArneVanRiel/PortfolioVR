import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const LoginPageTest = () => {
    const [mode, setMode] = useState('login'); // 'login' of 'register'
    const [step, setStep] = useState(1); // 1 = inloggegevens, 2 = OTP
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState(''); 
    const [confirmPassword, setConfirmPassword] = useState('');
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
            // Zorg dat deze poort overeenkomt met de backend-poort, 5000 is standaard in jouw project
            const response = await axios.post('http://localhost:5000/api/auth/login-step1', { username, password });
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
            const response = await axios.post('http://localhost:5000/api/auth/login-step2', { username, otp, rememberMe });
            const { token, userID, role } = response.data;

            // Bewaar in de localStorage voor de Protected Routes in App.js
            localStorage.setItem('token', token);
            localStorage.setItem('userID', userID);
            localStorage.setItem('role', role);
            localStorage.setItem('username', username);

            // Navigeer succesvol naar dashboard
            navigate('/dashboard');
        } catch (error) {
            setAlert({ type: 'error', message: error.response?.data?.message || 'Onjuiste verificatiecode.' });
        } finally {
            setLoading(false);
        }
    };

    // STAP: Registreren
    const handleRegister = async (e) => {
        e.preventDefault();
        if (!username || !email || !password || !confirmPassword) {
            setAlert({ type: 'error', message: 'Vul alle velden in.' });
            return;
        }
        if (password !== confirmPassword) {
            setAlert({ type: 'error', message: 'Wachtwoorden komen niet overeen.' });
            return;
        }
        if (password.length < 8) {
            setAlert({ type: 'error', message: 'Het wachtwoord moet minimaal 8 tekens lang zijn.' });
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post('http://localhost:5000/api/auth/register', { username, email, password });
            setAlert({ type: 'success', message: response.data.message });
            
            // Switch automatisch terug naar inloggen na 2 seconden
            setTimeout(() => {
                setMode('login');
                setPassword('');
                setConfirmPassword('');
            }, 2000);
        } catch (error) {
            setAlert({ type: 'error', message: error.response?.data?.message || 'Fout bij registratie.' });
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
                        {mode === 'register' ? 'Maak een nieuw account aan' 
                            : step === 1 ? 'Log in op je account' : 'Voer je verificatiecode in'}
                    </p>
                </div>

                {alert && (
                    <div className={`mb-6 p-3 rounded-lg text-sm border font-medium ${alert.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                        {alert.message}
                    </div>
                )}

                {mode === 'login' && step === 1 && (
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
                        <div className="text-center mt-4">
                            <p className="text-sm text-gray-600">Nog geen account?{' '}
                                <button type="button" onClick={() => { setMode('register'); setAlert(null); }} className="text-blue-500 font-medium hover:text-blue-700">
                                    Maak er één aan
                                </button>
                            </p>
                        </div>
                    </form>
                )}

                {mode === 'login' && step === 2 && (
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

                {mode === 'register' && (
                    <form onSubmit={handleRegister} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Gebruikersnaam</label>
                            <input 
                                type="text" 
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Kies een gebruikersnaam"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">E-mailadres</label>
                            <input 
                                type="email" 
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="jouw@email.be"
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
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Bevestig Wachtwoord</label>
                            <input 
                                type="password" 
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 mt-2"
                        >
                            {loading ? 'Bezig...' : 'Registreren'}
                        </button>
                        <div className="text-center mt-4">
                            <p className="text-sm text-gray-600">Al een account?{' '}
                                <button type="button" onClick={() => { setMode('login'); setAlert(null); }} className="text-blue-500 font-medium hover:text-blue-700">
                                    Log in
                                </button>
                            </p>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default LoginPageTest;

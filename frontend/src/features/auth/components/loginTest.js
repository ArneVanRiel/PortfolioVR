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
    
    // Voorkeursinlogmethode uitlezen van localStorage
    const [preferredMethod, setPreferredMethod] = useState(() => {
        return localStorage.getItem('preferredLoginMethod') || 'password';
    });

    const navigate = useNavigate();

    // Verwijder de alert automatisch na 4 seconden
    useEffect(() => {
        if (alert) {
            const timer = setTimeout(() => setAlert(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [alert]);

    // Google SDK initialisatie voor inloggen
    useEffect(() => {
        if (step !== 1) return;

        const initGoogle = () => {
            if (!window.google) return false;
            try {
                window.google.accounts.id.initialize({
                    client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID || 'your_google_client_id.apps.googleusercontent.com',
                    callback: handleGoogleLoginResponse
                });
                
                // Render knop in de Google container (indien getoond)
                const googleBtnContainer = document.getElementById("google-signin-btn-container");
                if (googleBtnContainer) {
                    window.google.accounts.id.renderButton(
                        googleBtnContainer,
                        { 
                            theme: "outline", 
                            size: "large", 
                            text: "signin_with",
                            shape: "rectangular",
                            width: 384
                        }
                    );
                }
                return true;
            } catch (err) {
                console.error("Fout bij laden Google login:", err);
                return true;
            }
        };

        // Probeer direct te initialiseren
        if (initGoogle()) return;

        // Als google nog niet geladen is, check elke 100ms
        const interval = setInterval(() => {
            if (initGoogle()) {
                clearInterval(interval);
            }
        }, 100);

        return () => clearInterval(interval);
    }, [preferredMethod, step]);

    const handleLoginSuccess = (token, userID, role, name) => {
        localStorage.setItem('token', token);
        localStorage.setItem('userID', userID);
        localStorage.setItem('role', role);
        localStorage.setItem('username', name);

        if (role === 'demo') {
            localStorage.setItem('incognito', 'true');
        }

        navigate('/dashboard');
    };

    // Verwerk Google login token
    const handleGoogleLoginResponse = async (response) => {
        if (!response.credential) return;
        setLoading(true);
        setAlert(null);
        try {
            const res = await axios.post(`${API_URL}/auth/provider/login`, {
                provider: 'google',
                token: response.credential
            });
            
            localStorage.setItem('preferredLoginMethod', 'google');
            setPreferredMethod('google');
            
            const { token, userID, role, username: name } = res.data;
            handleLoginSuccess(token, userID, role, name);
        } catch (err) {
            console.error(err);
            setAlert({ type: 'error', message: err.response?.data?.message || "Inloggen met Google mislukt." });
        } finally {
            setLoading(false);
        }
    };

    // Verwerk Microsoft login via Popup
    const handleMicrosoftLogin = () => {
        setLoading(true);
        setAlert(null);
        
        const clientId = process.env.REACT_APP_MICROSOFT_CLIENT_ID || 'your_microsoft_client_id';
        const redirectUri = encodeURIComponent(window.location.origin + '/microsoft-callback');
        const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=token&redirect_uri=${redirectUri}&scope=openid%20profile%20User.Read`;
        
        const width = 600;
        const height = 650;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        
        const popup = window.open(
            authUrl,
            'MicrosoftLoginPopup',
            `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
        );
        
        if (!popup) {
            setAlert({ type: 'error', message: "Popup blocker actief. Sta popups toe om in te loggen via Microsoft." });
            setLoading(false);
            return;
        }

        const handleMessage = async (event) => {
            if (event.origin !== window.location.origin) return;
            if (event.data && event.data.type === 'microsoft-token') {
                const token = event.data.token;
                window.removeEventListener('message', handleMessage);
                
                try {
                    const res = await axios.post(`${API_URL}/auth/provider/login`, {
                        provider: 'microsoft',
                        token
                    });
                    
                    localStorage.setItem('preferredLoginMethod', 'microsoft');
                    setPreferredMethod('microsoft');
                    
                    const { token: jwtToken, userID, role, username: name } = res.data;
                    handleLoginSuccess(jwtToken, userID, role, name);
                } catch (err) {
                    console.error(err);
                    setAlert({ type: 'error', message: err.response?.data?.message || "Inloggen met Microsoft mislukt." });
                } finally {
                    setLoading(false);
                }
            } else if (event.data && event.data.type === 'microsoft-error') {
                window.removeEventListener('message', handleMessage);
                setAlert({ type: 'error', message: event.data.description || "Inloggen met Microsoft geannuleerd." });
                setLoading(false);
            }
        };

        window.addEventListener('message', handleMessage);
    };

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
            
            localStorage.setItem('preferredLoginMethod', 'password');
            setPreferredMethod('password');

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
            handleLoginSuccess(token, userID, role, username);
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
                    <div className="space-y-5">
                        {preferredMethod === 'google' && (
                            <div className="text-center py-4 flex flex-col items-center justify-center gap-3">
                                <div id="google-signin-btn-container" className="flex justify-center w-full min-h-[44px]"></div>
                                <button
                                    type="button"
                                    className="text-sm text-blue-500 font-medium hover:text-blue-700 mt-3"
                                    onClick={() => setPreferredMethod('password')}
                                >
                                    Log in met gebruikersnaam/wachtwoord
                                </button>
                            </div>
                        )}

                        {preferredMethod === 'microsoft' && (
                            <div className="text-center py-4">
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={handleMicrosoftLogin}
                                    className="w-full flex items-center justify-center gap-2.5 bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm mb-3"
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 23 23">
                                        <path fill="#f3f2f1" d="M0 0h23v23H0z"/>
                                        <path fill="#f25022" d="M1 1h10v10H1z"/>
                                        <path fill="#7fba00" d="M12 1h10v10H12z"/>
                                        <path fill="#01a4eff" d="M1 12h10v10H1z"/>
                                        <path fill="#ffb900" d="M12 12h10v10H12z"/>
                                    </svg>
                                    Inloggen met Microsoft
                                </button>
                                <button
                                    type="button"
                                    className="text-sm text-blue-500 font-medium hover:text-blue-700 mt-2"
                                    onClick={() => setPreferredMethod('password')}
                                >
                                    Log in met gebruikersnaam/wachtwoord
                                </button>
                            </div>
                        )}

                        {preferredMethod === 'password' && (
                            <>
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

                                <div className="relative my-6">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-gray-200"></div>
                                    </div>
                                    <div className="relative flex justify-center text-sm">
                                        <span className="px-2 bg-white text-gray-500">Of log in met</span>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div id="google-signin-btn-container" className="flex justify-center w-full"></div>

                                    <button
                                        type="button"
                                        onClick={handleMicrosoftLogin}
                                        className="w-full flex items-center justify-center gap-2.5 bg-white border border-gray-300 text-gray-700 font-semibold py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-sm"
                                    >
                                        <svg className="w-4 h-4" viewBox="0 0 23 23">
                                            <path fill="#f3f2f1" d="M0 0h23v23H0z"/>
                                            <path fill="#f25022" d="M1 1h10v10H1z"/>
                                            <path fill="#7fba00" d="M12 1h10v10H12z"/>
                                            <path fill="#01a4eff" d="M1 12h10v10H1z"/>
                                            <path fill="#ffb900" d="M12 12h10v10H12z"/>
                                        </svg>
                                        Microsoft
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
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

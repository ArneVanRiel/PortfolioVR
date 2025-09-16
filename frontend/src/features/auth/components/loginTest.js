// Login.js
import React, { useState, useEffect } from 'react';
import axios from 'axios'; // Voor API-verzoeken
import { useNavigate  } from 'react-router-dom'; // Importeer Redirect

const LoginPageTest = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState(''); 
    const [email, setEmail] = useState('');
    const [confirmPassword, setConfirmPassword] = useState(''); 
    const [token, setToken] = useState('');
    const isLoggedIn = localStorage.getItem('token');
    const navigate = useNavigate(); // Maak een instantie van useNavigate
    const [activeTab, setActiveTab] = useState('Login');
    const [countries, setCountries] = useState([]);
    const [selectedCountry, setSelectedCountry] = useState('be');
    const [alert, setAlert] = useState(null);

    useEffect(() => {
        const fetchCountries = async () => {
            const result = await axios('https://flagcdn.com/en/codes.json');
            setCountries(result.data);
        };

        fetchCountries();
    }, []);


  const handleLogin = async () => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/login`, { username, password });
      const { token, userID, role } = response.data;

      // Sla token en gebruikersnaam op in localStorage
      localStorage.setItem('token', token);
      localStorage.setItem('userID', userID);
      localStorage.setItem('role', role);

      setToken(token);
      // Navigeer naar de 'upcoming-races' route na succesvol inloggen
      navigate('/upcoming-races');
    } catch (error) {
      setAlert({ type: 'info', message: 'Gebruikersnaam of wachtwoord komt niet overeen' });

    }
  };

  const handleRegister = async () => {
        // Controleer of alle velden zijn ingevuld
        if (!username || !password || !email || !confirmPassword || !selectedCountry) {
          setAlert({ type: 'info', message: 'Vul alle velden in!' });
          return;
      }
    // Controleer of het wachtwoord en het bevestigde wachtwoord overeenkomen
    if (password !== confirmPassword) {
        setAlert({ type: 'info', message: 'Wachtwoorden komen niet overeen' });
        return;
      }
      // Wachtwoord validatie
      if (password.length < 8) {
        setAlert({ type: 'info', message: 'Het wachtwoord moet minimaal 8 tekens lang zijn' });
        return;
      }

      if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
          setAlert({ type: 'info', message: 'Het wachtwoord moet minstens één kleine letter, één hoofdletter en één cijfer bevatten' });
          return;
      }

    try {
        const response = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/register`, { username, password, email, selectedCountry });

        // Na succesvolle registratie, log de gebruiker in
        if (response.status === 201) {
            setActiveTab('Login');
        }
    } catch (error) {
        alert('Fout bij registratie (frontend):', error);
        setAlert({ type: 'info', message: 'Fout bij registratie' });

    }
};

    // Verwijder de alert na 3 seconden
    useEffect(() => {
        if (alert) {
        const timer = setTimeout(() => {
            setAlert(null);
        }, 1000);
        return () => clearTimeout(timer);
        }
    }, [alert]);

//EMAILBEVESTIGING
/*
const nodemailer = require('nodemailer');

async function sendConfirmationEmail(userEmail, token) {
    // Maak een Nodemailer transporter object
    let transporter = nodemailer.createTransport({
        service: 'hotmail', // Gebruik Hotmail als de e-mail service
        auth: {
            user: 'arne.van.riel@hotmail.be', // Jouw Hotmail adres
            pass: 'jouw-wachtwoord' // Jouw Hotmail wachtwoord
        }
    });

    // De URL waar de gebruiker naartoe wordt gestuurd na het klikken op de bevestigingslink
    const url = `http://jouw-website.com/confirm-email?token=${token}`;

    // De e-mail opties
    let mailOptions = {
        from: 'arne.van.riel@hotmail.be', // Het e-mailadres dat de e-mail verstuurt
        to: userEmail, // Het e-mailadres van de ontvanger
        subject: 'Bevestig je e-mailadres', // Het onderwerp van de e-mail
        text: `Bevestig je e-mailadres door op de volgende link te klikken: ${url}`, // De tekst van de e-mail
        html: `<p>Bevestig je e-mailadres door op de volgende link te klikken: <a href="${url}">${url}</a></p>` // De HTML van de e-mail
    };

    // Verstuur de e-mail
    let info = await transporter.sendMail(mailOptions);

    console.log('Message sent: %s', info.messageId);
}

*/


  const handleLogout = () => {
        // Verwijder token en gebruikersnaam uit localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        localStorage.removeItem('userID');
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleLogin();
    }
  }

  return (
    <div>
      {isLoggedIn ? (
        <div>
          <p>{username} is ingelogd!</p>
          <button onClick={handleLogout}>Uitloggen</button>
        </div>
      ) : (
        <>
        {alert && 
        <div className='overlay '>
            <div align='center' className={`alert ${alert.type}`}>
                {alert.message}
                <div onClick={() => setAlert(null)}>&times;</div>
            </div>
        </div>
        }
        <div className='modal-content'>
            <div className="content-block-modal modal-zoom">
                <div className="toolbar">
                    <div className='row' style={{display: 'flex', flexDirection: 'row'}}>
                        <a className={`toolbar-btn ${activeTab === 'Login' ? 'active' : ''}`} onClick={() => setActiveTab('Login')}>Login</a>
                        <a className={`toolbar-btn ${activeTab === 'Registreren' ? 'active' : ''}`} onClick={() => setActiveTab('Registreren')}>Registreren</a>
                    </div>
                </div>
                {activeTab === 'Login' && (
                    <>
                      <br></br>
                      <label>Gebruikersnaam</label>
                      <input type="text" placeholder="Gebruikersnaam" onChange={(e) => setUsername(e.target.value)} onKeyDown={handleKeyDown} />
                      <br></br>
                      <label>Wachtwoord</label>
                      <input type="password" placeholder="Wachtwoord" onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKeyDown} />
                      <button className='btn btn-sm' onClick={handleLogin}>Inloggen</button>
                    </>
                )}
                {/*activeTab === 'Registreren' && (
                    <>
                    <br></br>
                    <div className="row">
                    <label>Gebruikersnaam</label>
                    <label>(deze naam wordt zichtbaar in de algemene rangschikking)</label>
                    </div>
                    <br></br>
                    <div className="row">
                          <input type="text" placeholder="Gebruikersnaam" onChange={(e) => setUsername(e.target.value)}/>
                    </div>
                    <br></br>
                    <div className="row">
                        <label>Land</label>
                        <select value={selectedCountry} onChange={(e) => setSelectedCountry(e.target.value)} required>
                            {Object.entries(countries).map(([code, country]) => (
                                <option key={code} value={code}>
                                    {country} <img src={`https://flagcdn.com/w20/${code.toLowerCase()}.png`} alt={country} />
                                </option>
                            ))}
                        </select>
                    </div>
                    <br></br>
                    <div className="row">
                         <label>email</label>
                    </div>
                    <div className="row">
                         <input type="email" placeholder="email@email.be" onChange={(e) => setEmail(e.target.value)}/>
                    </div>
                    <br></br>
                    <div className="row">
                          <label>Wachtwoord</label>
                    </div>
                    <div className="row">
                         <input type="password" placeholder="Wachtwoord" onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <br></br>
                    <div className="row">
                          <label>Bevestig wachtwoord</label>
                    </div>
                    <div className="row">
                          <input type="password" placeholder="Wachtwoord" onChange={(e) => setConfirmPassword(e.target.value)}/>
                    </div>
                    <div className="row">
                          <button className='btn btn-sm' onClick={handleRegister}>Registreren</button>
                    </div>
                    </>
                )*/}
            </div>
        </div>
        </>
      )}
    </div>
  );
};

export default LoginPageTest;

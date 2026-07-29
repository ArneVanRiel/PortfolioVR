// controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sql } = require('../config/database');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// In-memory store voor OTP's
const otpStore = new Map();

// Configureer de nodemailer transporter
const transporter = nodemailer.createTransport({
    host: "smtp-mail.outlook.com",
    port: 587,
    secure: false, // true voor 465, false voor andere poorten
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    },
    family: 4, // Forceert IPv4 en voorkomt de ENETUNREACH IPv6 fout!
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
});

const loginStep1 = async (req, res) => {
  const { username, password } = req.body;

  try {
    const request = new sql.Request();
    request.input('username', sql.NVarChar, username);
    const result = await request.query('SELECT * FROM PF_Users WHERE username = @username');

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Gebruiker niet gevonden of onjuist wachtwoord' });
    }

    const user = result.recordset[0];
    const wachtwoordMatch = await bcrypt.compare(password, user.password);

    if (!wachtwoordMatch) {
      return res.status(401).json({ message: 'Gebruiker niet gevonden of onjuist wachtwoord' });
    }

    // Kijk of de gebruiker een demo account is
    const isDemo = user.role === 'demo' || username.toLowerCase() === 'demo';
    const otp = isDemo ? '000000' : crypto.randomInt(100000, 999999).toString();
    
    otpStore.set(username, {
        otp: otp,
        expiresAt: Date.now() + 10 * 60 * 1000,
        user: user 
    });

    // Sla de mail server over voor demo accounts
    if (isDemo) {
        return res.json({ message: 'Demo account herkend. Gebruik verificatiecode: 000000' });
    }

    const userEmail = user.email || user.Email; 

    if (!userEmail) {
        return res.status(400).json({ message: 'Geen emailadres gevonden voor deze gebruiker in de database.' });
    }

    const mailOptions = {
        from: process.env.MAIL_USER,
        to: userEmail,
        subject: 'Je PortfolioVR Login Code',
        text: `Je verificatiecode is: ${otp}. Deze code is 10 minuten geldig.`,
        html: `<div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                  <h2>PortfolioVR Beveiliging</h2>
                  <p>Je hebt verzocht om in te loggen. Gebruik de onderstaande verificatiecode:</p>
                  <h1 style="background: #f4f4f4; padding: 10px; letter-spacing: 5px; color: #2563eb;">${otp}</h1>
                  <p style="color: #666; font-size: 12px;">Deze code is 10 minuten geldig. Deel deze met niemand.</p>
               </div>`
    };

    // Voor lokaal testen: print de code altijd in je terminal!
    console.log(`\n=========================================`);
    console.log(`🔑 JOUW LOGIN CODE VOOR ${username}: ${otp}`);
    console.log(`=========================================\n`);

    try {
        await transporter.sendMail(mailOptions);
        res.json({ message: 'Verificatiecode is verstuurd naar je e-mailadres.' });
    } catch (mailError) {
        console.error('Email verzenden mislukt:', mailError);
        // We geven TOCH een succesmelding aan de frontend zodat het scherm doorgaat naar Stap 2.
        // Zo kun je lokaal altijd inloggen met de code uit je terminal, zelfs als de mail faalt!
        res.status(200).json({ message: 'Mail mislukt door netwerk, maar gebruik de code uit de terminal!' });
    }
  } catch (error) {
    console.error('Fout bij inloggen stap 1:', error);
    res.status(500).json({ message: 'Serverfout bij het inloggen.' });
  }
};

const loginStep2 = async (req, res) => {
    const { username, otp, rememberMe } = req.body;

    try {
        const storedOtpData = otpStore.get(username);

        if (!storedOtpData) {
            return res.status(400).json({ message: 'Geen verificatiecode aangevraagd of de code is verlopen.' });
        }

        if (Date.now() > storedOtpData.expiresAt) {
            otpStore.delete(username);
            return res.status(400).json({ message: 'Verificatiecode is verlopen. Log opnieuw in.' });
        }

        if (storedOtpData.otp !== otp) {
            return res.status(401).json({ message: 'Onjuiste verificatiecode.' });
        }

        // Code is correct!
        const user = storedOtpData.user;
        let userID = user.id;
        const role = user.role || user.Roles;

        // Forceer demo gebruiker naar de data van ArneVR
        if (role === 'demo' || username.toLowerCase() === 'demo') {
            try {
                const arneReq = new sql.Request();
                // Pas de naam 'ArneVR' hier eventueel aan naar hoe je exact heet in de database
                const arneRes = await arneReq.query("SELECT id FROM PF_Users WHERE username = 'ArneVR'");
                if (arneRes.recordset.length > 0) {
                    userID = arneRes.recordset[0].id;
                }
            } catch (err) {
                console.error("Kon ID van ArneVR niet ophalen:", err);
            }
        }

        // Bepaal de geldigheidsduur van het token
        const expiresIn = rememberMe ? '30d' : '1h';

        const token = jwt.sign({ username, userID }, process.env.JWT_SECRET, { expiresIn });

        // Verwijder de gebruikte OTP zodat deze niet opnieuw gebruikt kan worden
        otpStore.delete(username);

        // Sla de inlogtijd op in de database
        const updateReq = new sql.Request();
        updateReq.input('id', sql.Int, userID);
        await updateReq.query('UPDATE PF_Users SET last_login = GETDATE() WHERE id = @id');

        // Stuur het token veilig terug in de JSON response
        res.json({ token, username, userID, role, expiresIn });
    } catch (error) {
        console.error('Fout bij inloggen stap 2:', error);
        res.status(500).json({ message: 'Serverfout bij het verifiëren.' });
    }
};

const register = async (req, res) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Vul gebruikersnaam, e-mailadres en wachtwoord in.' });
  }

  try {
    const request = new sql.Request();
    request.input('username', sql.NVarChar, username);
    const existingUser = await request.query('SELECT id FROM PF_Users WHERE username = @username');

    if (existingUser.recordset.length > 0) {
      return res.status(409).json({ message: 'Deze gebruikersnaam is al in gebruik.' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const insertRequest = new sql.Request();
    insertRequest.input('username', sql.NVarChar, username);
    insertRequest.input('email', sql.NVarChar, email);
    insertRequest.input('password', sql.NVarChar, hashedPassword);
    insertRequest.input('role', sql.NVarChar, role || 'user');
    
    await insertRequest.query(`INSERT INTO PF_Users (username, email, password, role) VALUES (@username, @email, @password, @role)`);

    res.status(201).json({ message: 'Account succesvol aangemaakt! Je kan nu inloggen.' });
  } catch (error) {
    console.error('Fout bij registratie:', error);
    res.status(500).json({ message: 'Serverfout bij het registreren.' });
  }
};

const getProfile = async (req, res) => {
    const { id } = req.params;
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        const result = await request.query(`
            SELECT username, email, ISNULL(default_currency, 'EUR') as default_currency, ISNULL(manual_exchange_rate, 1.0) as manual_exchange_rate, ISNULL(preferred_login_method, 'password') as preferred_login_method
            FROM PF_Users WHERE id = @id
        `);
        
        if (result.recordset.length === 0) return res.status(404).json({ message: 'Gebruiker niet gevonden.' });
        
        const user = result.recordset[0];
        
        const identRequest = new sql.Request();
        identRequest.input('userId', sql.Int, id);
        const identRes = await identRequest.query('SELECT provider_name FROM PF_User_Identities WHERE user_id = @userId');
        
        const linkedProviders = identRes.recordset.map(row => row.provider_name);
        
        res.json({
            ...user,
            linkedProviders
        });
    } catch (error) {
        console.error('Fout bij ophalen profiel:', error);
        res.status(500).json({ message: 'Fout bij het ophalen van het profiel.' });
    }
};


const updateProfile = async (req, res) => {
    const { id } = req.params;
    const { username, default_currency, manual_exchange_rate } = req.body;
    
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('username', sql.NVarChar, username);
        request.input('default_currency', sql.NVarChar, default_currency);
        request.input('manual_exchange_rate', sql.Decimal(18, 4), manual_exchange_rate);
        
        const checkUser = await request.query('SELECT id FROM PF_Users WHERE username = @username AND id != @id');
        if (checkUser.recordset.length > 0) return res.status(409).json({ message: 'Deze gebruikersnaam is al in gebruik.' });

        await request.query('UPDATE PF_Users SET username = @username, default_currency = @default_currency, manual_exchange_rate = @manual_exchange_rate WHERE id = @id');
        res.json({ message: 'Profiel succesvol bijgewerkt.' });
    } catch (error) {
        console.error('Fout bij updaten profiel:', error);
        res.status(500).json({ message: 'Fout bij het updaten van het profiel.' });
    }
};

const updatePassword = async (req, res) => {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        const userRes = await request.query('SELECT password FROM PF_Users WHERE id = @id');
        if (userRes.recordset.length === 0) return res.status(404).json({ message: 'Gebruiker niet gevonden.' });

        const match = await bcrypt.compare(currentPassword, userRes.recordset[0].password);
        if (!match) return res.status(401).json({ message: 'Huidig wachtwoord is onjuist.' });

        const hashed = await bcrypt.hash(newPassword, 10);
        const updateReq = new sql.Request();
        updateReq.input('id', sql.Int, id);
        updateReq.input('password', sql.NVarChar, hashed);
        await updateReq.query('UPDATE PF_Users SET password = @password WHERE id = @id');
        
        res.json({ message: 'Wachtwoord succesvol gewijzigd.' });
    } catch (error) {
        console.error('Fout bij updaten wachtwoord:', error);
        res.status(500).json({ message: 'Fout bij het updaten van het wachtwoord.' });
    }
};

const getAllUsers = async (req, res) => {
    try {
        // 1. Gebruik een sql.Request() object voor een veilige uitvoering
        const request = new sql.Request();
        const result = await request.query('SELECT * FROM PF_Users');
        
        // 2. Map de database resultaten zodat de frontend altijd exact weet wat hij krijgt,
        // zelfs als SQL Server de kolommen toevallig met een hoofdletter heeft aangemaakt.
        const mappedUsers = result.recordset.map(u => ({
            id: u.id || u.Id || u.ID,
            username: u.username || u.Username || u.USERNAME,
            email: u.email || u.Email || u.EMAIL,
            role: u.role || u.Role || u.Roles || 'user',
            last_login: u.last_login || u.Last_Login || null
        }));
        
        res.json(mappedUsers);
    } catch (error) {
        console.error('Fout bij ophalen gebruikers:', error);
        res.status(500).json({ message: 'Serverfout bij ophalen gebruikers.' });
    }
};

const updateUserRole = async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('role', sql.NVarChar, role);
        await request.query('UPDATE PF_Users SET role = @role WHERE id = @id');
        
        res.json({ message: 'Gebruikersrol succesvol bijgewerkt.' });
    } catch (error) {
        console.error('Fout bij updaten rol:', error);
        res.status(500).json({ message: 'Serverfout bij updaten rol.' });
    }
};

const logout = (req, res) => {
    res.json({ message: 'Succesvol uitgelogd' });
};

// Helper om Google ID Token te verifiëren met Google API
const verifyGoogleToken = async (idToken) => {
    try {
        const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        if (!response.ok) {
            throw new Error('Google token validatie mislukt');
        }
        const data = await response.json();
        if (process.env.GOOGLE_CLIENT_ID && data.aud !== process.env.GOOGLE_CLIENT_ID) {
            throw new Error('Google token client ID match mislukt');
        }
        return {
            providerId: data.sub,
            email: data.email
        };
    } catch (error) {
        console.error('Fout bij verifiëren Google token:', error);
        return null;
    }
};

// Helper om Microsoft Access Token te verifiëren via Microsoft Graph API
const verifyMicrosoftToken = async (accessToken) => {
    try {
        const response = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            throw new Error('Microsoft token validatie mislukt via Graph API');
        }
        const data = await response.json();
        return {
            providerId: data.id,
            email: data.mail || data.userPrincipalName
        };
    } catch (error) {
        console.error('Fout bij verifiëren Microsoft token:', error);
        return null;
    }
};

const loginProvider = async (req, res) => {
    const { provider, token } = req.body;
    
    if (!provider || !token) {
        return res.status(400).json({ message: 'Provider en token zijn verplicht.' });
    }
    
    let providerUserId = null;
    let email = null;
    
    if (provider === 'google') {
        const googleUser = await verifyGoogleToken(token);
        if (!googleUser) {
            return res.status(400).json({ message: 'Ongeldig Google-token.' });
        }
        providerUserId = googleUser.providerId;
        email = googleUser.email;
    } else if (provider === 'microsoft') {
        const msUser = await verifyMicrosoftToken(token);
        if (!msUser) {
            return res.status(400).json({ message: 'Ongeldig Microsoft-token.' });
        }
        providerUserId = msUser.providerId;
        email = msUser.email;
    } else {
        return res.status(400).json({ message: 'Ongeldige inlogprovider.' });
    }
    
    try {
        const checkReq = new sql.Request();
        checkReq.input('providerName', sql.NVarChar, provider);
        checkReq.input('providerKey', sql.NVarChar, providerUserId);
        const checkRes = await checkReq.query(
            'SELECT user_id FROM PF_User_Identities WHERE provider_name = @providerName AND provider_key = @providerKey'
        );
        
        if (checkRes.recordset.length === 0) {
            return res.status(401).json({ 
                message: `Dit ${provider === 'google' ? 'Google' : 'Microsoft'}-account is niet gekoppeld aan een PortfolioVR gebruiker. Meld je eerst aan met gebruikersnaam/wachtwoord en koppel je account via de profielpagina.` 
            });
        }
        
        const userID = checkRes.recordset[0].user_id;
        
        const userReq = new sql.Request();
        userReq.input('id', sql.Int, userID);
        const userRes = await userReq.query('SELECT * FROM PF_Users WHERE id = @id');
        
        if (userRes.recordset.length === 0) {
            return res.status(404).json({ message: 'Gekoppelde gebruiker bestaat niet meer.' });
        }
        
        const user = userRes.recordset[0];
        
        // Sla de inlogtijd op
        const updateReq = new sql.Request();
        updateReq.input('id', sql.Int, user.id);
        await updateReq.query('UPDATE PF_Users SET last_login = GETDATE() WHERE id = @id');
        
        const expiresIn = '30d';
        const jwtToken = jwt.sign(
            { username: user.username, userID: user.id },
            process.env.JWT_SECRET,
            { expiresIn }
        );
        
        res.json({
            token: jwtToken,
            username: user.username,
            userID: user.id,
            role: user.role || 'user',
            expiresIn
        });
    } catch (error) {
        console.error('Fout bij provider login:', error);
        res.status(500).json({ message: 'Serverfout bij het inloggen via externe provider.' });
    }
};

const linkGoogle = async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ message: 'Token is verplicht.' });
    }
    
    const googleUser = await verifyGoogleToken(token);
    if (!googleUser) {
        return res.status(400).json({ message: 'Ongeldig Google-token.' });
    }
    
    try {
        const userID = req.user.userID;
        
        const checkReq = new sql.Request();
        checkReq.input('providerKey', sql.NVarChar, googleUser.providerId);
        const checkRes = await checkReq.query('SELECT user_id FROM PF_User_Identities WHERE provider_name = \'google\' AND provider_key = @providerKey');
        
        if (checkRes.recordset.length > 0) {
            return res.status(409).json({ message: 'Dit Google-account is al gekoppeld aan een andere gebruiker.' });
        }
        
        const insertReq = new sql.Request();
        insertReq.input('userId', sql.Int, userID);
        insertReq.input('providerKey', sql.NVarChar, googleUser.providerId);
        await insertReq.query('INSERT INTO PF_User_Identities (user_id, provider_name, provider_key) VALUES (@userId, \'google\', @providerKey)');
        
        res.json({ message: 'Google-account succesvol gekoppeld!' });
    } catch (error) {
        console.error('Fout bij koppelen Google:', error);
        res.status(500).json({ message: 'Serverfout bij het koppelen.' });
    }
};

const linkMicrosoft = async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ message: 'Token is verplicht.' });
    }
    
    const msUser = await verifyMicrosoftToken(token);
    if (!msUser) {
        return res.status(400).json({ message: 'Ongeldig Microsoft-token.' });
    }
    
    try {
        const userID = req.user.userID;
        
        const checkReq = new sql.Request();
        checkReq.input('providerKey', sql.NVarChar, msUser.providerId);
        const checkRes = await checkReq.query('SELECT user_id FROM PF_User_Identities WHERE provider_name = \'microsoft\' AND provider_key = @providerKey');
        
        if (checkRes.recordset.length > 0) {
            return res.status(409).json({ message: 'Dit Microsoft-account is al gekoppeld aan een andere gebruiker.' });
        }
        
        const insertReq = new sql.Request();
        insertReq.input('userId', sql.Int, userID);
        insertReq.input('providerKey', sql.NVarChar, msUser.providerId);
        await insertReq.query('INSERT INTO PF_User_Identities (user_id, provider_name, provider_key) VALUES (@userId, \'microsoft\', @providerKey)');
        
        res.json({ message: 'Microsoft-account succesvol gekoppeld!' });
    } catch (error) {
        console.error('Fout bij koppelen Microsoft:', error);
        res.status(500).json({ message: 'Serverfout bij het koppelen.' });
    }
};

const unlinkProvider = async (req, res) => {
    const { provider } = req.params;
    
    if (!['google', 'microsoft'].includes(provider)) {
        return res.status(400).json({ message: 'Ongeldige inlogmethode.' });
    }
    
    try {
        const userID = req.user.userID;
        
        const request = new sql.Request();
        request.input('id', sql.Int, userID);
        const userRes = await request.query('SELECT password FROM PF_Users WHERE id = @id');
        
        const otherIdentsReq = new sql.Request();
        otherIdentsReq.input('userId', sql.Int, userID);
        otherIdentsReq.input('providerName', sql.NVarChar, provider);
        const identsRes = await otherIdentsReq.query('SELECT id FROM PF_User_Identities WHERE user_id = @userId AND provider_name != @providerName');
        
        const hasPassword = userRes.recordset[0]?.password && userRes.recordset[0]?.password !== '__PLACEHOLDER__';
        const hasOtherIdentity = identsRes.recordset.length > 0;
        
        if (!hasPassword && !hasOtherIdentity) {
            return res.status(400).json({ message: 'Je kunt deze inlogmethode niet ontkoppelen, omdat je dan geen andere manier meer hebt om in te loggen.' });
        }
        
        const deleteReq = new sql.Request();
        deleteReq.input('userId', sql.Int, userID);
        deleteReq.input('providerName', sql.NVarChar, provider);
        await deleteReq.query('DELETE FROM PF_User_Identities WHERE user_id = @userId AND provider_name = @providerName');
        
        const userPrefRes = await request.query('SELECT preferred_login_method FROM PF_Users WHERE id = @id');
        if (userPrefRes.recordset[0]?.preferred_login_method === provider) {
            const updatePrefReq = new sql.Request();
            updatePrefReq.input('id', sql.Int, userID);
            await updatePrefReq.query('UPDATE PF_Users SET preferred_login_method = \'password\' WHERE id = @id');
        }
        
        res.json({ message: `${provider === 'google' ? 'Google' : 'Microsoft'}-account succesvol ontkoppeld.` });
    } catch (error) {
        console.error('Fout bij ontkoppelen:', error);
        res.status(500).json({ message: 'Serverfout bij het ontkoppelen.' });
    }
};

const updatePreference = async (req, res) => {
    const { preferredMethod } = req.body;
    
    if (!['password', 'google', 'microsoft'].includes(preferredMethod)) {
        return res.status(400).json({ message: 'Ongeldige inlogmethode.' });
    }
    
    try {
        const userID = req.user.userID;
        const request = new sql.Request();
        request.input('preferredMethod', sql.NVarChar, preferredMethod);
        request.input('id', sql.Int, userID);
        await request.query('UPDATE PF_Users SET preferred_login_method = @preferredMethod WHERE id = @id');
        
        res.json({ message: 'Inlogvoorkeur succesvol bijgewerkt.' });
    } catch (error) {
        console.error('Fout bij bijwerken inlogvoorkeur:', error);
        res.status(500).json({ message: 'Serverfout bij bijwerken inlogvoorkeur.' });
    }
};

module.exports = { 
    loginStep1, 
    loginStep2, 
    register, 
    getProfile, 
    updateProfile, 
    updatePassword, 
    getAllUsers, 
    updateUserRole, 
    logout,
    loginProvider,
    linkGoogle,
    linkMicrosoft,
    unlinkProvider,
    updatePreference
};
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
    service: 'hotmail',
    auth: {
        user: process.env.MAIL_USER || 'arne.van.riel@hotmail.be',
        pass: process.env.MAIL_PASS || 'jouw-wachtwoord' // Let op: Gebruik hier jouw actuele wachtwoord
    }
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

    const otp = crypto.randomInt(100000, 999999).toString();
    
    otpStore.set(username, {
        otp: otp,
        expiresAt: Date.now() + 10 * 60 * 1000,
        user: user 
    });

    const userEmail = user.email || user.Email; 

    if (!userEmail) {
        return res.status(400).json({ message: 'Geen emailadres gevonden voor deze gebruiker in de database.' });
    }

    const mailOptions = {
        from: process.env.MAIL_USER || 'arne.van.riel@hotmail.be',
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

    // OPLOSSING VOOR TRAGE LOGIN: We wachten (await) niet meer op de mailserver.
    transporter.sendMail(mailOptions).catch(mailError => {
        console.error('Email verzenden op de achtergrond mislukt:', mailError.message);
    });

    // Frontend mag meteen door, geen vertraging meer!
    res.json({ message: 'Kijk in je Node.js console (terminal) voor je inlogcode!' });
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
        const userID = user.id;
        const role = user.role || user.Roles;

        // Bepaal de geldigheidsduur van het token
        const expiresIn = rememberMe ? '30d' : '1h';

        const token = jwt.sign({ username, userID }, 'geheime_sleutel', { expiresIn });

        // Verwijder de gebruikte OTP zodat deze niet opnieuw gebruikt kan worden
        otpStore.delete(username);

        res.json({ token, username, userID, role, expiresIn });
    } catch (error) {
        console.error('Fout bij inloggen stap 2:', error);
        res.status(500).json({ message: 'Serverfout bij het verifiëren.' });
    }
};

const register = async (req, res) => {
  const { username, email, password } = req.body;

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
    
    await insertRequest.query(`INSERT INTO PF_Users (username, email, password, role) VALUES (@username, @email, @password, 'user')`);

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
            SELECT username, email, ISNULL(default_currency, 'EUR') as default_currency, ISNULL(manual_exchange_rate, 1.0) as manual_exchange_rate 
            FROM PF_Users WHERE id = @id
        `);
        
        if (result.recordset.length === 0) return res.status(404).json({ message: 'Gebruiker niet gevonden.' });
        
        res.json(result.recordset[0]);
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

module.exports = { loginStep1, loginStep2, register, getProfile, updateProfile, updatePassword };
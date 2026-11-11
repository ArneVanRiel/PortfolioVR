// controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sql } = require('../config/database');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const {
    isAdminUser,
    buildUserPermissions,
    DEFAULT_PERMISSIONS_BY_MODE
} = require('../middleware/authMiddleware');

// In-memory store voor OTP's
const otpStore = new Map();

// Configureer de nodemailer transporter
const transporter = nodemailer.createTransport({
    host: "smtp-mail.outlook.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    },
    family: 4,
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
    if (Number(user.id) !== 1 && user.is_active === false) {
      return res.status(403).json({ message: 'Dit account is gedeactiveerd door de beheerder.' });
    }

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

    console.log(`\n=========================================`);
    console.log(`🔑 JOUW LOGIN CODE VOOR ${username}: ${otp}`);
    console.log(`=========================================\n`);

    try {
        await transporter.sendMail(mailOptions);
        res.json({ message: 'Verificatiecode is verstuurd naar je e-mailadres.' });
    } catch (mailError) {
        console.error('Email verzenden mislukt:', mailError);
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

        const user = storedOtpData.user;
        let userID = user.id;
        let role = Number(user.id) === 1 ? 'admin' : (user.role || user.Roles || 'user');
        let strategyMode = Number(user.id) === 1 ? 'full_access' : (user.strategy_mode || 'arne_advies');

        // Forceer demo gebruiker naar de data van ArneVR (alleen-lezen)
        if (role === 'demo' || username.toLowerCase() === 'demo') {
            role = 'demo';
            userID = 1;
        }

        const permissions = buildUserPermissions(role, strategyMode, user.permissions, user.id);
        const expiresIn = rememberMe ? '30d' : '1h';

        const token = jwt.sign(
            { username, userID, actualUserId: user.id, role, strategy_mode: strategyMode },
            process.env.JWT_SECRET,
            { expiresIn }
        );

        otpStore.delete(username);

        const updateReq = new sql.Request();
        updateReq.input('id', sql.Int, user.id);
        await updateReq.query('UPDATE PF_Users SET last_login = GETDATE() WHERE id = @id');

        res.json({
            token,
            username,
            userID,
            role,
            strategy_mode: strategyMode,
            permissions,
            default_currency: user.default_currency || 'EUR',
            expiresIn
        });
    } catch (error) {
        console.error('Fout bij inloggen stap 2:', error);
        res.status(500).json({ message: 'Serverfout bij het verifiëren.' });
    }
};

// Haal actuele sessie, rol en toegangsrechten op voor de ingelogde gebruiker
const getMe = async (req, res) => {
    try {
        const lookupId = Number(req.user?.actualUserId || req.user?.userID || 1);
        const request = new sql.Request();
        request.input('id', sql.Int, lookupId);
        const result = await request.query('SELECT * FROM PF_Users WHERE id = @id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Gebruiker niet gevonden.' });
        }

        const user = result.recordset[0];
        if (Number(user.id) !== 1 && user.is_active === false) {
            return res.status(403).json({ message: 'Dit account is gedeactiveerd.' });
        }

        const role = Number(user.id) === 1 ? 'admin' : (user.role || 'user');
        const strategyMode = Number(user.id) === 1 ? 'full_access' : (user.strategy_mode || 'arne_advies');
        const permissions = buildUserPermissions(role, strategyMode, user.permissions, user.id);
        const effectiveUserId = role === 'demo' ? 1 : user.id;

        res.json({
            userID: effectiveUserId,
            actualUserId: user.id,
            username: user.username,
            email: user.email,
            role,
            strategy_mode: strategyMode,
            permissions,
            default_currency: user.default_currency || 'EUR'
        });
    } catch (error) {
        console.error('Fout bij ophalen actuele gebruiker:', error);
        res.status(500).json({ message: 'Serverfout bij ophalen gebruikerssessie.' });
    }
};

// Alleen toegankelijk voor Admin (User 1): nodig een gebruiker uit / maak een account aan
const register = async (req, res) => {
  const {
    username,
    email,
    password,
    role = 'user',
    strategy_mode = 'arne_advies',
    permissions = null,
    sendInviteEmail = true
  } = req.body;

  if (!username || !email) {
    return res.status(400).json({ message: 'Vul een gebruikersnaam en e-mailadres in om iemand uit te nodigen.' });
  }

  // Als er geen wachtwoord is opgegeven, genereer automatisch een sterk tijdelijk wachtwoord
  const plainPassword = (password && String(password).trim().length >= 6)
    ? String(password).trim()
    : `Welkom-${crypto.randomInt(1000, 9999)}!`;

  try {
    const request = new sql.Request();
    request.input('username', sql.NVarChar, username.trim());
    request.input('email', sql.NVarChar, email.trim());
    const existingUser = await request.query('SELECT id FROM PF_Users WHERE username = @username OR LOWER(email) = LOWER(@email)');

    if (existingUser.recordset.length > 0) {
      return res.status(409).json({ message: 'Deze gebruikersnaam of dit e-mailadres is al in gebruik.' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

    const safeRole = ['user', 'admin', 'demo'].includes(role) ? role : 'user';
    const safeMode = ['portfolio_only', 'arne_advies', 'full_access'].includes(strategy_mode)
      ? strategy_mode
      : (safeRole === 'admin' ? 'full_access' : 'arne_advies');
    const resolvedPermissions = buildUserPermissions(safeRole, safeMode, permissions, null);

    const insertRequest = new sql.Request();
    insertRequest.input('username', sql.NVarChar, username.trim());
    insertRequest.input('email', sql.NVarChar, email.trim());
    insertRequest.input('password', sql.NVarChar, hashedPassword);
    insertRequest.input('role', sql.NVarChar, safeRole);
    insertRequest.input('strategy_mode', sql.NVarChar, safeMode);
    insertRequest.input('permissions', sql.NVarChar(sql.MAX), JSON.stringify(resolvedPermissions));

    const insertRes = await insertRequest.query(`
      INSERT INTO PF_Users (username, email, password, role, strategy_mode, permissions, is_active, default_currency, created_at)
      OUTPUT INSERTED.id
      VALUES (@username, @email, @password, @role, @strategy_mode, @permissions, 1, 'EUR', GETDATE())
    `);

    const newUserId = insertRes.recordset[0]?.id;

    // Initialiseer lege (0.00 EUR) saldo-rijen in AvailableBalances voor deze nieuwe gebruiker
    if (newUserId && safeRole !== 'demo') {
      const typesRes = await new sql.Request().query('SELECT balance_type_id FROM AvailableBalanceTypes');
      for (const t of typesRes.recordset) {
        await new sql.Request()
          .input('user_id', sql.Int, newUserId)
          .input('balance_type_id', sql.Int, t.balance_type_id)
          .query(`
            INSERT INTO AvailableBalances (user_id, balance_type_id, amount, update_date)
            VALUES (@user_id, @balance_type_id, 0, CAST(GETDATE() AS DATE))
          `);
      }
    }

    // Probeer optioneel een uitnodigingsmail te sturen
    let emailSent = false;
    if (sendInviteEmail && process.env.MAIL_USER && process.env.MAIL_PASS) {
      try {
        await transporter.sendMail({
          from: process.env.MAIL_USER,
          to: email.trim(),
          subject: 'Uitnodiging voor PortfolioVR',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
              <h2 style="color: #1e293b; margin-top: 0;">Je bent uitgenodigd voor PortfolioVR</h2>
              <p style="color: #475569; line-height: 1.5;">
                Arne heeft een persoonlijk account voor je klaargezet op <strong>PortfolioVR</strong>.
              </p>
              <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e2e8f0;">
                <p style="margin: 4px 0;"><strong>Gebruikersnaam:</strong> ${username.trim()}</p>
                <p style="margin: 4px 0;"><strong>Tijdelijk wachtwoord:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 4px;">${plainPassword}</code></p>
                <p style="margin: 4px 0;"><strong>Gekoppeld e-mailadres:</strong> ${email.trim()}</p>
              </div>
              <p style="color: #64748b; font-size: 13px;">
                Je kunt inloggen met bovenstaande gegevens (of direct via Google/Microsoft als je inlogt met ${email.trim()}). Pas na het inloggen gerust je wachtwoord aan via <em>Mijn Profiel</em>.
              </p>
            </div>
          `
        });
        emailSent = true;
      } catch (mailErr) {
        console.warn('Uitnodigingsmail kon niet automatisch worden verzonden:', mailErr.message);
      }
    }

    res.status(201).json({
      message: emailSent
        ? `Uitnodiging en account voor "${username}" aangemaakt (e-mail verstuurd)!`
        : `Account voor "${username}" aangemaakt! Kopieer hieronder de uitnodiging om door te sturen.`,
      userId: newUserId,
      inviteSummary: {
        username: username.trim(),
        email: email.trim(),
        temporaryPassword: plainPassword,
        strategy_mode: safeMode,
        emailSent
      }
    });
  } catch (error) {
    console.error('Fout bij registratie:', error);
    res.status(500).json({ message: 'Serverfout bij het uitnodigen/aanmaken.' });
  }
};

const getProfile = async (req, res) => {
    const requestedId = Number(req.params.id);
    const callerId = Number(req.user?.actualUserId || req.user?.userID);
    const id = isAdminUser(req) ? (requestedId || callerId) : callerId;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        const result = await request.query(`
            SELECT id, username, email, role,
                   ISNULL(strategy_mode, 'arne_advies') as strategy_mode,
                   permissions,
                   ISNULL(default_currency, 'EUR') as default_currency,
                   ISNULL(manual_exchange_rate, 1.0) as manual_exchange_rate,
                   ISNULL(preferred_login_method, 'password') as preferred_login_method
            FROM PF_Users WHERE id = @id
        `);
        
        if (result.recordset.length === 0) return res.status(404).json({ message: 'Gebruiker niet gevonden.' });
        
        const user = result.recordset[0];
        const role = Number(user.id) === 1 ? 'admin' : (user.role || 'user');
        const strategyMode = Number(user.id) === 1 ? 'full_access' : (user.strategy_mode || 'arne_advies');
        const parsedPermissions = buildUserPermissions(role, strategyMode, user.permissions, user.id);
        
        const identRequest = new sql.Request();
        identRequest.input('userId', sql.Int, id);
        const identRes = await identRequest.query('SELECT provider_name FROM PF_User_Identities WHERE user_id = @userId');
        
        const linkedProviders = identRes.recordset.map(row => row.provider_name);
        
        res.json({
            ...user,
            role,
            strategy_mode: strategyMode,
            permissions: parsedPermissions,
            linkedProviders
        });
    } catch (error) {
        console.error('Fout bij ophalen profiel:', error);
        res.status(500).json({ message: 'Fout bij het ophalen van het profiel.' });
    }
};

const updateProfile = async (req, res) => {
    const requestedId = Number(req.params.id);
    const callerId = Number(req.user?.actualUserId || req.user?.userID);
    if (!isAdminUser(req) && requestedId !== callerId) {
        return res.status(403).json({ message: 'Je kunt alleen je eigen profiel wijzigen.' });
    }
    const id = isAdminUser(req) ? requestedId : callerId;
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
    const requestedId = Number(req.params.id);
    const callerId = Number(req.user?.actualUserId || req.user?.userID);
    if (!isAdminUser(req) && requestedId !== callerId) {
        return res.status(403).json({ message: 'Je kunt alleen je eigen wachtwoord wijzigen.' });
    }
    const id = isAdminUser(req) ? requestedId : callerId;
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
        const request = new sql.Request();
        const result = await request.query(`
            SELECT u.*,
                   (SELECT COUNT(*) FROM PF_transactions t WHERE t.user_id = u.id) AS tx_count
            FROM PF_Users u
            ORDER BY u.id ASC
        `);
        
        const mappedUsers = result.recordset.map(u => {
            const uid = u.id || u.Id || u.ID;
            const role = Number(uid) === 1 ? 'admin' : (u.role || u.Role || u.Roles || 'user');
            const strategyMode = Number(uid) === 1 ? 'full_access' : (u.strategy_mode || 'arne_advies');
            const permissions = buildUserPermissions(role, strategyMode, u.permissions, uid);

            return {
                id: uid,
                username: u.username || u.Username || u.USERNAME,
                email: u.email || u.Email || u.EMAIL,
                role,
                strategy_mode: strategyMode,
                permissions,
                is_active: Number(uid) === 1 ? true : (u.is_active !== false && u.is_active !== 0),
                tx_count: u.tx_count || 0,
                last_login: u.last_login || u.Last_Login || null,
                created_at: u.created_at || null
            };
        });
        
        res.json(mappedUsers);
    } catch (error) {
        console.error('Fout bij ophalen gebruikers:', error);
        res.status(500).json({ message: 'Serverfout bij ophalen gebruikers.' });
    }
};

const updateUserRole = async (req, res) => {
    const id = Number(req.params.id);
    const { role } = req.body;

    if (id === 1 && role !== 'admin') {
        return res.status(400).json({ message: 'Gebruiker 1 (ArneVR) is de hoofdontwikkelaar en blijft altijd Admin.' });
    }

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

// Uitgebreid toegangsbeheer voor User 1 (Admin): pas rol, strategy_mode, individuele permissions, actief-status of wachtwoord aan
const updateUserAccess = async (req, res) => {
    const id = Number(req.params.id);
    const { role, strategy_mode, permissions, is_active, newPassword, email } = req.body;

    if (id === 1) {
        return res.status(400).json({ message: 'Gebruiker 1 (ArneVR) heeft als ontwikkelaar altijd volledige toegang.' });
    }

    try {
        const curReq = new sql.Request();
        curReq.input('id', sql.Int, id);
        const curRes = await curReq.query('SELECT * FROM PF_Users WHERE id = @id');
        if (curRes.recordset.length === 0) {
            return res.status(404).json({ message: 'Gebruiker niet gevonden.' });
        }
        const current = curRes.recordset[0];

        const nextRole = role || current.role || 'user';
        const nextMode = strategy_mode || current.strategy_mode || 'arne_advies';
        const nextActive = typeof is_active === 'boolean' ? is_active : (current.is_active !== false);

        // Als strategy_mode gewijzigd wordt zonder specifieke permissions-override, gebruik de preset van die mode
        let basePermissions = permissions;
        if (!basePermissions && strategy_mode && DEFAULT_PERMISSIONS_BY_MODE[strategy_mode]) {
            basePermissions = DEFAULT_PERMISSIONS_BY_MODE[strategy_mode];
        }
        const resolvedPermissions = buildUserPermissions(nextRole, nextMode, basePermissions || current.permissions, id);

        const updateReq = new sql.Request();
        updateReq.input('id', sql.Int, id);
        updateReq.input('role', sql.NVarChar, nextRole);
        updateReq.input('strategy_mode', sql.NVarChar, nextMode);
        updateReq.input('permissions', sql.NVarChar(sql.MAX), JSON.stringify(resolvedPermissions));
        updateReq.input('is_active', sql.Bit, nextActive ? 1 : 0);
        updateReq.input('email', sql.NVarChar, email !== undefined ? email : current.email);

        let query = `
            UPDATE PF_Users
            SET role = @role,
                strategy_mode = @strategy_mode,
                permissions = @permissions,
                is_active = @is_active,
                email = @email
        `;

        if (newPassword && String(newPassword).trim().length >= 6) {
            const hashed = await bcrypt.hash(String(newPassword).trim(), 10);
            updateReq.input('password', sql.NVarChar, hashed);
            query += `, password = @password`;
        }

        query += ` WHERE id = @id`;
        await updateReq.query(query);

        res.json({
            message: 'Toegangsrechten en instellingen succesvol opgeslagen.',
            user: {
                id,
                role: nextRole,
                strategy_mode: nextMode,
                permissions: resolvedPermissions,
                is_active: nextActive
            }
        });
    } catch (error) {
        console.error('Fout bij bijwerken toegangsrechten:', error);
        res.status(500).json({ message: 'Serverfout bij bijwerken toegangsrechten.' });
    }
};

const deleteUser = async (req, res) => {
    const id = Number(req.params.id);
    if (id === 1) {
        return res.status(400).json({ message: 'Gebruiker 1 (ArneVR) kan niet worden verwijderd.' });
    }

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        await request.query(`
            DELETE FROM PF_User_Identities WHERE user_id = @id;
            DELETE FROM PF_User_Watchlist WHERE user_id = @id;
            DELETE FROM AvailableBalances WHERE user_id = @id;
            DELETE FROM PF_Notifications WHERE user_id = @id;
            DELETE FROM UserBrokerCredentials WHERE user_id = @id;
            DELETE FROM DailyPortfolioValue WHERE user_id = @id;
            DELETE FROM PF_transactions WHERE user_id = @id;
            DELETE FROM PF_Users WHERE id = @id;
        `);
        res.json({ message: 'Gebruiker en bijbehorende gegevens zijn verwijderd.' });
    } catch (error) {
        console.error('Fout bij verwijderen gebruiker:', error);
        res.status(500).json({ message: 'Serverfout bij verwijderen gebruiker.' });
    }
};

const logout = (req, res) => {
    res.json({ message: 'Succesvol uitgelogd' });
};

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
    let providerEmail = null;
    
    if (provider === 'google') {
        const googleUser = await verifyGoogleToken(token);
        if (!googleUser) {
            return res.status(400).json({ message: 'Ongeldig Google-token.' });
        }
        providerUserId = googleUser.providerId;
        providerEmail = googleUser.email;
    } else if (provider === 'microsoft') {
        const msUser = await verifyMicrosoftToken(token);
        if (!msUser) {
            return res.status(400).json({ message: 'Ongeldig Microsoft-token.' });
        }
        providerUserId = msUser.providerId;
        providerEmail = msUser.email;
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
        
        let userID = checkRes.recordset[0]?.user_id || null;

        // Als nog niet gekoppeld in PF_User_Identities, kijk of Arne een gebruiker met dit e-mailadres heeft uitgenodigd
        if (!userID && providerEmail) {
            const emailReq = new sql.Request();
            emailReq.input('email', sql.NVarChar, String(providerEmail).trim());
            const emailRes = await emailReq.query(
                'SELECT id FROM PF_Users WHERE LOWER(email) = LOWER(@email)'
            );
            if (emailRes.recordset.length > 0) {
                userID = emailRes.recordset[0].id;
                // Koppel direct automatisch aan dit uitgenodigde account
                const autoLinkReq = new sql.Request();
                autoLinkReq.input('userId', sql.Int, userID);
                autoLinkReq.input('providerName', sql.NVarChar, provider);
                autoLinkReq.input('providerKey', sql.NVarChar, providerUserId);
                await autoLinkReq.query(`
                    IF NOT EXISTS (SELECT 1 FROM PF_User_Identities WHERE user_id = @userId AND provider_name = @providerName)
                    INSERT INTO PF_User_Identities (user_id, provider_name, provider_key)
                    VALUES (@userId, @providerName, @providerKey)
                `);
            }
        }
        
        if (!userID) {
            return res.status(401).json({ 
                message: `Toegang geweigerd: dit ${provider === 'google' ? 'Google' : 'Microsoft'}-account (${providerEmail || 'onbekend'}) is niet uitgenodigd. Alleen gebruikers die door de beheerder zijn uitgenodigd hebben toegang.` 
            });
        }
        
        const userReq = new sql.Request();
        userReq.input('id', sql.Int, userID);
        const userRes = await userReq.query('SELECT * FROM PF_Users WHERE id = @id');
        
        if (userRes.recordset.length === 0) {
            return res.status(404).json({ message: 'Gekoppelde gebruiker bestaat niet meer.' });
        }
        
        const user = userRes.recordset[0];
        if (Number(user.id) !== 1 && user.is_active === false) {
            return res.status(403).json({ message: 'Dit account is gedeactiveerd door de beheerder.' });
        }

        const role = Number(user.id) === 1 ? 'admin' : (user.role || 'user');
        const strategyMode = Number(user.id) === 1 ? 'full_access' : (user.strategy_mode || 'arne_advies');
        const permissions = buildUserPermissions(role, strategyMode, user.permissions, user.id);
        const effectiveUserId = role === 'demo' ? 1 : user.id;
        
        const updateReq = new sql.Request();
        updateReq.input('id', sql.Int, user.id);
        await updateReq.query('UPDATE PF_Users SET last_login = GETDATE() WHERE id = @id');
        
        const expiresIn = '30d';
        const jwtToken = jwt.sign(
            { username: user.username, userID: effectiveUserId, actualUserId: user.id, role, strategy_mode: strategyMode },
            process.env.JWT_SECRET,
            { expiresIn }
        );
        
        res.json({
            token: jwtToken,
            username: user.username,
            userID: effectiveUserId,
            role,
            strategy_mode: strategyMode,
            permissions,
            default_currency: user.default_currency || 'EUR',
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
        const userID = req.user.actualUserId || req.user.userID;
        
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
        const userID = req.user.actualUserId || req.user.userID;
        
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
        const userID = req.user.actualUserId || req.user.userID;
        
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
        const userID = req.user.actualUserId || req.user.userID;
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

const updateMyStrategyMode = async (req, res) => {
    const callerId = Number(req.user?.actualUserId || req.user?.userID);
    const { strategy_mode } = req.body;

    if (!['portfolio_only', 'arne_advies'].includes(strategy_mode)) {
        return res.status(400).json({ message: 'Ongeldige gebruiksmodus. Kies tussen "portfolio_only" (Modus 1) of "arne_advies" (Modus 2).' });
    }

    if (callerId === 1) {
        return res.status(400).json({ message: 'Als hoofdbeheerder (User 1) heb je altijd volledige ontwikkelaarstoegang.' });
    }

    try {
        const getReq = new sql.Request();
        getReq.input('id', sql.Int, callerId);
        const currentRes = await getReq.query('SELECT role, permissions FROM PF_Users WHERE id = @id');
        if (currentRes.recordset.length === 0) {
            return res.status(404).json({ message: 'Gebruiker niet gevonden.' });
        }

        const userRow = currentRes.recordset[0];
        const role = userRow.role || 'user';
        let existingPerms = {};
        if (userRow.permissions) {
            try {
                existingPerms = typeof userRow.permissions === 'string' ? JSON.parse(userRow.permissions) : userRow.permissions;
            } catch (e) {
                existingPerms = {};
            }
        }

        const isAdvies = strategy_mode === 'arne_advies';
        const updatedPermissions = buildUserPermissions(
            role,
            strategy_mode,
            {
                canViewDashboard: isAdvies,
                canViewPortfolio: true,
                canUseStockStrategy: isAdvies,
                canUseEtfStrategy: isAdvies,
                canViewAnalysis: true,
                canReceiveStrategyAlerts: isAdvies,
                // Zorg dat een reguliere gebruiker nooit zelf zijn rechten kan verhogen naar formule/screener/systeem-toegang
                canViewFormulas: false,
                canViewScreener: Boolean(existingPerms.canViewScreener),
                canEditSystemData: false
            },
            callerId
        );

        const updateReq = new sql.Request();
        updateReq.input('id', sql.Int, callerId);
        updateReq.input('strategy_mode', sql.NVarChar, strategy_mode);
        updateReq.input('permissions', sql.NVarChar, JSON.stringify(updatedPermissions));
        await updateReq.query(`
            UPDATE PF_Users
            SET strategy_mode = @strategy_mode,
                permissions = @permissions
            WHERE id = @id
        `);

        res.json({
            message: strategy_mode === 'portfolio_only'
                ? 'Modus 1 geactiveerd: Enkel Portfolio Tracking.'
                : 'Modus 2 geactiveerd: Portfolio + Arne\'s Strategie Advies (Black-Box).',
            strategy_mode,
            permissions: updatedPermissions
        });
    } catch (error) {
        console.error('Fout bij wijzigen gebruiksmodus:', error);
        res.status(500).json({ message: 'Serverfout bij wijzigen gebruiksmodus.' });
    }
};

module.exports = { 
    loginStep1, 
    loginStep2, 
    getMe,
    register, 
    getProfile, 
    updateProfile, 
    updatePassword, 
    getAllUsers, 
    updateUserRole, 
    updateUserAccess,
    deleteUser,
    logout,
    loginProvider,
    linkGoogle,
    linkMicrosoft,
    unlinkProvider,
    updatePreference,
    updateMyStrategyMode
};

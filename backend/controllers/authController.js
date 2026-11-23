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

// Standaard systeemrollen die automatisch in PF_Roles worden gezet
const SYSTEM_DEFAULT_ROLES = [
    {
        role_key: 'starter',
        role_name: '📊 Nieuwe Belegger (Enkel Portfolio)',
        description: 'Nieuwe gebruikers kunnen in het begin alleen hun eigen portfolio, transacties, dividenden en belastingen bijhouden (zonder Strategie Builder, Analyse of Dashboard).',
        is_system: 1,
        permissions: {
            canViewPortfolio: true,
            canViewDashboard: false,
            canUseStockStrategy: false,
            canUseEtfStrategy: false,
            canViewStrategyBuilder: false,
            canViewAnalysis: false,
            canViewScreener: false,
            canViewFormulas: false,
            canEditSystemData: false,
            canReceiveStrategyAlerts: false,
        }
    },
    {
        role_key: 'pro',
        role_name: '⚡ Portfolio + Strategie Advies (Black-Box)',
        description: 'Gebruiker houdt eigen portfolio bij én krijgt koop/verkoop-advies, meldingen en inzage in Aandelen Analyse & Strategie Builder, zonder dat jouw geheime DCF-formules of screener zichtbaar zijn.',
        is_system: 1,
        permissions: {
            canViewPortfolio: true,
            canViewDashboard: true,
            canUseStockStrategy: true,
            canUseEtfStrategy: true,
            canViewStrategyBuilder: true,
            canViewAnalysis: true,
            canViewScreener: false,
            canViewFormulas: false,
            canEditSystemData: false,
            canReceiveStrategyAlerts: true,
        }
    },
    {
        role_key: 'admin',
        role_name: '👑 Beheerder (Volledige Toegang)',
        description: 'Volledige inzage in alle pagina\'s, strategieën, screener, backtest, DCF-formules en het beheerderspaneel.',
        is_system: 1,
        permissions: {
            canViewPortfolio: true,
            canViewDashboard: true,
            canUseStockStrategy: true,
            canUseEtfStrategy: true,
            canViewStrategyBuilder: true,
            canViewAnalysis: true,
            canViewScreener: true,
            canViewFormulas: true,
            canEditSystemData: true,
            canReceiveStrategyAlerts: true,
        }
    },
    {
        role_key: 'demo',
        role_name: '👁️ Demo Account (Alleen-lezen)',
        description: 'Alleen-lezen weergave voor demonstratiedoeleinden.',
        is_system: 1,
        permissions: {
            canViewPortfolio: true,
            canViewDashboard: true,
            canUseStockStrategy: true,
            canUseEtfStrategy: true,
            canViewStrategyBuilder: false,
            canViewAnalysis: true,
            canViewScreener: false,
            canViewFormulas: false,
            canEditSystemData: false,
            canReceiveStrategyAlerts: false,
        }
    }
];

let rolesTableInitialized = false;
const ensureRolesTableAndColumns = async () => {
    if (rolesTableInitialized) return;
    try {
        const req = new sql.Request();
        await req.query(`
            IF OBJECT_ID('PF_Roles', 'U') IS NULL
            BEGIN
                CREATE TABLE PF_Roles (
                    role_id INT IDENTITY(1,1) PRIMARY KEY,
                    role_key NVARCHAR(50) NOT NULL UNIQUE,
                    role_name NVARCHAR(100) NOT NULL,
                    description NVARCHAR(500) NULL,
                    permissions_json NVARCHAR(MAX) NOT NULL,
                    is_system BIT NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL DEFAULT GETDATE(),
                    updated_at DATETIME NOT NULL DEFAULT GETDATE()
                );
            END;

            IF COL_LENGTH('PF_Users', 'must_change_password') IS NULL
            BEGIN
                ALTER TABLE PF_Users ADD must_change_password BIT NOT NULL DEFAULT 0;
            END;
        `);

        for (const def of SYSTEM_DEFAULT_ROLES) {
            const seedReq = new sql.Request();
            seedReq.input('key', sql.NVarChar, def.role_key);
            seedReq.input('name', sql.NVarChar, def.role_name);
            seedReq.input('desc', sql.NVarChar, def.description);
            seedReq.input('perms', sql.NVarChar(sql.MAX), JSON.stringify(def.permissions));
            seedReq.input('sys', sql.Bit, def.is_system ? 1 : 0);
            await seedReq.query(`
                IF NOT EXISTS (SELECT 1 FROM PF_Roles WHERE role_key = @key)
                INSERT INTO PF_Roles (role_key, role_name, description, permissions_json, is_system)
                VALUES (@key, @name, @desc, @perms, @sys);
            `);
        }

        // Migreer bestaande reguliere gebruikers die 'user' hadden en 'portfolio_only' of 'arne_advies' naar de juiste rol
        await new sql.Request().query(`
            UPDATE PF_Users
            SET role = CASE WHEN strategy_mode = 'portfolio_only' THEN 'starter' ELSE 'pro' END
            WHERE id != 1 AND role = 'user';
        `);

        rolesTableInitialized = true;
    } catch (err) {
        console.warn('Waarschuwing bij initialiseren PF_Roles:', err.message);
    }
};

const fetchRolesMapFromDb = async () => {
    await ensureRolesTableAndColumns();
    const res = await new sql.Request().query('SELECT * FROM PF_Roles ORDER BY is_system DESC, role_id ASC');
    const roles = (res.recordset || []).map(r => {
        let perms = {};
        try {
            perms = r.permissions_json ? JSON.parse(r.permissions_json) : {};
        } catch (e) {}
        return {
            role_id: r.role_id,
            role_key: r.role_key,
            role_name: r.role_name,
            description: r.description || '',
            permissions: perms,
            is_system: Boolean(r.is_system)
        };
    });
    const byKey = new Map();
    roles.forEach(r => byKey.set(r.role_key, r));
    return { roles, byKey };
};

const resolvePermissionsForUserRow = async (userRow, rolesByKey = null) => {
    const uid = Number(userRow.id || userRow.userID);
    if (uid === 1 || userRow.role === 'admin') {
        return {
            role: 'admin',
            role_name: '👑 Beheerder (Volledige Toegang)',
            strategy_mode: 'full_access',
            permissions: {
                canViewPortfolio: true,
                canViewDashboard: true,
                canUseStockStrategy: true,
                canUseEtfStrategy: true,
                canViewStrategyBuilder: true,
                canViewAnalysis: true,
                canViewScreener: true,
                canViewFormulas: true,
                canEditSystemData: true,
                canReceiveStrategyAlerts: true,
            }
        };
    }

    let map = rolesByKey;
    if (!map) {
        const fetched = await fetchRolesMapFromDb();
        map = fetched.byKey;
    }

    let rawRole = userRow.role || 'starter';
    if (rawRole === 'user') {
        rawRole = userRow.strategy_mode === 'arne_advies' ? 'pro' : 'starter';
    }

    const roleObj = map.get(rawRole) || map.get('starter') || SYSTEM_DEFAULT_ROLES[0];
    const perms = {
        ...SYSTEM_DEFAULT_ROLES[0].permissions,
        ...(roleObj.permissions || {})
    };
    const derivedMode = (perms.canUseStockStrategy || perms.canUseEtfStrategy || perms.canViewDashboard) ? 'arne_advies' : 'portfolio_only';

    return {
        role: roleObj.role_key,
        role_name: roleObj.role_name,
        strategy_mode: derivedMode,
        permissions: perms
    };
};

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
        const resolved = await resolvePermissionsForUserRow(user);
        let userID = user.id;
        let role = resolved.role;
        let strategyMode = resolved.strategy_mode;
        const permissions = resolved.permissions;

        // Forceer demo gebruiker naar de data van ArneVR (alleen-lezen)
        if (role === 'demo' || username.toLowerCase() === 'demo') {
            role = 'demo';
            userID = 1;
        }

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
            role_name: resolved.role_name,
            strategy_mode: strategyMode,
            permissions,
            must_change_password: Boolean(user.must_change_password),
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
        await ensureRolesTableAndColumns();
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

        const resolved = await resolvePermissionsForUserRow(user);
        const role = resolved.role;
        const strategyMode = resolved.strategy_mode;
        const permissions = resolved.permissions;
        const effectiveUserId = role === 'demo' ? 1 : user.id;

        res.json({
            userID: effectiveUserId,
            actualUserId: user.id,
            username: user.username,
            email: user.email,
            role,
            role_name: resolved.role_name,
            strategy_mode: strategyMode,
            permissions,
            must_change_password: Boolean(user.must_change_password),
            default_currency: user.default_currency || 'EUR'
        });
    } catch (error) {
        console.error('Fout bij ophalen actuele gebruiker:', error);
        res.status(500).json({ message: 'Serverfout bij ophalen gebruikerssessie.' });
    }
};

// Alleen toegankelijk voor Admin (User 1): nodig een gebruiker uit / maak een account aan op basis van een gekozen Rol
const register = async (req, res) => {
  const {
    username,
    email,
    password,
    role = 'starter',
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
    await ensureRolesTableAndColumns();
    const { byKey } = await fetchRolesMapFromDb();

    const request = new sql.Request();
    request.input('username', sql.NVarChar, username.trim());
    request.input('email', sql.NVarChar, email.trim());
    const existingUser = await request.query('SELECT id FROM PF_Users WHERE username = @username OR LOWER(email) = LOWER(@email)');

    if (existingUser.recordset.length > 0) {
      return res.status(409).json({ message: 'Deze gebruikersnaam of dit e-mailadres is al in gebruik.' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

    const chosenRoleObj = byKey.get(role) || byKey.get('starter') || SYSTEM_DEFAULT_ROLES[0];
    const safeRole = chosenRoleObj.role_key;
    const resolvedPermissions = chosenRoleObj.permissions;
    const safeMode = safeRole === 'admin'
      ? 'full_access'
      : ((resolvedPermissions.canUseStockStrategy || resolvedPermissions.canUseEtfStrategy || resolvedPermissions.canViewDashboard) ? 'arne_advies' : 'portfolio_only');

    const insertRequest = new sql.Request();
    insertRequest.input('username', sql.NVarChar, username.trim());
    insertRequest.input('email', sql.NVarChar, email.trim());
    insertRequest.input('password', sql.NVarChar, hashedPassword);
    insertRequest.input('role', sql.NVarChar, safeRole);
    insertRequest.input('strategy_mode', sql.NVarChar, safeMode);
    insertRequest.input('permissions', sql.NVarChar(sql.MAX), JSON.stringify(resolvedPermissions));

    const insertRes = await insertRequest.query(`
      INSERT INTO PF_Users (username, email, password, role, strategy_mode, permissions, is_active, must_change_password, default_currency, created_at)
      OUTPUT INSERTED.id
      VALUES (@username, @email, @password, @role, @strategy_mode, @permissions, 1, 1, 'EUR', GETDATE())
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
        role: safeRole,
        role_name: chosenRoleObj.role_name,
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
        await ensureRolesTableAndColumns();
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        const result = await request.query(`
            SELECT id, username, email, role,
                   ISNULL(strategy_mode, 'portfolio_only') as strategy_mode,
                   permissions,
                   ISNULL(must_change_password, 0) as must_change_password,
                   ISNULL(default_currency, 'EUR') as default_currency,
                   ISNULL(manual_exchange_rate, 1.0) as manual_exchange_rate,
                   ISNULL(preferred_login_method, 'password') as preferred_login_method,
                   ISNULL(allow_fractional_shares, 1) as allow_fractional_shares,
                   ISNULL(min_order_amount, 100.0) as min_order_amount,
                   ISNULL(min_order_skip_threshold, 50.0) as min_order_skip_threshold,
                   ISNULL(transaction_fee, 1.0) as transaction_fee,
                   ISNULL(tax_rate_pct, 0.35) as tax_rate_pct
            FROM PF_Users WHERE id = @id
        `);
        
        if (result.recordset.length === 0) return res.status(404).json({ message: 'Gebruiker niet gevonden.' });
        
        const user = result.recordset[0];
        const resolved = await resolvePermissionsForUserRow(user);
        
        const identRequest = new sql.Request();
        identRequest.input('userId', sql.Int, id);
        const identRes = await identRequest.query('SELECT provider_name FROM PF_User_Identities WHERE user_id = @userId');
        
        const linkedProviders = identRes.recordset.map(row => row.provider_name);
        
        res.json({
            ...user,
            role: resolved.role,
            role_name: resolved.role_name,
            strategy_mode: resolved.strategy_mode,
            permissions: resolved.permissions,
            must_change_password: Boolean(user.must_change_password),
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
    const { 
        username, 
        email,
        default_currency, 
        manual_exchange_rate,
        allow_fractional_shares,
        min_order_amount,
        min_order_skip_threshold,
        transaction_fee,
        tax_rate_pct
    } = req.body;
    
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('username', sql.NVarChar, username);
        request.input('email', sql.NVarChar, email || null);
        request.input('default_currency', sql.NVarChar, default_currency);
        request.input('manual_exchange_rate', sql.Decimal(18, 4), manual_exchange_rate);
        request.input('allow_fractional_shares', sql.Bit, allow_fractional_shares !== undefined ? (allow_fractional_shares ? 1 : 0) : 1);
        request.input('min_order_amount', sql.Decimal(18, 2), min_order_amount !== undefined ? Number(min_order_amount) : 100.0);
        request.input('min_order_skip_threshold', sql.Decimal(18, 2), min_order_skip_threshold !== undefined ? Number(min_order_skip_threshold) : 50.0);
        request.input('transaction_fee', sql.Decimal(10, 2), transaction_fee !== undefined ? Number(transaction_fee) : 1.0);
        request.input('tax_rate_pct', sql.Decimal(5, 2), tax_rate_pct !== undefined ? Number(tax_rate_pct) : 0.35);
        
        const checkUser = await request.query('SELECT id FROM PF_Users WHERE username = @username AND id != @id');
        if (checkUser.recordset.length > 0) return res.status(409).json({ message: 'Deze gebruikersnaam is al in gebruik.' });

        await request.query(`
            UPDATE PF_Users 
            SET username = @username, 
                email = ISNULL(@email, email),
                default_currency = @default_currency, 
                manual_exchange_rate = @manual_exchange_rate,
                allow_fractional_shares = @allow_fractional_shares,
                min_order_amount = @min_order_amount,
                min_order_skip_threshold = @min_order_skip_threshold,
                transaction_fee = @transaction_fee,
                tax_rate_pct = @tax_rate_pct
            WHERE id = @id
        `);
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

    if (!newPassword || String(newPassword).trim().length < 6) {
        return res.status(400).json({ message: 'Nieuw wachtwoord moet minimaal 6 tekens bevatten.' });
    }

    try {
        await ensureRolesTableAndColumns();
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        const userRes = await request.query('SELECT password FROM PF_Users WHERE id = @id');
        if (userRes.recordset.length === 0) return res.status(404).json({ message: 'Gebruiker niet gevonden.' });

        const match = await bcrypt.compare(currentPassword, userRes.recordset[0].password);
        if (!match) return res.status(401).json({ message: 'Huidig wachtwoord is onjuist.' });

        const hashed = await bcrypt.hash(String(newPassword).trim(), 10);
        const updateReq = new sql.Request();
        updateReq.input('id', sql.Int, id);
        updateReq.input('password', sql.NVarChar, hashed);
        await updateReq.query('UPDATE PF_Users SET password = @password, must_change_password = 0 WHERE id = @id');
        
        res.json({ message: 'Wachtwoord succesvol gewijzigd.', must_change_password: false });
    } catch (error) {
        console.error('Fout bij updaten wachtwoord:', error);
        res.status(500).json({ message: 'Fout bij het updaten van het wachtwoord.' });
    }
};

const getAllUsers = async (req, res) => {
    try {
        await ensureRolesTableAndColumns();
        const { byKey } = await fetchRolesMapFromDb();
        const request = new sql.Request();
        const result = await request.query(`
            SELECT u.*,
                   (SELECT COUNT(*) FROM PF_transactions t WHERE t.user_id = u.id) AS tx_count
            FROM PF_Users u
            ORDER BY u.id ASC
        `);
        
        const mappedUsers = [];
        for (const u of result.recordset) {
            const uid = u.id || u.Id || u.ID;
            const resolved = await resolvePermissionsForUserRow(u, byKey);

            mappedUsers.push({
                id: uid,
                username: u.username || u.Username || u.USERNAME,
                email: u.email || u.Email || u.EMAIL,
                role: resolved.role,
                role_name: resolved.role_name,
                strategy_mode: resolved.strategy_mode,
                permissions: resolved.permissions,
                must_change_password: Boolean(u.must_change_password),
                is_active: Number(uid) === 1 ? true : (u.is_active !== false && u.is_active !== 0),
                tx_count: u.tx_count || 0,
                last_login: u.last_login || u.Last_Login || null,
                created_at: u.created_at || null
            });
        }
        
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
        await ensureRolesTableAndColumns();
        const { byKey } = await fetchRolesMapFromDb();
        const chosenRole = byKey.get(role) || byKey.get('starter') || SYSTEM_DEFAULT_ROLES[0];
        const perms = chosenRole.permissions;
        const derivedMode = chosenRole.role_key === 'admin'
            ? 'full_access'
            : ((perms.canUseStockStrategy || perms.canUseEtfStrategy || perms.canViewDashboard) ? 'arne_advies' : 'portfolio_only');

        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('role', sql.NVarChar, chosenRole.role_key);
        request.input('mode', sql.NVarChar, derivedMode);
        request.input('perms', sql.NVarChar(sql.MAX), JSON.stringify(perms));
        await request.query('UPDATE PF_Users SET role = @role, strategy_mode = @mode, permissions = @perms WHERE id = @id');
        
        res.json({ message: `Gebruikersrol bijgewerkt naar "${chosenRole.role_name}".` });
    } catch (error) {
        console.error('Fout bij updaten rol:', error);
        res.status(500).json({ message: 'Serverfout bij updaten rol.' });
    }
};

// Toegangsbeheer voor User 1 (Admin): pas rol, actief-status, e-mail of wachtwoord van een gebruiker aan (rechten komen algemeen uit de rol!)
const updateUserAccess = async (req, res) => {
    const id = Number(req.params.id);
    const { role, is_active, newPassword, email } = req.body;

    if (id === 1) {
        return res.status(400).json({ message: 'Gebruiker 1 (ArneVR) heeft als ontwikkelaar altijd volledige toegang.' });
    }

    try {
        await ensureRolesTableAndColumns();
        const { byKey } = await fetchRolesMapFromDb();

        const curReq = new sql.Request();
        curReq.input('id', sql.Int, id);
        const curRes = await curReq.query('SELECT * FROM PF_Users WHERE id = @id');
        if (curRes.recordset.length === 0) {
            return res.status(404).json({ message: 'Gebruiker niet gevonden.' });
        }
        const current = curRes.recordset[0];

        const nextRoleKey = role || current.role || 'starter';
        const chosenRole = byKey.get(nextRoleKey) || byKey.get('starter') || SYSTEM_DEFAULT_ROLES[0];
        const resolvedPermissions = chosenRole.permissions;
        const nextMode = chosenRole.role_key === 'admin'
            ? 'full_access'
            : ((resolvedPermissions.canUseStockStrategy || resolvedPermissions.canUseEtfStrategy || resolvedPermissions.canViewDashboard) ? 'arne_advies' : 'portfolio_only');
        const nextActive = typeof is_active === 'boolean' ? is_active : (current.is_active !== false);

        const updateReq = new sql.Request();
        updateReq.input('id', sql.Int, id);
        updateReq.input('role', sql.NVarChar, chosenRole.role_key);
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
            query += `, password = @password, must_change_password = 1`;
        }

        query += ` WHERE id = @id`;
        await updateReq.query(query);

        res.json({
            message: 'Gebruikersrol en instellingen succesvol opgeslagen.',
            user: {
                id,
                role: chosenRole.role_key,
                role_name: chosenRole.role_name,
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

// --- ROLLEN BEHEER ENDPOINTS (algemene rechten per rol) ---
const getRoles = async (req, res) => {
    try {
        const { roles } = await fetchRolesMapFromDb();
        // Tel ook hoeveel gebruikers elke rol hebben
        const countRes = await new sql.Request().query(`
            SELECT role, COUNT(*) as user_count FROM PF_Users GROUP BY role
        `);
        const countMap = {};
        (countRes.recordset || []).forEach(r => {
            countMap[r.role] = Number(r.user_count || 0);
        });
        const enriched = roles.map(r => ({
            ...r,
            user_count: countMap[r.role_key] || 0
        }));
        res.json(enriched);
    } catch (error) {
        console.error('Fout bij ophalen rollen:', error);
        res.status(500).json({ message: 'Serverfout bij ophalen rollen.' });
    }
};

const createRole = async (req, res) => {
    const { role_name, description = '', permissions = {} } = req.body;
    if (!role_name || !String(role_name).trim()) {
        return res.status(400).json({ message: 'Geef een naam op voor de nieuwe rol.' });
    }

    const cleanName = String(role_name).trim();
    const rawKey = req.body.role_key
        ? String(req.body.role_key).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_')
        : cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const roleKey = rawKey || `rol_${Date.now()}`;

    try {
        await ensureRolesTableAndColumns();
        const checkReq = new sql.Request();
        checkReq.input('key', sql.NVarChar, roleKey);
        const existing = await checkReq.query('SELECT role_id FROM PF_Roles WHERE role_key = @key');
        if (existing.recordset.length > 0) {
            return res.status(409).json({ message: 'Er bestaat al een rol met deze sleutel/naam.' });
        }

        const safePerms = {
            ...SYSTEM_DEFAULT_ROLES[0].permissions,
            ...(permissions || {})
        };

        const insReq = new sql.Request();
        insReq.input('key', sql.NVarChar, roleKey);
        insReq.input('name', sql.NVarChar, cleanName);
        insReq.input('desc', sql.NVarChar, String(description || '').trim());
        insReq.input('perms', sql.NVarChar(sql.MAX), JSON.stringify(safePerms));

        await insReq.query(`
            INSERT INTO PF_Roles (role_key, role_name, description, permissions_json, is_system)
            VALUES (@key, @name, @desc, @perms, 0)
        `);

        const { roles } = await fetchRolesMapFromDb();
        res.status(201).json({
            message: `Nieuwe rol "${cleanName}" succesvol aangemaakt!`,
            roles
        });
    } catch (error) {
        console.error('Fout bij aanmaken rol:', error);
        res.status(500).json({ message: 'Serverfout bij aanmaken rol.' });
    }
};

const updateRole = async (req, res) => {
    const { roleKey } = req.params;
    const { role_name, description, permissions } = req.body;

    if (roleKey === 'admin') {
        return res.status(400).json({ message: 'De Beheerder (admin) rol heeft altijd volledige toegang en kan niet worden beperkt.' });
    }

    try {
        await ensureRolesTableAndColumns();
        const checkReq = new sql.Request();
        checkReq.input('key', sql.NVarChar, roleKey);
        const curRes = await checkReq.query('SELECT * FROM PF_Roles WHERE role_key = @key');
        if (curRes.recordset.length === 0) {
            return res.status(404).json({ message: 'Rol niet gevonden.' });
        }
        const cur = curRes.recordset[0];
        let curPerms = {};
        try { curPerms = JSON.parse(cur.permissions_json); } catch (e) {}

        const nextPerms = {
            ...SYSTEM_DEFAULT_ROLES[0].permissions,
            ...curPerms,
            ...(permissions || {})
        };
        const nextName = role_name ? String(role_name).trim() : cur.role_name;
        const nextDesc = description !== undefined ? String(description).trim() : cur.description;

        const updReq = new sql.Request();
        updReq.input('key', sql.NVarChar, roleKey);
        updReq.input('name', sql.NVarChar, nextName);
        updReq.input('desc', sql.NVarChar, nextDesc);
        updReq.input('perms', sql.NVarChar(sql.MAX), JSON.stringify(nextPerms));

        await updReq.query(`
            UPDATE PF_Roles
            SET role_name = @name,
                description = @desc,
                permissions_json = @perms,
                updated_at = GETDATE()
            WHERE role_key = @key
        `);

        // Werk direct alle gebruikers met deze rol bij zodat iedereen met deze rol exact dezelfde rechten heeft
        const derivedMode = (nextPerms.canUseStockStrategy || nextPerms.canUseEtfStrategy || nextPerms.canViewDashboard) ? 'arne_advies' : 'portfolio_only';
        const syncUsersReq = new sql.Request();
        syncUsersReq.input('role', sql.NVarChar, roleKey);
        syncUsersReq.input('mode', sql.NVarChar, derivedMode);
        syncUsersReq.input('perms', sql.NVarChar(sql.MAX), JSON.stringify(nextPerms));
        await syncUsersReq.query(`
            UPDATE PF_Users
            SET strategy_mode = @mode,
                permissions = @perms
            WHERE role = @role AND id != 1
        `);

        const { roles } = await fetchRolesMapFromDb();
        res.json({
            message: `Rechten voor rol "${nextName}" opgeslagen en toegepast op alle gekoppelde gebruikers!`,
            roles
        });
    } catch (error) {
        console.error('Fout bij bijwerken rol:', error);
        res.status(500).json({ message: 'Serverfout bij bijwerken rol.' });
    }
};

const deleteRole = async (req, res) => {
    const { roleKey } = req.params;
    if (['admin', 'starter', 'pro', 'demo'].includes(roleKey)) {
        return res.status(400).json({ message: 'Standaard systeemrollen kunnen niet worden verwijderd (je kunt wel hun rechten aanpassen).' });
    }

    try {
        await ensureRolesTableAndColumns();
        // Zet eventuele gebruikers met deze rol veilig terug naar 'starter'
        const { byKey } = await fetchRolesMapFromDb();
        const starterRole = byKey.get('starter') || SYSTEM_DEFAULT_ROLES[0];

        const reassignReq = new sql.Request();
        reassignReq.input('oldRole', sql.NVarChar, roleKey);
        reassignReq.input('perms', sql.NVarChar(sql.MAX), JSON.stringify(starterRole.permissions));
        await reassignReq.query(`
            UPDATE PF_Users
            SET role = 'starter',
                strategy_mode = 'portfolio_only',
                permissions = @perms
            WHERE role = @oldRole AND id != 1
        `);

        const delReq = new sql.Request();
        delReq.input('key', sql.NVarChar, roleKey);
        await delReq.query('DELETE FROM PF_Roles WHERE role_key = @key AND is_system = 0');

        const { roles } = await fetchRolesMapFromDb();
        res.json({
            message: 'Rol verwijderd (gekoppelde gebruikers zijn overgezet naar Nieuwe Belegger).',
            roles
        });
    } catch (error) {
        console.error('Fout bij verwijderen rol:', error);
        res.status(500).json({ message: 'Serverfout bij verwijderen rol.' });
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

        const resolved = await resolvePermissionsForUserRow(user);
        const role = resolved.role;
        const strategyMode = resolved.strategy_mode;
        const permissions = resolved.permissions;
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
            role_name: resolved.role_name,
            strategy_mode: strategyMode,
            permissions,
            must_change_password: Boolean(user.must_change_password),
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
    getRoles,
    createRole,
    updateRole,
    deleteRole,
    logout,
    loginProvider,
    linkGoogle,
    linkMicrosoft,
    unlinkProvider,
    updatePreference,
    updateMyStrategyMode
};

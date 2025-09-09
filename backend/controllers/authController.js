// controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sql } = require('../config/database');

const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const request = new sql.Request();
    request.input('username', sql.NVarChar, username);
    const result = await request.query('SELECT * FROM Users WHERE username = @username');

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Gebruiker niet gevonden' });
    }

    const user = result.recordset[0];
    const wachtwoordMatch = await bcrypt.compare(password, user.password);
    const userID = user.id;
    const role = user.Roles; // Haal de rol van de gebruiker op

    if (!wachtwoordMatch) {
      return res.status(401).json({ message: 'Ongeldig wachtwoord' });
    }

    const token = jwt.sign({ username }, 'geheime_sleutel', { expiresIn: '1h' });
    res.json({ token, username, userID, role }); // Stuur de gebruikersnaam, gebruikersID en rol terug naar de frontend
  } catch (error) {
    console.error('Fout bij inloggen:', error);
    res.status(500).json({ message: 'Serverfout bij inloggen' });
  }
};

module.exports = { login };
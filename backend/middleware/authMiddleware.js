const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  // Lees het token direct en veilig uit de cookies in plaats van de onveilige headers
  const token = req.cookies.token;

  if (!token) {
    return res.status(403).json({ message: 'Geen token voorzien. Toegang geweigerd.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Sla user info op voor in je controllers
    next(); // Gegevens kloppen! Ga door naar de daadwerkelijke route.
  } catch (err) {
    return res.status(401).json({ message: 'Ongeldige of verlopen token. Log opnieuw in.' });
  }
};

module.exports = verifyToken;
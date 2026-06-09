// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectToDatabase } = require('./config/database');
const secRoutes = require('./routes/secRoutes');
const watchlistRoutes = require('./routes/watchlistRoutes'); // alle pagina's voor watchlists en ideale portfolio
const availableBalanceRoutes = require('./routes/availableBalanceRoutes');
const idealPortfolioRoutes = require('./routes/idealPortfolioRoutes');
const fundamentalDataRoutes = require('./routes/fundamentalDataRoutes'); // NIEUW
const secImportRoutes = require('./routes/secImportRoutes');
const calculationRoutes = require('./routes/calculationRoutes');
const alertsRoutes = require('./routes/alertsRoutes');
const secFieldRoutes = require('./routes/secFieldRoutes');
const portfolioRoutes = require('./routes/portfolioRoutes');
const brokerRoutes = require('./routes/brokerRoutes');
const stockExchangeRoutes = require('./routes/stockExchangeRoutes');
const authRoutes = require('./routes/authRoutes');
const verifyToken = require('./middleware/authMiddleware');

const app = express();
app.use(express.json());
app.use(cors());

// Verbind met de database
connectToDatabase().catch(err => {
  console.error('Kon niet verbinden met de database:', err);
  process.exit(1); // Sluit de server af als de databaseverbinding mislukt
});

// Gebruik de routes
app.use('/api/auth', authRoutes); // Auth is publiek toegankelijk

// Beveilig alle andere routes met verifyToken
app.use('/api', verifyToken, secRoutes);
app.use('/api/watchlist', verifyToken, watchlistRoutes); 
app.use('/api/balance/available', verifyToken, availableBalanceRoutes); 
app.use('/api/ideal-portfolio', verifyToken, idealPortfolioRoutes); 
app.use('/api/fundamental-data', verifyToken, fundamentalDataRoutes);
app.use('/api/sec', verifyToken, secImportRoutes);
app.use('/api/calculations', verifyToken, calculationRoutes);
app.use('/api/alerts', verifyToken, alertsRoutes);
app.use('/api/sec-fields', verifyToken, secFieldRoutes);
app.use('/api/portfolio', verifyToken, portfolioRoutes);
app.use('/api/brokers', verifyToken, brokerRoutes);
app.use('/api/stockexchange', verifyToken, stockExchangeRoutes);


// Algemene foutafhandeling
app.use((err, req, res, next) => {
  console.error('Serverfout:', err);
  res.status(500).json({ message: 'Er is een serverfout opgetreden' });
});

// Sluit de database pool af wanneer de applicatie stopt
process.on('SIGINT', async () => {
    console.log('SIGINT signaal ontvangen, sluiten database pool...');
    await closePool();
    process.exit(0);
});

// Start de server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server luistert op poort ${port}`);
});
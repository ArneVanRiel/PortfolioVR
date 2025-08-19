// routes/idealPortfolioRoutes.js
const express = require('express');
const router = express.Router();
const idealPortfolioController = require('../controllers/idealPortfolioController'); // Importeer de controller

// Route om ideale portfolio instellingen op te halen
// Voorbeeld: GET /api/ideal-portfolio/settings
router.get('/settings', idealPortfolioController.getIdealPortfolioSettings);

// Route om ideale portfolio instellingen bij te werken
// Voorbeeld: POST /api/ideal-portfolio/settings
router.post('/settings', idealPortfolioController.updateIdealPortfolioSettings);

module.exports = router;

// routes/availableBalanceRoutes.js
const express = require('express');
const router = express.Router();
const availableBalanceController = require('../controllers/availableBalanceController');

// Route om alle beschikbare saldo types op te halen
router.get('/balance-types', availableBalanceController.getBalanceTypes);

// Route om de meest recente beschikbare vermogensdata op te halen
router.get('/latest-balance', availableBalanceController.getLatestAvailableBalance);

// Route om een nieuwe set van beschikbare vermogensdata toe te voegen of bij te werken
router.post('/update-balance', availableBalanceController.addOrUpdateAvailableBalance);

module.exports = router;
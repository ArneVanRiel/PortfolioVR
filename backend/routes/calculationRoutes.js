const express = require('express');
const router = express.Router();
const calculationController = require('../controllers/calculationController');

// Route to trigger a calculation for a specific stock
router.post('/:stockId', calculationController.runCalculationForStock);

module.exports = router;

const express = require('express');
const router = express.Router();
const calculationController = require('../controllers/calculationController');

// Route to get the latest calculations summary for all stocks
router.get('/latest-summary', calculationController.getLatestCalculationsSummary);

// Route to get existing calculations for a specific stock
router.get('/:stockId', calculationController.getCalculationsForStock);

// Route to trigger a calculation for a specific stock
router.post('/:stockId', calculationController.runCalculationForStock);

// Route to get fundamental data for a specific calculation
router.get('/:calculationId/fundamental-data', calculationController.getFundamentalDataForCalculation);

module.exports = router;

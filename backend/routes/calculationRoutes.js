const express = require('express');
const router = express.Router();
const calculationController = require('../controllers/calculationController');

// Route to get the latest calculations summary for all stocks
router.get('/latest-summary', calculationController.getLatestCalculationsSummary);

// Route to get calculations summary by date
router.get('/summary-by-date', calculationController.getSummaryByDate);

// Route to get existing calculations for a specific stock
router.get('/:stockId', calculationController.getCalculationsForStock);

// Route to get detailed calculation steps (re-runs calculation in memory)
router.get('/:stockId/details', calculationController.getCalculationDetails);

// Route to trigger a calculation for a specific stock
router.post('/:stockId', calculationController.runCalculationForStock);

// Route to get price history for chart
router.get('/:stockId/price-history', calculationController.getPriceHistory);

// Route to get MACD history for chart
router.get('/:stockId/macd-history', calculationController.getMACDHistory);

// Route to get MACD alerts for chart
router.get('/:stockId/macd-alerts', calculationController.getMACDAlerts);

// Route to get fundamental data for a specific calculation
router.get('/:calculationId/fundamental-data', calculationController.getFundamentalDataForCalculation);


// Route to delete a calculation
router.delete('/:id', calculationController.deleteCalculation);

module.exports = router;

// routes/portfolioRoutes.js
const express = require('express');
const router = express.Router();
const { // Renamed calculatePortfolioValues to recalculateAndStorePortfolioHistory
  recalculateAndStorePortfolioHistory,
  getPortfolioValues,
  checkAndRepairPriceData,
  calculateReturns,
  getPortfolioReturns,
  getCurrentPortfolioHoldings,
  getTransactions,
  addTransaction,
  updateTransaction,
  addMultipleTransactions,
  deleteTransaction,
  getPortfolioReturnsDynamics,
  forceUpdateExchangeRates,
  applyStockSplit
} = require('../controllers/portfolioController');

router.post('/recalculateAndStorePortfolioHistory', recalculateAndStorePortfolioHistory); // New route for recalculation
router.post('/checkAndRepairPriceData', checkAndRepairPriceData);
router.get('/calculatePortfolioValues', getPortfolioValues);
router.get('/calculateReturns', calculateReturns);
router.get('/portfolioReturns', getPortfolioReturns);
router.get('/holdings', getCurrentPortfolioHoldings);
router.get('/transactions', getTransactions);
router.get('/returns-dynamics', getPortfolioReturnsDynamics);
router.post('/addTransaction', addTransaction);
router.put('/transactions/:id', updateTransaction);
router.post('/addMultipleTransactions', addMultipleTransactions);
router.delete('/transactions/:id', deleteTransaction);
router.post('/force-update-exchange-rates', forceUpdateExchangeRates);
router.post('/apply-stock-split', applyStockSplit);

module.exports = router;
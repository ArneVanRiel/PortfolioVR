// routes/portfolioRoutes.js
const express = require('express');
const router = express.Router();
const {
  calculatePortfolioValues,
  getPortfolioValues,
  calculateReturns,
  getPortfolioReturns,
} = require('../controllers/portfolioController');

router.post('/calculatePortfolioValues', calculatePortfolioValues);
router.get('/calculatePortfolioValues', getPortfolioValues);
router.get('/calculateReturns', calculateReturns);
router.get('/portfolioReturns', getPortfolioReturns);

module.exports = router;
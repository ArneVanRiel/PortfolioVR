// backend/routes/backtestRoutes.js
const express = require('express');
const router = express.Router();
const { 
  runBacktest, 
  runDynamicScore5PortfolioBacktest, 
  runPortfolioBacktest 
} = require('../controllers/backtestController');

router.post('/single', runBacktest);
router.post('/dynamic-score5', runDynamicScore5PortfolioBacktest);
router.post('/portfolio', runPortfolioBacktest);

module.exports = router;

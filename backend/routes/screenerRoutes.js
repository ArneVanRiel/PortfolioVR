// backend/routes/screenerRoutes.js
const express = require('express');
const router = express.Router();
const { 
  fastScreenTickers, 
  getPresetTickers, 
  getAllAvailableStocks, 
  getCachedScreenerResults, 
  importAndAddToWatchlist,
  importAllScore5Stocks,
  getTickerHistoricalCalculations,
  recalculateAllDbHistory
} = require('../controllers/screenerController');

router.post('/fast-screen', fastScreenTickers);
router.get('/presets', getPresetTickers);
router.get('/all-stocks', getAllAvailableStocks);
router.get('/cached-results', getCachedScreenerResults);
router.post('/import-and-add-watchlist', importAndAddToWatchlist);
router.post('/import-all-score5', importAllScore5Stocks);
router.get('/history/:ticker', getTickerHistoricalCalculations);
router.post('/recalculate-all-history', recalculateAllDbHistory);

module.exports = router;


// routes/watchlistRoutes.js
const express = require('express');
const router = express.Router();
const watchlistController = require('../controllers/watchlistController'); // Importeer de controller

// Route om aandelen op te halen voor watchlist of ideale portfolio
// Voorbeeld: GET /api/watchlist/watchlist?view=watchlist
router.get('/watchlist', watchlistController.getStocksByView);

// Route om de dagelijkse update status te controleren
// Voorbeeld: GET /api/watchlist/update-status
router.get('/update-status', watchlistController.getDailyUpdateStatus);

// Route om een stock toe te voegen aan de watchlist of ideale portfolio
// Voorbeeld: POST /api/watchlist/add-stock
router.post('/add-stock', watchlistController.addStockToPortfolio);

// Route om een stock te verwijderen uit de watchlist of ideale portfolio
// Gebruik DELETE method met ID in de URL, viewType in body
// Voorbeeld: DELETE /api/watchlist/remove-stock/2 (met body { "viewType": "watchlist" })
router.delete('/remove-stock/:aandeel_id', watchlistController.removeStockFromPortfolio);

// Route om prijzen bij te werken, MACD te berekenen en meldingen te genereren
// Voorbeeld: POST /api/watchlist/update-data
router.post('/update-data', (req, res) => watchlistController.updateAndProcessStocks(req, res, false));

// Route om alle beschikbare stocks op te halen
// Voorbeeld: GET /api/watchlist/available-stocks
router.get('/available-stocks', watchlistController.getAvailableStocks);

// NIEUW: Route om alle beschikbare asset types op te halen
// Voorbeeld: GET /api/watchlist/asset-types
router.get('/asset-types', watchlistController.getAssetTypes);

// Route om alle beschikbare stock exchanges op te halen
// Voorbeeld: GET /api/watchlist/stock-exchanges
router.get('/stock-exchanges', watchlistController.getStockExchanges);

module.exports = router;

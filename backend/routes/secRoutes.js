// routes/secRoutes.js
const express = require('express');
const router = express.Router();
const { getAllStocks, createStock, updateStock, deleteStock, searchGlobalTickers, ensureStockFromGlobal } = require('../controllers/secController');

router.get('/stocks', getAllStocks);
router.get('/stocks/search-global', searchGlobalTickers);
router.post('/stocks/ensure', ensureStockFromGlobal);
router.post('/stocks', createStock);
router.put('/stocks/:id', updateStock);
router.delete('/stocks/:id', deleteStock);

module.exports = router;
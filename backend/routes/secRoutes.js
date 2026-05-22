// routes/secRoutes.js
const express = require('express');
const router = express.Router();
const { getSecData, fetchMissingData, addMissingData, getAllStocks, createStock, updateStock, deleteStock } = require('../controllers/secController');

router.get('/getSecData/:ticker', getSecData);
router.post('/fetch-missing-data', fetchMissingData);
router.post('/add-missing-data', addMissingData);
router.get('/stocks', getAllStocks);
router.post('/stocks', createStock);
router.put('/stocks/:id', updateStock);
router.delete('/stocks/:id', deleteStock);

module.exports = router;
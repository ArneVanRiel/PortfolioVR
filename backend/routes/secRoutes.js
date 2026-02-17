// routes/secRoutes.js
const express = require('express');
const router = express.Router();
const { getSecData, fetchMissingData, addMissingData, getAllStocks, createStock } = require('../controllers/secController');

router.get('/getSecData/:ticker', getSecData);
router.post('/fetch-missing-data', fetchMissingData);
router.post('/add-missing-data', addMissingData);
router.get('/stocks', getAllStocks);
router.post('/stocks', createStock);

module.exports = router;
// routes/secRoutes.js
const express = require('express');
const router = express.Router();
const { getAllStocks, createStock, updateStock, deleteStock } = require('../controllers/secController');

router.get('/stocks', getAllStocks);
router.post('/stocks', createStock);
router.put('/stocks/:id', updateStock);
router.delete('/stocks/:id', deleteStock);

module.exports = router;
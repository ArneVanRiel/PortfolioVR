const express = require('express');
const router = express.Router();
const stockExchangeController = require('../controllers/stockExchangeController');

router.get('/', stockExchangeController.getAllStockExchanges);
router.post('/', stockExchangeController.createStockExchange);
router.put('/:id', stockExchangeController.updateStockExchange);
router.delete('/:id', stockExchangeController.deleteStockExchange);

module.exports = router;
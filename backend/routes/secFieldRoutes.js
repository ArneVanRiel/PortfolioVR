const express = require('express');
const router = express.Router();
const secFieldController = require('../controllers/secFieldController');

// GET /api/sec-fields/:ticker
router.get('/:ticker', secFieldController.getSecFields);

module.exports = router;
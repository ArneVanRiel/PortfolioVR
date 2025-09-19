// backend/routes/secImportRoutes.js
const express = require('express');
const router = express.Router();
const secImportController = require('../controllers/secImportController');

router.post('/import', secImportController.importSecData);

module.exports = router;

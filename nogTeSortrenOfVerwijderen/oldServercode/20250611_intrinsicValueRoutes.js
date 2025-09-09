// routes/intrinsicValueRoutes.js
const express = require('express');
const router = express.Router();
const { calculateIntrinsicValueRoute } = require('../controllers/intrinsicValueController');

router.post('/calculate-intrinsic-value', calculateIntrinsicValueRoute);

module.exports = router;
// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { loginStep1, loginStep2, register, getProfile, updateProfile, updatePassword } = require('../controllers/authController');

router.post('/login-step1', loginStep1);
router.post('/login-step2', loginStep2);
router.post('/register', register);

router.get('/profile/:id', getProfile);
router.put('/profile/:id', updateProfile);
router.put('/password/:id', updatePassword);

module.exports = router;

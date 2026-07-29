// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { 
    loginStep1, 
    loginStep2, 
    register, 
    getProfile, 
    updateProfile, 
    updatePassword, 
    getAllUsers, 
    updateUserRole, 
    logout,
    loginProvider,
    linkGoogle,
    linkMicrosoft,
    unlinkProvider,
    updatePreference
} = require('../controllers/authController');
const verifyToken = require('../middleware/authMiddleware');

router.post('/login-step1', loginStep1);
router.post('/login-step2', loginStep2);
router.post('/register', register);
router.post('/logout', logout);

// Provider inloggen (publiek)
router.post('/provider/login', loginProvider);

// Beveiligde koppeling endpoints
router.post('/google/link', verifyToken, linkGoogle);
router.post('/microsoft/link', verifyToken, linkMicrosoft);
router.delete('/provider/:provider', verifyToken, unlinkProvider);
router.put('/preference', verifyToken, updatePreference);

router.get('/profile/:id', getProfile);
router.put('/profile/:id', updateProfile);
router.put('/password/:id', updatePassword);

router.get('/users', getAllUsers);
router.put('/users/:id/role', updateUserRole);

module.exports = router;

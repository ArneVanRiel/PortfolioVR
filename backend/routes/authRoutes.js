// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { 
    loginStep1, 
    loginStep2, 
    getMe,
    register, 
    getProfile, 
    updateProfile, 
    updatePassword, 
    getAllUsers, 
    updateUserRole, 
    updateUserAccess,
    deleteUser,
    logout,
    loginProvider,
    linkGoogle,
    linkMicrosoft,
    unlinkProvider,
    updatePreference,
    updateMyStrategyMode
} = require('../controllers/authController');
const verifyToken = require('../middleware/authMiddleware');
const { requireAdmin, blockDemoWrites } = verifyToken;

// Publieke inlog-endpoints (enkel voor bestaande, door Admin aangemaakte accounts)
router.post('/login-step1', loginStep1);
router.post('/login-step2', loginStep2);
router.post('/logout', logout);
router.post('/provider/login', loginProvider);

// Actuele sessie & rechten van ingelogde gebruiker
router.get('/me', verifyToken, getMe);
router.put('/mode', verifyToken, blockDemoWrites, updateMyStrategyMode);

// Beveiligde koppeling endpoints (eigen profiel)
router.post('/google/link', verifyToken, blockDemoWrites, linkGoogle);
router.post('/microsoft/link', verifyToken, blockDemoWrites, linkMicrosoft);
router.delete('/provider/:provider', verifyToken, blockDemoWrites, unlinkProvider);
router.put('/preference', verifyToken, blockDemoWrites, updatePreference);

// Profiel endpoints (beveiligd met verifyToken; controller dwingt eigen userID af tenzij Admin)
router.get('/profile/:id', verifyToken, getProfile);
router.put('/profile/:id', verifyToken, blockDemoWrites, updateProfile);
router.put('/password/:id', verifyToken, blockDemoWrites, updatePassword);

// Admin-only endpoints (enkel User 1 / Arne mag accounts aanmaken, bekijken, wijzigen of verwijderen)
router.post('/register', verifyToken, requireAdmin, register);
router.get('/users', verifyToken, requireAdmin, getAllUsers);
router.put('/users/:id/role', verifyToken, requireAdmin, updateUserRole);
router.put('/users/:id/access', verifyToken, requireAdmin, updateUserAccess);
router.delete('/users/:id', verifyToken, requireAdmin, deleteUser);

module.exports = router;

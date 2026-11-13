const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const {
  getAllStrategies,
  getStrategyById,
  createStrategy,
  updateStrategy,
  deleteStrategy,
  activateStrategyForUser
} = require('../controllers/strategyController');

// Alle routes vereisen authenticatie
router.get('/', verifyToken, getAllStrategies);
router.get('/:id', verifyToken, getStrategyById);
router.post('/', verifyToken, createStrategy);
router.put('/:id', verifyToken, updateStrategy);
router.delete('/:id', verifyToken, deleteStrategy);
router.post('/:id/activate', verifyToken, activateStrategyForUser);

module.exports = router;

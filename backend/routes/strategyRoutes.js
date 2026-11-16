const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const {
  getAllStrategies,
  getStrategyById,
  createStrategy,
  updateStrategy,
  deleteStrategy,
  activateStrategyForUser,
  getUserStrategyConfigAndHistory,
  updateUserStrategyPreferences,
  addOrUpdateActiveStrategy,
  changeActiveStrategyPriority,
  removeActiveStrategyForUser
} = require('../controllers/strategyController');

// Alle routes vereisen authenticatie
router.get('/', verifyToken, getAllStrategies);
router.get('/my-config', verifyToken, getUserStrategyConfigAndHistory);
router.put('/my-config', verifyToken, updateUserStrategyPreferences);
router.post('/my-active', verifyToken, addOrUpdateActiveStrategy);
router.put('/my-active/:entryId/priority', verifyToken, changeActiveStrategyPriority);
router.delete('/my-active/:entryId', verifyToken, removeActiveStrategyForUser);
router.get('/:id', verifyToken, getStrategyById);
router.post('/', verifyToken, createStrategy);
router.put('/:id', verifyToken, updateStrategy);
router.delete('/:id', verifyToken, deleteStrategy);
router.post('/:id/activate', verifyToken, activateStrategyForUser);

module.exports = router;

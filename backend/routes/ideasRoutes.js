// routes/ideasRoutes.js
const express = require('express');
const router = express.Router();
const {
    getIdeas,
    createIdea,
    toggleLike,
    updateIdeaStatus,
    updateIdea,
    deleteIdea
} = require('../controllers/ideasController');
const verifyToken = require('../middleware/authMiddleware');
const { blockDemoWrites } = verifyToken;

router.get('/', getIdeas);
router.post('/', blockDemoWrites, createIdea);
router.post('/:id/like', blockDemoWrites, toggleLike);
router.put('/:id/status', blockDemoWrites, updateIdeaStatus);
router.put('/:id', blockDemoWrites, updateIdea);
router.patch('/:id', blockDemoWrites, updateIdea);
router.delete('/:id', blockDemoWrites, deleteIdea);

module.exports = router;

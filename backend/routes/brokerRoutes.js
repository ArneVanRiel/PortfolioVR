const express = require('express');
const router = express.Router();
const brokerController = require('../controllers/brokerController');

router.get('/', brokerController.getAllBrokers);
router.post('/', brokerController.createBroker);
router.put('/:id', brokerController.updateBroker);
router.delete('/:id', brokerController.deleteBroker);

module.exports = router;
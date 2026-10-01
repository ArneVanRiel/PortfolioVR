const express = require('express');
const router = express.Router();
const brokerController = require('../controllers/brokerController');

router.get('/', brokerController.getAllBrokers);
router.post('/', brokerController.createBroker);
router.put('/:id', brokerController.updateBroker);
router.delete('/:id', brokerController.deleteBroker);

// Credentials & Sync
router.get('/credentials', brokerController.getBrokerSettings);
router.post('/credentials', brokerController.saveBrokerSettings);
router.delete('/credentials/:brokerName', brokerController.disconnectBroker);
router.post('/sync-etoro', brokerController.syncEtoroData);
router.get('/ledger-metadata', brokerController.getLedgerMetadata);

module.exports = router;
const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// WhatsApp Cloud API verification
router.get('/', webhookController.verify);

// Incoming messages
router.post('/', webhookController.handleIncoming);

module.exports = router;
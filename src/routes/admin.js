// src/routes/admin.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// GET /admin/stats
router.get('/stats', adminController.getStats);

// GET /admin/users
router.get('/users', adminController.getUsers);

module.exports = router;
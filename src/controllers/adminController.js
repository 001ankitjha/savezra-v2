// src/controllers/adminController.js
const User = require('../models/User');              // NOTE: capital U
const Transaction = require('../models/Transaction'); // NOTE: capital T
const logger = require('../utils/logger');

/**
 * GET /admin/stats
 * Summary numbers: total users, total transactions, active last 7 days
 */
async function getStats(req, res) {
  try {
    const totalUsers = await User.countDocuments();
    const totalTransactions = await Transaction.countDocuments();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeLast7Days = await User.countDocuments({
      lastActiveDate: { $gte: sevenDaysAgo },
    });

    return res.json({
      totalUsers,
      totalTransactions,
      activeLast7Days,
    });
  } catch (err) {
    logger.error('Error in getStats', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /admin/users
 * List of users with WhatsApp number, name, and activity info
 *
 * Optional query:
 *   ?limit=100   (default 100)
 */
async function getUsers(req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;

    const totalUsers = await User.countDocuments();

    const users = await User.find(
      {},
      'whatsappId name lastActiveDate lastTransactionAt streak createdAt'
    )
      .sort({ createdAt: -1 }) // newest first
      .limit(limit)
      .lean();

    return res.json({
      totalUsers,
      returned: users.length,
      users,
    });
  } catch (err) {
    logger.error('Error in getUsers', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getStats,
  getUsers,
};
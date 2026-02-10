// src/services/userService.js
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Find or create a user by their WhatsApp phone number ID.
 *
 * Important: we always set userId for new users, and backfill it
 * for old users if missing. This keeps Mongo's unique index on userId happy.
 */
async function findOrCreateUser(whatsappId, profileName) {
  try {
    let user = await User.findOne({ whatsappId });

    if (!user) {
      // NEW USER: set both whatsappId and userId
      user = new User({
        whatsappId,
        userId: whatsappId, // <-- critical line
        name: profileName || null,
      });
      await user.save();
      logger.info('New user created', { whatsappId });
    } else {
      // EXISTING USER: backfill userId if missing, and name if needed
      let changed = false;

      if (!user.userId) {
        user.userId = user.whatsappId;
        changed = true;
      }

      if (profileName && !user.name) {
        user.name = profileName;
        changed = true;
      }

      if (changed) {
        await user.save();
      }
    }

    return user;
  } catch (error) {
    logger.error('Error in findOrCreateUser', {
      whatsappId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Update monthly salary.
 */
async function updateSalary(user, amount) {
  user.monthlySalary = amount;
  await user.save();
  logger.info('Salary updated', { whatsappId: user.whatsappId, amount });
  return user;
}

module.exports = {
  findOrCreateUser,
  updateSalary,
};
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Find or create a user by their WhatsApp phone number ID.
 */
async function findOrCreateUser(whatsappId, profileName) {
  try {
    let user = await User.findOne({ whatsappId });

    if (!user) {
      user = new User({
        whatsappId,
        name: profileName || null,
      });
      await user.save();
      logger.info('New user created', { whatsappId });
    } else if (profileName && !user.name) {
      user.name = profileName;
      await user.save();
    }

    return user;
  } catch (error) {
    logger.error('Error in findOrCreateUser', { whatsappId, error: error.message });
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
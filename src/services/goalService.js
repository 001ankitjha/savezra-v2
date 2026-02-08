const Goal = require('../models/Goal');
const logger = require('../utils/logger');

/**
 * Log a new goal for a user.
 */
async function logGoal(user, data) {
  try {
    const goal = new Goal({
      userId: user._id,
      whatsappId: user.whatsappId,
      goalName: data.goalName || 'Unnamed Goal',
      goalAmount: data.goalAmount,
      goalTargetDate: data.goalTargetDate ? new Date(data.goalTargetDate) : null,
    });

    await goal.save();

    logger.info('Goal logged', {
      whatsappId: user.whatsappId,
      goalName: data.goalName,
      goalAmount: data.goalAmount,
    });

    return goal;
  } catch (error) {
    logger.error('Error logging goal', { error: error.message });
    throw error;
  }
}

module.exports = {
  logGoal,
};
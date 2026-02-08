const Debt = require('../models/Debt');
const logger = require('../utils/logger');

/**
 * Classify a debt based on interest rate.
 */
function classifyDebt(interestRate) {
  if (interestRate === null || interestRate === undefined) return 'unknown';
  if (interestRate >= 20) return 'toxic';
  if (interestRate >= 10) return 'neutral';
  return 'potentially_good';
}

/**
 * Log a new debt for a user.
 */
async function logDebt(user, data) {
  try {
    const debt = new Debt({
      userId: user._id,
      whatsappId: user.whatsappId,
      lenderName: data.lenderName || 'Unknown',
      totalAmount: data.totalAmount,
      interestRate: data.interestRate || null,
      emiAmount: data.emiAmount || null,
      tenureMonths: data.tenureMonths || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      classification: classifyDebt(data.interestRate),
    });

    await debt.save();

    logger.info('Debt logged', {
      whatsappId: user.whatsappId,
      lenderName: data.lenderName,
      totalAmount: data.totalAmount,
    });

    return debt;
  } catch (error) {
    logger.error('Error logging debt', { error: error.message });
    throw error;
  }
}

module.exports = {
  logDebt,
  classifyDebt,
};
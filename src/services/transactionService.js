const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

/**
 * Log a transaction for a user.
 * This always uses current server time for the `date` field.
 */
async function logTransaction(user, { item, amount, category, type }) {
  try {
    const transaction = new Transaction({
      userId: user._id,
      whatsappId: user.whatsappId,
      item: item || 'Unnamed',
      amount: amount,
      category: category || 'Uncategorized',
      type: type || 'Expense',
      date: new Date(), // current time
    });

    await transaction.save();

    // Update user's lastTransactionAt for quick reference
    user.lastTransactionAt = transaction.date;
    await user.save();

    logger.info('Transaction logged', {
      whatsappId: user.whatsappId,
      item,
      amount,
      category,
      type,
    });

    return transaction;
  } catch (error) {
    logger.error('Error logging transaction', { error: error.message });
    throw error;
  }
}

/**
 * Get monthly summary for a user (current month).
 */
async function getMonthlySummary(whatsappId) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const transactions = await Transaction.find({
    whatsappId,
    date: { $gte: startOfMonth },
  })
    .sort({ date: -1 })
    .lean();

  const expenses = transactions.filter((t) => t.type === 'Expense');
  const income = transactions.filter((t) => t.type === 'Income');

  const totalExpenses = expenses.reduce((s, t) => s + t.amount, 0);
  const totalIncome = income.reduce((s, t) => s + t.amount, 0);

  const categoryBreakdown = {};
  for (const t of expenses) {
    const cat = t.category || 'Uncategorized';
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + t.amount;
  }

  return {
    totalExpenses,
    totalIncome,
    categoryBreakdown,
    transactionCount: transactions.length,
    transactions,
  };
}

module.exports = {
  logTransaction,
  getMonthlySummary,
};
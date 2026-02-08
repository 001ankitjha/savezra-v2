const Transaction = require('../models/Transaction');
const Debt = require('../models/Debt');
const Goal = require('../models/Goal');
const logger = require('./logger');

/**
 * Build the USER CONTEXT block that is injected into the system prompt
 * so the AI has factual data about the user.
 */
async function buildUserContext(user) {
  try {
    const whatsappId = user.whatsappId;

    // --- Current month transactions ---
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlyTransactions = await Transaction.find({
      whatsappId,
      date: { $gte: startOfMonth },
    })
      .sort({ date: -1 })
      .limit(30)
      .lean();

    const totalExpensesThisMonth = monthlyTransactions
      .filter((t) => t.type === 'Expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalIncomeThisMonth = monthlyTransactions
      .filter((t) => t.type === 'Income')
      .reduce((sum, t) => sum + t.amount, 0);

    // Category breakdown
    const categoryBreakdown = {};
    for (const t of monthlyTransactions.filter((t) => t.type === 'Expense')) {
      const cat = t.category || 'Uncategorized';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + t.amount;
    }

    // Recent 10 transactions for display
    const recentTen = monthlyTransactions.slice(0, 10);

    // --- Debts ---
    const debts = await Debt.find({ whatsappId, isActive: true }).lean();

    // --- Goals ---
    const goals = await Goal.find({ whatsappId, isActive: true }).lean();

    // --- Build text block ---
    const lines = ['--- USER CONTEXT (System‑provided, factual) ---'];

    if (user.name) lines.push(`Name: ${user.name}`);
    lines.push(`Preferred Language: ${user.preferredLanguage}`);

    if (user.monthlySalary !== null && user.monthlySalary !== undefined) {
      lines.push(`Monthly Salary: ₹${user.monthlySalary.toLocaleString('en-IN')}`);
    } else {
      lines.push('Monthly Salary: Not set');
    }

    lines.push(`Streak: ${user.streak} day(s)`);
    lines.push(`Expenses This Month: ₹${totalExpensesThisMonth.toLocaleString('en-IN')}`);
    lines.push(`Income Logged This Month: ₹${totalIncomeThisMonth.toLocaleString('en-IN')}`);

    if (Object.keys(categoryBreakdown).length > 0) {
      lines.push('Category Breakdown This Month:');
      for (const [cat, amt] of Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])) {
        lines.push(`  - ${cat}: ₹${amt.toLocaleString('en-IN')}`);
      }
    }

    if (recentTen.length > 0) {
      lines.push('Recent Transactions (latest first):');
      for (const t of recentTen) {
        const d = new Date(t.date).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        });
        lines.push(`  - ${d}: ${t.item} ₹${t.amount.toLocaleString('en-IN')} [${t.category}] (${t.type})`);
      }
    } else {
      lines.push('Recent Transactions: None logged yet.');
    }

    if (debts.length > 0) {
      lines.push('Active Debts:');
      for (const d of debts) {
        let debtLine = `  - ${d.lenderName}: ₹${d.totalAmount.toLocaleString('en-IN')}`;
        if (d.interestRate !== null) debtLine += ` @ ${d.interestRate}%`;
        if (d.emiAmount !== null) debtLine += `, EMI ₹${d.emiAmount.toLocaleString('en-IN')}`;
        if (d.classification !== 'unknown') debtLine += ` [${d.classification}]`;
        lines.push(debtLine);
      }
    } else {
      lines.push('Active Debts: None recorded.');
    }

    if (goals.length > 0) {
      lines.push('Active Goals:');
      for (const g of goals) {
        let goalLine = `  - ${g.goalName}: Target ₹${g.goalAmount.toLocaleString('en-IN')}`;
        if (g.goalTargetDate) {
          goalLine += ` by ${new Date(g.goalTargetDate).toLocaleDateString('en-IN', {
            month: 'short',
            year: 'numeric',
          })}`;
        }
        goalLine += `, Saved so far ₹${g.savedSoFar.toLocaleString('en-IN')}`;
        lines.push(goalLine);
      }
    } else {
      lines.push('Active Goals: None set.');
    }

    lines.push('--- END USER CONTEXT ---');

    return lines.join('\n');
  } catch (error) {
    logger.error('Error building user context', { error: error.message });
    return '--- USER CONTEXT ---\nError loading context.\n--- END USER CONTEXT ---';
  }
}

module.exports = { buildUserContext };
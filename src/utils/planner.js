const Transaction = require('../models/Transaction');

/**
 * Parse an amount from free text (e.g. "impact 2000", "plan save 500 per week")
 */
function extractAmount(text) {
  const match = (text || '').match(/(\d[\d,\.]*)/);
  if (!match) return null;
  const amtStr = match[1].replace(/,/g, '');
  const amt = parseFloat(amtStr);
  return Number.isFinite(amt) && amt > 0 ? Math.round(amt) : null;
}

/**
 * Detect whether user is talking about "per week".
 */
function isPerWeek(text) {
  const t = (text || '').toLowerCase();
  return t.includes('per week') || t.includes('/week') || t.includes('weekly');
}

/**
 * Compute basic monthly summary for last full month (income, expenses, savings).
 */
async function getLastMonthSummary(whatsappId) {
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(
    startOfThisMonth.getFullYear(),
    startOfThisMonth.getMonth() - 1,
    1
  );

  const txns = await Transaction.find({
    whatsappId,
    date: { $gte: startOfLastMonth, $lt: startOfThisMonth },
  }).lean();

  const income = txns
    .filter((t) => t.type === 'Income')
    .reduce((s, t) => s + t.amount, 0);
  const expenses = txns
    .filter((t) => t.type === 'Expense')
    .reduce((s, t) => s + t.amount, 0);
  const savings = Math.max(income - expenses, 0);

  return {
    monthLabel: startOfLastMonth.toLocaleString('en-IN', {
      month: 'short',
      year: 'numeric',
    }),
    income,
    expenses,
    savings,
  };
}

/**
 * Build a forecast text if user saves extraAmount per month.
 */
async function buildSavingsImpactFromText(user, text) {
  const extra = extractAmount(text);
  if (!extra) {
    return (
      'To see impact, please add an amount. Example:\n' +
      '• impact 2000  (extra ₹2000 per month)\n' +
      '• plan save 500 per week'
    );
  }

  const whatsappId = user.whatsappId;
  const lastMonth = await getLastMonthSummary(whatsappId);

  // Convert to monthly if user said "per week"
  let extraPerMonth = extra;
  if (isPerWeek(text)) {
    extraPerMonth = extra * 4; // rough 4 weeks
  }

  const sixMonthsExtra = extraPerMonth * 6;
  const twelveMonthsExtra = extraPerMonth * 12;

  // Approx current monthly savings
  const baseSavings = lastMonth.savings || 0;
  const sixMonthsTotal = baseSavings * 6 + sixMonthsExtra;
  const twelveMonthsTotal = baseSavings * 12 + twelveMonthsExtra;

  // Approx basic monthly expenses (for emergency coverage)
  const monthlyExpenses =
    lastMonth.expenses > 0 ? lastMonth.expenses : user.monthlySalary || 0;
  const oneMonthNeed = monthlyExpenses || 1;

  const sixCover = sixMonthsTotal / oneMonthNeed;
  const twelveCover = twelveMonthsTotal / oneMonthNeed;

  let msg =
    `If you consistently save an extra ₹${extraPerMonth.toLocaleString(
      'en-IN'
    )} per month:\n\n` +
    `• In 6 months you could have about ₹${sixMonthsTotal.toLocaleString(
      'en-IN'
    )} saved (≈ ${sixCover.toFixed(1)} months of basic expenses).\n` +
    `• In 12 months you could have about ₹${twelveMonthsTotal.toLocaleString(
      'en-IN'
    )} saved (≈ ${twelveCover.toFixed(
      1
    )} months of basic expenses).\n\n`;

  msg +=
    'This is a rough forecast, not a guarantee. Real results depend on your actual income, spending and whether you invest this money or keep it in savings.';

  return msg;
}

module.exports = {
  buildSavingsImpactFromText,
};
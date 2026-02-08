const Transaction = require('../models/Transaction');
const Debt = require('../models/Debt');

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

async function computeMonthlyHealth(user) {
  const whatsappId = user.whatsappId;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const txns = await Transaction.find({
    whatsappId,
    date: { $gte: startOfMonth },
  }).lean();

  const income = txns
    .filter((t) => t.type === 'Income')
    .reduce((s, t) => s + t.amount, 0);
  const expenses = txns
    .filter((t) => t.type === 'Expense')
    .reduce((s, t) => s + t.amount, 0);
  const savings = Math.max(income - expenses, 0);

  // Saving rate
  let savingRate = 0;
  if (income > 0) {
    savingRate = clamp(savings / income, 0, 1);
  }

  // EMI burden
  const debts = await Debt.find({ whatsappId, isActive: true }).lean();
  const monthlyEmi = debts
    .map((d) => d.emiAmount || 0)
    .reduce((s, x) => s + x, 0);
  let emiRate = 0;
  if (income > 0) {
    emiRate = clamp(monthlyEmi / income, 0, 1);
  }

  // Basic scoring
  let score = 40; // base

  // Saving rate contribution (0–30)
  let savePoints = 0;
  if (savingRate >= 0.3) savePoints = 30;
  else if (savingRate >= 0.2) savePoints = 25;
  else if (savingRate >= 0.1) savePoints = 15;
  else if (savingRate >= 0.05) savePoints = 10;
  score += savePoints;

  // EMI burden contribution (0–10, lower is better)
  let emiPoints = 0;
  if (emiRate <= 0.1) emiPoints = 10;
  else if (emiRate <= 0.2) emiPoints = 7;
  else if (emiRate <= 0.3) emiPoints = 4;
  score += emiPoints;

  // Emergency readiness (approx) – use 3x monthly expenses as target
  const monthlyExpenses = expenses || user.monthlySalary || 0;
  const targetEmergency = monthlyExpenses * 3;
  const emergencyCoverage = targetEmergency > 0 ? savings / targetEmergency : 0;

  let emergencyPoints = 0;
  if (emergencyCoverage >= 1) emergencyPoints = 10;
  else if (emergencyCoverage >= 0.5) emergencyPoints = 5;
  score += emergencyPoints;

  score = clamp(Math.round(score), 0, 100);

  const suggestions = [];

  if (savingRate < 0.1) {
    suggestions.push(
      'Your saving rate is quite low. Target saving at least 10–20% of your income. We can start by finding one leak to cut this month.'
    );
  } else if (savingRate < 0.2) {
    suggestions.push(
      'You are saving something, which is good. Pushing this towards 20% of income will give you more security.'
    );
  } else {
    suggestions.push(
      'Your saving rate looks healthy. The next focus can be building or topping up your emergency fund.'
    );
  }

  if (emiRate > 0.3) {
    suggestions.push(
      'EMI/loan burden is on the heavier side. Try not to take new loans and prioritise clearing the highest-interest ones.'
    );
  } else if (emiRate > 0.2) {
    suggestions.push(
      'EMI burden is moderate. Keep an eye that it does not cross ~30% of your income.'
    );
  }

  if (emergencyCoverage < 0.5) {
    suggestions.push(
      'Emergency readiness is weak. Aim to build at least 3 months of essential expenses as a buffer.'
    );
  }

  return {
    monthLabel: startOfMonth.toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
    }),
    income,
    expenses,
    savings,
    savingRate,
    monthlyEmi,
    emiRate,
    emergencyCoverage,
    score,
    suggestions,
  };
}

function buildHealthSummaryText(result) {
  const {
    monthLabel,
    income,
    expenses,
    savings,
    savingRate,
    monthlyEmi,
    emiRate,
    emergencyCoverage,
    score,
    suggestions,
  } = result;

  let msg =
    `Financial health for ${monthLabel}:\n\n` +
    `• Income: ₹${income.toLocaleString('en-IN')}\n` +
    `• Expenses: ₹${expenses.toLocaleString('en-IN')}\n` +
    `• Savings: ₹${savings.toLocaleString('en-IN')} (${(
      savingRate * 100
    ).toFixed(1)}% of income)\n` +
    `• Total EMIs (per month): ₹${monthlyEmi.toLocaleString(
      'en-IN'
    )} (${(emiRate * 100).toFixed(1)}% of income)\n` +
    `• Emergency coverage (this month vs 3 months target): ${(Math.min(
      emergencyCoverage,
      1
    ) * 100).toFixed(1)}%\n\n` +
    `Your Money Health Score: ${score}/100\n\n`;

  if (suggestions.length > 0) {
    msg += 'Next steps:\n';
    for (const s of suggestions) {
      msg += `• ${s}\n`;
    }
  }

  msg +=
    '\nThis score is a rough guide, not a judgment. Use it to track your direction month by month.';

  return msg;
}

module.exports = {
  computeMonthlyHealth,
  buildHealthSummaryText,
};
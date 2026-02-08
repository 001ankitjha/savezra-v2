const userService = require('./userService');
const transactionService = require('./transactionService');
const debtService = require('./debtService');
const goalService = require('./goalService');
const logger = require('../utils/logger');
const Goal = require('../models/Goal');

const WORK_DAYS_PER_MONTH = 22;
const WORK_HOURS_PER_DAY = 8;

function isDiscretionaryCategory(category = '') {
  const cat = (category || '').toLowerCase();
  const discretionary = [
    'food',
    'food delivery',
    'restaurant',
    'swiggy',
    'zomato',
    'shopping',
    'online shopping',
    'entertainment',
    'travel',
    'movie',
    'uber',
    'ola',
    'cab',
    'subscription',
  ];
  return discretionary.some((c) => cat.includes(c));
}

/**
 * Remove SEBI/RBI disclaimer from normal expense logs.
 * We only strip it for action = log_transaction and type = "Expense".
 */
function stripExpenseDisclaimer(message, txn) {
  if (!message || txn.type !== 'Expense') return message;

  const needle = 'note: i am not a sebi/rbi registered advisor';
  const lower = message.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx === -1) return message;

  return message.slice(0, idx).trim();
}

async function buildTransactionImpact(user, txn) {
  const lines = [];

  const salary = user.monthlySalary || 0;

  // 1) Hours of work impact
  if (salary && txn.type === 'Expense') {
    const workDays = user.workDaysPerMonth || WORK_DAYS_PER_MONTH;
    const workHours = user.workHoursPerDay || WORK_HOURS_PER_DAY;
    const hourlyRate = salary / (workDays * workHours);

    if (hourlyRate > 0) {
      const hours = txn.amount / hourlyRate;
      if (hours >= 0.3) {
        const baseLine = `This spend equals about ${hours
          .toFixed(1)
          .replace('.0', '')} hours of your work.`;
        lines.push(baseLine);

        // Percentage of salary
        const pct = (txn.amount / salary) * 100;
        if (pct >= 5) {
          lines.push(
            `That’s about ${pct.toFixed(
              1
            )}% of your monthly salary in one shot.`
          );
        }

        // Small meme-ish nudge in strict mode for big discretionary spends
        if (
          user.strictMode &&
          pct >= 10 &&
          isDiscretionaryCategory(txn.category)
        ) {
          lines.push(
            'Savings just took a small L here 😅 Next time, ping me before such a big swipe.'
          );
        }
      }
    }
  }

  // 2) Goal impact (only for discretionary categories and active goals)
  const goal = await Goal.findOne({
    whatsappId: user.whatsappId,
    isActive: true,
  }).sort({ goalTargetDate: 1 });

  if (
    goal &&
    txn.type === 'Expense' &&
    isDiscretionaryCategory(txn.category) &&
    goal.goalTargetDate
  ) {
    const now = new Date();
    const target = goal.goalTargetDate;

    const monthsLeftRaw =
      (target.getFullYear() - now.getFullYear()) * 12 +
      (target.getMonth() - now.getMonth());
    const monthsLeft = Math.max(1, monthsLeftRaw);

    const monthlyNeed = goal.goalAmount / monthsLeft;
    const dailyNeed = monthlyNeed / 30;

    if (dailyNeed > 0) {
      const daysDelay = txn.amount / dailyNeed;
      if (daysDelay >= 1) {
        const delayDays = Math.round(daysDelay);
        lines.push(
          `If you had saved this ₹${txn.amount.toLocaleString(
            'en-IN'
          )} for your goal "${goal.goalName}", you could reach it roughly ${delayDays} day(s) earlier instead of spending it.`
        );
      }
    }
  }

  return lines.join('\n');
}

/**
 * Dispatch the parsed AI action to the appropriate service.
 * For log_transaction we KEEP the AI text (e.g. "Whoa..."),
 * but strip disclaimers for normal expenses and append our impact block.
 */
async function dispatch(user, aiResponse) {
  const { action } = aiResponse;
  let messageToSend = aiResponse.message || '';

  try {
    switch (action) {
      case 'log_transaction': {
        if (!aiResponse.amount || aiResponse.amount <= 0) {
          logger.warn('log_transaction missing valid amount', { aiResponse });
          break;
        }

        const txn = await transactionService.logTransaction(user, {
          item: aiResponse.item || 'Unnamed',
          amount: aiResponse.amount,
          category: aiResponse.category || 'Uncategorized',
          type: aiResponse.type || 'Expense',
        });

        // Remove disclaimer for simple expenses
        messageToSend = stripExpenseDisclaimer(messageToSend, txn);

        const impact = await buildTransactionImpact(user, txn);
        if (impact) {
          messageToSend += (messageToSend ? '\n\n' : '') + impact;
        }
        break;
      }

      case 'update_salary': {
        if (!aiResponse.amount || aiResponse.amount <= 0) {
          logger.warn('update_salary missing valid amount', { aiResponse });
          break;
        }
        await userService.updateSalary(user, aiResponse.amount);
        // Keep AI's message (simple confirmation) if present
        break;
      }

      case 'log_debt': {
        if (!aiResponse.totalAmount || aiResponse.totalAmount <= 0) {
          logger.warn('log_debt missing valid totalAmount', { aiResponse });
          break;
        }
        await debtService.logDebt(user, {
          lenderName: aiResponse.lenderName || 'Unknown',
          totalAmount: aiResponse.totalAmount,
          interestRate:
            aiResponse.interestRate !== undefined
              ? aiResponse.interestRate
              : null,
          emiAmount:
            aiResponse.emiAmount !== undefined ? aiResponse.emiAmount : null,
          tenureMonths:
            aiResponse.tenureMonths !== undefined
              ? aiResponse.tenureMonths
              : null,
          dueDate: aiResponse.dueDate || null,
        });
        // AI's message can explain debt; we keep it (with disclaimer)
        break;
      }

      case 'log_goal': {
        if (!aiResponse.goalAmount || aiResponse.goalAmount <= 0) {
          logger.warn('log_goal missing valid goalAmount', { aiResponse });
          break;
        }
        await goalService.logGoal(user, {
          goalName: aiResponse.goalName || 'My Goal',
          goalAmount: aiResponse.goalAmount,
          goalTargetDate: aiResponse.goalTargetDate || null,
        });
        // Keep AI's goal explanation
        break;
      }

      case 'chat':
      default:
        // Pure coaching / chat – keep AI message as is
        break;
    }
  } catch (error) {
    logger.error('Action dispatch error', {
      action,
      error: error.message,
    });
    // Still send whatever message we have
  }

  // Final fallback to avoid empty replies
  if (!messageToSend || typeof messageToSend !== 'string') {
    messageToSend =
      "I noted that, but my brain glitched on how to respond. Could you try saying that again in a slightly different way?";
  }

  return messageToSend;
}

module.exports = {
  dispatch,
};
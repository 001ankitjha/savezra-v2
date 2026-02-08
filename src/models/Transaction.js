const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    whatsappId: {
      type: String,
      required: true,
      index: true,
    },
    item: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    category: {
      type: String,
      default: 'Uncategorized',
    },
    type: {
      type: String,
      enum: ['Expense', 'Income'],
      default: 'Expense',
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient monthly queries
transactionSchema.index({ whatsappId: 1, date: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
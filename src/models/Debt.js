const mongoose = require('mongoose');

const debtSchema = new mongoose.Schema(
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
    lenderName: {
      type: String,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    interestRate: {
      type: Number,
      default: null,
    },
    emiAmount: {
      type: Number,
      default: null,
    },
    tenureMonths: {
      type: Number,
      default: null,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    classification: {
      type: String,
      enum: ['toxic', 'neutral', 'potentially_good', 'unknown'],
      default: 'unknown',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Debt', debtSchema);
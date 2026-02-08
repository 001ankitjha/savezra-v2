const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema(
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
    goalName: {
      type: String,
      required: true,
    },
    goalAmount: {
      type: Number,
      required: true,
    },
    goalTargetDate: {
      type: Date,
      default: null,
    },
    savedSoFar: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Goal', goalSchema);
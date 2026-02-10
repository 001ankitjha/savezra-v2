const mongoose = require('mongoose');

const conversationMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    whatsappId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
     // NEW: internal stable ID for this user (used by older index userId_1)
    userId: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      default: null,
    },
    monthlySalary: {
      type: Number,
      default: null,
    },
    preferredLanguage: {
      type: String,
      enum: ['english', 'hinglish'],
      default: 'english',
    },
    streak: {
      type: Number,
      default: 0,
    },
    lastActiveDate: {
      type: Date,
      default: null,
    },
    conversationHistory: {
      type: [conversationMessageSchema],
      default: [],
    },
    onboardingComplete: {
      type: Boolean,
      default: false,
    },

    // Work pattern & strict mode
    workHoursPerDay: {
      type: Number,
      default: 8,
    },
    workDaysPerMonth: {
      type: Number,
      default: 22,
    },
    strictMode: {
      type: Boolean,
      default: false,
    },

    // Last time this user logged a money transaction
    lastTransactionAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
  }
);

// Keep conversation history bounded to the last 40 messages
userSchema.methods.addToConversation = function (role, content) {
  this.conversationHistory.push({ role, content, timestamp: new Date() });
  if (this.conversationHistory.length > 40) {
    this.conversationHistory = this.conversationHistory.slice(-40);
  }
};

// Update streak logic
userSchema.methods.updateStreak = function () {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (this.lastActiveDate) {
    const lastActive = new Date(this.lastActiveDate);
    lastActive.setHours(0, 0, 0, 0);

    const diffDays = Math.round((today - lastActive) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      this.streak += 1;
    } else if (diffDays > 1) {
      this.streak = 1;
    }
    // diffDays === 0 → same day, streak unchanged
  } else {
    this.streak = 1;
  }

  this.lastActiveDate = new Date();
};

module.exports = mongoose.model('User', userSchema);
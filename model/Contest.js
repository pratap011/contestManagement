const mongoose = require("mongoose");

const contestSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Contest name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    contestType: {
      type: String,
      enum: ["NORMAL", "VIP"],
      default: "NORMAL",
      required: true,
    },
    startTime: {
      type: Date,
      required: [true, "Contest start time is required"],
    },
    endTime: {
      type: Date,
      required: [true, "Contest end time is required"],
    },
    prize: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prize",
      required: [true, "Contest prize reference is required"],
    },
    questions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Question",
      },
    ],
    currentTop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    winnerDeclared: {
      type: Boolean,
      default: false,
    }
  },
  { timestamps: true }
);


contestSchema.index({ endTime: 1 });
contestSchema.index({ contestType: 1 });

// Helper method: check if contest is active
contestSchema.methods.isActive = function () {
  const now = new Date();
  return now >= this.startTime && now <= this.endTime;
};

//Helper method: check if contest ended
contestSchema.methods.hasEnded = function () {
  return new Date() > this.endTime;
};

module.exports = mongoose.model("Contest", contestSchema);
const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contest",
      required: [true, "Contest reference is required"],
    },
    answers: [
      {
        questionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Question",
          required: [true, "Question reference is required"],
        },
        selectedAnswers: {
          type: [String],
          required: [true, "Selected answers are required"],
        },
      },
    ],
    status: {
      type: String,
      enum: ["IN_PROGRESS", "COMPLETED", "EVALUATED"],
      default: "IN_PROGRESS",
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
    },
    prizeAwarded: {
      type: Boolean,
      default: false,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    submittedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);


submissionSchema.index({ contestId: 1 });
submissionSchema.index({ userId: 1 });



// Mark submission as started
submissionSchema.methods.markInProgress = async function () {
  this.status = "IN_PROGRESS";
  this.startedAt = new Date();
  await this.save();
};

// Mark submission as completed
submissionSchema.methods.markCompleted = async function (answers) {
  this.answers = answers;
  this.status = "COMPLETED";
  this.submittedAt = new Date();
  await this.save();
};



module.exports = mongoose.model("Submission", submissionSchema);
const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    questionText: {
      type: String,
      required: [true, "Question text is required"],
      trim: true,
    },
    answerType: {
      type: String,
      enum: ["SINGLE", "MULTI", "BOOL"],
      required: [true, "Answer type is required"],
    },
    options: {
      type: [String],
      validate: {
        validator: function (val) {
          // For BOOL type, no options array is needed
          if (this.answerType === "BOOL") return true;
          return val && val.length >= 2;
        },
        message: "At least two options are required for SINGLE or MULTI questions",
      },
    },
    correctAnswers: {
      type: [String],
      required: [true, "Correct answers are required"],
      validate: {
        validator: function (val) {
          if (!val || val.length === 0) return false;
          if (this.answerType === "SINGLE" && val.length !== 1) return false;
          if (this.answerType === "BOOL" && !["TRUE", "FALSE"].includes(val[0]?.toUpperCase())) return false;
          return true;
        },
        message:
          "Invalid correctAnswers format based on answerType (SINGLE, MULTI, BOOL)",
      },
    },
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contest",
      required: [true, "Contest reference is required"],
    },
  },
  { timestamps: true }
);

// ⚡ Index for quick contest-wise question lookups
questionSchema.index({ contestId: 1 });


module.exports = mongoose.model("Question", questionSchema);
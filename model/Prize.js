const mongoose = require("mongoose");

const prizeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Prize name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    winnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, 
    },
    claimed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);


prizeSchema.index({ winnerId: 1 });


module.exports = mongoose.model("Prize", prizeSchema);
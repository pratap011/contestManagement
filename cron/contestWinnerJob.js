const cron = require("node-cron");
const Contest = require("../model/Contest");
const Submission = require("../model/Submission");
const Prize = require("../model/Prize");
const User = require("../model/User");
const mongoose=require('mongoose');
const dotenv=require('dotenv');

/**
 * CRON JOB:
 * Runs every 2 hours → checks for contests that have ended and not yet declared.
 * Determines top scorer, updates winner, and awards prize.
 */
const contestWinnerJob = () => {
  cron.schedule("0 */2 * * *", async () => {
    console.log("Running contest winner cron job...");

    try {
      // Find concerts that have ended and winner not declared
      const now = new Date();
      const contests = await Contest.find({
        endTime: { $lte: now },
        winnerDeclared: false,
      }).populate("prize");

      if (!contests.length) {
        console.log("No contests to process right now.");
        return;
      }

      for (const contest of contests) {
        console.log(`Processing contest: ${contest.name}`);
        const winner = await User.findById({_id:contest.currentTop});
        contest.winnerDeclared = true;
        await contest.save();

        if (contest.prize) {
          const prize = await Prize.findById(contest.prize._id);
          if (prize) {
            prize.winnerId = winner._id;
            prize.claimed = true;
            await prize.save();

            await User.findByIdAndUpdate(winner._id, {
              $push: { prizes: prize._id },
            });
          }
        }
  

        console.log(`Winner declared for ${contest.name}: ${winner.name}`);
      }

      console.log("Contest winner cron job completed successfully.");
    } catch (err) {
      console.error("Error in contest winner cron job:", err.message);
    }
  });
};

module.exports = contestWinnerJob;

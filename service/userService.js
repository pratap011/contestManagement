const User = require("../model/User");
const Submission = require('../model/Submission');
const Contest = require('../model/Contest');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const dotenv=require('dotenv');

dotenv.config();

exports.registerUser = async (userData) => {
  const { name, email, password, userType } = userData;

  const existingUser = await User.findOne({ email });
  if (existingUser) throw new Error("User already exists");

  const user = await User.create({ name, email, password, userType });
  user.password=undefined;

  return { user };
};

exports.loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new Error("Invalid credentials");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Invalid credentials");

  const token = jwt.sign({ id: user._id, role: user.userType }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
  user.password = undefined; // don't return password
  return { user, token };
};

exports.getProfile = async (userId) => {
    return await User.findById(userId).populate("prizes", "name description");
  };

  exports.getUserContestHistory = async (userId) => {
    // Fetch all submissions for the user
    const submissions = await Submission.find({ userId })
      .populate("contestId", "name description contestType startTime endTime prize")
      .populate("contestId.prize", "name description")
      .sort({ submittedAt: -1 });
  
    // Separate into IN_PROGRESS and COMPLETED
    const inProgress = [];
    const completed = [];
  
    submissions.forEach((sub) => {
      const contestData = {
        contestId: sub.contestId?._id,
        contestName: sub.contestId?.name,
        contestType: sub.contestId?.contestType,
        startTime: sub.contestId?.startTime,
        endTime: sub.contestId?.endTime,
        prize: sub.contestId?.prize || null,
        score: sub.score,
        status: sub.status,
      };
  
      if (sub.status === "IN_PROGRESS") inProgress.push(contestData);
      if (sub.status === "COMPLETED") completed.push(contestData);
    });
  
    return {
      inProgress,
      completed,
    };
  };
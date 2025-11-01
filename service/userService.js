const User = require("../model/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const dotenv=require('dotenv');

dotenv.config();

exports.registerUser = async (userData) => {
  const { name, email, password, userType } = userData;

  const existingUser = await User.findOne({ email });
  if (existingUser) throw new Error("User already exists");

  const user = await User.create({ name, email, password, userType });

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
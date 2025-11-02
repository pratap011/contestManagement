const userService = require("../service/userService");
const { success, error } = require("../utils/response");

exports.register = async (req, res) => {
  try {
    const result = await userService.registerUser(req.body);
    return success(res, "User registered successfully", result);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.login = async (req, res) => {
  try {
    const result = await userService.loginUser(req.body);
    return success(res, "Login successful", result);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await userService.getProfile(req.user._id);
    return success(res, "User profile fetched", user);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getUserContestHistory = async (req, res) => {
    try {
      const userId = req.user._id;
      const history = await userService.getUserContestHistory(userId);
  
      return success(res, "User contest history fetched successfully", history);
    } catch (err) {
      return error(res, err.message);
    }
  };
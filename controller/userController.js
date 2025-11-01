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


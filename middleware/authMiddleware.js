const jwt = require("jsonwebtoken");
const User = require("../model/User");
const { error } = require("../utils/response");

exports.protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return error(res, "Not authorized, token missing", 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) return error(res, "User not found", 404);
    next();
  } catch (err) {
    return error(res, "Not authorized, invalid token", 401);
  }
};


exports.authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.userType)) {
      return error(res, "Access denied: insufficient privileges", 403);
    }
    next();
  };
};

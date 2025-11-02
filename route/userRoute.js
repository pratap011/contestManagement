const express = require("express");
const router = express.Router();
const Joi = require("joi");

const userController = require("../controller/userController");
const validate = require("../middleware/validateRequest");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

// Validation Schemas
const registerSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  userType: Joi.string().valid("ADMIN", "VIP", "NORMAL").default("NORMAL"),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});


router.post("/register", validate(registerSchema), userController.register);
router.post("/login", validate(loginSchema), userController.login);
router.get("/profile", protect, userController.getProfile);
router.get("/history", protect, userController.getUserContestHistory);

module.exports = router;

const express = require("express");
const router = express.Router();
const Joi = require("joi");

const prizeController = require("../controller/prizeController");
const validate = require("../middleware/validateRequest");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

// 🧾 Validation schema
const prizeSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow("").default(""),
});

// 🧭 Routes
router.post(
  "/create",
  protect,
  authorizeRoles("ADMIN"),
  validate(prizeSchema),
  prizeController.create
);

module.exports = router;
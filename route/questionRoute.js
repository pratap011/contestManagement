const express = require("express");
const router = express.Router();
const Joi = require("joi");

const questionController = require("../controller/questionController");
const validate = require("../middleware/validateRequest");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");

// ✅ Validation Schema
const questionSchema = Joi.object({
  questionText: Joi.string().required(),
  answerType: Joi.string().valid("SINGLE", "MULTI", "BOOL").required(),
  options: Joi.when("answerType", {
    is: Joi.valid("SINGLE", "MULTI"),
    then: Joi.array().items(Joi.string().required()).min(2).required(),
    otherwise: Joi.array().items(Joi.string()).optional(),
  }),
  correctAnswers: Joi.array().items(Joi.string().required()).min(1).required(),
  contestId: Joi.string().required(),
});

// 🧭 Routes
router.post(
  "/create",
  protect,
  authorizeRoles("ADMIN"),
  validate(questionSchema),
  questionController.create
);

module.exports = router;

const express = require("express");
const router = express.Router();
const Joi = require("joi");

const submissionController = require("../controller/submissionController");
const validate = require("../middleware/validateRequest");
const { protect } = require("../middleware/authMiddleware");


const submitSchema = Joi.object({
  answers: Joi.array()
    .items(
      Joi.object({
        questionId: Joi.string().required(),
        selectedAnswers: Joi.array().items(Joi.string().required()).required(),
      })
    )
    .min(1)
    .required(),
});


router.post("/:id/start", protect, submissionController.startContest);


router.post("/:id/submit", protect, validate(submitSchema), submissionController.submitAnswers);

module.exports = router;

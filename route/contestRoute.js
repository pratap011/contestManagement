const express = require("express");
const router = express.Router();
const Joi = require("joi");

const contestController = require("../controller/contestController");
const validate = require("../middleware/validateRequest");
const { protect, authorizeRoles } = require("../middleware/authMiddleware");


const contestSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow("").default(""),
  contestType: Joi.string().valid("NORMAL", "VIP").default("NORMAL"),
  startTime: Joi.date().required(),
  endTime: Joi.date().required(),
  prize: Joi.string().required(), // must be a valid ObjectId string
});


// 🧭 Routes
router.post(
  "/create",
  protect,
  authorizeRoles("ADMIN"),
  validate(contestSchema),
  contestController.create
);

router.get("/fetch",contestController.fetch);

module.exports = router;
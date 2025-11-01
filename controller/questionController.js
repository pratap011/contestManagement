const questionService = require("../service/questionService");
const { success, error } = require("../utils/response");

exports.create = async (req, res) => {
  try {
    const question = await questionService.createQuestion(req.body);
    return success(res, "Question created successfully", question);
  } catch (err) {
    return error(res, err.message);
  }
};
const submissionService = require("../service/submissionService");
const { success, error } = require("../utils/response");


exports.startContest = async (req, res) => {
  try {
    const userId = req.user._id;
    const contestId = req.params.id;

    const submission = await submissionService.startContest(userId, contestId);

    return success(res, "Contest started successfully", submission);
  } catch (err) {
    return error(res, err.message);
  }
};


exports.submitAnswers = async (req, res) => {
  try {
    const userId = req.user._id;
    const contestId = req.params.id;
    const { answers } = req.body;

    const result = await submissionService.submitAnswers(userId, contestId, answers);

    return success(res, "Contest submitted successfully", {
      score: result.score,
      status: result.status,
    });
  } catch (err) {
    return error(res, err.message);
  }
};

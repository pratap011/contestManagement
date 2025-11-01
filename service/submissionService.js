const Submission = require("../model/Submission");
const Contest = require("../model/Contest");
const Question = require("../model/Question");

exports.startContest = async (userId, contestId) => {
  const contest = await Contest.findById(contestId);
  if (!contest) throw new Error("Contest not found");

  // prevent duplicate participation
  const existing = await Submission.findOne({ userId, contestId });
  if (existing) throw new Error("User already started this contest");

  const submission = await Submission.create({
    userId,
    contestId,
    status: "IN_PROGRESS",
    startedAt: new Date(),
  });

  // increment participants count in contest
  contest.participantsCount += 1;
  await contest.save();

  return submission;
};

exports.submitAnswers = async (userId, contestId, answers) => {
  const submission = await Submission.findOne({ userId, contestId });
  if (!submission) throw new Error("Submission not found");

  submission.answers = answers;
  submission.status = "COMPLETED";
  submission.submittedAt = new Date();


  let score = 0;
  for (const ans of answers) {
    const q = await Question.findById(ans.questionId);
    if (!q) continue;
    
    
    const correct = (q.correctAnswers || []).sort();
    const given = (ans.selectedAnswers || []).sort();
    const isCorrect = correct.length === given.length && correct.every((v, i) => v === given[i]);

    if (isCorrect) score += 1;
  }

  submission.score = score;
  await submission.save();

  // update contest top scorer
  const top = await Submission.findOne({ contestId }).sort({ score: -1 });
  if (!top || submission.score >= top.score) {
    await Contest.findByIdAndUpdate(contestId, { currentTop: userId });
  }

  return submission;
};

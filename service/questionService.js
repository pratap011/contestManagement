const Question = require("../model/Question");
const Contest = require("../model/Contest");

exports.createQuestion = async (data) => {
  const { questionText, answerType, options, correctAnswers, contestId } = data;

  // Check contest exists
  const contest = await Contest.findById(contestId);
  if (!contest) throw new Error("Contest not found");


  if (answerType !== "BOOL" && (!options || options.length < 2)) {
    throw new Error("At least two options are required for SINGLE or MULTI questions");
  }

  if (answerType === "BOOL" && !["TRUE", "FALSE"].includes(correctAnswers[0]?.toUpperCase())) {
    throw new Error("For BOOL type, correctAnswers must be TRUE or FALSE");
  }


  const question = await Question.create({
    questionText,
    answerType,
    options,
    correctAnswers,
    contestId,
  });

  // Push question to contest's questions array
  contest.questions.push(question._id);
  await contest.save();

  return question;
};
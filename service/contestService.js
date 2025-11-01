const Contest = require("../model/Contest");

exports.createContest = async (data) => {
  const { name, description, contestType, startTime, endTime, prize } = data;

 
  if (new Date(startTime) >= new Date(endTime)) {
    throw new Error("Start time must be before end time");
  }

  const contest = await Contest.create({
    name,
    description,
    contestType,
    startTime,
    endTime,
    prize,
  });

  return contest;
};

exports.fetchAllContests = async () => {
    const contests = await Contest.find({});
    return contests;
}

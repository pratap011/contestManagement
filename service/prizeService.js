const Prize = require("../model/Prize");

exports.createPrize = async (data) => {
  const { name, description, contestId } = data;
  const prize = await Prize.create({ name, description, contestId });
  return prize;
};
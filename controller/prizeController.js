const prizeService = require("../service/prizeService");
const { success, error } = require("../utils/response");

exports.create = async (req, res) => {
  try {
    const prize = await prizeService.createPrize(req.body);
    return success(res, "Prize created successfully", prize);
  } catch (err) {
    return error(res, err.message);
  }
};
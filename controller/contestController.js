const contestService = require("../service/contestService");
const { success, error } = require("../utils/response");

exports.create = async (req, res) => {
  try {
    const contest = await contestService.createContest(req.body);
    return success(res, "Contest created successfully", contest);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.fetch = async (req,res) => {
    try{
        const contests= await contestService.fetchAllContests();
        return success(res, "All contests fetched successfully",contests);

    }
    catch(err){
        return error(res,err.message);
    }
}
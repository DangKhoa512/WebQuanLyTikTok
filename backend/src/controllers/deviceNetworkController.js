const service = require("../services/deviceManagerService");
const { success, error } = require("../utils/response");
module.exports = async (req, res, next) => {
  try {
    return success(
      res,
      await service.reportIp(req.api_owner_username, req.body),
      "Network information updated",
    );
  } catch (e) {
    if (e.statusCode) return error(res, e.message, e.statusCode);
    next(e);
  }
};

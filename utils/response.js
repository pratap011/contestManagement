exports.success = (res, message, data = {}) => {
    return res.status(200).json({ success: true, message, data });
  };
  
  exports.error = (res, message, statusCode = 400) => {
    return res.status(statusCode).json({ success: false, message });
  };
/**
 * Standardised JSON response helpers
 * All responses follow: { success, message, data }
 */

const success = (res, data = {}, message = 'Thành công', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const error = (res, message = 'Có lỗi xảy ra', statusCode = 500, data = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    data,
  });
};

/**
 * Thêm full_data (pipe-separated) vào account object trước khi trả về
 */
const withFullData = (account) => {
  if (!account) return null;
  const a = account.toJSON ? account.toJSON() : { ...account };
  a.full_data = [
    a.username   || '',
    a.password   || '',
    a.email      || '',
    a.email_pass || '',
  ].join('|');
  return a;
};

module.exports = { success, error, withFullData };

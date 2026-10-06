const service = require('../services/totpService');
const generate = async (req,res) => {
 try {
  const value = await service.generate(req.body?.secret);
  return res.json({ success: true, code: value.code, expires_in: value.expiresIn });
 } catch (err) {
  return res.status(err.code === 'INVALID_SECRET' ? 400 : 500).json({ success: false, error: err.code === 'INVALID_SECRET' ? 'INVALID_SECRET' : 'TOTP_GENERATION_FAILED' });
 }
};
module.exports = { generate };

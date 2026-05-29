const Joi = require('joi');
const { error } = require('../utils/response');

/**
 * Returns Express middleware that validates req.body against a Joi schema
 */
const validate = (schema) => (req, res, next) => {
  const { error: validationError } = schema.validate(req.body, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
  });

  if (validationError) {
    const messages = validationError.details.map((d) => d.message).join('; ');
    return error(res, `Dữ liệu không hợp lệ: ${messages}`, 400);
  }

  next();
};

// ── Joi schemas ──────────────────────────────────────────────────────────────

const schemas = {
  /**
   * POST /api/accounts/reg-submit
   * Accepts either raw pipe-separated `data` OR individual JSON fields
   */
  regSubmit: Joi.object({
    data: Joi.string().min(1).optional(),
    username: Joi.string().max(255).optional().allow('', null),
    password: Joi.string().max(255).optional().allow('', null),
    twofa: Joi.string().max(255).optional().allow('', null),
    email: Joi.string().max(255).optional().allow('', null),
    email_pass: Joi.string().max(255).optional().allow('', null),
    cookie: Joi.string().optional().allow('', null),
    token: Joi.string().optional().allow('', null),
    proxy: Joi.string().max(255).optional().allow('', null),
    device_id: Joi.string().max(255).optional().allow('', null),
  }).or('data', 'username'),

  /**
   * POST /api/accounts/get-upvideo
   */
  getUpvideo: Joi.object({
    device_id: Joi.string().max(255).required(),
  }),

  /**
   * POST /api/accounts/upload-success
   */
  uploadSuccess: Joi.object({
    username:    Joi.string().max(255).required(),
    device_id:   Joi.string().max(255).required(),
    video_count: Joi.number().integer().min(0).optional(),
  }),

  uploadFail: Joi.object({
    username:  Joi.string().max(255).required(),
    device_id: Joi.string().max(255).required(),
    reason:    Joi.string().max(500).optional().allow('', null),
  }),

  updateLive: Joi.object({
    username:    Joi.string().max(255).required(),
    live_status: Joi.string().valid('unknown', 'live', 'die').required(),
  }),

  updateAccount: Joi.object({
    note:       Joi.string().optional().allow('', null),
    status:     Joi.string().valid('ACC_LOGIN','LOGIN_THANH_CONG','ACC_DA_KHANG','ACC_CHUA_KHANG','ACC_DU_DK','ACC_DIE').optional(),
    live_status:Joi.string().valid('unknown', 'live', 'die').optional(),
    proxy:      Joi.string().max(255).optional().allow('', null),
    device_id:  Joi.string().max(255).optional().allow('', null),
  }).min(1),
};

module.exports = { validate, schemas };

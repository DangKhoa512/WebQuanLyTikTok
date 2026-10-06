const express = require('express');
const rateLimit = require('express-rate-limit');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const { generate } = require('../controllers/totpController');
const router = express.Router();
// Mounted before general body parsing/request logging: never log URL queries, secret or OTP.
router.use((req,res,next) => { res.set('Cache-Control','no-store'); next(); });
router.all('/generate', rateLimit({ windowMs: 60000, max: 60, standardHeaders: true, legacyHeaders: false,
 handler: (req,res) => res.status(429).json({success:false,error:'RATE_LIMITED'})
}), (req,res,next) => Promise.resolve(apiKeyAuth(req,res,next)).catch(next), (req,res,next) => {
 if (req.method !== 'POST') return res.set('Allow','POST').status(405).json({success:false,error:'METHOD_NOT_ALLOWED'});
 if (Object.keys(req.query).length) return res.status(400).json({success:false,error:'INVALID_REQUEST'});
 next();
});
router.post('/generate', express.json({ limit: '2kb', strict: true }), generate);
router.use((req,res) => res.status(404).json({success:false,error:'NOT_FOUND'}));
// Fixed error identifiers only; never forward parser/auth errors (which may include body) to the common logger.
router.use((err,req,res,next) => res.status(err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' ? 400 : 500).json({success:false,error:err.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : err.type === 'entity.parse.failed' ? 'INVALID_REQUEST' : 'TOTP_GENERATION_FAILED'}));
module.exports = router;

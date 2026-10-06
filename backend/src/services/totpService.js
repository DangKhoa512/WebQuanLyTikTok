const { createTotp } = require('../utils/totp');
const PERIOD_MS = 30000;
const invalid = () => Object.assign(new Error('INVALID_SECRET'), { code: 'INVALID_SECRET' });
const normalizeSecret = input => {
 if (typeof input !== 'string' || input.length > 1024) throw invalid();
 const text = input.trim();
 if (!text || !/^[a-zA-Z2-7]+=*$/.test(text)) throw invalid();
 const secret = text.toUpperCase();
 const unpadded = secret.replace(/=+$/, '');
 if (unpadded.length < 2 || unpadded.length > 512) throw invalid();
 const padding = secret.length - unpadded.length;
 const remainder = unpadded.length % 8;
 const allowedPadding = { 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 };
 if (allowedPadding[remainder] === undefined || (padding && padding !== allowedPadding[remainder])) throw invalid();
 // Reject noncanonical trailing bits instead of silently discarding malformed Base32.
 const unusedBits = (unpadded.length * 5) % 8;
 const last = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(unpadded[unpadded.length - 1]);
 if (last & ((1 << unusedBits) - 1)) throw invalid();
 return unpadded;
};
const createTotpService = ({ now = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) => ({
 async generate(input) {
  const secret = normalizeSecret(input);
  let timestamp = now();
  let remaining = PERIOD_MS - timestamp % PERIOD_MS;
  while (remaining <= 3000) {
   await sleep(remaining + 25);
   timestamp = now(); remaining = PERIOD_MS - timestamp % PERIOD_MS;
  }
  return { code: createTotp(secret,timestamp), expiresIn: Math.ceil(remaining / 1000) };
 }
});
module.exports = { ...createTotpService(), createTotpService, normalizeSecret };

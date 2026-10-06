// Existing SHA1 / 6-digit / 30-second implementation shared with Instagram login.
const crypto = require('crypto');
const clean = value => String(value || '').trim();

const decodeBase32 = (value) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const source = clean(value).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of source) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('invalid_two_fa_secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(parseInt(bits.slice(offset, offset + 8), 2));
  }
  if (!bytes.length) throw new Error('invalid_two_fa_secret');
  return Buffer.from(bytes);
};

const createTotp = (secret, timestamp = Date.now()) => {
  const counter = Math.floor(timestamp / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(code).padStart(6, '0');
};

module.exports = { createTotp };

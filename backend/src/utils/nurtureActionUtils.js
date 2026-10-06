const normalizeNurtureCount = (data = {}, maxLimit = 100) => {
  const parsedMin = parseInt(data.min, 10);
  const parsedMax = parseInt(data.max, 10);
  const min = Number.isInteger(parsedMin) ? Math.min(Math.max(parsedMin, 0), maxLimit) : 0;
  const maxValue = Number.isInteger(parsedMax) ? Math.min(Math.max(parsedMax, 0), maxLimit) : min;
  return { enabled: data.enabled === true, min, max: Math.max(min, maxValue) };
};

const normalizeNurtureTargets = (data = {}, field) => {
  const raw = Array.isArray(data[field]) ? data[field] : String(data[field] || '').split(/\r?\n|,/);
  const targets = [...new Set(raw.map((value) => String(value || '').trim()).filter(Boolean))]
    .slice(0, 200)
    .map((value) => value.slice(0, 500));
  const count = normalizeNurtureCount(data, targets.length || 200);
  return { ...count, enabled: count.enabled && targets.length > 0, [field]: targets };
};

// Target activities share the existing Facebook count/list normalization.
const normalizeCrossFollow = (data) => {
  if (data === undefined) return { enabled: false, min: 0, max: 0, usernames: [] };
  const fail = (message) => { const err = new Error(message); err.statusCode = 400; throw err; };
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.enabled !== 'boolean') fail('Theo dõi chéo: enabled phải là boolean.');
  if (!Number.isSafeInteger(data.min) || !Number.isSafeInteger(data.max) || data.min < 0 || data.max < data.min) fail('Theo dõi chéo: Min/Max phải là số nguyên không âm và Min không lớn hơn Max.');
  if (!Array.isArray(data.usernames) || data.usernames.length > 200 || data.usernames.some(value => typeof value !== 'string' || value.length > 256)) fail('Theo dõi chéo: danh sách tối đa 200 username, mỗi mục tối đa 255 ký tự (không tính @).');
  const usernames = [];
  const seen = new Set();
  for (const value of data.usernames) {
    const username = value.trim().replace(/^@/, '').toLowerCase();
    if (!username) continue;
    if (username.length > 255 || !/^[a-zA-Z0-9._]+$/.test(username)) fail('Theo dõi chéo: username chỉ gồm chữ, số, dấu chấm hoặc gạch dưới.');
    const key = username.toLowerCase();
    if (!seen.has(key)) { seen.add(key); usernames.push(username); }
  }
  if (data.enabled && !usernames.length) fail('Theo dõi chéo: cần ít nhất 1 username.');
  if (data.enabled && data.max > usernames.length) fail('Max không được lớn hơn số username trong danh sách.');
  // OFF retains the configured range and list, matching Facebook target activities.
  return { ...normalizeNurtureCount(data, Math.max(data.max, usernames.length)), usernames };
};
module.exports = { normalizeNurtureCount, normalizeNurtureTargets, normalizeCrossFollow };

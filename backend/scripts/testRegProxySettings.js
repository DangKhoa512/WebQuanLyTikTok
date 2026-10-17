const assert = require('assert');

const AppSetting = require('../src/models/AppSetting');
const rows = new Map();
const rowKey = (where) => `${where.owner_username}:${where.setting_key}`;

AppSetting.findOne = async ({ where }) => {
  const key = rowKey(where);
  if (!rows.has(key)) return null;
  return { setting_value: rows.get(key) };
};

AppSetting.findOrCreate = async ({ where, defaults }) => {
  const key = rowKey(where);
  const created = !rows.has(key);
  if (created) rows.set(key, defaults.setting_value);
  return [{
    update: async ({ setting_value }) => {
      rows.set(key, setting_value);
    },
  }, created];
};

const controller = require('../src/controllers/settingsController');

const call = async (handler, req) => {
  let payload;
  let statusCode = 200;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return value;
    },
  };
  await handler(req, res, (error) => { throw error; });
  return { statusCode, payload };
};

(async () => {
  const ownerA = { admin: { username: 'Owner_A' } };
  const ownerB = { admin: { username: 'Owner_B' } };

  let result = await call(controller.updateRegProxies, {
    ...ownerA,
    body: { proxies: ' 192.0.2.10:8000 \n192.0.2.10:8000\n198.51.100.20:9000:user:pass\nuser:pass@198.51.100.20:9000 ' },
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.payload.data.settings.proxies, [
    '192.0.2.10:8000',
    'user:pass@198.51.100.20:9000',
  ]);

  result = await call(controller.updateRegProxies, {
    ...ownerB,
    body: { proxies: ['203.0.113.30:7000'] },
  });
  assert.deepEqual(result.payload.data.settings.proxies, ['203.0.113.30:7000']);

  const ownerAResult = await call(controller.getRegProxies, { ...ownerA, body: {} });
  const ownerBResult = await call(controller.getRegProxies, { ...ownerB, body: {} });
  assert.deepEqual(ownerAResult.payload.data.settings.proxies, [
    '192.0.2.10:8000',
    'user:pass@198.51.100.20:9000',
  ]);
  assert.deepEqual(ownerBResult.payload.data.settings.proxies, ['203.0.113.30:7000']);
  assert.equal(rows.size, 2);

  console.log('Proxy Reg settings: normalization and owner isolation PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const { Op } = require('sequelize');
const MachineApiConfig = require('../models/MachineApiConfig');
const { success, error } = require('../utils/response');
const { ownerFromAdmin, ownerFromRequest } = require('../utils/owner');
const { DEFAULT_MACHINE_API_KEYS, getMachineApiKeys } = require('../services/settingsService');

const COMMON_DEVICE_ID = '__COMMON__';
const MACHINE_MARKER_KEY = '__MACHINE__';
const INTERNAL_KEYS = new Set([MACHINE_MARKER_KEY]);

const DEFAULT_KEYS = DEFAULT_MACHINE_API_KEYS;

const normalizeDeviceId = (value) => String(value || '').trim();
const normalizeKey = (value) => String(value || '').trim().toUpperCase();
const rowToMap = (rows) => rows.reduce((acc, row) => {
  if (!INTERNAL_KEYS.has(row.config_key)) {
    acc[row.config_key] = row.config_value;
  }
  return acc;
}, {});

const listConfigs = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const rows = await MachineApiConfig.findAll({
      where: { owner_username },
      order: [['device_id', 'ASC'], ['config_key', 'ASC']],
      raw: true,
    });

    const configuredKeys = await getMachineApiKeys();
    const keys = [...new Set([...configuredKeys, ...rows.map((row) => row.config_key).filter((key) => !INTERNAL_KEYS.has(key))])];
    const common = rowToMap(rows.filter((row) => row.device_id === COMMON_DEVICE_ID));
    const machinesById = new Map();

    rows.filter((row) => row.device_id !== COMMON_DEVICE_ID).forEach((row) => {
      if (!machinesById.has(row.device_id)) {
        machinesById.set(row.device_id, {
          device_id: row.device_id,
          configs: {},
          updated_at: row.updated_at,
        });
      }
      const machine = machinesById.get(row.device_id);
      if (!INTERNAL_KEYS.has(row.config_key)) {
        machine.configs[row.config_key] = row.config_value;
      }
      if (!machine.updated_at || new Date(row.updated_at) > new Date(machine.updated_at)) {
        machine.updated_at = row.updated_at;
      }
    });

    const machines = [...machinesById.values()].sort((a, b) =>
      String(a.device_id).localeCompare(String(b.device_id), 'vi', { numeric: true, sensitivity: 'base' })
    );

    return success(res, {
      common_device_id: COMMON_DEVICE_ID,
      keys,
      common,
      machines,
    }, 'OK');
  } catch (err) { next(err); }
};

const saveConfigs = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const device_id = normalizeDeviceId(req.body.device_id || (req.body.common ? COMMON_DEVICE_ID : ''));
    const configs = req.body.configs || {};

    if (!device_id) return error(res, 'Thieu device_id', 400);
    if (!configs || typeof configs !== 'object' || Array.isArray(configs)) {
      return error(res, 'configs phai la object', 400);
    }

    if (device_id !== COMMON_DEVICE_ID) {
      await MachineApiConfig.findOrCreate({
        where: { owner_username, device_id, config_key: MACHINE_MARKER_KEY },
        defaults: { owner_username, device_id, config_key: MACHINE_MARKER_KEY, config_value: '1' },
      });
    }

    let saved = 0;
    let removed = 0;
    for (const [rawKey, rawValue] of Object.entries(configs)) {
      const config_key = normalizeKey(rawKey);
      if (!config_key || INTERNAL_KEYS.has(config_key)) continue;
      if (config_key.length > 100) return error(res, 'Key qua dai: ' + config_key, 400);

      const config_value = String(rawValue ?? '').trim();
      const where = { owner_username, device_id, config_key };
      if (!config_value) {
        const deleted = await MachineApiConfig.destroy({ where });
        removed += deleted;
        continue;
      }

      const [row, created] = await MachineApiConfig.findOrCreate({
        where,
        defaults: { ...where, config_value },
      });
      if (!created && row.config_value !== config_value) {
        await row.update({ config_value });
      }
      saved += 1;
    }

    return success(res, { device_id, saved, removed }, 'Da luu cau hinh API may');
  } catch (err) { next(err); }
};

const deleteMachine = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const device_id = normalizeDeviceId(req.params.device_id);
    if (!device_id || device_id === COMMON_DEVICE_ID) return error(res, 'device_id khong hop le', 400);

    const deleted = await MachineApiConfig.destroy({ where: { owner_username, device_id } });
    return success(res, { deleted }, 'Da xoa cau hinh may');
  } catch (err) { next(err); }
};

const getForDevice = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = normalizeDeviceId(req.params.device_id || req.query.device_id);
    if (!device_id) return error(res, 'Thieu device_id', 400);

    const rows = await MachineApiConfig.findAll({
      where: {
        owner_username,
        device_id: { [Op.in]: [COMMON_DEVICE_ID, device_id] },
      },
      raw: true,
    });

    const common = rowToMap(rows.filter((row) => row.device_id === COMMON_DEVICE_ID));
    const overrides = rowToMap(rows.filter((row) => row.device_id === device_id));
    const configs = { ...common, ...overrides };

    return success(res, {
      device_id,
      common,
      overrides,
      configs,
    }, 'OK');
  } catch (err) { next(err); }
};

module.exports = {
  COMMON_DEVICE_ID,
  DEFAULT_KEYS,
  listConfigs,
  saveConfigs,
  deleteMachine,
  getForDevice,
};

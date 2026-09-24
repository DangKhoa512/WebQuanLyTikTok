const { Op } = require('sequelize');
const MachineApiConfig = require('../models/MachineApiConfig');
const FacebookNurtureAssignment = require('../models/FacebookNurtureAssignment');
const InstagramNurtureAssignment = require('../models/InstagramNurtureAssignment');
const sequelize = require('../config/database');
const { success, error } = require('../utils/response');
const { ownerFromAdmin, ownerFromRequest } = require('../utils/owner');
const { DEFAULT_MACHINE_API_KEYS, getMachineApiKeys, saveMachineApiKeys, getFacebookNurtureSettings, getInstagramNurtureSettings } = require('../services/settingsService');

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

    const configuredKeys = await getMachineApiKeys(owner_username);
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

const bulkCreateMachines = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const startDevice = normalizeDeviceId(req.body.start_device);
    const endDevice = normalizeDeviceId(req.body.end_device);
    const startMatch = startDevice.match(/^(.*?)(\d+)$/);
    const endMatch = endDevice.match(/^(.*?)(\d+)$/);
    if (!startMatch || !endMatch || startMatch[1] !== endMatch[1]) {
      return error(res, 'Ten may phai cung tien to, vi du May1 den May100', 400);
    }
    const from = parseInt(startMatch[2], 10);
    const to = parseInt(endMatch[2], 10);
    if (from > to) return error(res, 'May bat dau phai nho hon hoac bang may ket thuc', 400);
    if (to - from + 1 > 1000) return error(res, 'Moi lan chi duoc them toi da 1000 may', 400);

    const deviceIds = Array.from({ length: to - from + 1 }, (_, index) => startMatch[1] + String(from + index));
    const existingRows = await MachineApiConfig.findAll({
      attributes: ['device_id'],
      where: { owner_username, device_id: { [Op.in]: deviceIds }, config_key: MACHINE_MARKER_KEY },
      raw: true,
    });
    const existing = new Set(existingRows.map((row) => row.device_id));
    const newIds = deviceIds.filter((deviceId) => !existing.has(deviceId));
    if (newIds.length) {
      await MachineApiConfig.bulkCreate(newIds.map((device_id) => ({
        owner_username,
        device_id,
        config_key: MACHINE_MARKER_KEY,
        config_value: '1',
      })), { ignoreDuplicates: true });
    }
    return success(res, { total: deviceIds.length, created: newIds.length, duplicated: deviceIds.length - newIds.length }, 'Da them nhanh danh sach may');
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

const bulkDeleteMachines = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const deviceIds = Array.isArray(req.body.device_ids)
      ? [...new Set(req.body.device_ids.map(normalizeDeviceId).filter((value) => value && value !== COMMON_DEVICE_ID))]
      : [];
    if (!deviceIds.length) return error(res, 'Can truyen danh sach device_ids', 400);
    const deleted = await MachineApiConfig.destroy({ where: { owner_username, device_id: { [Op.in]: deviceIds } } });
    return success(res, { machines: deviceIds.length, deleted }, 'Da xoa cac may da chon');
  } catch (err) { next(err); }
};

const addConfigKey = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const configKey = normalizeKey(req.body.key);
    if (!configKey || INTERNAL_KEYS.has(configKey) || configKey.length > 100) return error(res, 'Key API khong hop le', 400);
    const keys = await getMachineApiKeys(owner_username);
    const saved = await saveMachineApiKeys([...keys, configKey], owner_username);
    return success(res, { keys: saved }, keys.includes(configKey) ? 'Key API da ton tai' : 'Da them key API');
  } catch (err) { next(err); }
};

const renameConfigKey = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const oldKey = normalizeKey(req.params.config_key);
    const newKey = normalizeKey(req.body.key || req.body.new_key);
    if (!oldKey || !newKey || INTERNAL_KEYS.has(oldKey) || INTERNAL_KEYS.has(newKey) || newKey.length > 100) {
      return error(res, 'Key API khong hop le', 400);
    }
    if (oldKey !== newKey) {
      const rows = await MachineApiConfig.findAll({ where: { owner_username, config_key: oldKey } });
      for (const row of rows) {
        const target = await MachineApiConfig.findOne({ where: { owner_username, device_id: row.device_id, config_key: newKey } });
        if (target) await row.destroy();
        else await row.update({ config_key: newKey });
      }
    }
    const keys = await getMachineApiKeys(owner_username);
    const nextKeys = keys.map((key) => key === oldKey ? newKey : key);
    if (!nextKeys.includes(newKey)) nextKeys.push(newKey);
    const saved = await saveMachineApiKeys(nextKeys, owner_username);
    return success(res, { keys: saved }, 'Da sua key API');
  } catch (err) { next(err); }
};

const deleteConfigKey = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const configKey = normalizeKey(req.params.config_key);
    if (!configKey || INTERNAL_KEYS.has(configKey)) return error(res, 'Key API khong hop le', 400);
    const deleted = await MachineApiConfig.destroy({ where: { owner_username, config_key: configKey } });
    const keys = await getMachineApiKeys(owner_username);
    const saved = await saveMachineApiKeys(keys.filter((key) => key !== configKey), owner_username);
    return success(res, { keys: saved, deleted }, 'Da xoa key API');
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
    const deviceRows = rows.filter((row) => row.device_id === device_id);
    const overrides = rowToMap(deviceRows);
    const configuredKeys = await getMachineApiKeys(owner_username);
    const keys = [...new Set([...configuredKeys, ...Object.keys(common), ...Object.keys(overrides)])];
    const configs = keys.reduce((acc, key) => {
      acc[key] = overrides[key] ?? common[key] ?? '';
      return acc;
    }, {});
    const facebookNurture = await getFacebookNurtureSettings(owner_username);
    const activeNurture = facebookNurture.scenarios.find(
      (scenario) => scenario.id === facebookNurture.active_scenario_id
    );
    if (activeNurture && Object.values(activeNurture.actions).some((action) => action.enabled)) {
      configs.FACEBOOK_NURTURE = {
        active_scenario_id: activeNurture.id,
        cooldown_hours: facebookNurture.cooldown_hours,
        scenario: activeNurture,
      };
    }
    const instagramNurture = await getInstagramNurtureSettings(owner_username);
    const activeInstagramNurture = instagramNurture.scenarios.find(
      (scenario) => scenario.id === instagramNurture.active_scenario_id
    );
    if (activeInstagramNurture && Object.values(activeInstagramNurture.actions).some((action) => action.enabled)) {
      configs.INSTAGRAM_NURTURE = {
        active_scenario_id: activeInstagramNurture.id,
        cooldown_hours: instagramNurture.cooldown_hours,
        scenario: activeInstagramNurture,
      };
    }

    if (!Object.values(configs).some((value) => (
      typeof value === 'object' ? value !== null : String(value || '').trim()
    ))) {
      return res.json({ status: false, value: {}, message: 'May chua duoc config' });
    }

    return res.json({ status: true, value: configs });
  } catch (err) { next(err); }
};

const getRandomNurtureScenario = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = normalizeDeviceId(req.params.device_id || req.query.device_id);
    if (!device_id) return error(res, 'Thieu device_id', 400);

    const facebookNurture = await getFacebookNurtureSettings(owner_username);
    const eligibleScenarios = facebookNurture.scenarios.filter(
      (scenario) => Object.values(scenario.actions).some((action) => action.enabled)
    );
    if (!eligibleScenarios.length) {
      return res.json({ status: false, value: {}, message: 'Chua co kich ban Facebook nao duoc bat' });
    }

    const result = await sequelize.transaction(async (transaction) => {
      const assignments = await FacebookNurtureAssignment.findAll({
        where: { owner_username },
        order: [['id', 'ASC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const current = assignments.find((row) => row.device_id === device_id) || null;
      const eligibleIds = new Set(eligibleScenarios.map((scenario) => scenario.id));
      const counts = new Map(eligibleScenarios.map((scenario) => [scenario.id, 0]));
      assignments.forEach((row) => {
        if (eligibleIds.has(row.scenario_id)) {
          counts.set(row.scenario_id, (counts.get(row.scenario_id) || 0) + 1);
        }
      });

      let candidates = eligibleScenarios;
      if (eligibleScenarios.length > 1 && current && eligibleIds.has(current.scenario_id)) {
        candidates = eligibleScenarios.filter((scenario) => scenario.id !== current.scenario_id);
      }
      const minimumUsage = Math.min(...candidates.map((scenario) => counts.get(scenario.id) || 0));
      const balancedCandidates = candidates.filter(
        (scenario) => (counts.get(scenario.id) || 0) === minimumUsage
      );
      const scenario = balancedCandidates[Math.floor(Math.random() * balancedCandidates.length)];
      const previousScenarioId = current?.scenario_id || null;
      const assignedDevices = (counts.get(scenario.id) || 0)
        + (previousScenarioId === scenario.id ? 0 : 1);

      if (current) {
        await current.update({ scenario_id: scenario.id }, { transaction });
      } else {
        await FacebookNurtureAssignment.create({
          owner_username,
          device_id,
          scenario_id: scenario.id,
        }, { transaction });
      }

      return {
        scenario,
        previous_scenario_id: previousScenarioId,
        assigned_devices: assignedDevices,
      };
    });

    return res.json({
      status: true,
      value: {
        device_id,
        scenario: result.scenario,
        previous_scenario_id: result.previous_scenario_id,
        assigned_devices: result.assigned_devices,
        available_scenarios: eligibleScenarios.length,
        cooldown_hours: facebookNurture.cooldown_hours,
      },
    });
  } catch (err) { next(err); }
};

const getRandomInstagramNurtureScenario = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = normalizeDeviceId(req.params.device_id || req.query.device_id);
    if (!device_id) return error(res, 'Thieu device_id', 400);
    const settings = await getInstagramNurtureSettings(owner_username);
    const scenarios = settings.scenarios.filter((scenario) => Object.values(scenario.actions || {}).some((action) => action.enabled));
    if (!scenarios.length) return res.json({ status: false, value: {}, message: 'Chua co kich ban Instagram nao duoc bat' });
    const result = await sequelize.transaction(async (transaction) => {
      const assignments = await InstagramNurtureAssignment.findAll({ where: { owner_username }, order: [['id','ASC']], transaction, lock: transaction.LOCK.UPDATE });
      const current = assignments.find((row) => row.device_id === device_id) || null;
      const eligibleIds = new Set(scenarios.map((scenario) => scenario.id));
      const counts = new Map(scenarios.map((scenario) => [scenario.id, 0]));
      assignments.forEach((row) => { if (eligibleIds.has(row.scenario_id)) counts.set(row.scenario_id, (counts.get(row.scenario_id) || 0) + 1); });
      let candidates = scenarios;
      if (scenarios.length > 1 && current && eligibleIds.has(current.scenario_id)) candidates = scenarios.filter((scenario) => scenario.id !== current.scenario_id);
      const minimumUsage = Math.min(...candidates.map((scenario) => counts.get(scenario.id) || 0));
      const balanced = candidates.filter((scenario) => (counts.get(scenario.id) || 0) === minimumUsage);
      const scenario = balanced[Math.floor(Math.random() * balanced.length)];
      const previous_scenario_id = current?.scenario_id || null;
      if (current) await current.update({ scenario_id: scenario.id }, { transaction });
      else await InstagramNurtureAssignment.create({ owner_username, device_id, scenario_id: scenario.id }, { transaction });
      return { scenario, previous_scenario_id, assigned_devices: (counts.get(scenario.id) || 0) + (previous_scenario_id === scenario.id ? 0 : 1) };
    });
    return res.json({ status: true, value: { device_id, ...result, available_scenarios: scenarios.length, cooldown_hours: settings.cooldown_hours } });
  } catch (err) { next(err); }
};
module.exports = {
  COMMON_DEVICE_ID,
  DEFAULT_KEYS,
  listConfigs,
  saveConfigs,
  bulkCreateMachines,
  deleteMachine,
  bulkDeleteMachines,
  addConfigKey,
  renameConfigKey,
  deleteConfigKey,
  getForDevice,
  getRandomNurtureScenario,
  getRandomInstagramNurtureScenario,
};

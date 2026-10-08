const sequelize=require('../config/database');
const {clearDeviceWarning}=require('../services/deviceMonitoringService');
const DashboardDevice = require('../models/DashboardDevice');
const {ensureDevice,hasOwnedDevice}=require('../services/deviceRegistrationService');
const DeviceTaskRun = require('../models/DeviceTaskRun');
const DeviceTaskCapability = require('../models/DeviceTaskCapability');
const { success, error } = require('../utils/response');
const { ownerFromRequest, ownerFromAdmin } = require('../utils/owner');
const { getInstagramJobSettings } = require('../services/settingsService');
const { getNextTask } = require('../services/taskDispatcherService');
const { reportTask } = require('../services/taskReportService');
const { TASK_TYPES } = require('../services/deviceTaskTypes');
const { Op } = require('sequelize');

const text = (value, max = 255) => {
  const normalized = String(value ?? '').trim();
  return normalized && normalized.toLowerCase() !== 'null' ? normalized.slice(0, max) : null;
};

const heartbeat = async (req, res, next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = text(req.body.device_id || req.body.device || req.body.phone || req.body.may);
    if (!device_id) return error(res, 'Can truyen device_id', 400);
    const taskId=req.body.task_id==null?null:Number(req.body.task_id);
    if(taskId!==null){
      const id=taskId;
      if(!Number.isSafeInteger(id)||id<=0)return error(res,'task_id khong hop le',400);
      const valid=await DeviceTaskRun.findOne({where:{id,owner_username,device_id,locked_by:device_id,status:{[Op.in]:['RUNNING','REPORTING']}}});
      if(!valid)return error(res,'task_id khong thuoc device hoac da ket thuc',409);
    }
    await ensureDevice(owner_username,device_id);
    const row = await sequelize.transaction(async transaction=>{
      const row=await DashboardDevice.findOne({where:{owner_username,device_id},transaction,lock:transaction.LOCK.UPDATE});
      const activeTask = Number.isInteger(taskId)
        ? await DeviceTaskRun.findOne({
          where: {
            id: taskId,
            owner_username,
            device_id,
            locked_by: device_id,
            status: { [Op.in]: ['RUNNING', 'REPORTING'] },
          }, transaction,
        })
        : await DeviceTaskRun.findOne({where:{owner_username,device_id,status:{[Op.in]:['RUNNING','REPORTING']}},order:[['id','DESC']],transaction});
      if (Number.isInteger(taskId) && !activeTask) throw Object.assign(new Error('task_id khong thuoc device hoac da ket thuc'),{statusCode:409});
      const current_task = activeTask?.task_type || text(req.body.current_task || req.body.task, 100);
      const current_uid = activeTask?.uid || activeTask?.username || text(req.body.current_uid || req.body.uid || req.body.username);
      const requestedStatus = String(req.body.status || '').trim().toUpperCase();
      const reported_status = activeTask ? 'RUNNING'
        : ['IDLE','ONLINE'].includes(requestedStatus) ? requestedStatus
        : current_task || current_uid || requestedStatus === 'RUNNING' ? 'RUNNING' : 'IDLE';
      const now = new Date();
      const existing = row;
      const started_at = activeTask?.locked_at || (reported_status === 'RUNNING'
        ? existing?.reported_status === 'RUNNING' && existing.current_task === current_task && existing.current_uid === current_uid
          ? existing.started_at || now
          : now
        : null);
      const payload = {
        owner_username,
        device_id,
        device_name: text(req.body.device_name || req.body.name) || existing?.device_name || device_id,
        current_task,
        current_uid,
        reported_status,
        started_at,
        last_seen: now,
        last_error: text(req.body.error || req.body.last_error, 1000),
      };
      await row.update(payload,{transaction});

      await clearDeviceWarning(owner_username,device_id,transaction);
      return row;
    });
    return success(res, { device: row.toJSON() }, 'Da cap nhat heartbeat');
  } catch (err) {
    next(err);
  }
};

const nextTask = async (req, res) => {
  try {
    const owner = ownerFromRequest(req);
    const deviceId = text(req.body.device_id || req.body.device || req.body.phone || req.body.may);
    if (!deviceId) return res.status(400).json({ success: false, code: -1, message: 'Can truyen device_id' });
    const result = await getNextTask({
      owner,
      deviceId,
      requestedCapabilities: req.body.capabilities,
      req,
    });
    if (!result.task) {
      return res.json({ success: true, code: 0, has_task: false, task: null, message: 'Khong co task phu hop' });
    }
    if (result.task.type === 'INSTAGRAM_JOB') result.task.job_settings = await getInstagramJobSettings(owner);
    return res.json({ success: true, code: 1, has_task: true, task: result.task });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, code: -1, message: err.message || 'Loi Task Dispatcher' });
  }
};

const reportDeviceTask = async (req, res) => {
  try {
    const owner = ownerFromRequest(req);
    const deviceId = text(req.body.device_id || req.body.device || req.body.phone || req.body.may);
    const rawTaskId = req.body.task_id ?? req.body.id;
    const taskId = typeof rawTaskId === 'number' || typeof rawTaskId === 'string' && /^\d+$/.test(rawTaskId) ? Number(rawTaskId) : NaN;
    const status = req.body.status === undefined ? 'SUCCESS' : String(req.body.status || '').trim().toUpperCase();
    if (!Number.isSafeInteger(taskId) || taskId <= 0) return res.status(400).json({ success: false, code: -1, message: 'task_id khong hop le' });
    if (!['SUCCESS', 'FAILED', 'DONE', 'DA_XONG'].includes(status)) {
      return res.status(400).json({ success: false, code: -1, message: 'status chi nhan SUCCESS hoac FAILED' });
    }
    const reported = await reportTask({
      owner,
      deviceId,
      taskId,
      status,
      errorCode: req.body.error_code,
      message: text(req.body.message, 1000),
      req,
    });
    return res.json({
      success: true,
      code: 1,
      task: {
        id: Number(reported.run.id),
        type: reported.run.task_type,
        status: reported.run.status,
        retry_count: Number(reported.run.retry_count) || 0,
      },
      already_reported: reported.already_reported,
      retryable: reported.retryable === true,
      data: reported.legacy,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, code: -1, message: err.message || 'Loi bao cao task' });
  }
};

const getCapabilities = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const registry=require('../services/taskRegistryService').createRegistryService(require('../config/database'));
    const supportedTasks=await registry.activated() ? (await registry.list(owner_username)).map(task=>task.task_key) : TASK_TYPES;
    const device_id = text(req.params.device_id);
    if (!device_id) return error(res, 'device_id khong hop le', 400);
    if(!await hasOwnedDevice(owner_username,device_id))return error(res,'Device not found',404);
    const rows = await DeviceTaskCapability.findAll({
      where: { owner_username, device_id },
      order: [['task_type', 'ASC']],
      raw: true,
    });
    const configured = new Map(rows.map((row) => [row.task_type, row.enabled === true || row.enabled === 1]));
    return success(res, {
      device_id,
      capabilities: supportedTasks.map((task_type) => ({
        task_type,
        enabled: configured.has(task_type) ? configured.get(task_type) : true,
        configured: configured.has(task_type),
      })),
    }, 'Lay capability cua device thanh cong');
  } catch (err) { next(err); }
};

const updateCapabilities = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const registry=require('../services/taskRegistryService').createRegistryService(require('../config/database'));
    const supportedTasks=await registry.activated() ? (await registry.list(owner_username)).map(task=>task.task_key) : TASK_TYPES;
    const device_id = text(req.params.device_id);
    if (!device_id) return error(res, 'device_id khong hop le', 400);
    if(!await hasOwnedDevice(owner_username,device_id))return error(res,'Device not found',404);
    const source = Array.isArray(req.body.capabilities) ? req.body.capabilities : [];
    const enabledSet = new Set(source.map((item) => {
      if (typeof item === 'string') return item.trim().toUpperCase();
      return item?.enabled === false ? null : String(item?.task_type || '').trim().toUpperCase();
    }).filter((type) => supportedTasks.includes(type)));
    await DeviceTaskCapability.sequelize.transaction(async (transaction) => {
      await DeviceTaskCapability.destroy({ where: { owner_username, device_id }, transaction });
      await DeviceTaskCapability.bulkCreate(supportedTasks.map((task_type) => ({
        owner_username,
        device_id,
        task_type,
        enabled: enabledSet.has(task_type),
      })), { transaction });
    });
    return success(res, {
      device_id,
      capabilities: supportedTasks.map((task_type) => ({ task_type, enabled: enabledSet.has(task_type) })),
    }, 'Da luu capability cua device');
  } catch (err) { next(err); }
};

module.exports = { heartbeat, nextTask, reportDeviceTask, getCapabilities, updateCapabilities };

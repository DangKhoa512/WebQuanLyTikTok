const { Op } = require('sequelize');
const sequelize = require('../config/database');
const InstagramAccount = require('../models/InstagramAccount');
const AccountGroup = require('../models/AccountGroup');
const { success, error } = require('../utils/response');
const { ownerFromAdmin, ownerFromRequest } = require('../utils/owner');
const { INSTAGRAM_JOB_WEBS, normalizeInstagramJobWeb, addInstagramDailyJobs } = require('../services/instagramJobStatService');
const { getInstagramLoginLimitSettings, getFacebookCheckProxySettings } = require('../services/settingsService');
const { batchCheckInstagram } = require('../utils/instagramCheckLiveUtils');

const STATUSES = ['CHO_LOGIN','DANG_LOGIN','DANG_LAM','LOGIN_THANH_CONG','LOGIN_FAIL','DA_CHAY_XONG','ACCOUNT_DIE'];
const FINAL_STATUSES = ['LOGIN_FAIL','DA_CHAY_XONG','ACCOUNT_DIE'];
const MAX_LOGIN_GET_COUNT = 3;
const LOCK_TIMEOUT_MIN = parseInt(process.env.INSTAGRAM_LOCK_TIMEOUT_MIN, 10) || 120;
const nullify = (value) => {
  const text = String(value ?? '').trim();
  return !text || text.toLowerCase() === 'null' ? null : text;
};
const normalizeKind = (value, fallback = 'job') => ['reg','job'].includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : fallback;
const normalizeStatus = (value, fallback = 'CHO_LOGIN') => {
  const status = String(value || fallback).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (['DIE','ACC_DIE'].includes(status)) return 'ACCOUNT_DIE';
  return STATUSES.includes(status) ? status : fallback;
};
const groupType = (kind) => kind === 'reg' ? 'instagram_reg' : 'instagram_job';
const looksLikeTwoFa = (value) => /^[A-Z2-7]{8,80}$/i.test(String(value || '').replace(/\s+/g, ''));
const looksLikeCookies = (value) => /(^|[;\s])(sessionid|ds_user_id|csrftoken|mid|ig_did|rur)=/i.test(String(value || ''));
const parseLine = (line) => {
  const parts = String(line || '').split('|').map((part) => nullify(part));
  const uid = parts[0];
  if (!uid) return null;
  const parsed = { raw_data: String(line).trim(), uid, password: parts[1], two_fa: null, cookies: null };
  for (const value of parts.slice(2).filter(Boolean)) {
    if (!parsed.cookies && looksLikeCookies(value)) parsed.cookies = value;
    else if (!parsed.two_fa && looksLikeTwoFa(value)) parsed.two_fa = value.replace(/\s+/g, '');
    else if (!parsed.cookies && /[=;]/.test(value)) parsed.cookies = value;
  }
  return parsed;
};
const format = (account) => [account.uid, account.password, account.two_fa, account.cookies].map((v) => v == null || v === '' ? 'null' : String(v)).join('|');
const serialize = (account) => {
  const data = account.toJSON ? account.toJSON() : { ...account };
  data.raw_data = format(data);
  data.full_data = data.raw_data;
  return data;
};
const resolveGroup = async ({ owner_username, kind, group_id, group_name }) => {
  const id = parseInt(group_id, 10);
  if (id > 0) {
    const group = await AccountGroup.findOne({ where: { id, owner_username, account_type: groupType(kind) } });
    return group?.id || null;
  }
  const name = nullify(group_name);
  if (!name) return null;
  const [group] = await AccountGroup.findOrCreate({ where: { owner_username, account_type: groupType(kind), name }, defaults: { owner_username, account_type: groupType(kind), name } });
  return group.id;
};
const syncRegToJob = async (source) => {
  const data = serialize(source);
  const defaults = { raw_data: data.raw_data, uid: data.uid, password: data.password, two_fa: data.two_fa, cookies: data.cookies, owner_username: data.owner_username, kind: 'job', group_id: null, device_id: data.device_id, status: 'LOGIN_THANH_CONG', live_status: data.live_status || 'unknown', login_at: new Date() };
  const [account, created] = await InstagramAccount.unscoped().findOrCreate({ where: { owner_username: data.owner_username, kind: 'job', uid: data.uid }, defaults });
  if (!created) {
    await account.update({ raw_data: data.raw_data, password: data.password, two_fa: data.two_fa, cookies: data.cookies, device_id: data.device_id || account.device_id, ...(account.status === 'CHO_LOGIN' ? { status: 'LOGIN_THANH_CONG', login_at: new Date() } : {}) });
  }
  return { account, created };
};
const importRows = async ({ text, owner_username, kind, status, group_id, device_id }) => {
  const lines = String(text || '').split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  const result = { total: lines.length, created: 0, updated: 0, invalid: 0, job_created: 0, job_updated: 0 };
  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) { result.invalid += 1; continue; }
    const defaults = { ...parsed, owner_username, kind, status, group_id };
    if (device_id) defaults.device_id = device_id;
    if (kind === 'reg') defaults.login_at = new Date();
    const [account, created] = await InstagramAccount.unscoped().findOrCreate({ where: { owner_username, kind, uid: parsed.uid }, defaults });
    if (created) result.created += 1;
    else {
      await account.update({ raw_data: parsed.raw_data, uid: parsed.uid, password: parsed.password ?? account.password, ...(parsed.two_fa ? { two_fa: parsed.two_fa } : {}), ...(parsed.cookies ? { cookies: parsed.cookies } : {}), status, group_id: group_id ?? account.group_id, ...(device_id ? { device_id } : {}), ...(kind === 'reg' ? { login_at: new Date() } : {}) });
      result.updated += 1;
    }
    if (kind === 'reg' && status === 'LOGIN_THANH_CONG') {
      const synced = await syncRegToJob(account);
      if (synced.created) result.job_created += 1; else result.job_updated += 1;
    }
  }
  return result;
};

const list = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const kind = normalizeKind(req.query.kind);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 2000);
    const where = { owner_username, kind };
    const status = normalizeStatus(req.query.status, '');
    const groupId = parseInt(req.query.group_id, 10); if (groupId > 0) where.group_id = groupId;
    const deviceId = nullify(req.query.device_id); if (deviceId) where.device_id = deviceId;
    const q = nullify(req.query.q);
    if (q) where[Op.or] = [{ uid: { [Op.like]: '%' + q + '%' } }, { device_id: { [Op.like]: '%' + q + '%' } }, { locked_by: { [Op.like]: '%' + q + '%' } }];
    const live = nullify(req.query.live_status); if (['unknown','live','die'].includes(live)) where.live_status = live;
    const dateFrom = nullify(req.query.date_from), dateTo = nullify(req.query.date_to);
    if (dateFrom || dateTo) {
      const dateField = status === 'DA_CHAY_XONG' ? 'completed_at' : 'created_at';
      where[dateField] = {};
      if (dateFrom) where[dateField][Op.gte] = new Date(dateFrom);
      if (dateTo) where[dateField][Op.lte] = new Date(dateTo + 'T23:59:59');
    }
    const countWhere = { ...where };
    if (status) where.status = status;
    const sortBy = ['device_id','updated_at','created_at','post_count','followers','following','last_live_check_at'].includes(req.query.sort_by) ? req.query.sort_by : null;
    const direction = String(req.query.sort_order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    let order = [['updated_at','DESC'],['id','DESC']];
    if (sortBy === 'device_id') order = [[sequelize.literal("CASE WHEN device_id IS NULL OR device_id='' THEN 1 ELSE 0 END"),'ASC'],[sequelize.fn('CHAR_LENGTH',sequelize.col('device_id')),direction],['device_id',direction],['id','DESC']];
    else if (sortBy) order = [[sortBy,direction],['id','DESC']];
    const [{ rows, count }, counts, trash_count] = await Promise.all([
      InstagramAccount.findAndCountAll({ where, order, limit, offset: (page - 1) * limit }),
      InstagramAccount.findAll({ attributes: ['status',[sequelize.fn('COUNT',sequelize.col('id')),'count']], where: countWhere, group: ['status'], raw: true }),
      kind === 'job' ? InstagramAccount.unscoped().count({ where: { owner_username, kind: 'job', trashed_at: { [Op.ne]: null } } }) : 0,
    ]);
    let machine_stats = [];
    if (kind === 'job') {
      const machineRows = await InstagramAccount.findAll({ attributes: ['device_id',[sequelize.fn('COUNT',sequelize.col('id')),'total'],[sequelize.fn('SUM',sequelize.literal("CASE WHEN status='CHO_LOGIN' THEN 1 ELSE 0 END")),'waiting_login'],[sequelize.fn('SUM',sequelize.literal("CASE WHEN status='DANG_LOGIN' THEN 1 ELSE 0 END")),'logging_in'],[sequelize.fn('SUM',sequelize.literal("CASE WHEN status='LOGIN_THANH_CONG' THEN 1 ELSE 0 END")),'login_success'],[sequelize.fn('SUM',sequelize.literal("CASE WHEN status='DANG_LAM' THEN 1 ELSE 0 END")),'working'],[sequelize.fn('SUM',sequelize.literal("CASE WHEN status='DA_CHAY_XONG' THEN 1 ELSE 0 END")),'done'],[sequelize.fn('SUM',sequelize.literal("CASE WHEN status IN ('LOGIN_FAIL','ACCOUNT_DIE') THEN 1 ELSE 0 END")),'failed'],[sequelize.fn('MAX',sequelize.col('updated_at')),'last_updated_at']], where: { owner_username, kind: 'job' }, group: ['device_id'], raw: true });
      machine_stats = machineRows.filter((row) => nullify(row.device_id)).map((row) => ({ ...row, total: Number(row.total)||0, waiting_login:Number(row.waiting_login)||0, logging_in:Number(row.logging_in)||0, login_success:Number(row.login_success)||0, working:Number(row.working)||0, done:Number(row.done)||0, failed:Number(row.failed)||0, pages:0 })).sort((a,b)=>String(a.device_id).localeCompare(String(b.device_id),'vi',{numeric:true}));
    }
    return success(res, { accounts: rows.map(serialize), status_counts: Object.fromEntries(counts.map((row)=>[row.status,Number(row.count)||0])), machine_stats, trash_count, pagination:{page,limit,total:count,totalPages:Math.ceil(count/limit)||1} }, 'Lay danh sach Instagram thanh cong');
  } catch (err) { next(err); }
};

const importDashboard = async (req,res,next) => { try { const owner_username=ownerFromAdmin(req); const kind=normalizeKind(req.body.kind); const status=normalizeStatus(req.body.status,kind==='job'?'CHO_LOGIN':'LOGIN_THANH_CONG'); const group_id=await resolveGroup({owner_username,kind,...req.body}); return success(res,await importRows({text:req.body.text,owner_username,kind,status,group_id}),'Import Instagram thanh cong'); } catch(err){next(err);} };
const importApi = async (req,res,next) => { try { const owner_username=ownerFromRequest(req); const kind=normalizeKind(req.body.kind||req.query.kind,'reg'); const status=normalizeStatus(req.body.status||req.query.status,kind==='job'?'CHO_LOGIN':'LOGIN_THANH_CONG'); const device_id=nullify(req.body.device_id||req.body.device||req.body.phone||req.body.may||req.query.device_id||req.query.device||req.query.phone||req.query.may); const group_id=await resolveGroup({owner_username,kind,...req.body,...req.query}); return success(res,await importRows({text:req.body.text||req.body.data||req.body.accounts||req.body.account,owner_username,kind,status,group_id,device_id}),'Nhan account Instagram thanh cong'); } catch(err){next(err);} };

const releaseStaleInstagramLocks = async ({ owner_username, status, releaseStatus, failReason = null }) => {
  const update = { status: releaseStatus, locked_by: null, locked_at: null };
  if (releaseStatus === 'LOGIN_THANH_CONG') update.completed_at = null;
  if (FINAL_STATUSES.includes(releaseStatus)) update.completed_at = new Date();
  if (failReason) update.fail_reason = failReason;
  await InstagramAccount.update(update, { where: { owner_username, kind: 'job', status, locked_at: { [Op.lt]: new Date(Date.now() - LOCK_TIMEOUT_MIN * 60 * 1000) } } });
};

const deviceAccountWhere = (owner_username, device_id) => ({
  owner_username,
  kind: 'job',
  [Op.or]: [{ device_id }, { locked_by: device_id }],
});
const countDeviceInstagramActive = async ({ owner_username, device_id, transaction = null }) => InstagramAccount.count({
  where: {
    ...deviceAccountWhere(owner_username, device_id),
    status: { [Op.in]: ['DANG_LOGIN','LOGIN_THANH_CONG','DANG_LAM','DA_CHAY_XONG'] },
    [Op.and]: [
      { [Op.or]: [{ device_id }, { locked_by: device_id }] },
      { [Op.or]: [{ live_status: { [Op.ne]: 'die' } }, { live_status: null }] },
    ],
  },
  transaction,
});
const getDeviceAccountSummary = async ({ owner_username, device_id }) => {
  const rows = await InstagramAccount.findAll({
    attributes: ['status',[sequelize.fn('COUNT',sequelize.col('id')),'count']],
    where: deviceAccountWhere(owner_username, device_id),
    group: ['status'],
    raw: true,
  });
  const status_counts = Object.fromEntries(rows.map((row)=>[row.status,Number(row.count)||0]));
  const total = Object.values(status_counts).reduce((sum,value)=>sum+value,0);
  const used = await countDeviceInstagramActive({ owner_username, device_id });
  const settings = await getInstagramLoginLimitSettings(owner_username);
  return { device_id, total, used, limit: settings.limit, remaining: Math.max(settings.limit-used,0), full: used>=settings.limit, status_counts };
};

const getAccount = async (req,res,next) => {
  try {
    const owner_username=ownerFromRequest(req);
    const device_id=nullify(req.body.device_id||req.body.device||req.body.phone||req.body.may||req.query.device_id||req.query.device||req.query.phone||req.query.may);
    if(!device_id)return error(res,'Can truyen device_id',400);
    await releaseStaleInstagramLocks({ owner_username, status: 'DANG_LOGIN', releaseStatus: 'LOGIN_FAIL', failReason: 'Qua thoi gian lock login nhung may chua bao cao' });
    const claimResult=await sequelize.transaction(async(t)=>{
      let active=await InstagramAccount.findOne({where:{owner_username,kind:'job',status:'DANG_LOGIN',locked_by:device_id},transaction:t,lock:t.LOCK.UPDATE});
      let auto_failed_account=null;
      if(active){
        const count=(Number(active.login_get_count)||1)+1;
        if(count<=MAX_LOGIN_GET_COUNT){await active.update({login_get_count:count,locked_at:new Date()},{transaction:t});const loginLimit=await getInstagramLoginLimitSettings(owner_username);const used=await countDeviceInstagramActive({owner_username,device_id,transaction:t});return {account:active,limit:loginLimit.limit,used};}
        await active.update({status:'LOGIN_FAIL',login_get_count:count,locked_by:null,locked_at:null,completed_at:new Date(),fail_reason:'May get qua 3 lan chua bao cao'},{transaction:t});
        auto_failed_account={id:active.id,uid:active.uid,device_id,login_get_count:count};
      }
      const loginLimit=await getInstagramLoginLimitSettings(owner_username);
      const used=await countDeviceInstagramActive({owner_username,device_id,transaction:t});
      if(used>=loginLimit.limit)return {full:true,limit:loginLimit.limit,used,auto_failed_account};
      const nextAccount=await InstagramAccount.findOne({where:{owner_username,kind:'job',status:'CHO_LOGIN'},order:[['id','ASC']],transaction:t,lock:t.LOCK.UPDATE,skipLocked:true});
      if(!nextAccount)return {account:null,limit:loginLimit.limit,used,auto_failed_account};
      await nextAccount.update({status:'DANG_LOGIN',device_id,locked_by:device_id,locked_at:new Date(),login_get_count:1,completed_at:null,fail_reason:null},{transaction:t});
      return {account:nextAccount,limit:loginLimit.limit,used:used+1,auto_failed_account};
    });
    if(claimResult.full)return success(res,{account:null,limit:claimResult.limit,used:claimResult.used,remaining:0,full:true,auto_failed_account:claimResult.auto_failed_account||null},'Full limit');
    return success(res,{account:claimResult.account?serialize(claimResult.account):null,limit:claimResult.limit,used:claimResult.used,remaining:Math.max((claimResult.limit||0)-(claimResult.used||0),0),full:false,auto_failed_account:claimResult.auto_failed_account||null,max_login_get_count:MAX_LOGIN_GET_COUNT,lock_timeout_min:LOCK_TIMEOUT_MIN},claimResult.account?'Lay account Instagram thanh cong':'Het account Instagram cho login');
  } catch(err){next(err);}
};
const checkDeviceAccountCount = async(req,res,next)=>{
  try{
    const owner_username=ownerFromRequest(req);
    const device_id=nullify(req.body.device_id||req.body.device||req.body.phone||req.body.may||req.query.device_id||req.query.device||req.query.phone||req.query.may);
    if(!device_id)return error(res,'Can truyen device_id',400);
    return success(res,await getDeviceAccountSummary({owner_username,device_id}),'Lay so luong account Instagram cua may thanh cong');
  }catch(err){next(err);}
};
const getLoginSuccess = async(req,res,next)=>{try{const owner_username=ownerFromRequest(req);const device_id=nullify(req.body.device_id||req.body.device||req.body.phone||req.body.may||req.query.device_id||req.query.device||req.query.phone||req.query.may);if(!device_id)return error(res,'Can truyen device_id',400);await releaseStaleInstagramLocks({owner_username,status:'DANG_LAM',releaseStatus:'LOGIN_THANH_CONG'});const account=await sequelize.transaction(async(t)=>{let row=await InstagramAccount.findOne({where:{owner_username,kind:'job',status:'DANG_LAM',locked_by:device_id},transaction:t,lock:t.LOCK.UPDATE});if(row)return row;row=await InstagramAccount.findOne({where:{owner_username,kind:'job',status:'LOGIN_THANH_CONG',device_id},order:[['login_at','ASC'],['id','ASC']],transaction:t,lock:t.LOCK.UPDATE,skipLocked:true});if(row)await row.update({status:'DANG_LAM',locked_by:device_id,locked_at:new Date()},{transaction:t});return row;});return success(res,{account:account?serialize(account):null,lock_timeout_min:LOCK_TIMEOUT_MIN},account?'Lay Instagram Job thanh cong':'Het Instagram Job');}catch(err){next(err);}};
const report = async(req,res,next)=>{try{const owner_username=ownerFromRequest(req);const uid=nullify(req.body.uid||req.query.uid||req.body.username);const device_id=nullify(req.body.device_id||req.body.device||req.body.phone||req.body.may||req.query.device_id||req.query.device||req.query.phone||req.query.may);if(!uid)return error(res,'Can truyen tai khoan',400);if(!device_id)return error(res,'Can truyen device_id',400);const account=await InstagramAccount.findOne({where:{owner_username,kind:'job',uid,...(device_id?{[Op.or]:[{locked_by:device_id},{device_id}]}:{})},order:[['id','DESC']]});if(!account)return error(res,'Khong tim thay Instagram',404);const status=normalizeStatus(req.body.status||req.query.status,'LOGIN_THANH_CONG');if(account.locked_by&&device_id&&account.locked_by!==device_id)return error(res,'Account dang lock boi '+account.locked_by,409);const update={status};if(device_id)update.device_id=device_id;if(status==='LOGIN_THANH_CONG'){update.login_at=new Date();update.locked_by=null;update.locked_at=null;update.login_get_count=0;}else if(status==='DANG_LAM'){update.locked_by=device_id||account.device_id;update.locked_at=new Date();}else if(FINAL_STATUSES.includes(status)){update.locked_by=null;update.locked_at=null;update.completed_at=new Date();}if(status==='ACCOUNT_DIE')update.live_status='die';await account.update(update);return success(res,{account:serialize(account)},'Bao cao Instagram thanh cong');}catch(err){next(err);}};

const vietnamToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addInstagramJobCount = async (req,res,next) => {
  try {
    const owner_username = ownerFromRequest(req);
    const device_id = nullify(req.body.device_id||req.body.device||req.body.phone||req.body.may||req.query.device_id||req.query.device||req.query.phone||req.query.may);
    const web = normalizeInstagramJobWeb(req.body.web||req.body.label||req.body.nhan||req.query.web||req.query.label||req.query.nhan);
    const rawCount = req.body.jobs ?? req.body.job_count ?? req.body.count ?? req.body.so_luong ?? req.query.jobs ?? req.query.job_count ?? req.query.count;
    const rawXu = req.body.xu ?? req.body.xu_count ?? req.body.coins ?? req.query.xu ?? req.query.xu_count ?? req.query.coins;
    const xu = rawXu === undefined || rawXu === null || rawXu === '' ? 0 : parseInt(rawXu,10);
    const jobs = rawCount === undefined || rawCount === null || rawCount === '' ? (xu > 0 ? 0 : 1) : parseInt(rawCount,10);
    if(!device_id)return error(res,'Can truyen device_id',400);
    if(!web)return error(res,'Nhan web khong hop le. Dung: '+INSTAGRAM_JOB_WEBS.join(', '),400);
    if(!Number.isInteger(jobs)||jobs<0)return error(res,'jobs phai la so nguyen >= 0',400);
    if(!Number.isInteger(xu)||xu<0)return error(res,'xu phai la so nguyen >= 0',400);
    if(jobs===0&&xu===0)return error(res,'Can truyen jobs hoac xu lon hon 0',400);
    const stat_date=vietnamToday();
    await addInstagramDailyJobs({owner_username,device_id,stat_date,web,jobs,xu});
    return success(res,{device_id,web,added_jobs:jobs,added_xu:xu,stat_date},'Da ghi them job/xu Instagram '+web);
  } catch(err){next(err);}
};
const idsFrom = (req) => Array.isArray(req.body.ids)?[...new Set(req.body.ids.map(Number).filter((id)=>id>0))]:[];
const checkLive = async (req, res, next) => {
  try {
    const owner_username = ownerFromAdmin(req);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((id) => parseInt(id, 10)).filter(Boolean) : [];
    const where = { owner_username };
    if (ids.length) where.id = { [Op.in]: ids };
    const kind = normalizeKind(req.body.kind || req.query.kind, '');
    if (kind) where.kind = kind;
    const accounts = await InstagramAccount.findAll({
      where,
      order: [['id', 'ASC']],
      limit: ids.length ? undefined : 500,
    });

    const savedSettings = await getFacebookCheckProxySettings(owner_username);
    const requestProxies = Array.isArray(req.body.proxies) ? req.body.proxies.map((item) => String(item || '').trim()).filter(Boolean) : [];
    const proxies = requestProxies.length ? requestProxies : (savedSettings.proxies || []);
    const concurrency = Math.min(Math.max(parseInt(req.body.concurrency, 10) || savedSettings.concurrency || 20, 1), 40);
    const delayMs = Math.min(Math.max(parseInt(req.body.delay_ms, 10) || 0, 0), 10_000);
    const checked = await batchCheckInstagram(accounts, proxies, concurrency, delayMs);
    const live = checked.results.filter((row) => row.result === 'live').length;
    const die = checked.results.filter((row) => row.result === 'die').length;
    const unknown = checked.results.length - live - die;
    return success(res, {
      live,
      die,
      unknown,
      concurrency: checked.concurrency,
      proxy_count: checked.proxy_count,
      results: checked.results,
    }, 'Check live Instagram thanh cong');
  } catch (err) {
    next(err);
  }
};
const bulkGet=async(req,res,next)=>{try{const ids=idsFrom(req);if(!ids.length)return error(res,'Can truyen ids',400);const rows=await InstagramAccount.unscoped().findAll({where:{id:{[Op.in]:ids},owner_username:ownerFromAdmin(req)},order:[['id','ASC']]});return success(res,{text:rows.map(format).join('\n'),count:rows.length},'Lay account Instagram thanh cong');}catch(err){next(err);}};
const bulkSync=async(req,res,next)=>{try{const ids=idsFrom(req);const rows=await InstagramAccount.findAll({where:{id:{[Op.in]:ids},owner_username:ownerFromAdmin(req),kind:'reg'}});let created=0,updated=0;for(const row of rows){const result=await syncRegToJob(row);if(result.created)created++;else updated++;}return success(res,{created,updated,skipped:ids.length-rows.length},'Chuyen Instagram sang Job thanh cong');}catch(err){next(err);}};
const bulkMove=async(req,res,next)=>{try{const ids=idsFrom(req);const kind=normalizeKind(req.body.kind);const group=await AccountGroup.findOne({where:{id:Number(req.body.group_id),owner_username:ownerFromAdmin(req),account_type:groupType(kind)}});if(!group)return error(res,'Nhom Instagram khong hop le',404);const [affected]=await InstagramAccount.update({group_id:group.id},{where:{id:{[Op.in]:ids},owner_username:ownerFromAdmin(req)}});return success(res,{affected,group},'Da chuyen nhom Instagram');}catch(err){next(err);}};
const bulkAction=async(req,res,next)=>{try{const ids=idsFrom(req);const status=normalizeStatus(req.body.status||req.body.action,'');if(!ids.length||!status)return error(res,'Du lieu khong hop le',400);const update={status};if(['CHO_LOGIN','LOGIN_THANH_CONG'].includes(status)){update.locked_by=null;update.locked_at=null;update.login_get_count=0;update.completed_at=null;}if(status==='LOGIN_THANH_CONG')update.login_at=new Date();if(FINAL_STATUSES.includes(status)){update.locked_by=null;update.locked_at=null;update.completed_at=new Date();}const [affected]=await InstagramAccount.update(update,{where:{id:{[Op.in]:ids},owner_username:ownerFromAdmin(req)}});return success(res,{affected},'Da doi trang thai Instagram');}catch(err){next(err);}};
const bulkDelete=async(req,res,next)=>{try{const ids=idsFrom(req),owner_username=ownerFromAdmin(req);const rows=await InstagramAccount.findAll({where:{id:{[Op.in]:ids},owner_username}});const jobIds=rows.filter((r)=>r.kind==='job').map((r)=>r.id),regIds=rows.filter((r)=>r.kind==='reg').map((r)=>r.id);let trashed=0,deleted=0;if(jobIds.length)[trashed]=await InstagramAccount.update({trashed_at:new Date(),locked_by:null,locked_at:null},{where:{id:{[Op.in]:jobIds},owner_username}});if(regIds.length)deleted=await InstagramAccount.destroy({where:{id:{[Op.in]:regIds},owner_username}});return success(res,{trashed,deleted},'Da xoa Instagram');}catch(err){next(err);}};

const listTrash=async(req,res,next)=>{try{const owner_username=ownerFromAdmin(req),page=Math.max(Number(req.query.page)||1,1),limit=Math.min(Math.max(Number(req.query.limit)||50,1),2000);const where={owner_username,kind:'job',trashed_at:{[Op.ne]:null}};const q=nullify(req.query.q);if(q)where[Op.or]=[{uid:{[Op.like]:'%'+q+'%'}},{device_id:{[Op.like]:'%'+q+'%'}}];const direction=String(req.query.sort_order).toLowerCase()==='asc'?'ASC':'DESC';let order=[['trashed_at','DESC'],['id','DESC']];if(req.query.sort_by==='device_id')order=[[sequelize.fn('CHAR_LENGTH',sequelize.col('device_id')),direction],['device_id',direction]];else if(req.query.sort_by==='trashed_at')order=[['trashed_at',direction]];const result=await InstagramAccount.unscoped().findAndCountAll({where,order,limit,offset:(page-1)*limit});return success(res,{accounts:result.rows.map(serialize),pagination:{page,limit,total:result.count,totalPages:Math.ceil(result.count/limit)||1}},'Lay thung rac Instagram');}catch(err){next(err);}};
const restore=async(req,res,next)=>{try{const ids=idsFrom(req);const [restored]=await InstagramAccount.unscoped().update({trashed_at:null,status:'CHO_LOGIN',locked_by:null,locked_at:null,login_get_count:0},{where:{id:{[Op.in]:ids},owner_username:ownerFromAdmin(req),kind:'job',trashed_at:{[Op.ne]:null}}});return success(res,{restored},'Khoi phuc Instagram thanh cong');}catch(err){next(err);}};
const deleteTrash=async(req,res,next)=>{try{const ids=idsFrom(req);const deleted=await InstagramAccount.unscoped().destroy({where:{id:{[Op.in]:ids},owner_username:ownerFromAdmin(req),kind:'job',trashed_at:{[Op.ne]:null}}});return success(res,{deleted},'Xoa vinh vien Instagram thanh cong');}catch(err){next(err);}};

module.exports={list,importDashboard,importApi,getAccount,checkDeviceAccountCount,getLoginSuccess,report,addInstagramJobCount,checkLive,bulkGet,bulkSync,bulkMove,bulkAction,bulkDelete,listTrash,restore,deleteTrash};
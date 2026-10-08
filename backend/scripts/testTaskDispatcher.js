require('dotenv').config();

const sequelize = require('../src/config/database');
const {
  InstagramAccount,
  DashboardDevice,
  DeviceTaskRun,
  DeviceTaskCapability,
  AppSetting,
} = require('../src/models');
const { getNextTask, releaseExpiredTasks } = require('../src/services/taskDispatcherService');
const { reportTask } = require('../src/services/taskReportService');
const { reportLegacyTask } = require('../src/services/legacyTaskAdapter');
const { getDeviceTaskAvailability } = require('../src/services/taskEligibilityService');

const owner = '__dispatcher_test__';
const device = 'TEST_IPHONE_01';
const emptyDevice = 'TEST_IPHONE_02';
const request = { api_owner_username: owner, body: {}, query: {} };
const assert = (condition, message) => {
  if (!condition) throw new Error('ASSERT: ' + message);
};

const cleanup = async () => {
  await DeviceTaskRun.destroy({ where: { owner_username: owner }, force: true });
  await DeviceTaskCapability.destroy({ where: { owner_username: owner }, force: true });
  await DashboardDevice.destroy({ where: { owner_username: owner }, force: true });
  await InstagramAccount.unscoped().destroy({ where: { owner_username: owner }, force: true });
  await AppSetting.destroy({ where: { owner_username: owner }, force: true });
};

const seedInstagram = (uid, assignedDevice = device) => InstagramAccount.create({
  owner_username: owner,
  kind: 'job',
  raw_data: uid + '|pass',
  uid,
  password: 'pass',
  device_id: assignedDevice,
  status: 'LOGIN_THANH_CONG',
  live_status: 'live',
  nurture_status: 'CHUA_NUOI',
});

const main = async () => {
  await sequelize.authenticate();
  await sequelize.sync({ force: false, alter: false });
  await cleanup();
  await DashboardDevice.bulkCreate([
    { owner_username: owner, device_id: device, device_name: device, last_seen: new Date() },
    { owner_username: owner, device_id: emptyDevice, device_name: emptyDevice, last_seen: new Date() },
  ]);

  const first = await seedInstagram('dispatcher_ig_01');
  const preview = await getDeviceTaskAvailability(owner, [device]);
  assert(preview.get(device)?.task_type === 'INSTAGRAM_JOB', 'preview phai thay INSTAGRAM_JOB');
  await first.reload();
  assert(first.status === 'LOGIN_THANH_CONG' && first.locked_by === null, 'preview khong duoc lock account');

  const [raceA, raceB] = await Promise.all([
    getNextTask({ owner, deviceId: device, requestedCapabilities: ['INSTAGRAM_JOB'], req: request }),
    getNextTask({ owner, deviceId: device, requestedCapabilities: ['INSTAGRAM_JOB'], req: request }),
  ]);
  assert(raceA.task && raceB.task, 'hai request cung device phai nhan task/resume');
  assert(raceA.task.id === raceB.task.id, 'hai request dong thoi khong duoc tao hai task');
  assert(await DeviceTaskRun.count({ where: { owner_username: owner, status: 'RUNNING' } }) === 1, 'chi co mot task RUNNING');

  const empty = await getNextTask({ owner, deviceId: emptyDevice, requestedCapabilities: ['INSTAGRAM_JOB'], req: request });
  assert(empty.task === null, 'device khong co account phai tra no task');

  const businessSuccess = await reportLegacyTask('INSTAGRAM_JOB', request, {uid: raceA.task.uid, device_id: device, status: 'DA_CHAY_XONG'});
  assert(businessSuccess.payload.success, 'legacy API reports account data before task completion');
  const success = await reportTask({
    owner,
    deviceId: device,
    taskId: raceA.task.id,
    status: 'SUCCESS',
    result: { job_done: 12 },
    req: request,
  });
  assert(success.run.status === 'SUCCESS', 'report success phai ket thuc task');
  await first.reload();
  assert(first.status === 'DA_CHAY_XONG', 'IG Job success phai dung business status cu');

  const [crossAccountA, crossAccountB] = await Promise.all([
    seedInstagram('dispatcher_ig_cross_a', device),
    seedInstagram('dispatcher_ig_cross_b', emptyDevice),
  ]);
  const [crossTaskA, crossTaskB] = await Promise.all([
    getNextTask({ owner, deviceId: device, requestedCapabilities: ['INSTAGRAM_JOB'], req: request }),
    getNextTask({ owner, deviceId: emptyDevice, requestedCapabilities: ['INSTAGRAM_JOB'], req: request }),
  ]);
  assert(crossTaskA.task && crossTaskB.task, 'hai device phai cung lay duoc task');
  assert(crossTaskA.task.id !== crossTaskB.task.id, 'hai device khong duoc nhan trung task');
  assert(Number(crossTaskA.task.account_id) === Number(crossAccountA.id), 'device A phai nhan account cua device A');
  assert(Number(crossTaskB.task.account_id) === Number(crossAccountB.id), 'device B phai nhan account cua device B');
  await Promise.all([
    reportLegacyTask('INSTAGRAM_JOB', request, {uid: crossTaskA.task.uid, device_id: device, status: 'DA_CHAY_XONG'}),
    reportLegacyTask('INSTAGRAM_JOB', request, {uid: crossTaskB.task.uid, device_id: emptyDevice, status: 'DA_CHAY_XONG'}),
  ]);
  await Promise.all([
    reportTask({ owner, deviceId: device, taskId: crossTaskA.task.id, status: 'SUCCESS', result: { job_done: 1 }, req: request }),
    reportTask({ owner, deviceId: emptyDevice, taskId: crossTaskB.task.id, status: 'SUCCESS', result: { job_done: 1 }, req: request }),
  ]);

  const second = await seedInstagram('dispatcher_ig_02');
  const retryTask = await getNextTask({ owner, deviceId: device, requestedCapabilities: ['INSTAGRAM_JOB'], req: request });
  const businessFailure = await reportLegacyTask('INSTAGRAM_JOB', request, {uid: retryTask.task.uid, device_id: device, status: 'LOGIN_THANH_CONG'});
  assert(businessFailure.payload.success, 'legacy API prepares retry independently');
  const failed = await reportTask({
    owner,
    deviceId: device,
    taskId: retryTask.task.id,
    status: 'FAILED',
    errorCode: 'NETWORK_ERROR',
    message: 'test retry',
    req: request,
  });
  assert(failed.run.status === 'FAILED' && failed.retryable, 'network error phai retryable');
  await second.reload();
  assert(second.status === 'LOGIN_THANH_CONG', 'retryable failure phai tra account ve READY');

  const timeoutTask = await getNextTask({ owner, deviceId: device, requestedCapabilities: ['INSTAGRAM_JOB'], req: request });
  const staleAt = new Date(Date.now() - 40 * 60 * 1000);
  await DeviceTaskRun.update({ locked_at: staleAt }, { where: { id: timeoutTask.task.id } });
  await DashboardDevice.update({ last_seen: staleAt }, { where: { owner_username: owner, device_id: device } });
  const released = await releaseExpiredTasks(owner);
  assert(released === 0, 'mat heartbeat khong duoc tu release task');
  const staleRun = await DeviceTaskRun.findByPk(timeoutTask.task.id);
  await second.reload();
  assert(staleRun.status === 'RUNNING', 'task mat phan hoi van giu RUNNING de doi soat');
  assert(second.status === 'DANG_LAM' && second.locked_by === device, 'mat phan hoi khong duoc mo lock account');
  const resumed = await getNextTask({ owner, deviceId: device, requestedCapabilities: ['INSTAGRAM_JOB'], req: request });
  assert(resumed.task.id === timeoutTask.task.id && resumed.task.resumed, 'may tro lai phai resume task cu');

  console.log(JSON.stringify({
    ok: true,
    race_same_task_id: raceA.task.id,
    no_task_code: 0,
    report_success: success.run.status,
    report_failed: failed.run.status,
    timeout_released: released,
    preview_did_not_lock: true,
    two_devices_no_duplicate: true,
  }, null, 2));
};

main()
  .then(cleanup)
  .then(() => sequelize.close())
  .catch(async (error) => {
    console.error(error);
    try { await cleanup(); } catch (_) {}
    await sequelize.close();
    process.exit(1);
  });

// Capacity and liveness are independent of table pagination.
const timeout = Number(process.env.DEVICE_OFFLINE_TIMEOUT_SECONDS || 1800);
if (!Number.isInteger(timeout) || timeout < 1) throw new Error('INVALID_DEVICE_OFFLINE_TIMEOUT_SECONDS');
module.exports = Object.freeze({ capacity: 1000, offlineTimeoutSeconds: timeout, defaultPageSize: 50, maxPageSize: 100 });

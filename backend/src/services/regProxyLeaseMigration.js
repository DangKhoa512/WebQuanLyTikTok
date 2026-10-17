const db = require('../config/database');
const RegProxyLease = require('../models/RegProxyLease');

const lockSql = "CONCAT('quanly:reg-proxy:',LEFT(SHA2(DATABASE(),256),40))";

const withMigrationLock = async (work) => {
  const connection = await db.connectionManager.getConnection({ type: 'WRITE' });
  const query = (sql) => new Promise((resolve, reject) =>
    connection.query(sql, (error, rows) => error ? reject(error) : resolve(rows)));
  let acquired = false;
  try {
    const rows = await query(`SELECT GET_LOCK(${lockSql},30) acquired`);
    acquired = Number(rows[0].acquired) === 1;
    if (!acquired) throw new Error('Migration lock unavailable');
    return await work();
  } finally {
    if (acquired) {
      try { await query(`SELECT RELEASE_LOCK(${lockSql})`); } catch (_) { connection.destroy(); }
    }
    await db.connectionManager.releaseConnection(connection);
  }
};

const up = async () => withMigrationLock(() => RegProxyLease.sync({ force: false, alter: false }));
const down = async () => withMigrationLock(() => RegProxyLease.drop());

module.exports = { up, down };

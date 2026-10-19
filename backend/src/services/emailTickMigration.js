const { DataTypes } = require('sequelize');
const db = require('../config/database');
const Mailbox = require('../models/EmailTickMailbox');

async function up() {
  const connection = await db.connectionManager.getConnection({ type: 'WRITE' });
  const query = sql => new Promise((resolve, reject) => connection.query(sql, (err, rows) => err ? reject(err) : resolve(rows)));
  const lock = "CONCAT('quanly:emailtick:',LEFT(SHA2(DATABASE(),256),40))";
  let acquired = false;
  try {
    const rows = await query(`SELECT GET_LOCK(${lock},30) acquired`);
    acquired = Number(rows[0].acquired) === 1;
    if (!acquired) throw new Error('EmailTick migration lock unavailable');
    await Mailbox.sync({ force: false, alter: false, logging: false });
    const qi = db.getQueryInterface();
    const columns = await qi.describeTable('emailtick_mailboxes', { logging: false });
    if (!columns.transport_context) {
      await qi.addColumn('emailtick_mailboxes', 'transport_context', {
        type: DataTypes.JSON, allowNull: true, defaultValue: null,
      }, { logging: false });
    }
  } finally {
    if (acquired) {
      try { await query(`SELECT RELEASE_LOCK(${lock})`); } catch (_) { connection.destroy(); }
    }
    await db.connectionManager.releaseConnection(connection);
  }
}

module.exports = { up };

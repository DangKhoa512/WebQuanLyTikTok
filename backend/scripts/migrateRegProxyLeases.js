require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../src/config/database');

(async () => {
  if (!process.argv.includes('--apply')) {
    throw new Error('Use --apply; rollback requires --rollback --apply after backup');
  }
  await db.authenticate();
  const migration = require('../src/services/regProxyLeaseMigration');
  if (process.argv.includes('--rollback')) await migration.down();
  else await migration.up();
  console.log('REG_PROXY_LEASE_MIGRATION_OK');
})()
  .catch(() => {
    console.error('REG_PROXY_LEASE_MIGRATION_FAILED');
    process.exitCode = 1;
  })
  .finally(() => db.close());

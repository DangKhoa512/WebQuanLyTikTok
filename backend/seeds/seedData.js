/**
 * Seed 50 sample accounts for development / demo.
 * WARNING: uses force: true → drops and recreates the accounts table!
 * Run: npm run seed
 */
require('dotenv').config();

const sequelize = require('../src/config/database');
require('../src/models/index'); // register models
const Account   = require('../src/models/Account');

const STATUSES     = ['REG_DA_LAM', 'UPVIDEO', 'UPVIDEO_FAIL', 'DAT_CHI_TIEU', 'DIE'];
const LIVE_STATUSES = ['unknown', 'live', 'die'];
const DEVICES      = ['iphone_01', 'iphone_02', 'iphone_03', 'android_01', 'android_02'];

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);
const hoursAgo = (n) => new Date(Date.now() - n * 3_600_000);
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const seed = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ DB connected');

    // Drop & recreate table
    await Account.sync({ force: true });
    console.log('✅ Table recreated');

    const now = new Date();
    const accounts = [];

    for (let i = 1; i <= 50; i++) {
      const status      = STATUSES[i % STATUSES.length];
      const live_status = LIVE_STATUSES[i % LIVE_STATUSES.length];
      const ageDay      = randInt(0, 10);
      const reg_at      = daysAgo(ageDay);

      const videoCount =
        status === 'DAT_CHI_TIEU' ? randInt(20, 40) :
        status === 'UPVIDEO'      ? randInt(5, 19)   : randInt(0, 5);

      const last_upload_at =
        ['UPVIDEO', 'DAT_CHI_TIEU'].includes(status)
          ? hoursAgo(randInt(1, 48))
          : null;

      accounts.push({
        username:         `tiktok_user_${String(i).padStart(3, '0')}`,
        password:         `P@ss${i}2024!`,
        twofa:            i % 4 === 0 ? `${randInt(100000, 999999)}` : null,
        email:            `user${i}@gmail.com`,
        email_pass:       `emailP@ss${i}`,
        cookie:           `cookie_session_${i}_${Date.now()}`,
        token:            `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.seed${i}`,
        proxy:            `103.${randInt(1, 254)}.${randInt(1, 254)}.${randInt(1, 254)}:${randInt(8000, 9999)}`,
        device_id:        rand(DEVICES),
        status,
        live_status,
        video_count:      videoCount,
        reg_at,
        last_upload_at,
        last_live_check_at: live_status !== 'unknown' ? hoursAgo(randInt(1, 12)) : null,
        fail_reason:      status === 'UPVIDEO_FAIL' ? rand(['upload_error', 'network_timeout', 'account_restricted']) : null,
        note:             i % 10 === 0 ? 'Test account - do not use in production' : null,
      });
    }

    await Account.bulkCreate(accounts);
    console.log(`✅ Seeded ${accounts.length} accounts`);

    const counts = await Account.findAll({
      attributes: ['status', [sequelize.fn('COUNT', '*'), 'cnt']],
      group: ['status'],
      raw: true,
    });
    console.log('📊 Status breakdown:', counts.map((r) => `${r.status}: ${r.cnt}`).join(', '));
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  }
};

seed();

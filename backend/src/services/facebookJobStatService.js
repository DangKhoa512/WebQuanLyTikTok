const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

const FACEBOOK_JOB_WEBS = ['TTC', 'XSMM', 'NVC'];

const normalizeFacebookJobWeb = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return FACEBOOK_JOB_WEBS.includes(normalized) ? normalized : null;
};

const addFacebookDailyJobs = async ({ owner_username, device_id, stat_date, web, jobs, xu }) => {
  const jobWeb = normalizeFacebookJobWeb(web);
  const addJobs = parseInt(jobs, 10) || 0;
  const addXu = parseInt(xu, 10) || 0;
  if (!owner_username || !device_id || !stat_date || !jobWeb || addJobs < 0 || addXu < 0 || (addJobs === 0 && addXu === 0)) return false;

  await sequelize.query(
    `INSERT INTO facebook_job_daily_stats (owner_username, device_id, stat_date, web, job_count, xu_count, created_at, updated_at)
     VALUES (:owner, :device, :date, :web, :jobs, :xu, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       job_count = job_count + VALUES(job_count),
       xu_count = xu_count + VALUES(xu_count),
       updated_at = NOW()`,
    {
      replacements: { owner: owner_username, device: device_id, date: stat_date, web: jobWeb, jobs: addJobs, xu: addXu },
      type: QueryTypes.INSERT,
    }
  );
  return true;
};

const addFacebookPageClaim = async ({ owner_username, device_id, stat_date, transaction = null }) => {
  if (!owner_username || !device_id || !stat_date) return false;
  await sequelize.query(
    `INSERT INTO facebook_page_claim_daily_stats
       (owner_username, device_id, stat_date, page_count, created_at, updated_at)
     VALUES (:owner, :device, :date, 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       page_count = page_count + 1,
       updated_at = NOW()`,
    {
      replacements: { owner: owner_username, device: device_id, date: stat_date },
      type: QueryTypes.INSERT,
      transaction,
    }
  );
  return true;
};

module.exports = { FACEBOOK_JOB_WEBS, normalizeFacebookJobWeb, addFacebookDailyJobs, addFacebookPageClaim };

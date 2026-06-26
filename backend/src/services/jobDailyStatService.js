const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

const addDailyJobs = async ({ owner_username, device_id, stat_date, jobs, web = 'TDS' }) => {
  const addJobs = Math.max(0, parseInt(jobs, 10) || 0);
  const jobWeb = String(web || 'TDS').trim().toUpperCase() === 'XSMM' ? 'XSMM' : 'TDS';
  if (!owner_username || !device_id || !stat_date || addJobs <= 0) return;

  await sequelize.query(
    `INSERT INTO job_daily_stats (owner_username, device_id, stat_date, web, job_count, created_at, updated_at)
     VALUES (:owner, :device, :date, :web, :jobs, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       job_count = job_count + VALUES(job_count),
       updated_at = NOW()`,
    {
      replacements: {
        owner: owner_username,
        device: device_id,
        date: stat_date,
        web: jobWeb,
        jobs: addJobs,
      },
      type: QueryTypes.INSERT,
    }
  );
};

module.exports = { addDailyJobs };

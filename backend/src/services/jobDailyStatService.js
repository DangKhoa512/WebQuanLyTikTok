const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

const XU_PER_JOB = parseInt(process.env.JOB_XU_PER_JOB, 10) || 1400;

const addDailyJobs = async ({ owner_username, device_id, stat_date, jobs, xu, web = 'TDS' }) => {
  const addJobs = Math.max(0, parseInt(jobs, 10) || 0);
  const addXu = Math.max(0, parseInt(xu, 10) || 0);
  const normalizedWeb = String(web || 'TDS').trim().toUpperCase();
  const jobWeb = ['XSMM', 'XSMB'].includes(normalizedWeb) ? 'XSMM' : 'TDS';
  if (!owner_username || !device_id || !stat_date || addJobs <= 0) return;
  const dailyXu = jobWeb === 'XSMM' || addXu > 0 ? addXu : addJobs * XU_PER_JOB;

  await sequelize.query(
    `INSERT INTO job_daily_stats (owner_username, device_id, stat_date, web, job_count, xu_count, created_at, updated_at)
     VALUES (:owner, :device, :date, :web, :jobs, :xu, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       job_count = job_count + VALUES(job_count),
       xu_count = xu_count + VALUES(xu_count),
       updated_at = NOW()`,
    {
      replacements: {
        owner: owner_username,
        device: device_id,
        date: stat_date,
        web: jobWeb,
        jobs: addJobs,
        xu: dailyXu,
      },
      type: QueryTypes.INSERT,
    }
  );
};

module.exports = { addDailyJobs };

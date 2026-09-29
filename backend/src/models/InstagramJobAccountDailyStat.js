const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const InstagramJobAccountDailyStat = sequelize.define('InstagramJobAccountDailyStat', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'admin' },
  device_id: { type: DataTypes.STRING(255), allowNull: false },
  stat_date: { type: DataTypes.DATEONLY, allowNull: false },
  claimed_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'instagram_job_account_daily_stats',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, name: 'uq_instagram_job_account_daily_owner_device_date', fields: ['owner_username', 'device_id', 'stat_date'] },
    { fields: ['owner_username', 'stat_date'] },
  ],
});

module.exports = InstagramJobAccountDailyStat;
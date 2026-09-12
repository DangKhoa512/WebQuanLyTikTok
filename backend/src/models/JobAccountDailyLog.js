const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const JobAccountDailyLog = sequelize.define('JobAccountDailyLog', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  owner_username: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  device_id: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  account_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  username: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  job_type: {
    type: DataTypes.ENUM('chrome', 'hotmail'),
    allowNull: false,
    defaultValue: 'chrome',
  },
  report_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  taken_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  tableName: 'job_account_daily_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      name: 'uq_job_account_daily_owner_device_account_date',
      fields: ['owner_username', 'device_id', 'account_id', 'report_date'],
    },
    { name: 'idx_job_account_daily_owner_device_date', fields: ['owner_username', 'device_id', 'report_date'] },
    { name: 'idx_job_account_daily_job_type', fields: ['job_type'] },
  ],
});

module.exports = JobAccountDailyLog;

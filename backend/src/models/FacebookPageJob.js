const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FacebookPageJob = sequelize.define('FacebookPageJob', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false },
  facebook_account_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  page_id: { type: DataTypes.STRING(255), allowNull: false },
  page_name: { type: DataTypes.STRING(500), allowNull: true },
  job_status: {
    type: DataTypes.ENUM('CHUA_LAM', 'DANG_LAM', 'DA_LAM'),
    allowNull: false,
    defaultValue: 'CHUA_LAM',
  },
  device_id: { type: DataTypes.STRING(255), allowNull: true },
  completed_at: { type: DataTypes.DATE, allowNull: true },
  last_report_at: { type: DataTypes.DATE, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'facebook_page_jobs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, name: 'uq_facebook_page_job_owner_page', fields: ['owner_username', 'page_id'] },
    { name: 'idx_facebook_page_job_account_status', fields: ['facebook_account_id', 'job_status'] },
    { name: 'idx_facebook_page_job_owner_active', fields: ['owner_username', 'is_active'] },
  ],
});

module.exports = FacebookPageJob;

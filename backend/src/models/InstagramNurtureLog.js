const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const InstagramNurtureLog = sequelize.define('InstagramNurtureLog', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false },
  instagram_account_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  uid: { type: DataTypes.STRING(255), allowNull: false },
  device_id: { type: DataTypes.STRING(255), allowNull: false },
  scenario_id: { type: DataTypes.STRING(100), allowNull: true },
  run_id: { type: DataTypes.STRING(100), allowNull: false },
  status: { type: DataTypes.ENUM('DA_NUOI','NUOI_FAIL'), allowNull: false },
  started_at: { type: DataTypes.DATE, allowNull: true },
  completed_at: { type: DataTypes.DATE, allowNull: false },
  duration_seconds: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  message: { type: DataTypes.STRING(1000), allowNull: true },
}, {
  tableName: 'instagram_nurture_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'idx_ig_nurture_logs_owner_created', fields: ['owner_username','created_at'] },
    { name: 'idx_ig_nurture_logs_account', fields: ['instagram_account_id','created_at'] },
    { name: 'idx_ig_nurture_logs_device', fields: ['owner_username','device_id','created_at'] },
    { unique: true, name: 'uq_ig_nurture_logs_owner_run', fields: ['owner_username','run_id'] },
  ],
});

module.exports = InstagramNurtureLog;
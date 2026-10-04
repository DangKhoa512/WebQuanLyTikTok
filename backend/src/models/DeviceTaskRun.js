const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DeviceTaskRun = sequelize.define('DeviceTaskRun', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false },
  device_id: { type: DataTypes.STRING(255), allowNull: false },
  task_type: { type: DataTypes.STRING(50), allowNull: false },
  priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  entity_type: { type: DataTypes.STRING(50), allowNull: false },
  entity_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  account_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  uid: { type: DataTypes.STRING(255), allowNull: true },
  username: { type: DataTypes.STRING(255), allowNull: true },
  page_id: { type: DataTypes.STRING(255), allowNull: true },
  status: {
    type: DataTypes.ENUM('RUNNING', 'REPORTING', 'SUCCESS', 'FAILED', 'RELEASED'),
    allowNull: false,
    defaultValue: 'RUNNING',
  },
  locked_by: { type: DataTypes.STRING(255), allowNull: false },
  locked_at: { type: DataTypes.DATE, allowNull: false },
  completed_at: { type: DataTypes.DATE, allowNull: true },
  retry_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  error_code: { type: DataTypes.STRING(100), allowNull: true },
  error_message: { type: DataTypes.STRING(1000), allowNull: true },
  payload: { type: DataTypes.JSON, allowNull: true },
  result: { type: DataTypes.JSON, allowNull: true },
}, {
  tableName: 'device_task_runs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'idx_device_task_run_device_status', fields: ['owner_username', 'device_id', 'status'] },
    { name: 'idx_device_task_run_entity', fields: ['owner_username', 'task_type', 'entity_type', 'entity_id', 'status'] },
    { name: 'idx_device_task_run_timeout', fields: ['status', 'locked_at'] },
  ],
});

module.exports = DeviceTaskRun;

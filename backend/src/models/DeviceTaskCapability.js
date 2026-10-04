const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DeviceTaskCapability = sequelize.define('DeviceTaskCapability', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false },
  device_id: { type: DataTypes.STRING(255), allowNull: false },
  task_type: { type: DataTypes.STRING(50), allowNull: false },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'device_task_capabilities',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, name: 'uq_device_task_capability', fields: ['owner_username', 'device_id', 'task_type'] },
    { name: 'idx_device_task_capability_enabled', fields: ['owner_username', 'device_id', 'enabled'] },
  ],
});

module.exports = DeviceTaskCapability;

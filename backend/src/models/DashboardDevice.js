const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DashboardDevice = sequelize.define('DashboardDevice', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false },
  device_id: { type: DataTypes.STRING(255), allowNull: false },
  device_name: { type: DataTypes.STRING(255), allowNull: true },
  current_task: { type: DataTypes.STRING(100), allowNull: true },
  current_uid: { type: DataTypes.STRING(255), allowNull: true },
  reported_status: { type: DataTypes.ENUM('ONLINE', 'RUNNING', 'IDLE'), allowNull: false, defaultValue: 'IDLE' },
  started_at: { type: DataTypes.DATE, allowNull: true },
  last_seen: { type: DataTypes.DATE, allowNull: false },
  last_error: { type: DataTypes.STRING(1000), allowNull: true },
}, {
  tableName: 'dashboard_devices',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, name: 'uq_dashboard_device_owner', fields: ['owner_username', 'device_id'] },
    { name: 'idx_dashboard_device_last_seen', fields: ['owner_username', 'last_seen'] },
  ],
});

module.exports = DashboardDevice;

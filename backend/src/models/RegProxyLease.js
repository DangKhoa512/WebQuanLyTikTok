const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RegProxyLease = sequelize.define('RegProxyLease', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false },
  device_id: { type: DataTypes.STRING(255), allowNull: false },
  task_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  proxy_key: { type: DataTypes.STRING(64), allowNull: false },
  exit_ip: { type: DataTypes.STRING(45), allowNull: true },
  session_id: { type: DataTypes.STRING(36), allowNull: false },
  status: {
    type: DataTypes.ENUM('RESERVED', 'IN_USE', 'RELEASED', 'FAILED', 'EXPIRED'),
    allowNull: false,
    defaultValue: 'RESERVED',
  },
  active_device_id: { type: DataTypes.STRING(255), allowNull: true },
  active_proxy_key: { type: DataTypes.STRING(64), allowNull: true },
  active_exit_ip: { type: DataTypes.STRING(45), allowNull: true },
  allocated_at: { type: DataTypes.DATE, allowNull: false },
  last_heartbeat_at: { type: DataTypes.DATE, allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  released_at: { type: DataTypes.DATE, allowNull: true },
  release_reason: { type: DataTypes.STRING(100), allowNull: true },
}, {
  tableName: 'reg_proxy_leases',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, name: 'uq_reg_proxy_lease_session', fields: ['session_id'] },
    { unique: true, name: 'uq_reg_proxy_active_device', fields: ['owner_username', 'active_device_id'] },
    { unique: true, name: 'uq_reg_proxy_active_proxy', fields: ['owner_username', 'active_proxy_key'] },
    { unique: true, name: 'uq_reg_proxy_active_exit_ip', fields: ['owner_username', 'active_exit_ip'] },
    { name: 'idx_reg_proxy_lease_expiry', fields: ['status', 'expires_at'] },
    { name: 'idx_reg_proxy_lease_device_history', fields: ['owner_username', 'device_id', 'allocated_at'] },
  ],
});

module.exports = RegProxyLease;

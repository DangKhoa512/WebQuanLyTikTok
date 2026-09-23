const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PlatformMachineDailyStat = sequelize.define('PlatformMachineDailyStat', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false },
  platform: { type: DataTypes.ENUM('facebook', 'instagram'), allowNull: false },
  device_id: { type: DataTypes.STRING(255), allowNull: false },
  stat_date: { type: DataTypes.DATEONLY, allowNull: false },
  live_count: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  die_count: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  report_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  last_reported_at: { type: DataTypes.DATE, allowNull: false },
}, {
  tableName: 'platform_machine_daily_stats',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, name: 'uq_platform_machine_daily', fields: ['owner_username', 'platform', 'device_id', 'stat_date'] },
    { name: 'idx_platform_machine_range', fields: ['owner_username', 'platform', 'stat_date'] },
  ],
});

module.exports = PlatformMachineDailyStat;
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AppKhangDailyLog = sequelize.define('AppKhangDailyLog', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  owner_username: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  device_id: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  username: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('ACC_DA_KHANG', 'ACC_CHUA_KHANG'),
    allowNull: false,
  },
  report_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  reported_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  tableName: 'app_khang_daily_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      name: 'uq_app_khang_owner_device_user_date',
      fields: ['owner_username', 'device_id', 'username', 'report_date'],
    },
    {
      name: 'idx_app_khang_owner_device_date',
      fields: ['owner_username', 'device_id', 'report_date'],
    },
  ],
});

module.exports = AppKhangDailyLog;

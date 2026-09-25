const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EmailOtpDeviceUse = sequelize.define('EmailOtpDeviceUse', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false },
  email_order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  device_id: { type: DataTypes.STRING(255), allowNull: false },
  otp: { type: DataTypes.STRING(1000), allowNull: true },
  source: { type: DataTypes.ENUM('PURCHASED', 'CLAIMED'), allowNull: false, defaultValue: 'CLAIMED' },
  used_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'email_otp_device_uses',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, name: 'uq_email_otp_use_order_device', fields: ['email_order_id', 'device_id'] },
    { name: 'idx_email_otp_use_owner_device', fields: ['owner_username', 'device_id'] },
  ],
});

module.exports = EmailOtpDeviceUse;
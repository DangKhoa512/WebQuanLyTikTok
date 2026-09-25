const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EmailOtpOrder = sequelize.define('EmailOtpOrder', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false },
  site: { type: DataTypes.STRING(100), allowNull: false },
  gmail: { type: DataTypes.STRING(255), allowNull: false },
  order_id: { type: DataTypes.STRING(255), allowNull: false },
  otp_history: { type: DataTypes.TEXT('long'), allowNull: true },
  use_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  status: {
    type: DataTypes.ENUM('PENDING', 'PAUSED', 'DONE'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  source_device_id: { type: DataTypes.STRING(255), allowNull: true },
  locked_by: { type: DataTypes.STRING(255), allowNull: true },
  locked_at: { type: DataTypes.DATE, allowNull: true },
  last_used_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'email_otp_orders',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, name: 'uq_email_otp_owner_site_order', fields: ['owner_username', 'site', 'order_id'] },
    { name: 'idx_email_otp_owner_status', fields: ['owner_username', 'status'] },
    { name: 'idx_email_otp_gmail', fields: ['gmail'] },
    { name: 'idx_email_otp_locked_by', fields: ['locked_by'] },
  ],
});

module.exports = EmailOtpOrder;
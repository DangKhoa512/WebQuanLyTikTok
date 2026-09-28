const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FacebookRegPageSuccessEvent = sequelize.define('FacebookRegPageSuccessEvent', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'admin' },
  facebook_account_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  facebook_reg_page_report_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  uid: { type: DataTypes.STRING(100), allowNull: false },
  device_id: { type: DataTypes.STRING(255), allowNull: false },
  page_id: { type: DataTypes.STRING(255), allowNull: true },
  page_name: { type: DataTypes.STRING(500), allowNull: true },
  report_key: { type: DataTypes.STRING(255), allowNull: false },
  stat_date: { type: DataTypes.DATEONLY, allowNull: false },
}, {
  tableName: 'facebook_reg_page_success_events',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, name: 'uq_fb_reg_page_success_owner_key', fields: ['owner_username', 'report_key'] },
    { name: 'idx_fb_reg_page_success_device_date', fields: ['owner_username', 'device_id', 'stat_date'] },
    { name: 'idx_fb_reg_page_success_account', fields: ['facebook_account_id'] },
  ],
});

module.exports = FacebookRegPageSuccessEvent;
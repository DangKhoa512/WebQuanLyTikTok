const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const InstagramFacebookRegClaim = sequelize.define('InstagramFacebookRegClaim', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'admin' },
  facebook_account_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  facebook_uid: { type: DataTypes.STRING(255), allowNull: false },
  device_id: { type: DataTypes.STRING(255), allowNull: false },
  status: { type: DataTypes.ENUM('DANG_REG', 'REG_XONG', 'REG_FAIL', 'CANCELLED'), allowNull: false, defaultValue: 'DANG_REG' },
  locked_at: { type: DataTypes.DATE, allowNull: true },
  get_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  instagram_uid: { type: DataTypes.STRING(255), allowNull: true },
  email_order_id: { type: DataTypes.STRING(255), allowNull: true },
  fail_reason: { type: DataTypes.STRING(1000), allowNull: true },
  completed_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'instagram_facebook_reg_claims',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'idx_ig_fb_reg_owner_status', fields: ['owner_username', 'status'] },
    { name: 'idx_ig_fb_reg_device_status', fields: ['owner_username', 'device_id', 'status'] },
    { name: 'idx_ig_fb_reg_account_status', fields: ['owner_username', 'facebook_account_id', 'status'] },
    { name: 'idx_ig_fb_reg_instagram_uid', fields: ['instagram_uid'] },
  ],
});

module.exports = InstagramFacebookRegClaim;
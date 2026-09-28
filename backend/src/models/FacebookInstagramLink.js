const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FacebookInstagramLink = sequelize.define('FacebookInstagramLink', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'admin' },
  facebook_account_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  facebook_uid: { type: DataTypes.STRING(255), allowNull: false },
  instagram_account_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  instagram_uid: { type: DataTypes.STRING(255), allowNull: false },
  device_id: { type: DataTypes.STRING(255), allowNull: true },
  report_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  first_reported_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  last_reported_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'facebook_instagram_links',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, name: 'uq_fb_ig_link_owner_uids', fields: ['owner_username', 'facebook_uid', 'instagram_uid'] },
    { name: 'idx_fb_ig_link_owner_device', fields: ['owner_username', 'device_id'] },
    { name: 'idx_fb_ig_link_facebook_account', fields: ['facebook_account_id'] },
    { name: 'idx_fb_ig_link_instagram_account', fields: ['instagram_account_id'] },
  ],
});

module.exports = FacebookInstagramLink;
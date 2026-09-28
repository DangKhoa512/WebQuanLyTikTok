const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const InstagramFacebookRegResult = sequelize.define('InstagramFacebookRegResult', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'admin' },
  claim_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  facebook_account_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  facebook_uid: { type: DataTypes.STRING(255), allowNull: false },
  instagram_account_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  instagram_uid: { type: DataTypes.STRING(255), allowNull: false },
  device_id: { type: DataTypes.STRING(255), allowNull: false },
  reported_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'instagram_facebook_reg_results',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, name: 'uq_ig_fb_reg_result_claim_uid', fields: ['owner_username', 'claim_id', 'instagram_uid'] },
    { name: 'idx_ig_fb_reg_result_facebook', fields: ['owner_username', 'facebook_account_id'] },
    { name: 'idx_ig_fb_reg_result_instagram', fields: ['owner_username', 'instagram_uid'] },
    { name: 'idx_ig_fb_reg_result_device', fields: ['owner_username', 'device_id'] },
  ],
});

module.exports = InstagramFacebookRegResult;
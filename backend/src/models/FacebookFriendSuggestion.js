const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FacebookFriendSuggestion = sequelize.define('FacebookFriendSuggestion', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false },
  source_account_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  source_uid: { type: DataTypes.STRING(255), allowNull: false },
  target_account_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  target_uid: { type: DataTypes.STRING(255), allowNull: false },
  run_id: { type: DataTypes.STRING(100), allowNull: false },
  delivered_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'facebook_friend_suggestions',
  timestamps: false,
  indexes: [
    {
      unique: true,
      name: 'uq_fb_friend_source_target',
      fields: ['owner_username', 'source_account_id', 'target_uid'],
    },
    {
      name: 'idx_fb_friend_run',
      fields: ['owner_username', 'source_account_id', 'run_id'],
    },
    {
      name: 'idx_fb_friend_target',
      fields: ['owner_username', 'target_account_id'],
    },
  ],
});

module.exports = FacebookFriendSuggestion;

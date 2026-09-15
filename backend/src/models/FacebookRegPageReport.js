const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FacebookRegPageReport = sequelize.define(
  'FacebookRegPageReport',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    owner_username: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'admin' },
    facebook_account_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    uid: { type: DataTypes.STRING(100), allowNull: false },
    device_id: { type: DataTypes.STRING(255), allowNull: false },
    stat_date: { type: DataTypes.DATEONLY, allowNull: false },
    previous_page_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    current_page_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    page_difference: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    pages_added: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: 'facebook_reg_page_reports',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['owner_username', 'stat_date'] },
      { fields: ['owner_username', 'device_id', 'stat_date'] },
      { fields: ['facebook_account_id', 'created_at'] },
    ],
  }
);

module.exports = FacebookRegPageReport;

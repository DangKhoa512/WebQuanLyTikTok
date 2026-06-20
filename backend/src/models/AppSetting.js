const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const AppSetting = sequelize.define(
  'AppSetting',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    owner_username: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'admin',
    },
    setting_key: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    setting_value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: 'app_settings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        name: 'uq_app_setting_owner_key',
        fields: ['owner_username', 'setting_key'],
      },
    ],
  }
);

module.exports = AppSetting;

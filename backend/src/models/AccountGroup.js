const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AccountGroup = sequelize.define(
  'AccountGroup',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    owner_username: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'admin',
    },
    account_type: {
      type: DataTypes.ENUM('app', 'chrome', 'job'),
      allowNull: false,
    },
    job_type: {
      type: DataTypes.ENUM('chrome', 'hotmail'),
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    note: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: 'account_groups',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['owner_username'] },
      { fields: ['account_type'] },
      { unique: true, fields: ['owner_username', 'account_type', 'name'] },
    ],
  }
);

module.exports = AccountGroup;

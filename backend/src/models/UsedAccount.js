const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UsedAccount = sequelize.define(
  'UsedAccount',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    account_type: {
      type: DataTypes.ENUM('app', 'chrome'),
      allowNull: false,
    },
    account_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    email_pass: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    owner_username: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'admin',
    },
    used_by: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'admin',
    },
    source_status: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    batch_id: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    used_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'used_accounts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['owner_username'] },
      { fields: ['used_at'] },
      { fields: ['account_type'] },
      { fields: ['batch_id'] },
      { fields: ['owner_username', 'used_at'] },
      { unique: true, fields: ['owner_username', 'account_type', 'username'] },
    ],
  }
);

module.exports = UsedAccount;

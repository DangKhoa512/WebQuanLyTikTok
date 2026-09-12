const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FacebookAccount = sequelize.define(
  'FacebookAccount',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    kind: {
      type: DataTypes.ENUM('reg', 'job'),
      allowNull: false,
      defaultValue: 'job',
    },
    raw_data: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
    },
    uid: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    two_fa: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cookies: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    token: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    email_pass: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    refresh_token: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    client_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    owner_username: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'admin',
    },
    group_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    device_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('CHO_LOGIN', 'DANG_LOGIN', 'DANG_LAM', 'LOGIN_THANH_CONG', 'LOGIN_FAIL', 'DA_CHAY_XONG', 'ACCOUNT_DIE'),
      allowNull: false,
      defaultValue: 'CHO_LOGIN',
    },
    live_status: {
      type: DataTypes.ENUM('unknown', 'live', 'die'),
      allowNull: false,
      defaultValue: 'unknown',
    },
    locked_by: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    locked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    login_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_live_check_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    fail_reason: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'facebook_accounts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        name: 'uq_facebook_owner_kind_uid',
        fields: ['owner_username', 'kind', 'uid'],
      },
      { fields: ['owner_username', 'kind', 'status'] },
      { fields: ['locked_by'] },
      { fields: ['device_id'] },
      { fields: ['live_status'] },
    ],
  }
);

module.exports = FacebookAccount;

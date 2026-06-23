const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Account = sequelize.define(
  'Account',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    raw_data: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Raw pipe-separated data from phone',
    },
    username: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    twofa: {
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
    cookie: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    token: {
      type: DataTypes.TEXT('long'),
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
    local: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    proxy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    device_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Phone device ID that registered this account',
    },
    owner_username: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'admin',
      comment: 'Web user that owns this account',
    },
    group_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('ACC_LOGIN','LOGIN_THANH_CONG','ACC_DA_KHANG','ACC_CHUA_KHANG','ACC_DU_DK','ACC_DA_DUNG','ACC_DIE'),
      defaultValue: 'LOGIN_THANH_CONG',
      allowNull: false,
    },
    live_status: {
      type: DataTypes.ENUM('unknown', 'live', 'die'),
      defaultValue: 'unknown',
      allowNull: false,
    },
    video_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0,
      allowNull: false,
    },
    followers: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: 'TikTok follower count (from live check)',
    },
    following: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: 'TikTok following count (from live check)',
    },
    reg_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Server-set registration timestamp',
    },
    last_upload_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    khang_reported_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_live_check_at: {
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
    locked_by: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Device ID holding the lock',
    },
    locked_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When lock was acquired',
    },
  },
  {
    tableName: 'accounts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['status'] },
      { fields: ['live_status'] },
      { fields: ['device_id'] },
      { fields: ['reg_at'] },
      { fields: ['status', 'live_status'] },
      { fields: ['status', 'locked_by', 'locked_at'] },
      { fields: ['locked_at'] },
      { fields: ['last_upload_at'] },
    ],
  }
);

module.exports = Account;

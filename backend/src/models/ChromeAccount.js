const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ChromeAccount = sequelize.define(
  'ChromeAccount',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    raw_data:   { type: DataTypes.TEXT,          allowNull: true },
    username:   { type: DataTypes.STRING(255),   allowNull: true },
    password:   { type: DataTypes.STRING(255),   allowNull: true },
    twofa:      { type: DataTypes.STRING(255),   allowNull: true },
    email:      { type: DataTypes.STRING(255),   allowNull: true },
    email_pass: { type: DataTypes.STRING(255),   allowNull: true },
    cookie:     { type: DataTypes.TEXT('long'),  allowNull: true },
    token:      { type: DataTypes.TEXT('long'),  allowNull: true },
    proxy:      { type: DataTypes.STRING(255),   allowNull: true },
    device_id:  { type: DataTypes.STRING(255),   allowNull: true },
    owner_username: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'admin',
    },
    group_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(
        'ACC_LOGIN',
        'LOGIN_THANH_CONG',
        'ACC_DA_KHANG','ACC_CHUA_KHANG',
        'ACC_DU_DK','ACC_DA_DUNG','ACC_DIE'
      ),
      defaultValue: 'ACC_LOGIN',
      allowNull: false,
    },
    live_status: {
      type: DataTypes.ENUM('unknown','live','die'),
      defaultValue: 'unknown',
      allowNull: false,
    },
    video_count: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0,    allowNull: false },
    followers:   { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    following:   { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    note:        { type: DataTypes.TEXT,             allowNull: true },
    locked_by:   { type: DataTypes.STRING(255),      allowNull: true },
    locked_at:   { type: DataTypes.DATE,             allowNull: true },
    reg_at:            { type: DataTypes.DATE, allowNull: true },
    last_live_check_at:{ type: DataTypes.DATE, allowNull: true },
    fail_reason: { type: DataTypes.STRING(500), allowNull: true },
  },
  {
    tableName:  'chrome_accounts',
    timestamps: true,
    createdAt:  'created_at',
    updatedAt:  'updated_at',
    indexes: [
      { fields: ['status'] },
      { fields: ['live_status'] },
      { fields: ['device_id'] },
      { fields: ['group_id'] },
      { fields: ['reg_at'] },
      { fields: ['status', 'live_status'] },
    ],
  }
);

module.exports = ChromeAccount;

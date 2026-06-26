const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const JobAccount = sequelize.define(
  'JobAccount',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    raw_data: {
      type: DataTypes.TEXT('long'),
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
    group_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    job_type: {
      type: DataTypes.ENUM('chrome', 'hotmail'),
      allowNull: false,
      defaultValue: 'chrome',
    },
    job_web: {
      type: DataTypes.ENUM('TDS', 'XSMM'),
      allowNull: false,
      defaultValue: 'TDS',
    },
    status: {
      type: DataTypes.ENUM(
        'ACCOUNT_CHAY',
        'DANG_LAM',
        'DUOI_50_JOB',
        'FAIL_AVT',
        'LOI_CAU_HINH',
        'DA_CHAY_XONG',
        'ACCOUNT_DIE'
      ),
      allowNull: false,
      defaultValue: 'ACCOUNT_CHAY',
    },
    job_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    today_job_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    today_job_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    live_status: {
      type: DataTypes.ENUM('unknown', 'live', 'die'),
      allowNull: false,
      defaultValue: 'unknown',
    },
    video_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    followers: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    following: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    last_live_check_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    device_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
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
    login_fail_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    last_login_fail_at: {
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
    tableName: 'job_accounts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        name: 'uq_job_owner_username',
        fields: ['owner_username', 'username'],
      },
      { fields: ['owner_username', 'status'] },
      { fields: ['status', 'locked_at'] },
      { fields: ['locked_by'] },
      { fields: ['device_id'] },
    ],
  }
);

module.exports = JobAccount;

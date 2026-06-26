const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const JobDailyStat = sequelize.define(
  'JobDailyStat',
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
    device_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    stat_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    web: {
      type: DataTypes.ENUM('TDS', 'XSMM'),
      allowNull: false,
      defaultValue: 'TDS',
    },
    job_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'job_daily_stats',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['device_id'] },
    ],
  }
);

module.exports = JobDailyStat;

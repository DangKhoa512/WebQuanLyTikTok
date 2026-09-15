const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FacebookNurtureAssignment = sequelize.define('FacebookNurtureAssignment', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  owner_username: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  device_id: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  scenario_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
}, {
  tableName: 'facebook_nurture_assignments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      name: 'uq_fb_nurture_assignment_owner_device',
      fields: ['owner_username', 'device_id'],
    },
    {
      name: 'idx_fb_nurture_assignment_owner_scenario',
      fields: ['owner_username', 'scenario_id'],
    },
  ],
});

module.exports = FacebookNurtureAssignment;

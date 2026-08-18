const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MachineApiConfig = sequelize.define('MachineApiConfig', {
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
  config_key: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  config_value: {
    type: DataTypes.TEXT('long'),
    allowNull: false,
  },
}, {
  tableName: 'machine_api_configs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      name: 'uq_machine_api_owner_device_key',
      fields: ['owner_username', 'device_id', 'config_key'],
    },
    {
      name: 'idx_machine_api_owner_device',
      fields: ['owner_username', 'device_id'],
    },
  ],
});

module.exports = MachineApiConfig;

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const HotmailAccount = sequelize.define('HotmailAccount', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  raw_data: { type: DataTypes.TEXT('long'), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false },
  password: { type: DataTypes.TEXT, allowNull: true },
  owner_username: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'admin' },
  status: {
    type: DataTypes.ENUM('CHUA_SU_DUNG', 'DANG_SU_DUNG', 'DA_SU_DUNG'),
    allowNull: false,
    defaultValue: 'CHUA_SU_DUNG',
  },
  device_id: { type: DataTypes.STRING(255), allowNull: true },
  locked_by: { type: DataTypes.STRING(255), allowNull: true },
  locked_at: { type: DataTypes.DATE, allowNull: true },
  used_at: { type: DataTypes.DATE, allowNull: true },
  note: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'hotmail_accounts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, name: 'uq_hotmail_owner_email', fields: ['owner_username', 'email'] },
    { fields: ['owner_username', 'status'] },
    { fields: ['locked_by'] },
    { fields: ['device_id'] },
  ],
});

module.exports = HotmailAccount;

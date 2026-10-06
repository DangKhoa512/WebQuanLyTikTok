const { DataTypes } = require('sequelize');
const db = require('../config/database');
const scope = {
 owner_username: { type: DataTypes.STRING(100), allowNull: false },
 platform: { type: DataTypes.STRING(20), allowNull: false },
 action_type: { type: DataTypes.STRING(30), allowNull: false },
 source_account_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
 scenario_id: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
};
const scopeKeys = ['owner_username','platform','action_type','source_account_id','scenario_id'];
module.exports = db.define('CrossTargetHistory', {
 id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, ...scope,
 cycle_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
 target_key: { type: DataTypes.STRING(255), allowNull: false },
 batch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
 status: { type: DataTypes.ENUM('ISSUED','SUCCESS','FAILED'), allowNull: false, defaultValue: 'ISSUED' },
 issued_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'cross_target_history', timestamps: false, indexes: [
 { unique: true, name: 'uq_cross_history_target', fields: [...scopeKeys,'cycle_id','target_key'] },
 { name: 'idx_cross_history_batch', fields: ['batch_id'] },
] });

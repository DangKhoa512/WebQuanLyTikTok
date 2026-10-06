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
module.exports = db.define('CrossTargetBatch', {
 id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, ...scope,
 request_id: { type: DataTypes.STRING(100), allowNull: false },
 cycle_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
 requested_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
 available_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
 issued_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
 issued_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'cross_target_batches', timestamps: false, indexes: [{ unique: true, name: 'uq_cross_batch_request', fields: [...scopeKeys,'request_id'] }] });

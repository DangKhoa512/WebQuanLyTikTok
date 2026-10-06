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
module.exports = db.define('CrossTargetCycle', {
 id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true }, ...scope,
 cycle_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
 legacy_imported: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'cross_target_cycles', timestamps: false, indexes: [{ unique: true, name: 'uq_cross_cycle_scope', fields: scopeKeys }] });

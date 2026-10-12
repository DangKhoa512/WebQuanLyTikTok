const db = require("../config/database"),
  { DataTypes: D } = require("sequelize");
const base = require("./DashboardDevice");
// A restricted management projection of dashboard_devices, not a second device table.
// Legacy heartbeat continues to select/return exactly its original attributes.
const attributes = Object.fromEntries(
  Object.entries(base.getAttributes()).map(([k, v]) => [k, { ...v }]),
);
module.exports = db.define(
  "ManagedDashboardDevice",
  {
    ...attributes,
    private_ip: { type: D.STRING(15), allowNull: true },
    ip_updated_at: { type: D.DATE, allowNull: true },
    ip_changed_at: { type: D.DATE, allowNull: true },
    device_group_id: { type: D.INTEGER.UNSIGNED, allowNull: true },
    lan_id: { type: D.INTEGER.UNSIGNED, allowNull: true },
    gateway_id: { type: D.INTEGER.UNSIGNED, allowNull: true },
    ssh_status: { type: D.STRING(20), defaultValue: "UNKNOWN" },
    ssh_checked_at: { type: D.DATE, allowNull: true },
    ssh_credentials: { type: D.TEXT, allowNull: true },
    ssh_host_fingerprint: { type: D.STRING(64), allowNull: true },
    command_adapter: { type: D.STRING(30), defaultValue: "UNCONFIGURED" },
  },
  {
    tableName: "dashboard_devices",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

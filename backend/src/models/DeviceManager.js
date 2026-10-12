const { DataTypes: D } = require("sequelize");
const db = require("../config/database");
const owner = { type: D.STRING(100), allowNull: false };
const id = { type: D.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true };
const opts = (table) => ({
  tableName: table,
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});
const Group = db.define(
  "DeviceGroup",
  {
    id,
    owner_username: owner,
    name: { type: D.STRING(100), allowNull: false },
  },
  {
    ...opts("device_groups"),
    indexes: [{ unique: true, fields: ["owner_username", "name"] }],
  },
);
const Lan = db.define(
  "NetworkLan",
  {
    id,
    owner_username: owner,
    name: { type: D.STRING(100), allowNull: false },
    description: D.STRING(500),
  },
  {
    ...opts("network_lans"),
    indexes: [{ unique: true, fields: ["owner_username", "name"] }],
  },
);
const Gateway = db.define(
  "SshGateway",
  {
    id,
    owner_username: owner,
    name: { type: D.STRING(100), allowNull: false },
    token_hash: {
      type: D.STRING(64),
      allowNull: false,
      unique: "uq_dm_gateway_token_hash",
    },
    is_active: { type: D.BOOLEAN, defaultValue: true },
    last_connected_at: D.DATE,
    last_seen: D.DATE,
    version: D.STRING(50),
    max_connections: { type: D.INTEGER, defaultValue: 5 },
  },
  { ...opts("ssh_gateways"), indexes: [{ fields: ["owner_username"] }] },
);
const Mapping = db.define(
  "GatewayLanMapping",
  {
    id,
    owner_username: owner,
    gateway_id: {
      type: D.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: Gateway, key: "id" },
      onDelete: "CASCADE",
    },
    lan_id: {
      type: D.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: Lan, key: "id" },
      onDelete: "CASCADE",
    },
  },
  {
    ...opts("gateway_lan_mappings"),
    indexes: [
      { unique: true, fields: ["gateway_id", "lan_id"] },
      { fields: ["owner_username", "lan_id"] },
    ],
  },
);
const Action = db.define(
  "SshActionLog",
  {
    id: { type: D.UUID, primaryKey: true, defaultValue: D.UUIDV4 },
    owner_username: owner,
    device_id: { type: D.STRING(255), allowNull: false },
    gateway_id: D.INTEGER.UNSIGNED,
    action: { type: D.STRING(40), allowNull: false },
    request_key: { type: D.STRING(100), allowNull: false },
    status: { type: D.STRING(30), defaultValue: "QUEUED" },
    started_at: D.DATE,
    finished_at: D.DATE,
    result: D.JSON,
    error_code: D.STRING(100),
    requested_by: D.STRING(100),
    snapshot: D.TEXT,
  },
  {
    ...opts("ssh_action_logs"),
    indexes: [
      { unique: true, fields: ["owner_username", "request_key", "device_id"] },
      { fields: ["owner_username", "device_id", "created_at"] },
      { fields: ["gateway_id", "status"] },
    ],
  },
);
const Session = db.define(
  "SshSession",
  {
    id: { type: D.UUID, primaryKey: true, defaultValue: D.UUIDV4 },
    owner_username: owner,
    device_id: { type: D.STRING(255), allowNull: false },
    gateway_id: D.INTEGER.UNSIGNED,
    status: { type: D.STRING(30), defaultValue: "CREATED" },
    ticket_hash: D.STRING(64),
    ticket_expires_at: D.DATE,
    started_at: D.DATE,
    finished_at: D.DATE,
    error_code: D.STRING(100),
  },
  {
    ...opts("ssh_sessions"),
    indexes: [{ fields: ["owner_username", "device_id", "created_at"] }],
  },
);
module.exports = { Group, Lan, Gateway, Mapping, Action, Session };

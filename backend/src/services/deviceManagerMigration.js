const { DataTypes: D } = require("sequelize");
const db = require("../config/database");
const models = require("../models/DeviceManager");
const columns = {
  private_ip: { type: D.STRING(15), allowNull: true },
  ip_updated_at: { type: D.DATE, allowNull: true },
  ip_changed_at: { type: D.DATE, allowNull: true },
  device_group_id: {
    type: D.INTEGER.UNSIGNED,
    allowNull: true,
    references: { model: "device_groups", key: "id" },
    onDelete: "SET NULL",
  },
  lan_id: {
    type: D.INTEGER.UNSIGNED,
    allowNull: true,
    references: { model: "network_lans", key: "id" },
    onDelete: "SET NULL",
  },
  gateway_id: {
    type: D.INTEGER.UNSIGNED,
    allowNull: true,
    references: { model: "ssh_gateways", key: "id" },
    onDelete: "SET NULL",
  },
  ssh_status: { type: D.STRING(20), allowNull: false, defaultValue: "UNKNOWN" },
  ssh_checked_at: { type: D.DATE, allowNull: true },
  ssh_credentials: { type: D.TEXT, allowNull: true },
  ssh_host_fingerprint: { type: D.STRING(64), allowNull: true },
  command_adapter: {
    type: D.STRING(30),
    allowNull: false,
    defaultValue: "UNCONFIGURED",
  },
};
const tenantLinks = [
  [
    "dashboard_devices",
    "device_group_id",
    "device_groups",
    "fk_dm_device_owner_group",
    "RESTRICT",
  ],
  [
    "dashboard_devices",
    "lan_id",
    "network_lans",
    "fk_dm_device_owner_lan",
    "RESTRICT",
  ],
  [
    "dashboard_devices",
    "gateway_id",
    "ssh_gateways",
    "fk_dm_device_owner_gateway",
    "RESTRICT",
  ],
  [
    "gateway_lan_mappings",
    "gateway_id",
    "ssh_gateways",
    "fk_dm_mapping_owner_gateway",
    "CASCADE",
  ],
  [
    "gateway_lan_mappings",
    "lan_id",
    "network_lans",
    "fk_dm_mapping_owner_lan",
    "CASCADE",
  ],
  [
    "ssh_action_logs",
    "gateway_id",
    "ssh_gateways",
    "fk_dm_action_owner_gateway",
    "RESTRICT",
  ],
  [
    "ssh_sessions",
    "gateway_id",
    "ssh_gateways",
    "fk_dm_session_owner_gateway",
    "RESTRICT",
  ],
];
async function tenantConstraints(qi) {
  for (const table of ["device_groups", "network_lans", "ssh_gateways"]) {
    const name = "uq_dm_" + table + "_owner_id";
    const indexes = await qi.showIndex(table);
    if (!indexes.some((i) => i.name === name))
      await qi.addIndex(table, ["owner_username", "id"], {
        name,
        unique: true,
      });
  }
  for (const [table, column, parent, name, onDelete] of tenantLinks) {
    const constraints = await qi.getForeignKeyReferencesForTable(table);
    if (!constraints.some((c) => c.constraintName === name))
      await qi.addConstraint(table, {
        fields: ["owner_username", column],
        type: "foreign key",
        name,
        references: { table: parent, fields: ["owner_username", "id"] },
        onDelete,
        onUpdate: "RESTRICT",
      });
  }
}
async function up() {
  const connection = await db.connectionManager.getConnection({
    type: "WRITE",
  });
  const query = (sql) =>
    new Promise((resolve, reject) =>
      connection.query(sql, (e, r) => (e ? reject(e) : resolve(r))),
    );
  let acquired = false;
  try {
    const rows = await query(
      "SELECT GET_LOCK(CONCAT('quanly:dm:',LEFT(SHA2(DATABASE(),256),40)),30) acquired",
    );
    acquired = Number(rows[0].acquired) === 1;
    if (!acquired) throw new Error("Migration lock unavailable");
    for (const model of Object.values(models))
      await model.sync({ force: false, alter: false });
    const qi = db.getQueryInterface(),
      existing = await qi.describeTable("dashboard_devices");
    for (const [name, definition] of Object.entries(columns))
      if (!existing[name])
        await qi.addColumn("dashboard_devices", name, definition);
    const indexes = await qi.showIndex("dashboard_devices");
    for (const [name, fields] of [
      ["idx_dm_owner_group", ["owner_username", "device_group_id"]],
      ["idx_dm_owner_lan", ["owner_username", "lan_id"]],
      ["idx_dm_owner_ssh", ["owner_username", "ssh_status"]],
    ])
      if (!indexes.some((i) => i.name === name))
        await qi.addIndex("dashboard_devices", fields, { name });
    await tenantConstraints(qi);
  } finally {
    if (acquired)
      try {
        await query(
          "SELECT RELEASE_LOCK(CONCAT('quanly:dm:',LEFT(SHA2(DATABASE(),256),40)))",
        );
      } catch {
        connection.destroy();
      }
    await db.connectionManager.releaseConnection(connection);
  }
}
async function down() {
  const qi = db.getQueryInterface();
  const constraints =
    await qi.getForeignKeyReferencesForTable("dashboard_devices");
  for (const name of new Set(constraints.map((c) => c.constraintName)))
    if (tenantLinks.some((x) => x[0] === "dashboard_devices" && x[3] === name))
      await qi.removeConstraint("dashboard_devices", name);
  const existing = await qi.describeTable("dashboard_devices");
  for (const name of Object.keys(columns).reverse())
    if (existing[name]) await qi.removeColumn("dashboard_devices", name);
  for (const model of Object.values(models).reverse()) await model.drop();
}
module.exports = { up, down, columns };

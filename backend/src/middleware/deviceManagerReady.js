const db = require("../config/database");
let ready = false;
let checking;
module.exports = async (req, res, next) => {
  if (process.env.DEVICE_MANAGER_ENABLED !== "true") {
    return res
      .status(503)
      .json({ success: false, message: "DEVICE_MANAGER_DISABLED", data: null });
  }
  try {
    if (!ready) {
      checking ||= (async () => {
        const qi = db.getQueryInterface();
        const cols = await qi.describeTable("dashboard_devices");
        for (const column of [
          "private_ip",
          "ip_updated_at",
          "ip_changed_at",
          "device_group_id",
          "lan_id",
          "gateway_id",
          "ssh_status",
          "ssh_checked_at",
          "ssh_credentials",
          "ssh_host_fingerprint",
          "command_adapter",
        ]) {
          if (!cols[column]) throw new Error("Migration required");
        }
        const tables = await qi.showAllTables();
        for (const table of [
          "device_groups",
          "network_lans",
          "ssh_gateways",
          "gateway_lan_mappings",
          "ssh_action_logs",
          "ssh_sessions",
        ]) {
          if (!tables.includes(table)) throw new Error("Migration required");
        }
        const links = {
          dashboard_devices: [
            "fk_dm_device_owner_group",
            "fk_dm_device_owner_lan",
            "fk_dm_device_owner_gateway",
          ],
          gateway_lan_mappings: [
            "fk_dm_mapping_owner_gateway",
            "fk_dm_mapping_owner_lan",
          ],
          ssh_action_logs: ["fk_dm_action_owner_gateway"],
          ssh_sessions: ["fk_dm_session_owner_gateway"],
        };
        for (const [table, names] of Object.entries(links)) {
          const references = await qi.getForeignKeyReferencesForTable(table);
          for (const name of names) {
            if (
              !references.some(
                (r) =>
                  r.constraintName === name &&
                  r.columnName === "owner_username",
              )
            ) {
              throw new Error("Tenant constraints required");
            }
          }
        }
        ready = true;
      })();
      await checking;
    }
    next();
  } catch {
    checking = null;
    res
      .status(503)
      .json({
        success: false,
        message: "DEVICE_MANAGER_MIGRATION_REQUIRED",
        data: null,
      });
  }
};

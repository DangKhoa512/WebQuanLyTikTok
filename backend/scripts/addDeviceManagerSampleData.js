require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const { QueryTypes } = require("sequelize");
const db = require("../src/config/database");

const apply = process.argv.includes("--apply");
const ownerArgument = process.argv.find((value) => value.startsWith("--owner="));
const owner = ownerArgument ? ownerArgument.slice("--owner=".length) : "admin";
const now = new Date();
const samples = [
  {
    device_id: "sample-device-01",
    device_name: "Điện thoại mẫu 01",
    private_ip: "192.168.10.101",
    public_ip: "203.0.113.101",
    mac_address: "02:00:00:00:01:01",
    ip_updated_at: now,
    ip_changed_at: now,
    last_seen: now,
  },
  {
    device_id: "sample-device-02",
    device_name: "Điện thoại mẫu 02",
    private_ip: "192.168.10.102",
    public_ip: "198.51.100.102",
    mac_address: "02:00:00:00:01:02",
    ip_updated_at: now,
    ip_changed_at: now,
    last_seen: now,
  },
  {
    device_id: "sample-device-03",
    device_name: "Điện thoại mẫu Offline",
    private_ip: "10.10.0.103",
    public_ip: "192.0.2.103",
    mac_address: "02:00:00:00:01:03",
    ip_updated_at: now,
    ip_changed_at: now,
    last_seen: new Date(now.getTime() - 31 * 60 * 1000),
  },
  {
    device_id: "sample-device-04",
    device_name: "Điện thoại mẫu Public IPv6",
    private_ip: "172.16.20.104",
    public_ip: "2001:db8::104",
    mac_address: "02:00:00:00:01:04",
    ip_updated_at: now,
    ip_changed_at: now,
    last_seen: now,
  },
  {
    device_id: "sample-device-05",
    device_name: "Điện thoại mẫu thiếu MAC",
    private_ip: "192.168.20.105",
    public_ip: "203.0.113.105",
    mac_address: null,
    ip_updated_at: now,
    ip_changed_at: now,
    last_seen: now,
  },
  {
    device_id: "sample-device-06",
    device_name: "Điện thoại mẫu thiếu Public IP",
    private_ip: "192.168.20.106",
    public_ip: null,
    mac_address: "02:00:00:00:01:06",
    ip_updated_at: now,
    ip_changed_at: now,
    last_seen: now,
  },
  {
    device_id: "sample-device-07",
    device_name: "Điện thoại mẫu chỉ Private IP",
    private_ip: "10.20.0.107",
    public_ip: null,
    mac_address: null,
    ip_updated_at: now,
    ip_changed_at: now,
    last_seen: now,
  },
  {
    device_id: "sample-device-08",
    device_name: "Điện thoại mẫu Offline IPv6",
    private_ip: "10.20.0.108",
    public_ip: "2001:db8::108",
    mac_address: "02:00:00:00:01:08",
    ip_updated_at: now,
    ip_changed_at: now,
    last_seen: new Date(now.getTime() - 45 * 60 * 1000),
  },
];

function stop(code) {
  throw Object.assign(new Error(code), { publicCode: code });
}

(async () => {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner))
    stop("DEVICE_MANAGER_SAMPLE_INVALID_OWNER");
  await db.authenticate();
  const columns = await db
    .getQueryInterface()
    .describeTable("dashboard_devices");
  if (!columns.public_ip || !columns.mac_address)
    stop("DEVICE_MANAGER_SAMPLE_MIGRATION_REQUIRED");

  const users = await db.query(
    "SELECT id FROM users WHERE username=:owner LIMIT 1",
    { replacements: { owner }, type: QueryTypes.SELECT },
  );
  if (!users.length) stop("DEVICE_MANAGER_SAMPLE_OWNER_NOT_FOUND");

  const ids = samples.map((sample) => sample.device_id);
  const existing = await db.query(
    "SELECT device_id,private_ip,public_ip,mac_address,device_group_id,lan_id,gateway_id,last_seen FROM dashboard_devices WHERE owner_username=:owner AND device_id IN (:ids)",
    { replacements: { owner, ids }, type: QueryTypes.SELECT },
  );
  if (!apply) {
    console.log(
      JSON.stringify({
        ready: true,
        owner,
        sample_devices: ids,
        existing: existing.length,
        complete_network_data: existing.filter(
          (device) =>
            device.private_ip && device.public_ip && device.mac_address,
        ).length,
        missing_public_ip: existing.filter((device) => !device.public_ip)
          .length,
        missing_mac_address: existing.filter((device) => !device.mac_address)
          .length,
        offline_samples: existing.filter(
          (device) =>
            Date.now() - new Date(device.last_seen).getTime() > 30 * 60 * 1000,
        ).length,
        unassigned_lan: existing.filter(
          (device) =>
            device.device_group_id === null &&
            device.lan_id === null &&
            device.gateway_id === null,
        ).length,
        action: "Run again with --apply to add or refresh sample devices",
      }),
    );
    return;
  }

  const Device = require("../src/models/ManagedDevice");
  let created = 0,
    updated = 0;
  await db.transaction(async (transaction) => {
    for (const sample of samples) {
      const [device, wasCreated] = await Device.findOrCreate({
        where: { owner_username: owner, device_id: sample.device_id },
        defaults: {
          owner_username: owner,
          ...sample,
          reported_status: "IDLE",
        },
        transaction,
      });
      if (wasCreated) created += 1;
      else {
        await device.update(
          { ...sample, reported_status: "IDLE" },
          { transaction },
        );
        updated += 1;
      }
    }
  });
  console.log(
    JSON.stringify({
      success: true,
      owner,
      created,
      updated,
      lan_assignment: "UNCHANGED",
    }),
  );
})()
  .catch((error) => {
    console.error(error.publicCode || "DEVICE_MANAGER_SAMPLE_FAILED");
    process.exitCode = 1;
  })
  .finally(() => db.close());

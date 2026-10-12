require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const db = require("../src/config/database");
(async () => {
  if (!process.argv.includes("--apply"))
    throw new Error(
      "Use --apply; rollback requires --rollback --apply after backup",
    );
  await db.authenticate();
  const m = require("../src/services/deviceManagerMigration");
  if (process.argv.includes("--rollback")) await m.down();
  else await m.up();
  console.log("DEVICE_MANAGER_MIGRATION_OK");
})()
  .catch(() => {
    console.error("DEVICE_MANAGER_MIGRATION_FAILED");
    process.exitCode = 1;
  })
  .finally(() => db.close());

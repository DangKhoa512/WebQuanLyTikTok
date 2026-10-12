require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const db = require("../src/config/database");
(async () => {
  await db.authenticate();
  if (process.env.DEVICE_MANAGER_SSH_ENABLED !== "true")
    throw new Error(
      "Set DEVICE_MANAGER_SSH_ENABLED=true for explicit broker startup",
    );
  const broker = await require("../src/services/deviceGatewayBroker").start();
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      await broker.close();
      await db.close();
      process.exit(0);
    });
  console.log("DEVICE_BROKER_STARTED");
})().catch(() => {
  console.error("DEVICE_BROKER_START_FAILED");
  process.exit(1);
});

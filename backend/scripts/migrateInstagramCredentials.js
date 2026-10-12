const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const db = require("../src/config/database");
(async () => {
  if (!process.argv.includes("--apply")) {
    console.log(
      "PLAN: add nullable token/token_updated_at columns only. Run --apply after backup.",
    );
    return;
  }
  await require("../src/services/instagramCredentialMigration").migrate(db);
  console.log("INSTAGRAM_CREDENTIAL_MIGRATION_OK");
})()
  .catch((e) => {
    console.error(e.name);
    process.exitCode = 1;
  })
  .finally(() => db.close());

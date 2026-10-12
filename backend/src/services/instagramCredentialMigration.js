const { DataTypes } = require("sequelize");
async function migrate(db) {
  const qi = db.getQueryInterface();
  await db
    .query("SELECT GET_LOCK('ig_credentials_migration',15) acquired", {
      logging: false,
    })
    .then(([rows]) => {
      if (Number(rows[0].acquired) !== 1) throw Error("MIGRATION_LOCK_TIMEOUT");
    });
  try {
    const columns = await qi.describeTable("instagram_accounts");
    if (!columns.token)
      await qi.addColumn("instagram_accounts", "token", {
        type: DataTypes.TEXT("long"),
        allowNull: true,
      });
    if (!columns.token_updated_at)
      await qi.addColumn("instagram_accounts", "token_updated_at", {
        type: DataTypes.DATE,
        allowNull: true,
      });
  } finally {
    await db.query("SELECT RELEASE_LOCK('ig_credentials_migration')", {
      logging: false,
    });
  }
}
module.exports = { migrate };

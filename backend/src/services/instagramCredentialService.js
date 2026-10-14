const db = require("../config/database");
const Account = require("../models/InstagramAccount");
const validation = require("./instagramCredentials");
const logger = require("../config/logger");
async function update(owner, input, { deviceId, kind = "job" } = {}) {
  const uid = input.uid || input.username;
  if (typeof uid !== "string" || !uid.trim())
    throw Object.assign(new Error("ACCOUNT_UID_REQUIRED"), { statusCode: 400 });
  // Keep the network request outside the row-locking transaction.
  const checked = await validation.patchAndEnrich(input, { owner });
  return db.transaction(async (transaction) => {
    const account = await Account.findOne({
      where: { owner_username: owner, kind, uid: uid.trim() },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!account)
      throw Object.assign(new Error("INSTAGRAM_ACCOUNT_NOT_FOUND"), {
        statusCode: 404,
      });
    if (
      deviceId &&
      account.device_id !== deviceId &&
      account.locked_by !== deviceId
    )
      throw Object.assign(new Error("ACCOUNT_DEVICE_MISMATCH"), {
        statusCode: 409,
      });
    if (account.locked_by && deviceId && account.locked_by !== deviceId)
      throw Object.assign(new Error("ACCOUNT_LOCKED_BY_OTHER_DEVICE"), {
        statusCode: 409,
      });
    if (Object.keys(checked.values).length)
      await account.update(checked.values, { transaction });
    logger.info("Instagram credentials updated", {
      owner_username: owner,
      account_id: account.id,
      fields: Object.keys(checked.values).filter(
        (k) => k !== "token_updated_at",
      ),
      warning_codes: checked.warnings,
    });
    return {
      account_id: account.id,
      uid: account.uid,
      updated_fields: Object.keys(checked.values).filter(
        (k) => k !== "token_updated_at",
      ),
      warnings: checked.warnings,
    };
  });
}
async function detail(owner, id, field) {
  if (
    !/^\d+$/.test(String(id)) ||
    !Number.isSafeInteger(Number(id)) ||
    Number(id) < 1
  )
    throw Object.assign(new Error("INVALID_ACCOUNT_ID"), { statusCode: 400 });
  if (!["cookies", "token"].includes(field))
    throw Object.assign(new Error("INVALID_CREDENTIAL_FIELD"), {
      statusCode: 400,
    });
  const account = await Account.unscoped().findOne({
    where: { id, owner_username: owner },
    attributes: ["id", "uid", field, "token_updated_at"],
  });
  if (!account)
    throw Object.assign(new Error("INSTAGRAM_ACCOUNT_NOT_FOUND"), {
      statusCode: 404,
    });
  logger.info("Instagram credential viewed", {
    owner_username: owner,
    account_id: account.id,
    field,
  });
  return {
    id: account.id,
    uid: account.uid,
    field,
    value: account[field] || "",
    ...(field === "token"
      ? { token_updated_at: account.token_updated_at }
      : {}),
  };
}
const safeAttributes = {
  exclude: ["cookies", "token", "raw_data"],
  include: [
    [
      db.literal(
        "CASE WHEN cookies IS NOT NULL AND TRIM(cookies) NOT IN ('','null') THEN 1 ELSE 0 END",
      ),
      "has_cookies",
    ],
    [
      db.literal(
        "CASE WHEN token IS NOT NULL AND TRIM(token) NOT IN ('','null') THEN 1 ELSE 0 END",
      ),
      "has_token",
    ],
  ],
};
function safeSerialize(account) {
  const row = account.toJSON ? account.toJSON() : { ...account };
  delete row.cookies;
  delete row.token;
  delete row.raw_data;
  delete row.full_data;
  return row;
}
module.exports = { update, detail, safeAttributes, safeSerialize };

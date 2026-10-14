const crypto = require("crypto");
const csrfService = require("./instagramCsrfService");
const fail = (field, reason) =>
  Object.assign(
    new Error("INVALID_INSTAGRAM_" + field.toUpperCase() + ": " + reason),
    { statusCode: 400 },
  );
const present = (value) =>
  value !== undefined && value !== null && value !== "";

// User-confirmed producer signature. Never strip arbitrary hexadecimal fragments.
function normalizeKnownSession(value) {
  const entries = value
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  const pairs = entries.map((part) => {
    const at = part.indexOf("=");
    return { name: part.slice(0, at), value: part.slice(at + 1) };
  });
  const uid = pairs.find((p) => p.name.toLowerCase() === "ds_user_id")?.value;
  const session = pairs.find((p) => p.name.toLowerCase() === "sessionid");
  if (!uid || !session) return { value, normalized: false };
  const match = session.value.match(
    /^(\d+)0X1\.0FDAB1AP-1042([A-Za-z_-][A-Za-z0-9_-]*)0X0P\+0(\d+)0X1\.FB5D8CE8P-1042([A-Za-z_-][A-Za-z0-9_-]*)$/i,
  );
  if (!match || match[1] !== uid) return { value, normalized: false };
  // Additional marker-looking data is ambiguous and must remain unchanged.
  if ([match[2], match[4]].some((v) => /0x[0-9a-f.]+(?:p[+-]?\d+)?/i.test(v)))
    return { value, normalized: false };
  session.value =
    match[1] + "%3A" + match[2] + "%3A" + match[3] + "%3A" + match[4];
  return {
    value: pairs.map((p) => p.name + "=" + p.value).join("; ") + ";",
    normalized: true,
  };
}

function validateCookies(value) {
  if (typeof value !== "string") throw fail("cookies", "expected string");
  if (value.length > 131072 || /[\x00-\x1f\x7f]/.test(value))
    throw fail("cookies", "control character or oversized header");
  const parts = value.split(";");
  const seen = new Set();
  let hex = false,
    encoded = false;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) {
      if (i === parts.length - 1) continue;
      throw fail("cookies", "empty cookie");
    }
    const equals = part.indexOf("=");
    if (equals < 1) throw fail("cookies", "expected name=value");
    const name = part.slice(0, equals),
      v = part.slice(equals + 1);
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
      seen.has(name.toLowerCase())
    )
      throw fail("cookies", "invalid or duplicate name");
    seen.add(name.toLowerCase());
    if (!v || /[^\x21-\x7e]|[",;\\]/.test(v))
      throw fail("cookies", "invalid value");
    if (/%(?![0-9a-f]{2})/i.test(v) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(v))
      throw fail("cookies", "invalid percent encoding or encoded control");
    if (name.toLowerCase() === "ds_user_id" && !/^\d+$/.test(v))
      throw fail("cookies", "ds_user_id must be digits");
    if (
      name.toLowerCase() === "sessionid" &&
      /0x[0-9a-f.]+(?:p[+-]?\d+)?/i.test(v)
    )
      hex = true;
    if (/%[0-9a-f]{2}/i.test(v)) encoded = true;
  }
  const normalized = normalizeKnownSession(value);
  return {
    value: normalized.value,
    warnings: normalized.normalized
      ? ["SESSION_CONFIRMED_SIGNATURE_NORMALIZED"]
      : hex
        ? ["SESSION_HEX_PATTERN_UNVERIFIED"]
        : [],
    encoding: normalized.normalized
      ? "PERCENT_ENCODED_NORMALIZED"
      : encoded
        ? "PERCENT_ENCODED_PRESERVED"
        : "RAW_PRESERVED",
  };
}
function validateToken(value) {
  if (
    typeof value !== "string" ||
    value.length > 131072 ||
    /[\x00-\x1f\x7f]/.test(value) ||
    !/^Bearer [^\s]+$/.test(value)
  )
    throw fail("token", "expected Bearer token without control characters");
  return value;
}

function recoverFromIgt(cookie, token) {
  if (
    typeof cookie !== "string" ||
    !/sessionid=[^;]*0x[0-9a-f.]+p[+-]?\d+/i.test(cookie) ||
    typeof token !== "string" ||
    !token.startsWith("Bearer IGT:2:")
  )
    return { value: cookie, recovered: false };
  validateToken(token);
  const encoded = token.slice("Bearer IGT:2:".length);
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded))
    throw fail("token", "invalid IGT payload");
  const clean = encoded.replace(/-/g, "+").replace(/_/g, "/"),
    bytes = Buffer.from(clean, "base64");
  if (bytes.toString("base64").replace(/=+$/, "") !== clean.replace(/=+$/, ""))
    throw fail("token", "invalid IGT base64");
  let payload;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw fail("token", "IGT payload must be JSON");
  }
  if (
    !payload ||
    typeof payload.ds_user_id !== "string" ||
    !/^\d+$/.test(payload.ds_user_id) ||
    typeof payload.sessionid !== "string"
  )
    throw fail("token", "IGT UID/session missing");
  const segments = payload.sessionid.split(/%3a/i);
  if (
    segments.length !== 4 ||
    segments[0] !== payload.ds_user_id ||
    !/^\d+$/.test(segments[2]) ||
    ![segments[1], segments[3]].every((v) => /^[A-Za-z0-9_-]+$/.test(v))
  )
    throw fail("token", "unverified IGT session structure");
  const hex = "0[xX][0-9A-Fa-f]+(?:\\.[0-9A-Fa-f]+)?[pP][+-]\\d+";
  const pattern = new RegExp(
    "^" +
      segments[0] +
      hex +
      segments[1] +
      "0[xX]0[pP]\\+0" +
      segments[2] +
      hex +
      segments[3] +
      "$",
  );
  let found = false,
    uidFound = false;
  const parts = cookie
    .split(";")
    .map((part, i, array) => {
      const text = part.trim();
      if (!text) {
        if (i === array.length - 1) return null;
        throw fail("cookies", "empty cookie");
      }
      const malformed = text.match(/^ds_user_id(\d+)$/);
      if (malformed) {
        if (uidFound || malformed[1] !== payload.ds_user_id)
          throw fail("cookies", "IGT UID mismatch");
        uidFound = true;
        return "ds_user_id=" + payload.ds_user_id;
      }
      const at = text.indexOf("=");
      if (at < 1) throw fail("cookies", "expected name=value");
      const name = text.slice(0, at),
        value = text.slice(at + 1);
      if (name.toLowerCase() === "ds_user_id") {
        if (uidFound || value !== payload.ds_user_id)
          throw fail("cookies", "IGT UID mismatch");
        uidFound = true;
      }
      if (name.toLowerCase() === "sessionid") {
        if (found || !pattern.test(value))
          throw fail("cookies", "IGT session mismatch");
        found = true;
        return name + "=" + payload.sessionid;
      }
      return text;
    })
    .filter(Boolean);
  if (!found || !uidFound) throw fail("cookies", "IGT cookie fields missing");
  const result = parts.join("; ") + ";";
  validateCookies(result);
  return { value: result, recovered: true };
}

function patch(input = {}) {
  const values = {},
    warnings = [];
  for (const field of ["cookies", "token"]) {
    const value = input[field];
    if (
      !present(value) ||
      (typeof value === "string" &&
        (!value.trim() || value.trim().toLowerCase() === "null"))
    )
      continue;
    if (field === "cookies") {
      const recovery = recoverFromIgt(value, input.token);
      const checked = validateCookies(recovery.value);
      if (recovery.recovered)
        warnings.push("SESSION_RECOVERED_FROM_IGT_PAYLOAD");
      values.cookies = checked.value;
      warnings.push(...checked.warnings);
    } else {
      values.token = validateToken(value);
      values.token_updated_at = new Date();
    }
  }
  return { values, warnings };
}

async function patchAndEnrich(input = {}, options = {}) {
  const checked = patch(input);
  if (!checked.values.cookies) return checked;
  const enriched = await csrfService.enrich(checked.values.cookies, options);
  if (enriched.warning) checked.warnings.push(enriched.warning);
  if (enriched.cookies !== checked.values.cookies) {
    checked.values.cookies = validateCookies(enriched.cookies).value;
  }
  return checked;
}
const PREFIX = "igenc:v1:";
function key() {
  const source = process.env.INSTAGRAM_CREDENTIAL_ENCRYPTION_KEY;
  if (!source) return null;
  const k = Buffer.from(source, "base64");
  if (k.length !== 32)
    throw Object.assign(
      new Error("INSTAGRAM_CREDENTIAL_ENCRYPTION_KEY_INVALID"),
      { statusCode: 503 },
    );
  return k;
}
function seal(value) {
  if (!value) return value;
  const k = key();
  if (!k) return value;
  const iv = crypto.randomBytes(12),
    c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}
function unseal(value) {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return value;
  const k = key();
  if (!k)
    throw Object.assign(new Error("INSTAGRAM_CREDENTIAL_KEY_REQUIRED"), {
      statusCode: 503,
    });
  const data = Buffer.from(value.slice(PREFIX.length), "base64"),
    d = crypto.createDecipheriv("aes-256-gcm", k, data.subarray(0, 12));
  d.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([d.update(data.subarray(28)), d.final()]).toString(
    "utf8",
  );
}
module.exports = {
  validateCookies,
  validateToken,
  patch,
  patchAndEnrich,
  seal,
  unseal,
};

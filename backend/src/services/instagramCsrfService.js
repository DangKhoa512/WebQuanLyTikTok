const axios = require("axios");

const CSRF_URL = "https://www.instagram.com/accounts/login/";
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 " +
  "Mobile/15E148 Safari/604.1";

const enabled = () =>
  String(process.env.INSTAGRAM_CSRF_FETCH_ENABLED || "true").toLowerCase() !==
  "false";

const timeoutMs = () => {
  const value = Number(process.env.INSTAGRAM_CSRF_FETCH_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 1000 && value <= 30000
    ? Math.floor(value)
    : 8000;
};

const cookieValue = (cookies, wanted) => {
  const target = String(wanted || "").toLowerCase();
  for (const part of String(cookies || "").split(";")) {
    const text = part.trim();
    const at = text.indexOf("=");
    if (at < 1 || text.slice(0, at).trim().toLowerCase() !== target) continue;
    return text.slice(at + 1).trim();
  }
  return "";
};

const validCsrf = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{8,256}$/.test(value);

const setCookieRows = (headers) => {
  if (typeof headers?.getSetCookie === "function") return headers.getSetCookie();
  const rows = headers?.["set-cookie"] || headers?.["Set-Cookie"] || [];
  return Array.isArray(rows) ? rows : rows ? [rows] : [];
};

const csrfFromResponse = (response) => {
  for (const row of setCookieRows(response?.headers)) {
    const match = String(row || "").match(/(?:^|;\s*)csrftoken=([^;]+)/i);
    const value = match?.[1]?.trim();
    if (validCsrf(value)) return value;
  }
  const html = String(response?.data || "");
  const match =
    html.match(/"csrf_token"\s*:\s*"([A-Za-z0-9_-]+)"/i) ||
    html.match(/"csrfToken"\s*:\s*"([A-Za-z0-9_-]+)"/i);
  return validCsrf(match?.[1]) ? match[1] : "";
};

const appendCsrf = (cookies, csrf) => {
  if (!validCsrf(csrf) || cookieValue(cookies, "csrftoken")) return cookies;
  const parts = String(cookies || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  parts.push("csrftoken=" + csrf);
  return parts.join("; ") + ";";
};

async function enrich(cookies, options = {}) {
  if (cookieValue(cookies, "csrftoken")) {
    return { cookies, fetched: false, warning: null };
  }
  const shouldFetch = options.enabled ?? enabled();
  if (!shouldFetch) return { cookies, fetched: false, warning: null };

  const request =
    options.request || ((url, config) => axios.get(url, config));
  try {
    const response = await request(CSRF_URL, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Referer: "https://www.instagram.com/",
        Cookie: cookies,
      },
      timeout: options.timeoutMs || timeoutMs(),
      maxRedirects: 5,
      maxContentLength: 1024 * 1024,
      validateStatus: () => true,
      decompress: true,
    });
    const csrf = csrfFromResponse(response);
    if (!csrf) {
      return {
        cookies,
        fetched: false,
        warning: "CSRF_TOKEN_NOT_RECEIVED",
      };
    }
    return {
      cookies: appendCsrf(cookies, csrf),
      fetched: true,
      warning: "CSRF_TOKEN_FETCHED",
    };
  } catch (_) {
    return { cookies, fetched: false, warning: "CSRF_TOKEN_FETCH_FAILED" };
  }
}

module.exports = {
  appendCsrf,
  cookieValue,
  csrfFromResponse,
  enrich,
};

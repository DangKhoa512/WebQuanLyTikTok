const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { parseProxy } = require("../utils/checkLiveUtils");
let proxyCursor = 0;

async function proxyOptions(owner, required = false) {
  const settings = await require("./settingsService").getFacebookCheckProxySettings(owner);
  const proxies = (settings.proxies || []).map(parseProxy).filter((value) => {
    try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !!url.hostname; }
    catch (_) { return false; }
  });
  if (!proxies.length && (required || settings.proxies.length)) {
    return { blocked: true, warning: settings.proxies.length ? "CSRF_PROXY_INVALID" : "CSRF_PROXY_REQUIRED" };
  }
  return { proxyUrl: proxies.length ? proxies[proxyCursor++ % proxies.length] : null };
}

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

  let transport = options;
  try {
    if (options.owner) transport = { ...options, ...await proxyOptions(options.owner, options.requireProxy) };
  } catch (_) {
    return { cookies, fetched: false, warning: "CSRF_PROXY_SETTINGS_FAILED" };
  }
  if (transport.blocked) return { cookies, fetched: false, warning: transport.warning };

  const request =
    options.request || ((url, config) => axios.get(url, config));
  const deadline = Date.now() + (options.timeoutMs || timeoutMs());
  let httpStatus = null;
  let previousHttpStatus = null;
  let requestStage = 'initial';
  const failure = warning => ({ cookies, fetched: false, warning, http_status: httpStatus,
    previous_http_status: previousHttpStatus, request_stage: requestStage });
  try {
    let url = CSRF_URL;
    for (let hop = 0; hop <= 2; hop++) {
    requestStage = hop ? 'redirect' : 'initial';
    previousHttpStatus = httpStatus;
    httpStatus = null;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return failure("CSRF_FETCH_TIMEOUT");
    const response = await request(url, {
      proxy: false,
      ...(transport.proxyUrl ? { httpsAgent: new HttpsProxyAgent(transport.proxyUrl) } : {}),
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
      timeout: remaining,
      maxRedirects: 0,
      maxContentLength: 8 * 1024 * 1024,
      validateStatus: () => true,
      decompress: true,
    });
    httpStatus = response.status;
    if (httpStatus === 429) return failure("CSRF_RATE_LIMITED");
    if (httpStatus === 407) return failure("CSRF_PROXY_AUTH_REQUIRED");
    if (httpStatus === 401 || httpStatus === 403) return failure("CSRF_ACCESS_DENIED");
    const redirect = [301, 302, 303, 307, 308].includes(httpStatus);
    let target = null;
    if (redirect) {
      const location = response.headers?.location || response.headers?.Location;
      if (typeof location !== 'string' || !location.trim()) return failure("CSRF_REDIRECT_BLOCKED");
      try { target = new URL(location, url); }
      catch (_) { return failure("CSRF_REDIRECT_BLOCKED"); }
      if (target.protocol !== "https:" || !["www.instagram.com", "instagram.com"].includes(target.hostname) ||
          (target.port && target.port !== "443") || target.username || target.password) {
        return failure("CSRF_REDIRECT_BLOCKED");
      }
      if (/^\/(?:challenge|checkpoint|accounts\/suspended)(?:\/|$)/i.test(target.pathname)) return failure("CSRF_CHALLENGE_REQUIRED");
    }
    if (/"(?:message|error_type)"\s*:\s*"(?:challenge_required|checkpoint_required)"/i.test(String(response.data || ""))) {
      return failure("CSRF_CHALLENGE_REQUIRED");
    }
    if (httpStatus !== 200 && !redirect) return failure("CSRF_HTTP_ERROR");
    // Instagram can issue csrftoken on the redirect response itself.
    const csrf = csrfFromResponse(response);
    if (csrf) return {
      cookies: appendCsrf(cookies, csrf),
      fetched: true,
      warning: "CSRF_TOKEN_FETCHED",
      http_status: httpStatus,
    };
    if (!redirect) return failure("CSRF_TOKEN_NOT_RECEIVED");
    if (hop === 2) return failure("CSRF_REDIRECT_LIMIT");
    url = target.href;
    }
  } catch (err) {
    if (err.code === 'ERR_BAD_RESPONSE' && /maxContentLength|larger than max/i.test(err.message || '')) {
      return failure('CSRF_RESPONSE_TOO_LARGE');
    }
    const reason = {
      ECONNABORTED: 'CSRF_FETCH_TIMEOUT', ETIMEDOUT: 'CSRF_FETCH_TIMEOUT',
      ENOTFOUND: 'CSRF_DNS_FAILED', EAI_AGAIN: 'CSRF_DNS_FAILED',
      ECONNREFUSED: 'CSRF_CONNECTION_REFUSED', ECONNRESET: 'CSRF_CONNECTION_RESET',
      EPROTO: 'CSRF_TLS_FAILED', CERT_HAS_EXPIRED: 'CSRF_TLS_FAILED',
      UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'CSRF_TLS_FAILED',
      DEPTH_ZERO_SELF_SIGNED_CERT: 'CSRF_TLS_FAILED',
      ERR_TLS_CERT_ALTNAME_INVALID: 'CSRF_TLS_FAILED',
    }[err.code] || 'CSRF_TOKEN_FETCH_FAILED';
    return failure(reason);
  }
}

module.exports = {
  proxyOptions,
  appendCsrf,
  cookieValue,
  csrfFromResponse,
  enrich,
};

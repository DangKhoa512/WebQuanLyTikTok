const axios = require('axios');
const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { parseProxy } = require('./checkLiveUtils');

const APP_ID = '936619743392459';
const LOGIN_URL = 'https://www.instagram.com/accounts/login/';
const LOGIN_AJAX_URL = 'https://www.instagram.com/api/v1/web/accounts/login/ajax/';
const TWO_FACTOR_URL = 'https://www.instagram.com/api/v1/web/accounts/login/ajax/two_factor/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value || '').trim();

const decodeBase32 = (value) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const source = clean(value).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of source) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('invalid_two_fa_secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(parseInt(bits.slice(offset, offset + 8), 2));
  }
  if (!bytes.length) throw new Error('invalid_two_fa_secret');
  return Buffer.from(bytes);
};

const createTotp = (secret, timestamp = Date.now()) => {
  const counter = Math.floor(timestamp / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(code).padStart(6, '0');
};

const resolveTwoFactorCode = (value) => {
  const token = clean(value).replace(/\s+/g, '');
  if (/^\d{6}$/.test(token)) return token;
  return createTotp(token);
};

class CookieJar {
  constructor() {
    this.values = new Map();
  }

  update(response) {
    let rows = response?.headers?.['set-cookie'] || [];
    if (!Array.isArray(rows)) rows = rows ? [rows] : [];
    for (const row of rows) {
      const pair = String(row || '').split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (!name) continue;
      if (!value) this.values.delete(name);
      else this.values.set(name, value);
    }
  }

  set(name, value) {
    if (name && value) this.values.set(String(name), String(value));
  }

  get(name) {
    return this.values.get(name) || '';
  }

  toString() {
    const priority = ['ds_user_id', 'ig_did', 'datr', 'mid', 'sessionid', 'csrftoken', 'rur'];
    return [...this.values.entries()]
      .sort(([left], [right]) => {
        const leftIndex = priority.indexOf(left);
        const rightIndex = priority.indexOf(right);
        return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
      })
      .map(([name, value]) => name + '=' + value)
      .join('; ');
  }

  export() {
    return [...this.values.entries()].map(([name, value]) => ({
      name,
      value,
      domain: '.instagram.com',
      path: '/',
    }));
  }
}

const responseData = (response) => {
  if (response?.data && typeof response.data === 'object') return response.data;
  try { return JSON.parse(String(response?.data || '')); } catch (_) { return {}; }
};

const responseUrl = (response) => response?.request?.res?.responseUrl || response?.config?.url || '';

const landingHeaders = () => ({
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
});

const ajaxHeaders = (jar) => ({
  'User-Agent': USER_AGENT,
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Content-Type': 'application/x-www-form-urlencoded',
  Origin: 'https://www.instagram.com',
  Referer: LOGIN_URL,
  'X-CSRFToken': jar.get('csrftoken'),
  'X-IG-App-ID': APP_ID,
  'X-ASBD-ID': '129477',
  'X-Requested-With': 'XMLHttpRequest',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  Cookie: jar.toString(),
});

const requestConfig = (proxyUrl, headers) => ({
  headers,
  timeout: 30_000,
  maxRedirects: 5,
  validateStatus: () => true,
  decompress: true,
  httpsAgent: new HttpsProxyAgent(proxyUrl),
  proxy: false,
});

const findCsrfInHtml = (html) => {
  const text = String(html || '');
  return text.match(/"csrf_token"\s*:\s*"([^"]+)"/i)?.[1]
    || text.match(/"csrfToken"\s*:\s*"([^"]+)"/i)?.[1]
    || '';
};

const isTwoFactorRequired = (data) => Boolean(
  data?.two_factor_required
  || data?.error_type === 'two_factor_required'
  || data?.two_factor_info
);

const failure = (reason, message = null, extra = {}) => ({
  status: 'failed',
  reason,
  message: message || reason,
  ...extra,
});

const classifyResponseFailure = (response, data, fallback = 'login_rejected') => {
  const status = Number(response?.status) || 0;
  const finalUrl = String(responseUrl(response)).toLowerCase();
  const errorType = String(data?.error_type || '').toLowerCase();
  const text = [data?.message, errorType, data?.status].map((item) => String(item || '')).join(' ').toLowerCase();

  if (/challenge|checkpoint/.test(finalUrl)
      || data?.checkpoint_url
      || data?.challenge
      || /challenge_required|checkpoint_required|consent_required/.test(text)) {
    return failure('challenge_required', 'Instagram requires checkpoint or challenge', { http_status: status || null });
  }
  if (/invalid_user|user_not_found|user not found|no user found|doesn.?t belong to an account|does not belong to an account|account does not exist|account has been deleted/.test(text)) {
    return failure('account_disabled', 'Instagram account does not exist or is disabled', { http_status: status || null });
  }
  if (/bad_password|incorrect password|password is incorrect|wrong password/.test(text)) {
    return failure('invalid_password', 'Instagram rejected the password', { http_status: status || null });
  }
  if (/invalid_two_factor|incorrect code|code.*incorrect|invalid code/.test(text)) {
    return failure('invalid_two_fa', 'Instagram rejected the two-factor code', { http_status: status || null });
  }
  if (status === 429 || /please wait a few minutes|try again later|feedback_required|rate.limit/.test(text)) {
    return failure('rate_limited', 'Instagram rate limited this login', { http_status: status || null });
  }
  if (status >= 500) {
    return failure('instagram_server_error', 'Instagram server error', { http_status: status });
  }
  return failure(fallback, String(data?.message || data?.status || fallback), { http_status: status || null });
};

const authenticatedResult = (jar, data) => {
  const cookies = jar.toString();
  if (!jar.get('sessionid')) return failure('session_cookie_missing', 'Login succeeded but sessionid was not returned');
  return {
    status: 'success',
    reason: 'login_success',
    message: 'Instagram login successful',
    cookies,
    cookie_jar: jar.export(),
    ds_user_id: jar.get('ds_user_id') || String(data?.userId || data?.user_id || ''),
    username: String(data?.username || ''),
  };
};

const finishTwoFactor = async ({ jar, proxyUrl, data, identifier, twoFa }) => {
  if (!clean(twoFa)) return failure('missing_two_fa', 'Instagram requires a two-factor code');
  let verificationCode;
  try { verificationCode = resolveTwoFactorCode(twoFa); } catch (_) {
    return failure('invalid_two_fa_secret', 'Invalid Base32 two-factor secret');
  }

  const info = data?.two_factor_info || {};
  const payload = new URLSearchParams({
    username: String(info.username || identifier),
    verificationCode,
    identifier: String(info.two_factor_identifier || data?.two_factor_identifier || info.identifier || ''),
    queryParams: '{}',
    trust_signal: 'true',
    verification_method: '3',
  });

  const response = await axios.post(TWO_FACTOR_URL, payload.toString(), requestConfig(proxyUrl, ajaxHeaders(jar)));
  jar.update(response);
  const result = responseData(response);
  if (!result?.authenticated) return classifyResponseFailure(response, result, 'two_factor_rejected');
  return authenticatedResult(jar, result);
};

const loginInstagramAccount = async ({ username, password, two_fa, proxy }) => {
  const identifier = clean(username).replace(/^@/, '');
  if (!identifier || !String(password || '')) return failure('missing_username_or_password');
  const proxyUrl = parseProxy(clean(proxy));
  if (!proxyUrl) return failure('invalid_proxy');

  const jar = new CookieJar();
  try {
    const landing = await axios.get(LOGIN_URL, requestConfig(proxyUrl, landingHeaders()));
    jar.update(landing);
    if (!jar.get('csrftoken')) jar.set('csrftoken', findCsrfInHtml(landing.data));
    if (!jar.get('csrftoken')) return failure('csrf_token_missing', 'Could not obtain Instagram CSRF token', { http_status: landing.status });
    if ([403, 429].includes(landing.status) || landing.status >= 500) {
      return classifyResponseFailure(landing, responseData(landing), 'login_page_rejected');
    }

    const payload = new URLSearchParams({
      username: identifier,
      enc_password: '#PWD_INSTAGRAM_BROWSER:0:' + Math.floor(Date.now() / 1000) + ':' + String(password),
      queryParams: '{}',
      optIntoOneTap: 'false',
      trustedDeviceRecords: '{}',
    });
    const response = await axios.post(LOGIN_AJAX_URL, payload.toString(), requestConfig(proxyUrl, ajaxHeaders(jar)));
    jar.update(response);
    const data = responseData(response);

    if (isTwoFactorRequired(data)) {
      return await finishTwoFactor({
        jar,
        proxyUrl,
        data,
        identifier,
        twoFa: two_fa,
      });
    }
    if (!data?.authenticated) return classifyResponseFailure(response, data);
    return authenticatedResult(jar, data);
  } catch (error) {
    const reason = error?.code === 'ECONNABORTED'
      ? 'request_timeout'
      : error?.code || error?.name || 'request_login_failed';
    return failure(reason, String(error?.message || reason));
  }
};

const loginInstagramAccounts = async (accounts, rawProxies, { proxyOffset = 0 } = {}) => {
  const proxies = rawProxies.map((item) => clean(item)).filter((item) => parseProxy(item));
  if (!proxies.length) throw new Error('instagram_login_proxy_required');
  const results = new Array(accounts.length);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= accounts.length) return;
      const account = accounts[index];
      const firstProxyIndex = (Math.max(parseInt(proxyOffset, 10) || 0, 0) + index) % proxies.length;
      const maxAttempts = Math.min(3, proxies.length);
      let result = null;
      let proxyIndex = firstProxyIndex;
      let attempts = 0;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        proxyIndex = (firstProxyIndex + attempt) % proxies.length;
        attempts += 1;
        result = await loginInstagramAccount({
          username: account.uid,
          password: account.password,
          two_fa: account.two_fa,
          proxy: proxies[proxyIndex],
        });
        if (result.status === 'success') break;
        const retryable = /csrf_token_missing|request_timeout|econn|socket|proxy|network|server_error|login_page_rejected/i.test(String(result.reason || ''));
        if (!retryable) break;
        if (attempt + 1 < maxAttempts) await sleep(500);
      }

      results[index] = {
        id: account.id,
        uid: account.uid,
        ...result,
        proxy_index: proxyIndex + 1,
        proxy_attempts: attempts,
      };
    }
  };

  // Cookie logins are intentionally serialized so large selections do not
  // overload the VPS/proxy pool or create concurrent Instagram checkpoints.
  const workerCount = Math.min(accounts.length, 1);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return { results, proxy_count: proxies.length, engine: 'request' };
};

module.exports = {
  CookieJar,
  createTotp,
  resolveTwoFactorCode,
  loginInstagramAccount,
  loginInstagramAccounts,
};

const dns = require('dns').promises;
const net = require('net');
const { randomInt } = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { publicIp } = require('./deviceManagerSecurity');

const failure = (code, statusCode = 502) => Object.assign(new Error(code), {
  code, statusCode, isEmailTickError: true,
});

function normalizeProxy(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  let value = text;
  if (!text.includes('://')) {
    const parts = text.split(':');
    if (!text.includes('@') && ![2, 4].includes(parts.length) && !/^\[[^\]]+\]:\d+$/.test(text)) return null;
    value = !text.includes('@') && parts.length === 4
      ? `http://${encodeURIComponent(parts[2])}:${encodeURIComponent(parts[3])}@${parts[0]}:${parts[1]}`
      : `http://${text}`;
  }
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol) ||
        !url.hostname || url.search || url.hash || (url.pathname && url.pathname !== '/')) return null;
    // SOCKS5 destination DNS is resolved by the proxy; proxy host is always pinned locally.
    if (url.protocol === 'socks5:') url.protocol = 'socks5h:';
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    return url;
  } catch (_) { return null; }
}

async function publicAddress(url, lookup, timeoutMs) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(hostname)) {
    if (!publicIp(hostname)) throw failure('EMAILTICK_PROXY_UNAVAILABLE');
    return { address: hostname, family: net.isIP(hostname) };
  }
  let timer;
  try {
    const addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(failure('EMAILTICK_PROXY_UNAVAILABLE')), timeoutMs); }),
    ]);
    if (!addresses.length || addresses.some(entry => !publicIp(entry.address))) throw failure('EMAILTICK_PROXY_UNAVAILABLE');
    return addresses[0];
  } finally { clearTimeout(timer); }
}

function createProxySession({ proxies = [], config, random = randomInt, now = Date.now, lookup = dns.lookup }) {
  if (!Array.isArray(proxies)) throw failure('EMAILTICK_PROXY_CONFIG_ERROR', 503);
  if (!proxies.length) return null;
  const unique = new Map();
  for (const raw of proxies) {
    const url = normalizeProxy(raw);
    if (url) unique.set(url.href, url);
  }
  const candidates = [...unique.values()];
  if (!candidates.length) throw failure('EMAILTICK_PROXY_CONFIG_ERROR', 503);
  const start = random(candidates.length);
  const pool = candidates.slice(start).concat(candidates.slice(0, start))
    .slice(0, config.proxyMaxAttempts ?? 3);
  const deadline = now() + (config.proxyTotalTimeoutMs ?? 20000);
  const perProxy = config.proxyTimeoutMs ?? 6000;
  let index = 0;
  let pinned = null;

  return {
    remainingMs() { return Math.max(0, deadline - now()); },
    advance() { pinned = null; index += 1; },
    async options() {
      while (index < pool.length && now() < deadline) {
        const attemptDeadline = Math.min(deadline, now() + perProxy);
        const original = pool[index];
        if (!pinned) {
          try {
            const resolved = await publicAddress(original, lookup, attemptDeadline - now());
            pinned = { url: new URL(original.href), hostname: original.hostname.replace(/^\[|\]$/g, '') };
            pinned.url.hostname = resolved.family === 6 ? `[${resolved.address}]` : resolved.address;
          } catch (_) { index += 1; continue; }
        }
        const timeout = Math.min(config.timeoutMs, attemptDeadline - now());
        if (timeout <= 0) { index += 1; pinned = null; continue; }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        let agent;
        try {
          agent = pinned.url.protocol.startsWith('socks')
            ? new SocksProxyAgent(pinned.url, { timeout, socketOptions: { signal: controller.signal } })
            : new HttpsProxyAgent(pinned.url, {
              timeout, signal: controller.signal,
              ...(pinned.url.protocol === 'https:' && !net.isIP(pinned.hostname) ? { servername: pinned.hostname } : {}),
            });
        } catch (_) { clearTimeout(timer); index += 1; pinned = null; continue; }
        const result = {
          config: { proxy: false, httpAgent: agent, httpsAgent: agent, timeout, signal: controller.signal },
          connectFailed: false,
          cleanup() { clearTimeout(timer); agent.destroy(); },
        };
        agent.on('proxyConnect', response => { result.connectFailed = response.statusCode !== 200; });
        return result;
      }
      throw failure('EMAILTICK_PROXY_UNAVAILABLE');
    },
  };
}

module.exports = { createProxySession, normalizeProxy };

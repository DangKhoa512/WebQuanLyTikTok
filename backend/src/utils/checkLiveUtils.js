/**
 * checkLiveUtils.js — shared check-live logic dùng cho cả Account và ChromeAccount
 */
const axios  = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const UA_PROFILES = [
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.199 Safari/537.36', extra: { 'sec-ch-ua': '"Not_A Brand";v="8","Chromium";v="120","Google Chrome";v="120"', 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"', 'Sec-Fetch-User': '?1' }, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.199 Safari/537.36', extra: { 'sec-ch-ua': '"Google Chrome";v="119","Not?A_Brand";v="24","Chromium";v="119"', 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"', 'Sec-Fetch-User': '?1' }, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.199 Safari/537.36', extra: { 'sec-ch-ua': '"Not_A Brand";v="8","Chromium";v="120","Google Chrome";v="120"', 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"macOS"', 'Sec-Fetch-User': '?1' }, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0', extra: { 'Sec-Fetch-User': '?1', 'TE': 'trailers' }, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8', noSecCh: true },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15', extra: {}, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', noSecCh: true },
  { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1', extra: { 'sec-ch-ua-mobile': '?1', 'sec-ch-ua-platform': '"iOS"' }, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', mobile: true },
  { ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36', extra: { 'sec-ch-ua': '"Not_A Brand";v="8","Chromium";v="120","Google Chrome";v="120"', 'sec-ch-ua-mobile': '?1', 'sec-ch-ua-platform': '"Android"' }, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8', mobile: true },
];

const ACCEPT_LANGUAGES = ['en-US,en;q=0.9', 'en-US,en;q=0.9,vi;q=0.8', 'en-GB,en;q=0.9', 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'];
const REFERERS = [null, 'https://www.google.com/', 'https://www.tiktok.com/'];

const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep     = (ms)  => new Promise((r) => setTimeout(r, ms));
const jitter    = (base, pct = 0.4) => base + Math.floor(Math.random() * base * pct);

const buildHeaders = (username) => {
  const profile = getRandom(UA_PROFILES);
  const lang    = getRandom(ACCEPT_LANGUAGES);
  const referer = getRandom(REFERERS)?.replace('%USERNAME%', encodeURIComponent(username));
  const headers = {
    'User-Agent': profile.ua, 'Accept': profile.accept,
    'Accept-Language': lang, 'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache', 'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'cross-site' : 'none',
    'Upgrade-Insecure-Requests': '1', ...profile.extra,
  };
  if (referer) headers['Referer'] = referer;
  return headers;
};

const parseProxy = (str) => {
  if (!str || !str.trim()) return null;
  str = str.trim();
  if (/^https?:\/\//i.test(str)) return str;
  if (str.includes('@')) return `http://${str}`;
  const p = str.split(':');
  if (p.length === 4) return `http://${p[2]}:${p[3]}@${p[0]}:${p[1]}`;
  if (p.length === 2) return `http://${str}`;
  return null;
};

const parseTikTokPage = (html, username) => {
  try {
    const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      const root  = JSON.parse(m[1]);
      const scope = root?.['__DEFAULT_SCOPE__'] || root;
      const ui    = scope?.['webapp.user-detail']?.userInfo;
      if (ui?.user?.uniqueId) {
        const s = ui.stats || {};
        return { live: true, banned: false, private: !!ui.user.privateAccount, verified: !!ui.user.verified, followers: s.followerCount || 0, following: s.followingCount || 0, videos: s.videoCount || 0, likes: s.heartCount || s.heart || 0 };
      }
      const detail = scope?.['webapp.user-detail'];
      if (detail && (detail.statusCode === 10202 || detail.statusCode === '10202')) {
        return { live: false, banned: true, followers: 0, following: 0, videos: 0, likes: 0 };
      }
    }
  } catch (_) {}

  try {
    const m = html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      const data  = JSON.parse(m[1]);
      const users = data?.UserModule?.users || {};
      const user  = users[username.toLowerCase()] || Object.values(users)[0];
      if (user?.uniqueId) {
        const sm = data?.UserModule?.stats || {};
        const s  = sm[user.id] || Object.values(sm)[0] || {};
        return { live: true, banned: false, private: !!user.privateAccount, verified: !!user.verified, followers: s.followerCount || 0, following: s.followingCount || 0, videos: s.videoCount || 0, likes: s.heartCount || 0 };
      }
    }
  } catch (_) {}

  try {
    const fM = html.match(/"followerCount"\s*:\s*(\d+)/);
    const vM = html.match(/"videoCount"\s*:\s*(\d+)/);
    const wM = html.match(/"followingCount"\s*:\s*(\d+)/);
    if (fM || vM) return { live: true, banned: false, private: false, verified: false, followers: fM ? +fM[1] : 0, following: wM ? +wM[1] : 0, videos: vM ? +vM[1] : 0, likes: 0 };
  } catch (_) {}

  const h = html.toLowerCase();
  if (h.includes('"statuscode":10202') || h.includes('"statuscode": 10202')) {
    return { live: false, banned: true, followers: 0, following: 0, videos: 0, likes: 0 };
  }
  const hasTikTokStructure = h.includes('__universal_data_for_rehydration__') || h.includes('sigi_state') || h.includes('"webapp.user-detail"');
  if (hasTikTokStructure && h.includes("couldn't find this account")) {
    return { live: false, banned: true, followers: 0, following: 0, videos: 0, likes: 0 };
  }
  return null;
};

const checkOne = async (username, proxyUrl, attempt = 0) => {
  if (attempt === 0) await sleep(jitter(60, 0.8));
  const url    = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
  const config = { headers: buildHeaders(username), timeout: 9_000, maxRedirects: 3, validateStatus: (s) => s < 500, decompress: true };
  if (proxyUrl) {
    try { config.httpsAgent = new HttpsProxyAgent(proxyUrl); config.proxy = false; } catch (_) {}
  }
  let resp;
  try {
    resp = await axios.get(url, config);
  } catch (e) {
    if (attempt < 1 && !proxyUrl) { await sleep(jitter(600, 0.5)); return checkOne(username, proxyUrl, attempt + 1); }
    return null;
  }
  if (resp.status === 404) return { live: false, banned: true, followers: 0, following: 0, videos: 0, likes: 0 };
  if (resp.status !== 200) return null;
  const result = parseTikTokPage(resp.data, username);
  if (result === null && attempt < 1 && !proxyUrl) { await sleep(jitter(800, 0.4)); return checkOne(username, proxyUrl, attempt + 1); }
  return result;
};

/**
 * Perform batch check-live on a list of Sequelize model instances.
 * accounts: array of model instances with .id and .username and .update()
 * Returns array of result objects.
 */
const batchCheckLive = async (accounts, proxyPool, concurrency, delay_ms) => {
  const results = [];
  let proxyIdx  = 0;

  for (let i = 0; i < accounts.length; i += concurrency) {
    const batch = accounts.slice(i, i + concurrency);

    const batchOut = await Promise.all(batch.map(async (acc) => {
      const proxyUrl = proxyPool.length > 0 ? proxyPool[proxyIdx++ % proxyPool.length] : null;
      let stats      = null;
      let liveStatus = 'unknown';

      try { stats = await checkOne(acc.username, proxyUrl); } catch (_) {}

      if (stats !== null) {
        liveStatus = stats.live ? 'live' : 'die';
        const upd = { live_status: liveStatus, last_live_check_at: new Date(), followers: stats.followers ?? null, following: stats.following ?? null };
        if (liveStatus === 'die') upd.status = 'ACC_DIE';
        if (stats.videos != null) upd.video_count = stats.videos;
        await acc.update(upd);
      } else {
        await acc.update({ last_live_check_at: new Date() });
      }

      return {
        id: acc.id, username: acc.username, result: liveStatus,
        followers: stats?.followers ?? null, following: stats?.following ?? null,
        videos:    stats?.videos    ?? null, likes:     stats?.likes     ?? null,
        private:   stats?.private   ?? false, verified:  stats?.verified  ?? false,
        proxy: proxyUrl ? proxyUrl.replace(/\/\/([^:@]+):([^@]+)@/, '//$1:***@') : 'direct',
      };
    }));

    results.push(...batchOut);
    if (i + concurrency < accounts.length && delay_ms > 0) await sleep(jitter(delay_ms, 0.4));
  }

  return results;
};

module.exports = { checkOne, batchCheckLive, parseProxy };

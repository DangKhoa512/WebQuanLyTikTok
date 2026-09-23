const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { parseProxy } = require('./checkLiveUtils');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (base, pct = 0.35) => base + Math.floor(Math.random() * base * pct);
const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
const numberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
};
const humanNumberOrNull = (value) => {
  const normalized = String(value ?? '').trim().replace(/,/g, '');
  const match = normalized.match(/^(\d+(?:\.\d+)?)([KMB])?$/i);
  if (!match) return null;
  const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[String(match[2] || '').toUpperCase()] || 1;
  return Math.round(Number(match[1]) * multiplier);
};

const buildHeaders = (username, json = true, cookies = null) => ({
  'User-Agent': randomItem(USER_AGENTS),
  Accept: json ? '*/*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
  Referer: `https://www.instagram.com/${encodeURIComponent(username)}/`,
  ...(cookies ? { Cookie: cookies } : {}),
  ...(json ? {
    'X-IG-App-ID': '936619743392459',
    'X-ASBD-ID': '129477',
    'X-Requested-With': 'XMLHttpRequest',
  } : {}),
});

const requestConfig = (username, proxyUrl, json = true, cookies = null) => {
  const config = {
    headers: buildHeaders(username, json, cookies),
    timeout: 12_000,
    maxRedirects: 3,
    validateStatus: () => true,
    decompress: true,
  };
  if (proxyUrl) {
    config.httpsAgent = new HttpsProxyAgent(proxyUrl);
    config.proxy = false;
  }
  return config;
};

const parseProfileUser = (user) => {
  if (!user || typeof user !== 'object') return null;
  const username = user.username || user.user_name;
  if (!username) return null;
  return {
    live: true,
    posts: numberOrNull(user.edge_owner_to_timeline_media?.count ?? user.media_count ?? user.mediaCount ?? user.post_count ?? user.posts_count ?? user.posts),
    followers: numberOrNull(user.edge_followed_by?.count ?? user.follower_count ?? user.followers_count ?? user.followerCount),
    following: numberOrNull(user.edge_follow?.count ?? user.following_count ?? user.followingCount),
    private: Boolean(user.is_private ?? user.private),
    verified: Boolean(user.is_verified ?? user.verified),
  };
};

const parseProfileJson = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const user = payload.data?.user
    ?? payload.user
    ?? payload.graphql?.user
    ?? payload.data?.graphql?.user
    ?? payload.data?.xdt_api__v1__users__web_profile_info?.user
    ?? payload.data?.user_by_username
    ?? payload.data?.items?.[0]?.user
    ?? payload.items?.[0]?.user;
  const parsed = parseProfileUser(user);
  if (parsed) return parsed;
  if ((Object.prototype.hasOwnProperty.call(payload, 'data') && payload.data?.user === null)
      || payload.status === 'not_found'
      || payload.message === 'User not found') {
    return { live: false, posts: 0, followers: 0, following: 0 };
  }
  return null;
};

const parseProfileHtml = (html) => {
  if (typeof html !== 'string' || !html.trim()) return null;
  const pick = (patterns) => {
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return numberOrNull(match[1]);
    }
    return null;
  };
  const posts = pick([/"edge_owner_to_timeline_media"\s*:\s*\{\s*"count"\s*:\s*(\d+)/, /"media_count"\s*:\s*(\d+)/]);
  const followers = pick([/"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/, /"follower_count"\s*:\s*(\d+)/]);
  const following = pick([/"edge_follow"\s*:\s*\{\s*"count"\s*:\s*(\d+)/, /"following_count"\s*:\s*(\d+)/]);
  if (posts !== null || followers !== null || following !== null) {
    return { live: true, posts, followers, following };
  }

  const metaFollowers = html.match(/([\d,.]+\s*[KMB]?)\s+Followers/i);
  const metaFollowing = html.match(/([\d,.]+\s*[KMB]?)\s+Following/i);
  const metaPosts = html.match(/([\d,.]+\s*[KMB]?)\s+Posts/i);
  if (metaFollowers || metaFollowing || metaPosts) {
    return {
      live: true,
      posts: humanNumberOrNull(metaPosts?.[1]),
      followers: humanNumberOrNull(metaFollowers?.[1]),
      following: humanNumberOrNull(metaFollowing?.[1]),
    };
  }

  const lower = html.toLowerCase();
  if (lower.includes("sorry, this page isn't available") || lower.includes('page may have been removed')) {
    return { live: false, posts: 0, followers: 0, following: 0 };
  }
  return null;
};

const checkInstagramProfile = async (username, proxyUrl = null, cookies = null) => {
  const safeUsername = String(username || '').trim().replace(/^@/, '');
  if (!safeUsername) return null;
  await sleep(jitter(50, 0.8));
  try {
    const endpoint = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(safeUsername)}`;
    const response = await axios.get(endpoint, requestConfig(safeUsername, proxyUrl, true, cookies));
    if (response.status === 404) return { live: false, posts: 0, followers: 0, following: 0 };
    if (response.status === 200) {
      const parsed = parseProfileJson(response.data);
      if (parsed) return parsed;
    }
  } catch (_) {
    // Continue with the public profile HTML fallback.
  }

  try {
    const response = await axios.get(`https://www.instagram.com/${encodeURIComponent(safeUsername)}/`, requestConfig(safeUsername, proxyUrl, false, cookies));
    if (response.status === 404) return { live: false, posts: 0, followers: 0, following: 0 };
    if (response.status !== 200) return null;
    return parseProfileHtml(response.data);
  } catch (_) {
    return null;
  }
};

const maskProxy = (proxyUrl) => proxyUrl
  ? proxyUrl.replace(/\/\/([^:@]+):([^@]+)@/, '//$1:***@')
  : 'direct';

const batchCheckInstagram = async (accounts, rawProxies = [], concurrency = 20, delayMs = 0) => {
  const proxyPool = rawProxies.map(parseProxy).filter(Boolean);
  const workerCount = Math.min(Math.max(parseInt(concurrency, 10) || 20, 1), 40);
  const delay = Math.min(Math.max(parseInt(delayMs, 10) || 0, 0), 10_000);
  const results = [];
  let proxyIndex = 0;
  const nextProxy = () => proxyPool.length ? proxyPool[proxyIndex++ % proxyPool.length] : null;

  for (let index = 0; index < accounts.length; index += workerCount) {
    const batch = accounts.slice(index, index + workerCount);
    const rows = await Promise.all(batch.map(async (account) => {
      let stats = null;
      let proxyUrl = nextProxy();
      const maxAttempts = proxyPool.length > 1 ? Math.min(3, proxyPool.length) : 1;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        stats = await checkInstagramProfile(account.uid, proxyUrl, account.cookies || null);
        if (stats !== null) break;
        if (attempt + 1 < maxAttempts) proxyUrl = nextProxy();
      }

      const result = stats === null ? 'unknown' : stats.live ? 'live' : 'die';
      const update = { last_live_check_at: new Date() };
      if (stats !== null) {
        update.live_status = result;
        update.post_count = stats.posts;
        update.followers = stats.followers;
        update.following = stats.following;
        if (result === 'die') update.status = 'ACCOUNT_DIE';
      }
      await account.update(update);
      return {
        id: account.id,
        uid: account.uid,
        result,
        posts: stats?.posts ?? null,
        followers: stats?.followers ?? null,
        following: stats?.following ?? null,
        private: stats?.private ?? false,
        verified: stats?.verified ?? false,
        proxy: maskProxy(proxyUrl),
      };
    }));
    results.push(...rows);
    if (index + workerCount < accounts.length && delay > 0) await sleep(jitter(delay));
  }
  return { results, concurrency: workerCount, proxy_count: proxyPool.length };
};

module.exports = { checkInstagramProfile, parseProfileJson, parseProfileHtml, batchCheckInstagram };
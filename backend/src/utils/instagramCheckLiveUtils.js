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
  let normalized = String(value ?? '').trim().replace(/\s/g, '');
  const match = normalized.match(/^(\d+(?:[.,]\d+)?)([KMB])?$/i);
  if (!match) return null;
  const suffix = String(match[2] || '').toUpperCase();
  normalized = match[1];
  if (suffix && normalized.includes(',') && !normalized.includes('.')) normalized = normalized.replace(',', '.');
  else if (!suffix) normalized = normalized.replace(/[.,]/g, '');
  else normalized = normalized.replace(/,/g, '');
  const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[suffix] || 1;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * multiplier) : null;
};
const unknownResult = (reason, extra = {}) => ({
  live: null,
  posts: null,
  followers: null,
  following: null,
  reason,
  ...extra,
});
const dieResult = (reason, extra = {}) => ({
  live: false,
  posts: 0,
  followers: 0,
  following: 0,
  reason,
  ...extra,
});

const buildHeaders = (username, json = true, cookies = null) => {
  const cookieText = String(cookies || '').replace(/[\r\n]+/g, ' ').trim();
  const csrfToken = cookieText.match(/(?:^|;\s*)csrftoken=([^;]+)/i)?.[1];
  return {
    'User-Agent': randomItem(USER_AGENTS),
    Accept: json ? '*/*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
    Referer: `https://www.instagram.com/${encodeURIComponent(username)}/`,
    ...(cookieText ? { Cookie: cookieText } : {}),
    ...(json ? {
      'X-IG-App-ID': '936619743392459',
      'X-ASBD-ID': '129477',
      'X-Requested-With': 'XMLHttpRequest',
      'X-IG-WWW-Claim': '0',
      ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
    } : {}),
  };
};

const requestConfig = (username, proxyUrl, json = true, cookies = null) => {
  const config = {
    headers: buildHeaders(username, json, cookies),
    timeout: 15_000,
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
    user_id: user.id || user.pk || user.pk_id || null,
    posts: numberOrNull(user.edge_owner_to_timeline_media?.count
      ?? user.edge_felix_video_timeline?.count
      ?? user.media_count
      ?? user.mediaCount
      ?? user.post_count
      ?? user.posts_count
      ?? user.posts),
    followers: numberOrNull(user.edge_followed_by?.count ?? user.follower_count ?? user.followers_count ?? user.followerCount),
    following: numberOrNull(user.edge_follow?.count ?? user.following_count ?? user.followingCount),
    private: Boolean(user.is_private ?? user.private),
    verified: Boolean(user.is_verified ?? user.verified),
  };
};

const isNotFoundMessage = (value) => /user\s*(?:not\s*found|doesn'?t\s*exist)|no user found|không tìm thấy người dùng/i.test(String(value || ''));
const parseProfileJson = (input) => {
  let payload = input;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload.replace(/^for\s*\(;;\);\s*/, '')); } catch (_) { return null; }
  }
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

  const explicitNull = (payload.data && Object.prototype.hasOwnProperty.call(payload.data, 'user') && payload.data.user === null)
    || (payload.graphql && Object.prototype.hasOwnProperty.call(payload.graphql, 'user') && payload.graphql.user === null)
    || (payload.data?.xdt_api__v1__users__web_profile_info
      && Object.prototype.hasOwnProperty.call(payload.data.xdt_api__v1__users__web_profile_info, 'user')
      && payload.data.xdt_api__v1__users__web_profile_info.user === null);
  const message = payload.message || payload.error?.message || payload.errors?.[0]?.message || payload.status;
  if (explicitNull || isNotFoundMessage(message) || payload.status === 'not_found') return dieResult('user_not_found');
  return null;
};

const parseProfileHtml = (html) => {
  if (typeof html !== 'string' || !html.trim()) return null;
  const normalized = html.replace(/&quot;/gi, '"').replace(/\\"/g, '"').replace(/&#x27;|&#39;/gi, "'");
  const pick = (patterns) => {
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) return numberOrNull(match[1]);
    }
    return null;
  };
  const posts = pick([
    /"edge_owner_to_timeline_media"\s*:\s*\{\s*"count"\s*:\s*(\d+)/,
    /"edge_felix_video_timeline"\s*:\s*\{\s*"count"\s*:\s*(\d+)/,
    /"(?:media_count|post_count|posts_count)"\s*:\s*(\d+)/,
  ]);
  const followers = pick([/"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/, /"(?:follower_count|followers_count)"\s*:\s*(\d+)/]);
  const following = pick([/"edge_follow"\s*:\s*\{\s*"count"\s*:\s*(\d+)/, /"following_count"\s*:\s*(\d+)/]);
  if (posts !== null || followers !== null || following !== null) return { live: true, posts, followers, following };

  const metaFollowers = normalized.match(/([\d.,]+\s*[KMB]?)\s+(?:Followers?|người theo dõi)/i);
  const metaFollowing = normalized.match(/([\d.,]+\s*[KMB]?)\s+(?:Following|đang theo dõi)/i);
  const metaPosts = normalized.match(/([\d.,]+\s*[KMB]?)\s+(?:Posts?|bài viết)/i);
  if (metaFollowers || metaFollowing || metaPosts) {
    return {
      live: true,
      posts: humanNumberOrNull(metaPosts?.[1]),
      followers: humanNumberOrNull(metaFollowers?.[1]),
      following: humanNumberOrNull(metaFollowing?.[1]),
    };
  }

  const lower = normalized.toLowerCase();
  if (lower.includes("sorry, this page isn't available")
      || lower.includes('page may have been removed')
      || lower.includes('the link you followed may be broken')) return dieResult('profile_page_not_found');
  return null;
};

const responseUrl = (response) => response?.request?.res?.responseUrl || response?.config?.url || '';
const responseReason = (response, source) => {
  const status = Number(response?.status) || 0;
  const url = responseUrl(response);
  if (/\/accounts\/login|\/challenge\//i.test(url)) return `${source}_login_required`;
  if (status === 401) return `${source}_unauthorized`;
  if (status === 403) return `${source}_forbidden`;
  if (status === 404) return `${source}_404_inconclusive`;
  if (status === 429) return `${source}_rate_limited`;
  if (status >= 500) return `${source}_server_error_${status}`;
  return `${source}_unrecognized_${status || 'network'}`;
};
const mergeLiveStats = (base, extra) => ({
  ...(base || {}),
  ...(extra || {}),
  live: true,
  user_id: extra?.user_id ?? base?.user_id ?? null,
  posts: extra?.posts ?? base?.posts ?? null,
  followers: extra?.followers ?? base?.followers ?? null,
  following: extra?.following ?? base?.following ?? null,
  private: extra?.private ?? base?.private ?? false,
  verified: extra?.verified ?? base?.verified ?? false,
});

const checkInstagramProfile = async (username, proxyUrl = null, cookies = null) => {
  const safeUsername = String(username || '').trim().replace(/^@/, '');
  if (!safeUsername) return unknownResult('missing_username');
  await sleep(jitter(50, 0.8));
  let partial = null;
  let lastReason = 'no_profile_data';
  let lastStatus = null;

  try {
    const endpoint = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(safeUsername)}`;
    const response = await axios.get(endpoint, requestConfig(safeUsername, proxyUrl, true, cookies));
    lastStatus = response.status;
    const parsed = parseProfileJson(response.data);
    if (parsed?.live === false) return { ...parsed, source: 'web_profile_info', http_status: response.status };
    if (parsed?.live === true) {
      partial = { ...parsed, source: 'web_profile_info', http_status: response.status };
      if (partial.posts !== null) return partial;
      if (partial.user_id) {
        try {
          const infoResponse = await axios.get(`https://www.instagram.com/api/v1/users/${encodeURIComponent(partial.user_id)}/info/`, requestConfig(safeUsername, proxyUrl, true, cookies));
          const infoParsed = parseProfileJson(infoResponse.data);
          if (infoParsed?.live === true) {
            partial = { ...mergeLiveStats(partial, infoParsed), source: 'user_info', http_status: infoResponse.status };
            if (partial.posts !== null) return partial;
          }
        } catch (_) {}
      }
    } else lastReason = responseReason(response, 'web_profile_info');
  } catch (err) {
    lastReason = `web_profile_info_${err.code || 'request_failed'}`;
  }

  try {
    const response = await axios.get(`https://www.instagram.com/${encodeURIComponent(safeUsername)}/`, requestConfig(safeUsername, proxyUrl, false, cookies));
    lastStatus = response.status;
    const parsed = parseProfileHtml(response.data);
    if (parsed?.live === false) return { ...parsed, source: 'profile_html', http_status: response.status };
    if (parsed?.live === true) return { ...mergeLiveStats(partial, parsed), source: 'profile_html', http_status: response.status };
    lastReason = responseReason(response, 'profile_html');
  } catch (err) {
    lastReason = `profile_html_${err.code || 'request_failed'}`;
  }

  if (partial?.live === true) return { ...partial, reason: 'post_count_unavailable' };
  return unknownResult(lastReason, { source: 'instagram', http_status: lastStatus });
};

const maskProxy = (proxyUrl) => proxyUrl
  ? proxyUrl.replace(/\/\/([^:@]+):([^@]+)@/, '//$1:***@')
  : 'direct';

const batchCheckInstagram = async (accounts, rawProxies = [], concurrency = 20, delayMs = 0) => {
  const configuredProxies = Array.isArray(rawProxies) ? rawProxies.map((item) => String(item || '').trim()).filter(Boolean) : [];
  const proxyPool = configuredProxies.map(parseProxy).filter(Boolean);
  if (configuredProxies.length && !proxyPool.length) throw new Error('Cau hinh proxy Instagram khong hop le; da dung check de tranh su dung mang chinh');
  const workerCount = Math.min(Math.max(parseInt(concurrency, 10) || 20, 1), 40);
  const delay = Math.min(Math.max(parseInt(delayMs, 10) || 0, 0), 10_000);
  const results = [];
  let proxyIndex = 0;
  const nextProxy = () => proxyPool.length ? proxyPool[proxyIndex++ % proxyPool.length] : null;

  for (let index = 0; index < accounts.length; index += workerCount) {
    const batch = accounts.slice(index, index + workerCount);
    const rows = await Promise.all(batch.map(async (account) => {
      let stats = unknownResult('not_checked');
      let proxyUrl = nextProxy();
      let attempts = 0;
      const maxAttempts = proxyPool.length ? Math.min(3, Math.max(2, proxyPool.length)) : 1;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        attempts += 1;
        stats = await checkInstagramProfile(account.uid, proxyUrl, account.cookies || null);
        if (stats.live === true || stats.live === false) break;
        if (attempt + 1 < maxAttempts) proxyUrl = nextProxy();
      }

      const result = stats.live === true ? 'live' : stats.live === false ? 'die' : 'unknown';
      const update = { last_live_check_at: new Date(), live_status: result };
      if (stats.posts !== null && stats.posts !== undefined) update.post_count = stats.posts;
      if (stats.followers !== null && stats.followers !== undefined) update.followers = stats.followers;
      if (stats.following !== null && stats.following !== undefined) update.following = stats.following;
      if (result === 'die') update.status = 'ACCOUNT_DIE';
      await account.update(update);
      return {
        id: account.id,
        uid: account.uid,
        result,
        reason: stats.reason || null,
        source: stats.source || null,
        http_status: stats.http_status ?? null,
        posts: stats.posts ?? account.post_count ?? null,
        followers: stats.followers ?? account.followers ?? null,
        following: stats.following ?? account.following ?? null,
        private: stats.private ?? false,
        verified: stats.verified ?? false,
        proxy: maskProxy(proxyUrl),
        proxy_used: Boolean(proxyUrl),
        attempts,
      };
    }));
    results.push(...rows);
    if (index + workerCount < accounts.length && delay > 0) await sleep(jitter(delay));
  }
  return {
    results,
    concurrency: workerCount,
    proxy_count: proxyPool.length,
    proxy_configured_count: configuredProxies.length,
    invalid_proxy_count: Math.max(0, configuredProxies.length - proxyPool.length),
  };
};

module.exports = { checkInstagramProfile, parseProfileUser, parseProfileJson, parseProfileHtml, batchCheckInstagram };
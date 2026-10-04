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
const randomDelay = (min, max) => min + Math.floor(Math.random() * (Math.max(max, min) - min + 1));
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
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Sec-Fetch-Dest': json ? 'empty' : 'document',
    'Sec-Fetch-Mode': json ? 'cors' : 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    Referer: `https://www.instagram.com/${encodeURIComponent(username)}/`,
    ...(cookieText ? { Cookie: cookieText } : {}),
    ...(json ? {
      Origin: 'https://www.instagram.com',
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

const isNotFoundMessage = (value) => /user\s*(?:not\s*found|doesn'?t\s*exist)|no users? found|unable to find (?:this )?user|invalid user|profile (?:was )?not found|requested (?:resource|user) (?:was )?not found|khÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng/i.test(String(value || ''));
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
  const message = payload.message || payload.error?.message || payload.error?.title || payload.errors?.[0]?.message || payload.status;
  if (explicitNull || isNotFoundMessage(message) || payload.status === 'not_found') return dieResult('user_not_found');
  return null;
};

const parseProfileHtml = (html) => {
  if (typeof html !== 'string' || !html.trim()) return null;
  let normalized = html
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#44;/gi, ',')
    .replace(/&amp;/gi, '&')
    .replace(/\\u0022/gi, '"')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/&#x27;|&#39;/gi, "'");
  for (let index = 0; index < 2; index += 1) normalized = normalized.replace(/\\"/g, '"');
  const visibleProfileText = normalized
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .toLowerCase();
  if (visibleProfileText.includes("sorry, this page isn't available")
      || visibleProfileText.includes("this profile isn't available")
      || visibleProfileText.includes("profile isn't available")
      || visibleProfileText.includes("this account isn't available")
      || visibleProfileText.includes('page may have been removed')
      || visibleProfileText.includes('profile may have been removed')
      || visibleProfileText.includes('link to this profile may be broken')
      || visibleProfileText.includes('account may have been removed')
      || visibleProfileText.includes('the link you followed may be broken')
      || visibleProfileText.includes("sorry, we couldn't find this page")
      || visibleProfileText.includes('page not found')
      || visibleProfileText.includes('ráº¥t tiáº¿c, trang nÃ y hiá»‡n khÃ´ng kháº£ dá»¥ng')
      || visibleProfileText.includes('liÃªn káº¿t báº¡n theo dÃµi cÃ³ thá»ƒ bá»‹ há»ng')) return dieResult('profile_page_not_found');
  if (/"(?:xdt_api__v1__users__web_profile_info|graphql|profile_page)"\s*:\s*\{[\s\S]{0,500}?"user"\s*:\s*null/i.test(normalized)
      || /"message"\s*:\s*"(?:user not found|no user found|unable to find (?:this )?user|profile not found)"/i.test(normalized)) {
    return dieResult('profile_user_null');
  }
  const pick = (patterns, text = normalized) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return numberOrNull(String(match[1]).replace(/[.,](?=\d{3}(?:\D|$))/g, ''));
    }
    return null;
  };
  const posts = pick([
    /"edge_owner_to_timeline_media"\s*:\s*\{[\s\S]{0,160}?"count"\s*:\s*"?(\d+)"?/i,
    /"edge_felix_video_timeline"\s*:\s*\{[\s\S]{0,160}?"count"\s*:\s*"?(\d+)"?/i,
    /"(?:media_count|post_count|posts_count|postsCount)"\s*:\s*"?(\d+)"?/i,
  ]);
  const followers = pick([/"edge_followed_by"\s*:\s*\{[\s\S]{0,160}?"count"\s*:\s*"?(\d+)"?/i, /"(?:follower_count|followers_count|followersCount)"\s*:\s*"?(\d+)"?/i]);
  const following = pick([/"edge_follow"\s*:\s*\{[\s\S]{0,160}?"count"\s*:\s*"?(\d+)"?/i, /"(?:following_count|followingCount)"\s*:\s*"?(\d+)"?/i]);
  if (posts !== null || followers !== null || following !== null) return { live: true, posts, followers, following };
  const metaValues = [];
  for (const match of normalized.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content="([^"]*)"/gi)) metaValues.push(match[1]);
  for (const match of normalized.matchAll(/<meta[^>]+content="([^"]*)"[^>]+(?:property|name)=["'](?:og:description|description)["']/gi)) metaValues.push(match[1]);
  const visibleText = [normalized, ...metaValues].join(' ');
  const metaFollowers = visibleText.match(/([\d.,]+\s*[KMB]?)\s+(?:Followers?|ngÆ°á»i theo dÃµi)/i);
  const metaFollowing = visibleText.match(/([\d.,]+\s*[KMB]?)\s+(?:Following|Ä‘ang theo dÃµi)/i);
  const metaPosts = visibleText.match(/([\d.,]+\s*[KMB]?)\s+(?:Posts?|bÃ i viáº¿t|publications?|publicaciones|publicaÃ§Ãµes)/i);
  if (metaFollowers || metaFollowing || metaPosts) return { live: true, posts: humanNumberOrNull(metaPosts?.[1]), followers: humanNumberOrNull(metaFollowers?.[1]), following: humanNumberOrNull(metaFollowing?.[1]) };
  return null;

};
const responseUrl = (response) => response?.request?.res?.responseUrl || response?.config?.url || '';
const isLoginWallHtml = (html) => {
  const value = String(html || '');
  return /<title>\s*(?:Login|Log in)[^<]*Instagram\s*<\/title>/i.test(value)
    || /<form[^>]+action=["'][^"']*\/accounts\/login\/ajax\/?["']/i.test(value)
    || (/<input[^>]+name=["']username["']/i.test(value) && /<input[^>]+name=["']password["']/i.test(value));
};
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

const fetchPublicPostStats = async (username, userId, proxyUrl, cookies = null) => {
  const endpoints = [
    { url: `https://www.instagram.com/${encodeURIComponent(username)}/?__a=1&__d=dis`, source: 'profile_json' },
    ...(userId ? [{ url: `https://i.instagram.com/api/v1/users/${encodeURIComponent(userId)}/info/`, source: 'mobile_user_info' }] : []),
    { url: `https://www.instagram.com/api/v1/feed/user/${encodeURIComponent(username)}/username/?count=12`, source: 'profile_feed' },
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(endpoint.url, requestConfig(username, proxyUrl, true, cookies));
      // These endpoints are only fallbacks for the post count after the profile
      // has already been confirmed live. A 404 here may mean that the private
      // endpoint is unavailable, not that the Instagram account is dead.
      if ([401, 403, 404, 410, 429].includes(response.status)
          || response.status >= 500
          || /\/accounts\/login|\/challenge\//i.test(responseUrl(response))) continue;
      const parsed = parseProfileJson(response.data);
      if (parsed?.live === true && parsed.posts !== null) {
        return { ...parsed, source: endpoint.source, http_status: response.status };
      }
      const items = Array.isArray(response.data?.items) ? response.data.items : null;
      const moreAvailable = response.data?.more_available ?? response.data?.moreAvailable;
      if (items && moreAvailable === false) {
        return {
          live: true,
          posts: items.length,
          followers: parsed?.followers ?? null,
          following: parsed?.following ?? null,
          source: endpoint.source,
          http_status: response.status,
        };
      }
    } catch (_) {
      // Try the next public endpoint. The caller keeps the already-confirmed
      // live result even when every post-count endpoint is unavailable.
    }
  }
  return null;
};
const hasAuthenticatedMissingProfile = (html, username) => {
  let normalized = String(html || '');
  for (let index = 0; index < 2; index += 1) normalized = normalized.replace(/\\"/g, '"');
  const escapedUsername = String(username || '').replace(/[^a-z0-9._]/gi, '\\$&');
  const hasExactUsername = new RegExp(`"username"\\s*:\\s*"${escapedUsername}"`, 'i').test(normalized);
  const hasErrorRoot = /PolarisErrorRoot\.entrypoint|"pageID"\s*:\s*"httpErrorPage"/i.test(normalized);
  return hasErrorRoot && !hasExactUsername;
};

const fetchProfileHtml = async (username, proxyUrl, cookies = null) => {
  const endpoints = [
    { url: `https://www.instagram.com/${encodeURIComponent(username)}/?hl=en`, source: 'profile_html', definitiveDie: true },
    { url: `https://www.instagram.com/${encodeURIComponent(username)}/embed/?hl=en`, source: 'profile_embed_html', definitiveDie: false },
  ];
  let partial = null;
  let authenticatedMissingCount = 0;
  let last = unknownResult('profile_html_unavailable');
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(endpoint.url, requestConfig(username, proxyUrl, false, cookies));
      const finalUrl = responseUrl(response);
      if (/\/accounts\/login|\/challenge\//i.test(finalUrl) || isLoginWallHtml(response.data)) {
        last = unknownResult(responseReason(response, endpoint.source), { source: endpoint.source, http_status: response.status });
        continue;
      }
      if ((response.status === 404 || response.status === 410) && endpoint.definitiveDie) return { ...dieResult('profile_http_404'), source: endpoint.source, http_status: response.status };
      if ([401, 403, 429].includes(response.status) || response.status >= 500) {
        last = unknownResult(responseReason(response, endpoint.source), { source: endpoint.source, http_status: response.status });
        continue;
      }
      const parsed = parseProfileHtml(response.data);
      if (parsed?.live === false) {
        if (endpoint.definitiveDie) return { ...parsed, source: endpoint.source, http_status: response.status };
        if (cookies) {
          authenticatedMissingCount += 1;
          last = unknownResult('authenticated_embed_missing_candidate', { source: endpoint.source, http_status: response.status });
          continue;
        }
      }
      if (cookies && response.status === 200 && !parsed && hasAuthenticatedMissingProfile(response.data, username)) {
        authenticatedMissingCount += 1;
        last = unknownResult('authenticated_profile_missing_candidate', { source: endpoint.source, http_status: response.status });
        continue;
      }
      if (parsed?.live === true) {
        partial = { ...mergeLiveStats(partial, parsed), source: endpoint.source, http_status: response.status };
        if (partial.posts !== null) return partial;
      } else last = unknownResult(responseReason(response, endpoint.source), { source: endpoint.source, http_status: response.status });
    } catch (err) {
      last = unknownResult(`${endpoint.source}_${err.code || 'request_failed'}`, { source: endpoint.source });
    }
  }
  if (!partial && authenticatedMissingCount >= 2) {
    return { ...dieResult('authenticated_profile_missing_confirmed'), source: 'authenticated_profile_html', http_status: 200 };
  }
  return partial || last;
};

const checkInstagramProfile = async (username, proxyUrl = null, cookies = null) => {
  const safeUsername = String(username || '').trim().replace(/^@/, '');
  if (!safeUsername) return unknownResult('missing_username');
  await sleep(randomDelay(250, 750));
  let partial = null;
  let lastReason = 'no_profile_data';
  let lastStatus = null;
  const htmlProfile = await fetchProfileHtml(safeUsername, proxyUrl, cookies);
  if (htmlProfile?.live === false) return htmlProfile;
  if (htmlProfile?.live === true) {
    partial = htmlProfile;
    if (partial.posts !== null) return partial;
  } else {
    lastReason = htmlProfile?.reason || lastReason;
    lastStatus = htmlProfile?.http_status ?? lastStatus;
  }
  try {
    const endpoint = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(safeUsername)}`;
    const response = await axios.get(endpoint, requestConfig(safeUsername, proxyUrl, true, cookies));
    lastStatus = response.status;
    if ((response.status === 404 || response.status === 410) && !partial && !/\/accounts\/login|\/challenge\//i.test(responseUrl(response))) {
      return { ...dieResult('web_profile_info_404'), source: 'web_profile_info', http_status: response.status };
    }
    const parsed = parseProfileJson(response.data);
    if (parsed?.live === false && !partial) return { ...parsed, source: 'web_profile_info', http_status: response.status };
    if (parsed?.live === true) {
      partial = { ...mergeLiveStats(partial, parsed), source: 'web_profile_info', http_status: response.status };
      if (partial.posts !== null) return partial;
      const publicStats = await fetchPublicPostStats(safeUsername, partial.user_id, proxyUrl, cookies);
      if (publicStats?.live === true) {
        partial = { ...mergeLiveStats(partial, publicStats), source: publicStats.source, http_status: publicStats.http_status };
        if (partial.posts !== null) return partial;
      }
    } else lastReason = responseReason(response, 'web_profile_info');
  } catch (err) {
    lastReason = `web_profile_info_${err.code || 'request_failed'}`;
  }
  if (partial?.live === true) return { ...partial, reason: 'post_count_unavailable' };
  return unknownResult(lastReason, { source: 'instagram', http_status: lastStatus });
};
const maskProxy = (proxyUrl) => proxyUrl
  ? proxyUrl.replace(/\/\/([^:@]+):([^@]+)@/, '//$1:***@')
  : 'direct';

const batchCheckInstagram = async (accounts, rawProxies = [], concurrency = 20, delayMs = 0, rawCookies = []) => {
  const configuredCookies = [...new Set((Array.isArray(rawCookies) ? rawCookies : String(rawCookies || '').split(/\r?\n/))
    .map((item) => String(item || '').replace(/[\r\n]+/g, ' ').trim())
    .filter(Boolean))];
  const configuredProxies = Array.isArray(rawProxies) ? rawProxies.map((item) => String(item || '').trim()).filter(Boolean) : [];
  const proxyPool = configuredProxies.map(parseProxy).filter(Boolean);
  if (configuredProxies.length && !proxyPool.length) throw new Error('Cau hinh proxy Instagram khong hop le; da dung check de tranh su dung mang chinh');
  const workerCount = Math.min(Math.max(parseInt(concurrency, 10) || 20, 1), 40);
  const delay = Math.min(Math.max(parseInt(delayMs, 10) || 0, 0), 10_000);
  const results = [];
  const proxyStates = proxyPool.map((proxy) => ({ proxy, cooldownUntil: 0 }));
  let proxyIndex = 0;
  let cookieIndex = 0;
  const nextFallbackCookie = (excluded = new Set()) => {
    if (!configuredCookies.length) return null;
    for (let offset = 0; offset < configuredCookies.length; offset += 1) {
      const cookie = configuredCookies[cookieIndex++ % configuredCookies.length];
      if (!excluded.has(cookie)) return cookie;
    }
    return null;
  };
  const nextProxy = (excluded = null) => {
    if (!proxyStates.length) return null;
    const now = Date.now();
    let fallback = null;
    for (let offset = 0; offset < proxyStates.length; offset += 1) {
      const state = proxyStates[proxyIndex++ % proxyStates.length];
      if (state.proxy === excluded && proxyStates.length > 1) continue;
      if (!fallback || state.cooldownUntil < fallback.cooldownUntil) fallback = state;
      if (state.cooldownUntil <= now) return state.proxy;
    }
    return fallback?.proxy || proxyStates[proxyIndex++ % proxyStates.length].proxy;
  };
  const markProxyResult = (proxyUrl, stats) => {
    if (!proxyUrl) return;
    const state = proxyStates.find((item) => item.proxy === proxyUrl);
    if (!state) return;
    const status = Number(stats?.http_status) || 0;
    const reason = String(stats?.reason || '');
    if (status === 429 || /rate_limited/i.test(reason)) state.cooldownUntil = Date.now() + 30_000;
    else if (status === 403 || /forbidden/i.test(reason)) state.cooldownUntil = Date.now() + 15_000;
    else if (/ECONNRESET|ETIMEDOUT|request_failed/i.test(reason)) state.cooldownUntil = Date.now() + 10_000;
    else if (stats?.live === true || stats?.live === false) state.cooldownUntil = 0;
  };

  for (let index = 0; index < accounts.length; index += workerCount) {
    const batch = accounts.slice(index, index + workerCount);
    const rows = await Promise.all(batch.map(async (account) => {
      let stats = unknownResult('not_checked');
      let proxyUrl = nextProxy();
      let attempts = 0;
      let cookieFallbackAttempts = 0;
      const maxAttempts = proxyPool.length ? Math.min(3, Math.max(2, proxyPool.length)) : 1;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        attempts += 1;
        stats = await checkInstagramProfile(account.uid, proxyUrl, account.cookies || null);
        markProxyResult(proxyUrl, stats);
        if (stats.live === true || stats.live === false) break;
        if (attempt + 1 < maxAttempts) {
          await sleep(randomDelay(350, 900));
          proxyUrl = nextProxy(proxyUrl);
        }
      }

      if (stats.live !== true && stats.live !== false && configuredCookies.length) {
        const triedCookies = new Set(account.cookies ? [String(account.cookies).trim()] : []);
        const maxCookieAttempts = Math.min(3, configuredCookies.length);
        for (let cookieAttempt = 0; cookieAttempt < maxCookieAttempts; cookieAttempt += 1) {
          const fallbackCookie = nextFallbackCookie(triedCookies);
          if (!fallbackCookie) break;
          triedCookies.add(fallbackCookie);
          cookieFallbackAttempts += 1;
          attempts += 1;
          if (proxyPool.length) proxyUrl = nextProxy(proxyUrl);
          stats = await checkInstagramProfile(account.uid, proxyUrl, fallbackCookie);
          markProxyResult(proxyUrl, stats);
          if (stats.live === true || stats.live === false) break;
          if (cookieAttempt + 1 < maxCookieAttempts) await sleep(randomDelay(350, 900));
        }
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
        cookie_fallback_used: cookieFallbackAttempts > 0,
        cookie_attempts: cookieFallbackAttempts,
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
    cookie_count: configuredCookies.length,
  };
};

module.exports = { checkInstagramProfile, parseProfileUser, parseProfileJson, parseProfileHtml, batchCheckInstagram };

/**
 * liveCheckController.js  —  TikTok live-check với proxy pool
 *
 * Nguyên tắc chống false-die:
 *  1. Header profile phải khớp UA (Chrome ≠ Firefox ≠ Safari ≠ iPhone)
 *  2. Delay ngẫu nhiên TRƯỚC mỗi request (không chỉ giữa batch)
 *  3. Chỉ kết luận "die" khi có signal rõ ràng từ TikTok (statusCode, 404, ...)
 *     → Nếu ambiguous → unknown (không ghi đè live_status cũ)
 *  4. Retry 1 lần nếu parse thất bại
 */

const axios  = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { Op } = require('sequelize');
const Account = require('../models/Account');
const logger  = require('../config/logger');
const { success, error } = require('../utils/response');
const { scopedWhere } = require('../utils/owner');
const {
  batchCheckLive: sharedBatchCheckLive,
  parseProxy: sharedParseProxy,
} = require('../utils/checkLiveUtils');

const ELIGIBLE_MIN_AGE_DAYS = 4;
const ELIGIBLE_MIN_VIDEOS = 20;

// ─────────────────────────────────────────────────────────────────────────────
// UA profiles: mỗi profile có UA + header đặc trưng khớp nhau
// ─────────────────────────────────────────────────────────────────────────────
const UA_PROFILES = [
  // ── Chrome 120 Windows ────────────────────────────────────────────────────
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.199 Safari/537.36',
    extra: {
      'sec-ch-ua': '"Not_A Brand";v="8","Chromium";v="120","Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-User': '?1',
    },
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  },
  // ── Chrome 119 Windows ────────────────────────────────────────────────────
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.199 Safari/537.36',
    extra: {
      'sec-ch-ua': '"Google Chrome";v="119","Not?A_Brand";v="24","Chromium";v="119"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-User': '?1',
    },
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  },
  // ── Chrome 120 Mac ────────────────────────────────────────────────────────
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.199 Safari/537.36',
    extra: {
      'sec-ch-ua': '"Not_A Brand";v="8","Chromium";v="120","Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'Sec-Fetch-User': '?1',
    },
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  },
  // ── Chrome 118 Mac ────────────────────────────────────────────────────────
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.88 Safari/537.36',
    extra: {
      'sec-ch-ua': '"Chromium";v="118","Google Chrome";v="118","Not=A?Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'Sec-Fetch-User': '?1',
    },
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  },
  // ── Edge 120 Windows ─────────────────────────────────────────────────────
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91',
    extra: {
      'sec-ch-ua': '"Not_A Brand";v="8","Chromium";v="120","Microsoft Edge";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-User': '?1',
    },
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  },
  // ── Firefox 121 Windows ──────────────────────────────────────────────────
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    extra: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Sec-Fetch-User': '?1',
      'TE': 'trailers',
    },
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    noSecCh: true, // Firefox không có sec-ch-ua
  },
  // ── Firefox 120 Windows ──────────────────────────────────────────────────
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    extra: { 'TE': 'trailers', 'Sec-Fetch-User': '?1' },
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    noSecCh: true,
  },
  // ── Firefox 121 Mac ──────────────────────────────────────────────────────
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.2; rv:121.0) Gecko/20100101 Firefox/121.0',
    extra: { 'TE': 'trailers', 'Sec-Fetch-User': '?1' },
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    noSecCh: true,
  },
  // ── Safari 17 Mac ────────────────────────────────────────────────────────
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    extra: {},
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    noSecCh: true,
  },
  // ── Safari 16 Mac ────────────────────────────────────────────────────────
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    extra: {},
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    noSecCh: true,
  },
  // ── Safari iPhone 17 ────────────────────────────────────────────────────
  {
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    extra: {
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"iOS"',
    },
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    mobile: true,
  },
  // ── Safari iPhone 16 ────────────────────────────────────────────────────
  {
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    extra: { 'sec-ch-ua-mobile': '?1' },
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    mobile: true,
  },
  // ── Chrome Android ───────────────────────────────────────────────────────
  {
    ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
    extra: {
      'sec-ch-ua': '"Not_A Brand";v="8","Chromium";v="120","Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
    },
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    mobile: true,
  },
  // ── Chrome Samsung ───────────────────────────────────────────────────────
  {
    ua: 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
    extra: {
      'sec-ch-ua': '"Chromium";v="120","Google Chrome";v="120","Not=A?Brand";v="99"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
    },
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    mobile: true,
  },
];

const ACCEPT_LANGUAGES = [
  'en-US,en;q=0.9',
  'en-US,en;q=0.9,vi;q=0.8',
  'en-GB,en;q=0.9',
  'en-US,en;q=0.8,fr;q=0.6',
  'en-US,en;q=0.8,de;q=0.6',
  'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
];

const REFERERS = [
  null,
  'https://www.google.com/',
  'https://www.google.com/search?q=tiktok+%USERNAME%',
  'https://www.bing.com/',
  'https://t.co/',
  'https://www.tiktok.com/',
];

const getRandom  = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep      = (ms)  => new Promise((r) => setTimeout(r, ms));
const jitter     = (base, pct = 0.4) => base + Math.floor(Math.random() * base * pct);

// ── Build headers từ UA profile ───────────────────────────────────────────
const buildHeaders = (username) => {
  const profile  = getRandom(UA_PROFILES);
  const lang     = getRandom(ACCEPT_LANGUAGES);
  const referer  = getRandom(REFERERS)?.replace('%USERNAME%', encodeURIComponent(username));

  const headers = {
    'User-Agent':      profile.ua,
    'Accept':          profile.accept,
    'Accept-Language': lang,
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control':   'no-cache',
    'Pragma':          'no-cache',
    'Sec-Fetch-Dest':  'document',
    'Sec-Fetch-Mode':  'navigate',
    'Sec-Fetch-Site':  referer ? 'cross-site' : 'none',
    'Upgrade-Insecure-Requests': '1',
    ...profile.extra,
  };

  if (!profile.noSecCh) {
    // Chromium-based: thêm sec-ch-ua-* nếu chưa có trong extra
    headers['Sec-Fetch-User'] = headers['Sec-Fetch-User'] || '?1';
  }

  if (referer) headers['Referer'] = referer;

  return headers;
};

// ── Parse proxy string → URL ──────────────────────────────────────────────
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

// ── Parse TikTok HTML → stats (conservative: chỉ die khi chắc chắn) ──────
const parseTikTokPage = (html, username) => {
  // Strategy 1: __UNIVERSAL_DATA_FOR_REHYDRATION__ (TikTok mới nhất)
  try {
    const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      const root  = JSON.parse(m[1]);
      const scope = root?.['__DEFAULT_SCOPE__'] || root;
      const ui    = scope?.['webapp.user-detail']?.userInfo;

      // Tìm thấy user rõ ràng → LIVE
      if (ui?.user?.uniqueId) {
        const s = ui.stats || {};
        return {
          live:      true, banned: false,
          private:   !!ui.user.privateAccount,
          verified:  !!ui.user.verified,
          followers: s.followerCount  || 0,
          following: s.followingCount || 0,
          videos:    s.videoCount     || 0,
          likes:     s.heartCount || s.heart || 0,
        };
      }

      // Có statusCode rõ ràng trong JSON → DIE (TikTok trả về API error)
      const detail = scope?.['webapp.user-detail'];
      if (detail && (detail.statusCode === 10202 || detail.statusCode === '10202')) {
        return { live: false, banned: true, followers: 0, following: 0, videos: 0, likes: 0 };
      }

      // Còn lại (userInfo rỗng, detail rỗng, v.v.) → KHÔNG kết luận die
      // Vì trang challenge của TikTok cũng có __UNIVERSAL_DATA_FOR_REHYDRATION__
      // với webapp.user-detail là {} hoặc { userInfo: {} }
      // → fall through sang các strategy khác
    }
  } catch (_) {}

  // Strategy 2: SIGI_STATE (TikTok cũ)
  try {
    const m = html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      const data  = JSON.parse(m[1]);
      const users = data?.UserModule?.users || {};
      const user  = users[username.toLowerCase()] || Object.values(users)[0];
      if (user?.uniqueId) {
        const sm = data?.UserModule?.stats || {};
        const s  = sm[user.id] || Object.values(sm)[0] || {};
        return {
          live:      true, banned: false,
          private:   !!user.privateAccount,
          verified:  !!user.verified,
          followers: s.followerCount  || 0,
          following: s.followingCount || 0,
          videos:    s.videoCount     || 0,
          likes:     s.heartCount     || 0,
        };
      }
    }
  } catch (_) {}

  // Strategy 3: inline regex (fallback nhẹ)
  try {
    const fM = html.match(/"followerCount"\s*:\s*(\d+)/);
    const vM = html.match(/"videoCount"\s*:\s*(\d+)/);
    const wM = html.match(/"followingCount"\s*:\s*(\d+)/);
    if (fM || vM) {
      return {
        live: true, banned: false, private: false, verified: false,
        followers: fM ? +fM[1] : 0,
        following: wM ? +wM[1] : 0,
        videos:    vM ? +vM[1] : 0,
        likes:     0,
      };
    }
  } catch (_) {}

  // Strategy 4: die signals — CHỈ những signal CHẮC CHẮN từ TikTok API
  // KHÔNG dùng "userInfo:{}" vì trang challenge cũng có thể có string này
  const h = html.toLowerCase();

  // statusCode 10202 dưới dạng text trong JSON
  if (h.includes('"statuscode":10202') || h.includes('"statuscode": 10202')) {
    return { live: false, banned: true, followers: 0, following: 0, videos: 0, likes: 0 };
  }

  // TikTok "không tìm thấy" — chỉ khi đồng thời có structure của trang TikTok thật
  // (tránh false-positive trên trang lỗi generic của proxy/CDN)
  const hasTikTokStructure = (
    h.includes('__universal_data_for_rehydration__') ||
    h.includes('sigi_state') ||
    h.includes('"webapp.user-detail"')
  );
  if (hasTikTokStructure && h.includes("couldn't find this account")) {
    return { live: false, banned: true, followers: 0, following: 0, videos: 0, likes: 0 };
  }

  // Ambiguous (bot-challenge, network error, unknown format) → null = unknown
  // KHÔNG kết luận die chỉ vì không parse được!
  return null;
};

// ── Check 1 account (với retry) ───────────────────────────────────────────
const checkOne = async (username, proxyUrl, attempt = 0) => {
  // Per-request jitter delay (tránh concurrent burst)
  await sleep(jitter(300, 0.8)); // 300 – 540 ms trước mỗi request

  const url    = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
  const config = {
    headers:        buildHeaders(username),
    timeout:        18_000,
    maxRedirects:   4,
    validateStatus: (s) => s < 500, // Chấp nhận 2xx, 3xx, 4xx
    decompress:     true,
  };

  if (proxyUrl) {
    try {
      config.httpsAgent = new HttpsProxyAgent(proxyUrl);
      config.proxy      = false;
    } catch (_) {}
  }

  let resp;
  try {
    resp = await axios.get(url, config);
  } catch (e) {
    // Network error (proxy fail, timeout) → retry once với delay lớn hơn
    if (attempt < 1) {
      await sleep(jitter(4000, 0.5)); // 4-6 giây
      return checkOne(username, proxyUrl, attempt + 1);
    }
    return null; // unknown sau 2 lần thử
  }

  // HTTP 404 → die chắc chắn
  if (resp.status === 404) {
    return { live: false, banned: true, followers: 0, following: 0, videos: 0, likes: 0 };
  }

  // HTTP khác 200 → unknown
  if (resp.status !== 200) return null;

  const result = parseTikTokPage(resp.data, username);

  // Parse thất bại (bot-challenge) → retry 1 lần sau ~5 giây với UA khác
  if (result === null && attempt < 1) {
    await sleep(jitter(5000, 0.4)); // 5-7 giây
    return checkOne(username, proxyUrl, attempt + 1);
  }

  return result;
};

// ── Main controller ───────────────────────────────────────────────────────
const checkLive = async (req, res, next) => {
  req.socket?.setTimeout?.(600_000);

  try {
    let { ids, proxies = [], concurrency = 12, delay_ms = 200 } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return error(res, 'Cần truyền mảng ids', 400);
    }
    if (ids.length > 1000) return error(res, 'Tối đa 1000 accounts/lần', 400);

    const proxyPool = (Array.isArray(proxies) ? proxies : String(proxies).split('\n'))
      .map(sharedParseProxy).filter(Boolean);

    concurrency = Math.max(1, Math.min(50,   parseInt(concurrency) || 12));
    delay_ms    = Math.max(0, Math.min(10000, parseInt(delay_ms)    || 200));

    const accounts = await Account.findAll({
      where:      scopedWhere(req, { id: { [Op.in]: ids }, username: { [Op.ne]: null } }),
      attributes: ['id', 'username'],
      order:      [['id', 'ASC']],
    });

    if (accounts.length === 0) {
      return success(res, { results: [], live: 0, die: 0, unknown: 0 }, 'Không có account');
    }

    const results = await sharedBatchCheckLive(accounts, proxyPool, concurrency, delay_ms);

    const live    = results.filter((r) => r.result === 'live').length;
    const die     = results.filter((r) => r.result === 'die').length;
    const unknown = results.filter((r) => r.result === 'unknown').length;

    logger.info('check-live done', {
      total: results.length, live, die, unknown,
      proxies: proxyPool.length, concurrency, delay_ms,
      admin: req.admin?.username,
    });

    return success(res, { results, live, die, unknown },
      `Checked ${results.length}: ${live} live · ${die} die · ${unknown} unknown`);

  } catch (err) {
    next(err);
  }
};

// ── Promote eligible ──────────────────────────────────────────────────────
const promoteEligible = async (req, res, next) => {
  try {
    const { min_age_days = ELIGIBLE_MIN_AGE_DAYS, min_videos = ELIGIBLE_MIN_VIDEOS } = req.body;
    const cutoff = new Date(Date.now() - min_age_days * 24 * 60 * 60 * 1000);

    const [affected] = await Account.update(
      { status: 'ACC_DU_DK' },
      {
        where: {
          status:      'LOGIN_THANH_CONG',
          video_count: { [Op.gte]: min_videos },
          reg_at:      { [Op.lte]: cutoff },
          ...scopedWhere(req),
        },
      }
    );

    logger.info('promote-eligible', { affected, min_age_days, min_videos, admin: req.admin?.username });
    return success(res, { affected },
      affected > 0
        ? `Đã chuyển ${affected} accounts đủ điều kiện → ACC_DU_DK`
        : `Không có account đủ điều kiện (cần: Login Thành Công + ≥ ${min_videos} video + reg ≥ ${min_age_days} ngày)`);

  } catch (err) { next(err); }
};

module.exports = { checkLive, promoteEligible };

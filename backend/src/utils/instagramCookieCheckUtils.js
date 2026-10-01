const fs = require('fs');
const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const ProxyChain = require('proxy-chain');
const { parseProxy } = require('./checkLiveUtils');

const APP_ID = '936619743392459';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseCookie = (rawCookie) => String(rawCookie || '')
  .split(String.fromCharCode(10)).join(' ')
  .split(String.fromCharCode(13)).join(' ')
  .split(';')
  .map((part) => {
    const separator = part.indexOf('=');
    if (separator <= 0) return null;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return name && value ? { name, value } : null;
  })
  .filter(Boolean);

const cookieValue = (cookies, name) => cookies.find((item) => item.name.toLowerCase() === String(name).toLowerCase())?.value || null;

const findExecutable = (configured, candidates) => {
  if (configured && fs.existsSync(configured)) return configured;
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

const chromeBinary = () => findExecutable(process.env.CHROME_BIN, [
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]);

const chromeDriver = () => findExecutable(process.env.CHROMEDRIVER_PATH, [
  '/usr/bin/chromedriver',
  '/usr/local/bin/chromedriver',
]);

const createDriver = async (proxyUrl = null) => {
  const options = new chrome.Options();
  options.setPageLoadStrategy('eager');
  options.addArguments(
    '--headless=new',
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--window-size=1280,900',
    '--lang=en-US'
  );
  options.excludeSwitches('enable-automation');
  options.setUserPreferences({
    'profile.default_content_setting_values.notifications': 2,
    'profile.managed_default_content_settings.images': 2,
  });
  const binary = chromeBinary();
  if (binary) options.setChromeBinaryPath(binary);
  if (proxyUrl) options.addArguments('--proxy-server=' + proxyUrl);

  let builder = new Builder().forBrowser('chrome').setChromeOptions(options);
  const driverPath = chromeDriver();
  if (driverPath) builder = builder.setChromeService(new chrome.ServiceBuilder(driverPath));
  const driver = await builder.build();
  try {
    await driver.sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });",
    });
  } catch (_) {}
  await driver.manage().setTimeouts({ pageLoad: 30_000, script: 30_000, implicit: 0 });
  return driver;
};

const authenticatedFetch = async (driver) => driver.executeAsyncScript(function browserCookieCheck(appId, done) {
  fetch('/api/v1/accounts/edit/web_form_data/', {
    method: 'GET',
    credentials: 'include',
    redirect: 'follow',
    headers: {
      Accept: '*/*',
      'X-IG-App-ID': appId,
      'X-Requested-With': 'XMLHttpRequest',
    },
  }).then(async (response) => {
    let data = null;
    try { data = await response.json(); } catch (_) {
      try { data = (await response.text()).slice(0, 500); } catch (_) { data = null; }
    }
    done({ ok: true, status: response.status, url: response.url, data });
  }).catch((err) => done({ ok: false, error: String(err && err.message ? err.message : err) }));
}, APP_ID);

const responseMessage = (data) => String(data?.message || data?.error?.message || data?.error_type || data?.status || data || '').toLowerCase();

const classifyBrowserResult = (pageUrl, response) => {
  const currentUrl = String(pageUrl || '').toLowerCase();
  const responseUrl = String(response?.url || '').toLowerCase();
  const status = Number(response?.status) || 0;
  const data = response?.data;
  const message = responseMessage(data);
  const username = data?.form_data?.username || data?.user?.username || data?.data?.user?.username || null;

  if (currentUrl.includes('/challenge/') || currentUrl.includes('/checkpoint/')
      || responseUrl.includes('/challenge/') || /challenge_required|checkpoint_required|consent_required/.test(message)) {
    return { status: 'unknown', reason: 'challenge_required', username: null, http_status: status || null };
  }
  if (currentUrl.includes('/accounts/login') || responseUrl.includes('/accounts/login')
      || status === 401 || /login_required|not logged in|invalid session|session.*expired/.test(message)) {
    return { status: 'die', reason: 'login_required', username: null, http_status: status || null };
  }
  if (status === 200 && username) return { status: 'live', reason: 'browser_authenticated', username, http_status: status };
  if (status === 200 && data?.status === 'ok' && (data?.form_data || data?.user)) {
    return { status: 'live', reason: 'browser_authenticated', username, http_status: status };
  }
  if (status === 429) return { status: 'unknown', reason: 'rate_limited', username: null, http_status: status };
  if (status === 403) return { status: 'unknown', reason: 'forbidden', username: null, http_status: status };
  if (status >= 500) return { status: 'unknown', reason: 'instagram_server_error', username: null, http_status: status };
  return { status: 'unknown', reason: response?.error || 'browser_inconclusive', username: null, http_status: status || null };
};

const checkInstagramCookie = async (rawCookie, upstreamProxy = null) => {
  const cookies = parseCookie(rawCookie);
  const dsUserId = cookieValue(cookies, 'ds_user_id');
  if (!cookieValue(cookies, 'sessionid')) {
    return { status: 'die', reason: 'missing_sessionid', username: null, ds_user_id: dsUserId, http_status: null, proxy_used: Boolean(upstreamProxy), engine: 'selenium' };
  }

  let driver = null;
  let browserProxy = null;
  try {
    if (upstreamProxy) browserProxy = await ProxyChain.anonymizeProxy(upstreamProxy);
    driver = await createDriver(browserProxy);
    await driver.get('https://www.instagram.com/robots.txt');
    for (const item of cookies) {
      try {
        await driver.manage().addCookie({ name: item.name, value: item.value, domain: '.instagram.com', path: '/' });
      } catch (_) {
        try { await driver.manage().addCookie({ name: item.name, value: item.value, path: '/' }); } catch (_) {}
      }
    }
    await driver.get('https://www.instagram.com/accounts/edit/');
    await sleep(1_500);
    const pageUrl = await driver.getCurrentUrl();
    const response = await authenticatedFetch(driver);
    return {
      ...classifyBrowserResult(pageUrl, response),
      ds_user_id: dsUserId,
      proxy_used: Boolean(upstreamProxy),
      engine: 'selenium',
    };
  } catch (err) {
    return {
      status: 'unknown',
      reason: err?.name || err?.code || 'selenium_failed',
      username: null,
      ds_user_id: dsUserId,
      http_status: null,
      proxy_used: Boolean(upstreamProxy),
      engine: 'selenium',
    };
  } finally {
    if (driver) {
      try { await driver.quit(); } catch (_) {}
    }
    if (browserProxy) {
      try { await ProxyChain.closeAnonymizedProxy(browserProxy, true); } catch (_) {}
    }
  }
};

const checkInstagramCookies = async (rawCookies = [], rawProxies = [], concurrency = 2) => {
  const cookies = [...new Set(rawCookies.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 30);
  const configuredProxies = rawProxies.map((item) => String(item || '').trim()).filter(Boolean);
  const proxies = configuredProxies.map(parseProxy).filter(Boolean);
  if (configuredProxies.length && !proxies.length) throw new Error('Cau hinh proxy Instagram khong hop le');
  const workerCount = Math.min(Math.max(parseInt(concurrency, 10) || 2, 1), 3);
  const results = new Array(cookies.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= cookies.length) return;
      const proxyUrl = proxies.length ? proxies[index % proxies.length] : null;
      results[index] = { index, ...(await checkInstagramCookie(cookies[index], proxyUrl)), checked_at: new Date().toISOString() };
      if (index + workerCount < cookies.length) await sleep(300);
    }
  };
  await Promise.all(Array.from({ length: Math.min(workerCount, Math.max(cookies.length, 1)) }, worker));
  return {
    results,
    cookie_count: cookies.length,
    proxy_count: proxies.length,
    invalid_proxy_count: configuredProxies.length - proxies.length,
    engine: 'selenium',
  };
};

module.exports = { createInstagramDriver: createDriver, checkInstagramCookie, checkInstagramCookies };

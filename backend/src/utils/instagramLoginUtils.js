const { By } = require('selenium-webdriver');
const ProxyChain = require('proxy-chain');
const crypto = require('crypto');
const { parseProxy } = require('./checkLiveUtils');
const { createInstagramDriver } = require('./instagramCookieCheckUtils');

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
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(parseInt(bits.slice(offset, offset + 8), 2));
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

const findFirst = async (driver, selectors) => {
  for (const selector of selectors) {
    const rows = await driver.findElements(By.css(selector));
    for (const row of rows) {
      try { if (await row.isDisplayed()) return row; } catch (_) {}
    }
  }
  return null;
};

const findSubmitControl = async (driver) => {
  const candidates = await driver.findElements(By.css('button[type="submit"], input[type="submit"], [role="button"]'));
  for (const candidate of candidates) {
    try {
      if (!await candidate.isDisplayed()) continue;
      if (await candidate.getAttribute('disabled')) continue;
      if (String(await candidate.getAttribute('aria-disabled')).toLowerCase() === 'true') continue;
      const tag = String(await candidate.getTagName()).toLowerCase();
      const type = String(await candidate.getAttribute('type')).toLowerCase();
      const text = String(await candidate.getText()).trim().toLowerCase();
      if ((tag === 'input' && type === 'submit') || /^(log in|continue|confirm|next|submit)$/.test(text)) return candidate;
    } catch (_) {}
  }
  return null;
};
const dismissCookieDialog = async (driver) => {
  const selectors = [
    "//button[contains(., 'Allow all cookies')]",
    "//button[contains(., 'Only allow essential cookies')]",
    "//button[contains(., 'Decline optional cookies')]",
  ];
  for (const selector of selectors) {
    try {
      const buttons = await driver.findElements(By.xpath(selector));
      if (buttons.length && await buttons[0].isDisplayed()) {
        await buttons[0].click();
        await sleep(300);
        return;
      }
    } catch (_) {}
  }
};
const readPageState = async (driver) => {
  let url = '';
  let text = '';
  try { url = await driver.getCurrentUrl(); } catch (_) {}
  try { text = String(await driver.findElement(By.css('body')).getText()).toLowerCase().slice(0, 4000); } catch (_) {}
  let cookies = [];
  try { cookies = await driver.manage().getCookies(); } catch (_) {}
  return { url: String(url).toLowerCase(), text, cookies };
};

const diagnosePage = async (driver) => {
  const state = await readPageState(driver);
  const fields = [];
  try {
    const inputs = await driver.findElements(By.css('input'));
    for (const input of inputs.slice(0, 12)) {
      fields.push({
        type: await input.getAttribute('type'),
        name: await input.getAttribute('name'),
        autocomplete: await input.getAttribute('autocomplete'),
        aria_label: await input.getAttribute('aria-label'),
        displayed: await input.isDisplayed(),
      });
    }
  } catch (_) {}
  let pageUrl = state.url;
  try { const parsed = new URL(state.url); pageUrl = parsed.origin + parsed.pathname; } catch (_) {}
  return { state, diagnostic: { page_url: pageUrl, fields } };
};
const classifyFailure = ({ url, text }) => {
  if (/challenge|checkpoint/.test(url) || /confirm it.?s you|suspicious login|security code/.test(text)) return 'challenge_required';
  if (/incorrect password|password was incorrect|wrong password/.test(text)) return 'invalid_password';
  if (/incorrect code|code.*incorrect|invalid code/.test(text)) return 'invalid_two_fa';
  if (/please wait a few minutes|try again later|feedback_required/.test(text)) return 'rate_limited';
  if (/couldn.?t log you in|problem logging you|sorry, there was a problem/.test(text)) return 'login_rejected';
  return 'login_timeout';
};

const serializeCookies = (cookies) => {
  const priority = ['ds_user_id', 'ig_did', 'datr', 'mid', 'sessionid', 'csrftoken', 'rur'];
  const rows = cookies.filter((item) => item && item.name && item.value);
  rows.sort((left, right) => {
    const leftIndex = priority.indexOf(left.name);
    const rightIndex = priority.indexOf(right.name);
    return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
  });
  return rows.map((item) => item.name + '=' + item.value).join('; ');
};

const loginInstagramAccount = async ({ username, password, two_fa, proxy }) => {
  const safeUsername = clean(username).replace(/^@/, '');
  if (!safeUsername || !clean(password)) return { status: 'failed', reason: 'missing_username_or_password' };
  const proxyUrl = parseProxy(clean(proxy));
  if (!proxyUrl) return { status: 'failed', reason: 'invalid_proxy' };

  let browserProxy = null;
  let driver = null;
  try {
    browserProxy = await ProxyChain.anonymizeProxy(proxyUrl);
    driver = await createInstagramDriver(browserProxy);

    await driver.get('https://www.instagram.com/accounts/login/');
    await sleep(700);
    await dismissCookieDialog(driver);

    let usernameInput = null;
    for (let attempt = 0; attempt < 20 && !usernameInput; attempt += 1) {
      usernameInput = await findFirst(driver, [
        'input[name="username"]',
        'input[name="email"]',
        'input[autocomplete="username"]',
        'input[autocomplete*="username"]',
      ]);
      if (!usernameInput) await sleep(500);
    }
    if (!usernameInput) return { status: 'failed', reason: 'login_form_not_found' };
    const passwordInput = await findFirst(driver, ['input[name="password"]', 'input[name="pass"]', 'input[type="password"]']);
    if (!passwordInput) return { status: 'failed', reason: 'password_field_not_found' };

    await usernameInput.clear();
    await usernameInput.sendKeys(safeUsername);
    await passwordInput.clear();
    await passwordInput.sendKeys(String(password));
    await sleep(300);
    const submit = await findSubmitControl(driver);
    if (!submit) return { status: 'failed', reason: 'login_button_not_found' };
    await submit.click();

    let twoFaSubmitted = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await sleep(750);
      const state = await readPageState(driver);
      const sessionCookie = state.cookies.find((item) => item.name === 'sessionid' && item.value);
      if (sessionCookie) {
        const cookieText = serializeCookies(state.cookies);
        const dsUserId = state.cookies.find((item) => item.name === 'ds_user_id')?.value || null;
        return { status: 'success', reason: 'login_success', cookies: cookieText, ds_user_id: dsUserId };
      }

      if (!twoFaSubmitted) {
        let twoFaInput = await findFirst(driver, [
          'input[name="verificationCode"]',
          'input[name="security_code"]',
          'input[name="approvals_code"]',
          'input[name="code"]',
          'input[autocomplete="one-time-code"]',
        ]);
        const onTwoStepPage = /two_step_verification|two_factor|two-factor/.test(state.url + ' ' + state.text);
        if (!twoFaInput && onTwoStepPage) {
          twoFaInput = await findFirst(driver, ['input[type="text"]', 'input[type="tel"]', 'input[inputmode="numeric"]']);
        }
        if (twoFaInput) {
          if (!clean(two_fa)) return { status: 'failed', reason: 'missing_two_fa' };
          let code;
          try { code = createTotp(two_fa); } catch (_) { return { status: 'failed', reason: 'invalid_two_fa_secret' }; }
          await twoFaInput.clear();
          await twoFaInput.sendKeys(code);
          await sleep(300);
          const verifyButton = await findSubmitControl(driver);
          if (verifyButton) await verifyButton.click();
          twoFaSubmitted = true;
          continue;
        }
      }

      if (/challenge|checkpoint/.test(state.url)) return { status: 'failed', reason: 'challenge_required' };
      if (/incorrect password|password was incorrect|wrong password/.test(state.text)) return { status: 'failed', reason: 'invalid_password' };
      if (/please wait a few minutes|try again later|feedback_required/.test(state.text)) return { status: 'failed', reason: 'rate_limited' };
    }
    const finalPage = await diagnosePage(driver);
    return { status: 'failed', reason: classifyFailure(finalPage.state), diagnostic: finalPage.diagnostic };
  } catch (error) {
    return { status: 'failed', reason: error?.name || error?.code || 'selenium_login_failed' };
  } finally {
    if (driver) { try { await driver.quit(); } catch (_) {} }
    if (browserProxy) { try { await ProxyChain.closeAnonymizedProxy(browserProxy, true); } catch (_) {} }
  }
};

const loginInstagramAccounts = async (accounts, rawProxies) => {
  const proxies = rawProxies.map((item) => clean(item)).filter((item) => parseProxy(item));
  if (!proxies.length) throw new Error('instagram_login_proxy_required');
  const results = [];
  for (let index = 0; index < accounts.length; index += 1) {
    const account = accounts[index];
    const result = await loginInstagramAccount({
      username: account.uid,
      password: account.password,
      two_fa: account.two_fa,
      proxy: proxies[index % proxies.length],
    });
    results.push({ id: account.id, uid: account.uid, ...result, proxy_index: (index % proxies.length) + 1 });
  }
  return { results, proxy_count: proxies.length, engine: 'selenium' };
};

module.exports = { createTotp, loginInstagramAccount, loginInstagramAccounts };
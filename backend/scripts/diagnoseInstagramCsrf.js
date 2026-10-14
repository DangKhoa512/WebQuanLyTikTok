// Read-only local account diagnostics. Never print response bodies or credentials.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../src/config/database');
const Account = require('../src/models/InstagramAccount');
const csrf = require('../src/services/instagramCsrfService');
const axios = require('axios');

(async () => {
  const id = Number(process.argv[2]);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('ID_REQUIRED');
  const account = await Account.findByPk(id, { attributes: ['id', 'owner_username', 'cookies', 'token'] });
  if (!account) { console.log('ACCOUNT_NOT_FOUND'); return; }
  if (!process.argv.includes('--live')) {
    const settings = await require('../src/services/settingsService').getFacebookCheckProxySettings(account.owner_username);
    let valid = false;
    try { require('../src/services/instagramCredentials').patch({cookies:account.cookies,token:account.token}); valid = true; } catch (_) {}
    const transport = await csrf.proxyOptions(account.owner_username, true);
    console.log(JSON.stringify({ id, has_cookie: !!account.cookies,
      has_csrf: !!csrf.cookieValue(account.cookies,'csrftoken'),
      has_session: !!csrf.cookieValue(account.cookies,'sessionid'),
      credentials_format_valid: valid, configured_proxy_count: settings.proxies.length,
      usable_proxy: !transport.blocked, network_called: false, database_written: false }));
    return;
  }
  if (!account.cookies || csrf.cookieValue(account.cookies, 'csrftoken')) {
    console.log(JSON.stringify({ id, skipped: true, reason: account.cookies ? 'ALREADY_PRESENT' : 'NO_COOKIE' })); return;
  }
  const transport = await csrf.proxyOptions(account.owner_username, true);
  if (transport.blocked) { console.log(JSON.stringify({ id, reason: transport.warning })); return; }
  let step = 0;
  const result = await csrf.enrich(account.cookies, {
    ...transport, enabled: true,
    request: async (url, config) => {
      step++;
      try {
        const response = await axios.get(url, config);
        console.log(JSON.stringify({ step, http_status: response.status,
          csrf_received: !!csrf.csrfFromResponse(response),
          body_bytes: typeof response.data === 'string' ? Buffer.byteLength(response.data) : null,
          redirect_present: !!response.headers.location }));
        return response;
      } catch (err) {
        console.log(JSON.stringify({ step, error_code: /^[A-Z0-9_]+$/.test(err.code || '') ? err.code : null,
          response_too_large: /maxContentLength|larger than max/i.test(err.message || ''),
          decompression_error: /decompress|incorrect header|invalid distance|invalid code/i.test(err.message || '') }));
        throw err;
      }
    },
  });
  console.log(JSON.stringify({ id, fetched: result.fetched, warning: result.warning,
    http_status: result.http_status, previous_http_status: result.previous_http_status,
    request_stage: result.request_stage, database_written: false }));
})().catch(() => { console.error('DIAGNOSTIC_FAILED_NO_SECRET_OUTPUT'); process.exitCode = 1; })
  .finally(() => db.close());

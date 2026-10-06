// AutoTouch JavaScript (legacy JS-enabled builds). No Node.js dependency.
// Reuse the tool's exec/safeParse and configuration getters; never log secret or OTP.
function installGetTOTP(API, options) {
  options = options || {};
  const run = options.exec;
  const parse = options.safeParse || function (text) {
    try { return JSON.parse(text); } catch (_) { return null; }
  };
  const shellQuote = function (value) { return "'" + value.replace(/'/g, "'\"'\"'") + "'"; };
  API._GetTOTP = function (secret) {
    try {
      if (typeof secret !== 'string' || secret.length > 1024 || typeof run !== 'function') return 0;
      secret = secret.trim().toUpperCase();
      if (!/^[A-Z2-7]+=*$/.test(secret) || secret.length > 520) return 0;
      const baseUrl = String(options.getBaseUrl() || '').replace(/\/+$/, '').replace(/\/api$/i, '');
      const apiKey = String(options.getApiKey() || '').trim();
      const protocol = options.allowHttp === true ? 'https?' : 'https';
      if (!new RegExp('^' + protocol + '://[^\\s?#]+$').test(baseUrl) || !apiKey || /[\r\n]/.test(apiKey)) return 0;
      const command = 'curl -s --fail --connect-timeout 10 --max-time 30 --proto ' + shellQuote(options.allowHttp === true ? '=http,https' : '=https')
        + ' -X POST ' + shellQuote(baseUrl + '/api/totp/generate')
        + ' -H ' + shellQuote('Content-Type: application/json')
        + ' -H ' + shellQuote('x-api-key: ' + apiKey)
        + ' --data ' + shellQuote(JSON.stringify({ secret: secret }));
      const raw = run(command);
      if (typeof raw !== 'string' || !raw.trim()) return 0;
      const response = parse(raw);
      if (!response || response.success !== true || typeof response.code !== 'string' || !/^\d{6}$/.test(response.code)) return 0;
      return response.code;
    } catch (_) { return 0; }
  };
  return API;
}
if (typeof module !== 'undefined' && module.exports) module.exports = installGetTOTP;

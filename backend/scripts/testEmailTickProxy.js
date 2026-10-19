// Synthetic proxies and HTTP stubs only; no production DB or external network.
const assert = require('assert');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { getEmailTickConfig } = require('../src/config/emailtick');
const { createEmailTickService, createOwnerEmailTickService } = require('../src/services/emailTickService');
const { normalizeProxy } = require('../src/services/emailTickProxyTransport');
const config = getEmailTickConfig({ EMAILTICK_RETRY_DELAY_MS: '0' });
const json = data => ({ status: 200, headers: { 'content-type': 'application/json' }, data: JSON.stringify(data) });
const mailbox = () => json({ success: true, email: 'fixture@example.test', code: 'synthetic-key' });
const host = options => options.httpsAgent instanceof SocksProxyAgent ? options.httpsAgent.proxy.host : options.httpsAgent.proxy.hostname;
const base = { config, random: () => 0, sleep: async () => {} };
let groups = 0;

(async () => {
  for (const text of ['192.0.2.10:8100:fixture:password', 'fixture:password@192.0.2.10:8100', 'http://fixture:password@192.0.2.10:8100']) {
    assert.equal(normalizeProxy(text).href, 'http://fixture:password@192.0.2.10:8100/');
  }
  assert.equal(normalizeProxy('socks5://fixture:password@192.0.2.10:1080').protocol, 'socks5h:');
  for (const text of ['ftp://192.0.2.10:80', 'broken', 'http://192.0.2.10:65536', 'http://192.0.2.10:8000/path']) {
    assert.equal(normalizeProxy(text), null);
  }
  groups++;

  const calls = [];
  const provider = createEmailTickService({ ...base, proxies: ['192.0.2.10:8100', '192.0.2.11:8101'], http: {
    post: async (url, payload, options) => {
      assert(options.httpsAgent instanceof HttpsProxyAgent);
      assert.equal(options.proxy, false);
      assert.equal(options.maxRedirects, 0);
      assert(options.timeout <= 6000);
      calls.push({ host: host(options), ua: options.headers['User-Agent'] });
      if (host(options) === '192.0.2.10') throw Object.assign(Error('fixture'), { code: 'ECONNREFUSED' });
      return url.endsWith('/get-mailbox') ? mailbox() : json({ success: true, emails: [] });
    },
  } });
  const mail = await provider.createMailbox([4]);
  await provider.activateMailbox(mail.email, mail.mailboxCode);
  await provider.getEmails(mail.email, mail.mailboxCode);
  assert.deepEqual(calls.map(call => call.host), ['192.0.2.10', '192.0.2.11', '192.0.2.11', '192.0.2.11']);
  assert.equal(new Set(calls.map(call => call.ua)).size, 1);
  groups++;

  // Persisted context keeps UA/proxy after a new instance and pool reordering.
  const savedContext = provider.getTransportContext();
  assert(/^[a-f0-9]{64}$/.test(savedContext.proxy_key));
  const stable = createEmailTickService({ ...base, random: max => max - 1,
    transportContext: savedContext, proxies: ['192.0.2.11:8101', '192.0.2.10:8100'],
    http: { post: async (url, body, options) => {
      assert.equal(host(options), '192.0.2.11');
      assert.equal(options.headers['User-Agent'], savedContext.user_agent);
      return json({ success: true, emails: [] });
    } },
  });
  await stable.getEmails(mail.email, mail.mailboxCode);
  assert.deepEqual(stable.getTransportContext(), savedContext);
  assert.throws(() => createEmailTickService({ ...base, transportContext: savedContext, proxies: [] }), err => err.code === 'EMAILTICK_PROXY_UNAVAILABLE');
  assert.throws(() => createEmailTickService({ ...base, transportContext: { ...savedContext, user_agent: 'invalid\r\nheader' } }), err => err.code === 'EMAILTICK_CONFIG_ERROR');
  groups++;

  // Proxy authentication and failed CONNECT may move to another proxy.
  for (const kind of ['407', 'connect-failure', 'socks-auth']) {
    let count = 0;
    const p = createEmailTickService({ ...base, proxies: ['socks5://192.0.2.10:1080', '192.0.2.11:8101'], http: { post: async (url, body, options) => {
      count++;
      if (count === 1) {
        assert(options.httpsAgent instanceof SocksProxyAgent);
        if (kind === 'socks-auth') throw Error('Socks5 Authentication failed: synthetic-private-value');
        if (kind === 'connect-failure') options.httpsAgent.emit('proxyConnect', { statusCode: 502 });
        return { status: kind === '407' ? 407 : 502, data: '', headers: {} };
      }
      return mailbox();
    } } });
    await p.createMailbox([4]);
    assert.equal(count, 2);
  }
  groups++;

  // Do not move to another proxy for upstream rate limits/challenges/schema errors.
  for (const [response, errorCode] of [
    [{ status: 429, headers: { 'retry-after': '90' }, data: '' }, 'EMAILTICK_RATE_LIMITED'],
    [{ status: 403, headers: {}, data: 'Just a moment challenge-platform' }, 'EMAILTICK_CLOUDFLARE_CHALLENGE'],
    [json({ success: true }), 'EMAILTICK_INVALID_RESPONSE'],
  ]) {
    let count = 0;
    const p = createEmailTickService({ ...base, proxies: ['192.0.2.10:8100', '192.0.2.11:8101'], http: { post: async () => { count++; return response; } } });
    await assert.rejects(() => p.createMailbox([4]), err => err.code === errorCode);
    assert.equal(count, 1);
  }
  groups++;

  // All failing proxies stop at the distinct-proxy limit, without a direct request.
  let failures = 0;
  const dead = createEmailTickService({ ...base, proxies: [8100, 8101, 8102, 8103].map(port => `192.0.2.10:${port}`), http: { post: async (url, body, options) => {
    assert(options.httpsAgent);
    failures++;
    throw Object.assign(Error('synthetic-private-proxy-password'), { code: 'ETIMEDOUT' });
  } } });
  await assert.rejects(() => dead.createMailbox([4]), err => err.code === 'EMAILTICK_PROXY_UNAVAILABLE' && !JSON.stringify(err).includes('synthetic-private'));
  assert.equal(failures, 3);
  groups++;

  // DNS is public-only and pinned; mixed/private answers are never connected to.
  let requests = 0;
  const dnsProvider = createEmailTickService({ ...base, proxies: ['https://mixed.example.test:8100', 'https://public.example.test:8100'],
    lookup: async name => name.startsWith('mixed') ? [{ address: '127.0.0.1', family: 4 }, { address: '192.0.2.20', family: 4 }] : [{ address: '192.0.2.21', family: 4 }],
    http: { post: async (url, body, options) => {
      requests++;
      assert.equal(host(options), '192.0.2.21');
      assert.equal(options.httpsAgent.connectOpts.servername, 'public.example.test');
      return mailbox();
    } },
  });
  await dnsProvider.createMailbox([4]);
  assert.equal(requests, 1);
  const privateProvider = createEmailTickService({ ...base, proxies: ['127.0.0.1:8000', '192.168.1.1:8000'], http: { post: async () => { throw Error('Must not connect'); } } });
  await assert.rejects(() => privateProvider.createMailbox([4]), err => err.code === 'EMAILTICK_PROXY_UNAVAILABLE');
  groups++;

  // A stalled proxy handshake is aborted, then the next proxy is tried within total budget.
  let timeouts = 0;
  const started = Date.now();
  const hanging = createEmailTickService({ ...base, config: { ...config, proxyTimeoutMs: 30, proxyTotalTimeoutMs: 50 }, proxies: ['192.0.2.10:8100', '192.0.2.11:8101', '192.0.2.12:8102'],
    http: { post: async (url, body, options) => {
      timeouts++;
      return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(Error('fixture abort'), { code: 'ERR_CANCELED' })), { once: true }));
    } },
  });
  await assert.rejects(() => hanging.createMailbox([4]), err => err.code === 'EMAILTICK_PROXY_UNAVAILABLE');
  assert(timeouts >= 1 && timeouts <= 2);
  assert(Date.now() - started < 2000);
  groups++;

  // Failed DNS lookups also have a deadline and can fail over.
  const stalledDns = createEmailTickService({ ...base, config: { ...config, proxyTimeoutMs: 15 }, proxies: ['http://stalled.example.test:8000', '192.0.2.11:8101'],
    lookup: () => new Promise(() => {}), http: { post: async () => mailbox() },
  });
  await stalledDns.createMailbox([4]);
  groups++;

  // Owner is explicit; configured proxies cannot silently become direct traffic.
  const owners = [];
  for (const owner of ['owner_a', 'owner_b']) {
    const expected = owner === 'owner_a' ? '192.0.2.30' : '192.0.2.31';
    const p = await createOwnerEmailTickService(owner, { ...base,
      getProxySettings: async name => { owners.push(name); return { proxies: [`${expected}:8100`] }; },
      http: { post: async (url, body, options) => { assert.equal(host(options), expected); return mailbox(); } },
    });
    await p.createMailbox([4]);
  }
  assert.deepEqual(owners, ['owner_a', 'owner_b']);
  await assert.rejects(() => createOwnerEmailTickService('', base), err => err.code === 'EMAILTICK_PROXY_SETTINGS_ERROR');
  await assert.rejects(() => createOwnerEmailTickService('owner_a', { ...base, getProxySettings: async () => { throw Error('private-db-detail'); } }), err => err.code === 'EMAILTICK_PROXY_SETTINGS_ERROR');
  await assert.rejects(() => createOwnerEmailTickService('owner_a', { ...base, getProxySettings: async () => ({ proxies: ['ftp://192.0.2.10:8000'] }) }), err => err.code === 'EMAILTICK_PROXY_CONFIG_ERROR');
  const direct = await createOwnerEmailTickService('owner_a', { ...base, getProxySettings: async () => ({ proxies: [] }), http: { post: async (url, body, options) => { assert.equal(options.httpsAgent, undefined); return mailbox(); } } });
  await direct.createMailbox([4]);
  groups++;

  // Exercise actual Axios + CONNECT sockets, including a proxy that never completes its handshake.
  const http = require('http');
  const net = require('net');
  const axios = require('axios');
  const sockets = new Set();
  const track = server => server.on('connection', socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket));
  });
  const target = http.createServer((req, res) => {
    assert.equal(req.headers['proxy-authorization'], undefined);
    req.resume();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, email: 'fixture@example.test', code: 'synthetic-key' }));
  });
  const blackhole = net.createServer();
  const relay = http.createServer();
  for (const server of [target, blackhole, relay]) track(server);
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await Promise.all([listen(target), listen(blackhole), listen(relay)]);
  let connects = 0;
  relay.on('connect', (req, client, head) => {
    connects++;
    assert.equal(req.url, `127.0.0.1:${target.address().port}`);
    assert.equal(req.headers['proxy-authorization'], `Basic ${Buffer.from('fixture:password').toString('base64')}`);
    const upstream = net.connect(target.address().port, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      client.pipe(upstream); upstream.pipe(client);
    });
    sockets.add(upstream); upstream.once('close', () => sockets.delete(upstream));
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
  });
  try {
    const actual = createEmailTickService({ ...base,
      config: { ...config, baseUrl: `http://127.0.0.1:${target.address().port}`, proxyTimeoutMs: 150, proxyTotalTimeoutMs: 2000 },
      proxies: ['http://fixture:password@192.0.2.10:8100', 'http://fixture:password@192.0.2.11:8101'],
      http: { post: async (url, body, options) => {
        const originalHost = host(options);
        // Route synthetic public proxies to our local test servers only, after production validation.
        options.httpsAgent.connectOpts.host = '127.0.0.1';
        options.httpsAgent.connectOpts.port = originalHost === '192.0.2.10' ? blackhole.address().port : relay.address().port;
        return axios.post(url, body, options);
      } },
    });
    const createdMail = await actual.createMailbox([4]);
    await actual.activateMailbox(createdMail.email, createdMail.mailboxCode);
    assert.equal(connects, 2);
    groups++;
  } finally {
    for (const socket of sockets) socket.destroy();
    await Promise.all([target, blackhole, relay].map(server => new Promise(resolve => server.close(resolve))));
  }
  console.log(`EMAILTICK_PROXY_OK: ${groups} groups, failover/budgets/auth/owner/pinning/no-direct-fallback/429`);
})().catch(err => { console.error(err.stack); process.exitCode = 1; });

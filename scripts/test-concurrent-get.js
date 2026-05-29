#!/usr/bin/env node

const [baseUrl, endpoint, countArg, prefixArg] = process.argv.slice(2);

if (!baseUrl || !endpoint) {
  console.error('Usage: node scripts/test-concurrent-get.js <baseUrl> <endpoint> [count=10] [devicePrefix=loadtest]');
  console.error('Example: node scripts/test-concurrent-get.js http://116.99.46.111:12345 /api/chrome-accounts/get-cho-login 10 phone');
  process.exit(1);
}

const count = Math.max(1, parseInt(countArg, 10) || 10);
const devicePrefix = prefixArg || 'loadtest';
const url = `${baseUrl.replace(/\/$/, '')}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

const runOne = async (index) => {
  const started = Date.now();
  const device_id = `${devicePrefix}_${String(index + 1).padStart(2, '0')}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id }),
    });

    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (_) {
      body = { raw: text };
    }

    const account = body?.data?.account;
    return {
      index: index + 1,
      device_id,
      http: res.status,
      success: body?.success,
      message: body?.message,
      id: account?.id || null,
      username: account?.username || null,
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      index: index + 1,
      device_id,
      error: err.message,
      ms: Date.now() - started,
    };
  }
};

(async () => {
  console.log(`POST ${url}`);
  console.log(`Concurrent requests: ${count}`);

  const results = await Promise.all(Array.from({ length: count }, (_, i) => runOne(i)));
  const seen = new Map();

  for (const row of results) {
    const accountLabel = row.id ? `account=${row.id}/${row.username}` : 'account=-';
    const statusLabel = row.error ? `ERROR ${row.error}` : `HTTP ${row.http} success=${row.success}`;
    console.log(`#${row.index} ${row.device_id} ${statusLabel} ${accountLabel} ${row.ms}ms - ${row.message || ''}`);

    if (row.id) {
      const prev = seen.get(row.id);
      if (prev) {
        console.log(`DUPLICATE_ACCOUNT id=${row.id} devices=${prev},${row.device_id}`);
      } else {
        seen.set(row.id, row.device_id);
      }
    }
  }

  console.log(`Unique accounts returned: ${seen.size}/${count}`);
})();

import api from './api';

const clampNumber = (value, min, max, fallback) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

export async function checkLiveInBatches(endpoint, ids, settings, onProgress) {
  const proxyList = String(settings.proxies || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const batchSize = clampNumber(settings.batchSize, 10, 200, 50);
  const concurrency = clampNumber(settings.concurrency, 1, 30, 5);
  const delayMs = clampNumber(settings.delayMs, 0, 10000, 1000);

  const totals = { live: 0, die: 0, unknown: 0, rows: [] };

  for (let index = 0; index < ids.length; index += batchSize) {
    const batch = ids.slice(index, index + batchSize);
    const res = await api.post(
      endpoint,
      { ids: batch, proxies: proxyList, concurrency, delay_ms: delayMs },
      { timeout: 600_000 }
    );
    const data = res.data || {};

    totals.live += data.live || 0;
    totals.die += data.die || 0;
    totals.unknown += data.unknown || 0;
    totals.rows.push(...(data.results || []));

    onProgress?.({
      done: Math.min(index + batch.length, ids.length),
      total: ids.length,
      live: totals.live,
      die: totals.die,
      unknown: totals.unknown,
    });
  }

  return totals;
}

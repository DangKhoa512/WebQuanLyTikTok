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

  const batchSize = clampNumber(settings.batchSize, 1, 200, 60);
  const concurrency = clampNumber(settings.concurrency, 1, 50, 12);
  const delayMs = clampNumber(settings.delayMs, 0, 10000, 200);

  const totals = { live: 0, die: 0, unknown: 0, rows: [] };
  onProgress?.({ done: 0, total: ids.length, live: 0, die: 0, unknown: 0 });

  for (let index = 0; index < ids.length; index += batchSize) {
    const batch = ids.slice(index, index + batchSize);
    const timeoutMs = Math.max(30_000, Math.min(120_000, Math.ceil(batch.length / concurrency) * 18_000));
    const res = await api.post(
      endpoint,
      { ids: batch, proxies: proxyList, concurrency, delay_ms: delayMs },
      { timeout: timeoutMs }
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

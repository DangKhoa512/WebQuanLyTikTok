const LS_KEY = 'cl_settings';
const DEFAULTS = { proxies: '', concurrency: 5, delayMs: 1000 };

export function loadCheckLiveSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY)) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveCheckLiveSettings(settings) {
  localStorage.setItem(LS_KEY, JSON.stringify(settings));
}

import { createContext, useCallback, useContext, useRef } from 'react';
import { settingsApi } from '../services/api';
const SettingsData = createContext(null);

export function SettingsDataProvider({ children }) {
  const cache = useRef(new Map());
  const loadSettings = useCallback((name) => {
    if (!cache.current.has(name)) {
      const pending = settingsApi[name]().catch((error) => { cache.current.delete(name); throw error; });
      cache.current.set(name, pending);
    }
    return cache.current.get(name);
  }, []);
  const saveSettings = useCallback(async (name, ...args) => {
    const result = await settingsApi[name](...args);
    // The settings APIs have cross-module effects (workflow/nurture). Subsequent loads must be fresh.
    cache.current.clear();
    return result;
  }, []);
  return <SettingsData.Provider value={{ loadSettings, saveSettings }}>{children}</SettingsData.Provider>;
}
export function useSettingsData() {
  const value = useContext(SettingsData);
  if (!value) throw new Error('SettingsDataProvider is required');
  return value;
}

import { useEffect, useState } from 'react';
import { settingsApi } from './api';

const DEFAULTS = { min_age_days: 4, min_videos: 20 };

export function useEligibilitySettings() {
  const [settings, setSettings] = useState(DEFAULTS);

  useEffect(() => {
    let mounted = true;
    settingsApi.getEligibility()
      .then((res) => {
        if (!mounted) return;
        setSettings({ ...DEFAULTS, ...(res.data?.settings || {}) });
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  return settings;
}

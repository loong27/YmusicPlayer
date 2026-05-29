import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { defaultSettings, loadSettings, saveSettings, type PersistedSettings } from '../services/storage';

type SettingsContextValue = {
  settings: PersistedSettings;
  isLoading: boolean;
  updateSettings: (next: PersistedSettings | ((current: PersistedSettings) => PersistedSettings)) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<PersistedSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    loadSettings()
      .then(value => {
        if (isMounted) {
          setSettings(value);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const updateSettings = useCallback(async (next: PersistedSettings | ((current: PersistedSettings) => PersistedSettings)) => {
    const resolved = typeof next === 'function' ? next(settings) : next;
    setSettings(resolved);
    await saveSettings(resolved);
  }, [settings]);

  const value = useMemo<SettingsContextValue>(() => ({
    settings,
    isLoading,
    updateSettings,
  }), [isLoading, settings, updateSettings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error('useSettings must be used inside SettingsProvider');
  }
  return value;
}

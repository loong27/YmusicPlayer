import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { defaultSettings, loadSettings, normalizeSettings, saveSettings, type PersistedSettings } from '../services/storage';

type SettingsContextValue = {
  settings: PersistedSettings;
  isLoading: boolean;
  lastError?: string;
  updateSettings: (next: PersistedSettings | ((current: PersistedSettings) => PersistedSettings)) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<PersistedSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [lastError, setLastError] = useState<string>();

  useEffect(() => {
    let isMounted = true;
    loadSettings()
      .then(value => {
        if (isMounted) {
          setSettings(value);
        }
      })
      .catch(error => {
        if (isMounted) {
          setLastError(error instanceof Error ? error.message : '读取设置失败');
        }
      })
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
    let resolved: PersistedSettings = defaultSettings;
    setSettings(current => {
      const raw = typeof next === 'function' ? next(current) : next;
      resolved = normalizeSettings(raw);
      return resolved;
    });
    try {
      await saveSettings(resolved);
      setLastError(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存设置失败';
      setLastError(message);
      throw error;
    }
  }, []);

  const value = useMemo<SettingsContextValue>(() => ({
    settings,
    isLoading,
    lastError,
    updateSettings,
  }), [isLoading, lastError, settings, updateSettings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error('useSettings must be used inside SettingsProvider');
  }
  return value;
}

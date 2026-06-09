import type { PersistedSettings } from '../services/storage';

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function sanitizeSettingsForDiagnostics(settings: PersistedSettings) {
  return {
    ...settings,
    cloudApiKey: settings.cloudApiKey.trim() ? '已配置' : '未配置',
    aiApiKey: settings.aiApiKey.trim() ? '已配置' : '未配置',
  };
}

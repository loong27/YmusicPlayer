import type { AudioQuality, CloudProvider } from './Track';

export type ThemeMode = 'system' | 'light' | 'dark';

export type CloudSettings = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  authHeader: string;
  authScheme: string;
  activeProvider: CloudProvider;
  enabledProviders: CloudProvider[];
  searchMode: 'single' | 'multi';
  pageSize: number;
  defaultQuality: AudioQuality;
  timeoutMs: number;
  scrapeOverwriteMetadata: boolean;
  scrapeDownloadLyric: boolean;
};

export type AiSettings = {
  enabled: boolean;
  providerType: 'openai' | 'anthropic';
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  includeLyricSnippets: boolean;
  resolveCloudResults: boolean;
  maxRemoteRecommendations: number;
};

export type DownloadSettings = {
  directoryUri: string;
  quality: AudioQuality;
  maxConcurrentTasks: number;
  enableSegmentedDownload: boolean;
  segmentCount: number;
  autoImportAfterDownload: boolean;
  autoDownloadLyric: boolean;
  autoQualityFallback: boolean;
};

export type AndroidMvpSettings = {
  librarySort: string;
  minAudioDurationMs: number;
  libraryExcludeNonMusicByName: boolean;
  libraryCustomExcludeKeywords: string;
  restoreQueueOnLaunch: boolean;
  keepAliveEnabled: boolean;
  showBatteryOptimizationHint: boolean;
  audioFocusDuckOnTransient: boolean;
  audioFocusPauseOnLoss: boolean;
  audioFocusResumeAfterGain: boolean;
  bluetoothAutoResumeOnReconnect: boolean;
  bluetoothAutoResumeWindowMs: number;
};

export type AppSettings = {
  themeMode: ThemeMode;
  androidMvp: AndroidMvpSettings;
  cloud: CloudSettings;
  ai: AiSettings;
  download: DownloadSettings;
};

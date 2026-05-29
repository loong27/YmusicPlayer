import type { AudioQuality, CloudProvider } from './Track';

export type ThemeMode = 'system' | 'light' | 'dark';

export type CloudSettings = {
  enabled: boolean;
  baseUrl: string;
  activeProvider: CloudProvider;
  enabledProviders: CloudProvider[];
  searchMode: 'single' | 'multi';
  pageSize: number;
  scrapeOverwriteMetadata: boolean;
  scrapeDownloadLyric: boolean;
};

export type AiSettings = {
  enabled: boolean;
  providerType: 'openai' | 'anthropic';
  baseUrl: string;
  model: string;
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
  restoreQueueOnLaunch: boolean;
};

export type AppSettings = {
  themeMode: ThemeMode;
  androidMvp: AndroidMvpSettings;
  cloud: CloudSettings;
  ai: AiSettings;
  download: DownloadSettings;
};

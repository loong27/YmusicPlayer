import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RepeatMode } from '../models/Player';
import type { Playlist } from '../models/Playlist';
import type { DownloadTask } from '../models/DownloadTask';
import type { AudioQuality, CloudProvider, Track } from '../models/Track';

const schemaVersion = 1;

const keys = {
  meta: '@ymusic/schema',
  player: '@ymusic/player',
  settings: '@ymusic/settings',
  libraryCache: '@ymusic/library-cache',
  playlists: '@ymusic/playlists',
  likedTrackIds: '@ymusic/liked-track-ids',
  playHistory: '@ymusic/play-history',
  downloadTasks: '@ymusic/download-tasks',
  cloudCache: '@ymusic/cloud-cache',
};

export type PersistedPlayerState = {
  queue: Track[];
  currentIndex: number;
  positionMs: number;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
};

export type PersistedSettings = {
  librarySort: string;
  minAudioDurationMs: number;
  libraryExcludeNonMusicByName: boolean;
  libraryCustomExcludeKeywords: string;
  restoreQueueOnLaunch: boolean;
  cloudEnabled: boolean;
  cloudBaseUrl: string;
  cloudApiKey: string;
  cloudAuthHeader: string;
  cloudAuthScheme: string;
  cloudActiveProvider: CloudProvider;
  cloudSearchMode: 'single' | 'multi';
  cloudPageSize: number;
  cloudDefaultQuality: AudioQuality;
  cloudTimeoutMs: number;
  aiEnabled: boolean;
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
  aiTemperature: number;
  aiMaxTokens: number;
  aiTimeoutMs: number;
  aiIncludeLyricSnippets: boolean;
  downloadQuality: AudioQuality;
  downloadMaxConcurrentTasks: number;
  downloadAutoImportAfterDownload: boolean;
  downloadAutoDownloadLyric: boolean;
  downloadAutoQualityFallback: boolean;
  androidKeepAliveEnabled: boolean;
  androidShowBatteryOptimizationHint: boolean;
  audioFocusDuckOnTransient: boolean;
  audioFocusPauseOnLoss: boolean;
  audioFocusResumeAfterGain: boolean;
  bluetoothAutoResumeOnReconnect: boolean;
  bluetoothAutoResumeWindowMs: number;
};

export type LibraryCache = {
  scannedAt?: number;
  minDurationMs: number;
  tracks: Track[];
};

export type AppStorageSnapshot = {
  schemaVersion: number;
  player?: PersistedPlayerState;
  settings: PersistedSettings;
  libraryCache?: LibraryCache;
  playlists: Playlist[];
  likedTrackIds: string[];
  playHistory: PlayHistoryItem[];
  downloadTasks: DownloadTask[];
  cloudCache: Record<string, unknown>;
};

export type PlayHistoryItem = {
  trackId: string;
  playedAt: string;
  durationPlayedMs: number;
  completedRatio: number;
  source?: string;
};

export const defaultSettings: PersistedSettings = {
  librarySort: 'dateModified',
  minAudioDurationMs: 30_000,
  libraryExcludeNonMusicByName: true,
  libraryCustomExcludeKeywords: '',
  restoreQueueOnLaunch: true,
  cloudEnabled: false,
  cloudBaseUrl: '',
  cloudApiKey: '',
  cloudAuthHeader: 'Authorization',
  cloudAuthScheme: 'Bearer',
  cloudActiveProvider: 'netease',
  cloudSearchMode: 'single',
  cloudPageSize: 20,
  cloudDefaultQuality: 'MP3_320',
  cloudTimeoutMs: 15_000,
  aiEnabled: false,
  aiBaseUrl: '',
  aiModel: '',
  aiApiKey: '',
  aiTemperature: 0.7,
  aiMaxTokens: 800,
  aiTimeoutMs: 30_000,
  aiIncludeLyricSnippets: false,
  downloadQuality: 'MP3_320',
  downloadMaxConcurrentTasks: 1,
  downloadAutoImportAfterDownload: true,
  downloadAutoDownloadLyric: true,
  downloadAutoQualityFallback: true,
  androidKeepAliveEnabled: true,
  androidShowBatteryOptimizationHint: true,
  audioFocusDuckOnTransient: true,
  audioFocusPauseOnLoss: true,
  audioFocusResumeAfterGain: true,
  bluetoothAutoResumeOnReconnect: true,
  bluetoothAutoResumeWindowMs: 300_000,
};

const audioQualities: AudioQuality[] = ['MP3_128', 'MP3_320', 'FLAC', 'ATMOS', 'ATMOS2'];
const cloudProviders: CloudProvider[] = ['qqmusic', 'netease', 'kugou'];
const searchModes: PersistedSettings['cloudSearchMode'][] = ['single', 'multi'];

async function readJson<T>(key: string): Promise<T | undefined> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function writeJson<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(Math.max(number, min), max);
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && values.includes(value as T) ? value as T : fallback;
}

export function normalizeSettings(value?: Partial<PersistedSettings> | null): PersistedSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    librarySort: stringValue(source.librarySort, defaultSettings.librarySort),
    minAudioDurationMs: numberValue(source.minAudioDurationMs, defaultSettings.minAudioDurationMs, 5_000, 10 * 60_000),
    libraryExcludeNonMusicByName: booleanValue(source.libraryExcludeNonMusicByName, defaultSettings.libraryExcludeNonMusicByName),
    libraryCustomExcludeKeywords: stringValue(source.libraryCustomExcludeKeywords, defaultSettings.libraryCustomExcludeKeywords).slice(0, 500),
    restoreQueueOnLaunch: booleanValue(source.restoreQueueOnLaunch, defaultSettings.restoreQueueOnLaunch),
    cloudEnabled: booleanValue(source.cloudEnabled, defaultSettings.cloudEnabled),
    cloudBaseUrl: stringValue(source.cloudBaseUrl, defaultSettings.cloudBaseUrl).slice(0, 500),
    cloudApiKey: stringValue(source.cloudApiKey, defaultSettings.cloudApiKey).slice(0, 2_000),
    cloudAuthHeader: stringValue(source.cloudAuthHeader, defaultSettings.cloudAuthHeader).slice(0, 80),
    cloudAuthScheme: stringValue(source.cloudAuthScheme, defaultSettings.cloudAuthScheme).slice(0, 80),
    cloudActiveProvider: enumValue(source.cloudActiveProvider, cloudProviders, defaultSettings.cloudActiveProvider),
    cloudSearchMode: enumValue(source.cloudSearchMode, searchModes, defaultSettings.cloudSearchMode),
    cloudPageSize: Math.round(numberValue(source.cloudPageSize, defaultSettings.cloudPageSize, 1, 50)),
    cloudDefaultQuality: enumValue(source.cloudDefaultQuality, audioQualities, defaultSettings.cloudDefaultQuality),
    cloudTimeoutMs: Math.round(numberValue(source.cloudTimeoutMs, defaultSettings.cloudTimeoutMs, 3_000, 120_000)),
    aiEnabled: booleanValue(source.aiEnabled, defaultSettings.aiEnabled),
    aiBaseUrl: stringValue(source.aiBaseUrl, defaultSettings.aiBaseUrl).slice(0, 500),
    aiModel: stringValue(source.aiModel, defaultSettings.aiModel).slice(0, 200),
    aiApiKey: stringValue(source.aiApiKey, defaultSettings.aiApiKey).slice(0, 2_000),
    aiTemperature: numberValue(source.aiTemperature, defaultSettings.aiTemperature, 0, 2),
    aiMaxTokens: Math.round(numberValue(source.aiMaxTokens, defaultSettings.aiMaxTokens, 64, 8_000)),
    aiTimeoutMs: Math.round(numberValue(source.aiTimeoutMs, defaultSettings.aiTimeoutMs, 3_000, 120_000)),
    aiIncludeLyricSnippets: booleanValue(source.aiIncludeLyricSnippets, defaultSettings.aiIncludeLyricSnippets),
    downloadQuality: enumValue(source.downloadQuality, audioQualities, defaultSettings.downloadQuality),
    downloadMaxConcurrentTasks: Math.round(numberValue(source.downloadMaxConcurrentTasks, defaultSettings.downloadMaxConcurrentTasks, 1, 1)),
    downloadAutoImportAfterDownload: booleanValue(source.downloadAutoImportAfterDownload, defaultSettings.downloadAutoImportAfterDownload),
    downloadAutoDownloadLyric: booleanValue(source.downloadAutoDownloadLyric, defaultSettings.downloadAutoDownloadLyric),
    downloadAutoQualityFallback: booleanValue(source.downloadAutoQualityFallback, defaultSettings.downloadAutoQualityFallback),
    androidKeepAliveEnabled: booleanValue(source.androidKeepAliveEnabled, defaultSettings.androidKeepAliveEnabled),
    androidShowBatteryOptimizationHint: booleanValue(source.androidShowBatteryOptimizationHint, defaultSettings.androidShowBatteryOptimizationHint),
    audioFocusDuckOnTransient: booleanValue(source.audioFocusDuckOnTransient, defaultSettings.audioFocusDuckOnTransient),
    audioFocusPauseOnLoss: booleanValue(source.audioFocusPauseOnLoss, defaultSettings.audioFocusPauseOnLoss),
    audioFocusResumeAfterGain: booleanValue(source.audioFocusResumeAfterGain, defaultSettings.audioFocusResumeAfterGain),
    bluetoothAutoResumeOnReconnect: booleanValue(source.bluetoothAutoResumeOnReconnect, defaultSettings.bluetoothAutoResumeOnReconnect),
    bluetoothAutoResumeWindowMs: Math.round(numberValue(source.bluetoothAutoResumeWindowMs, defaultSettings.bluetoothAutoResumeWindowMs, 60_000, 10 * 60_000)),
  };
}

function migratePlayerState(value?: Partial<PersistedPlayerState>): PersistedPlayerState | undefined {
  if (!value || !Array.isArray(value.queue) || value.queue.length === 0) {
    return undefined;
  }
  const currentIndex = Number.isFinite(value.currentIndex) ? Number(value.currentIndex) : 0;
  return {
    queue: value.queue,
    currentIndex: Math.min(Math.max(currentIndex, 0), value.queue.length - 1),
    positionMs: Math.max(0, Number(value.positionMs) || 0),
    repeatMode: value.repeatMode || 'off',
    shuffleEnabled: Boolean(value.shuffleEnabled),
  };
}

export async function ensureStorageMigrated(): Promise<void> {
  const meta = await readJson<{ schemaVersion?: number }>(keys.meta);
  if (meta?.schemaVersion === schemaVersion) {
    return;
  }

  const settings = normalizeSettings(await readJson<Partial<PersistedSettings>>(keys.settings));
  try {
    await writeJson(keys.settings, settings);
    await writeJson(keys.meta, { schemaVersion });
  } catch {
    // Migration writes are best-effort so corrupt storage does not block app startup.
  }
}

export async function loadPlayerState(): Promise<PersistedPlayerState | undefined> {
  await ensureStorageMigrated();
  return migratePlayerState(await readJson<Partial<PersistedPlayerState>>(keys.player));
}

export async function savePlayerState(state: PersistedPlayerState): Promise<void> {
  await ensureStorageMigrated();
  await writeJson(keys.player, migratePlayerState(state) || state);
}

export async function clearPlayerState(): Promise<void> {
  await ensureStorageMigrated();
  await AsyncStorage.removeItem(keys.player);
}

export async function loadSettings(): Promise<PersistedSettings> {
  await ensureStorageMigrated();
  return normalizeSettings(await readJson<Partial<PersistedSettings>>(keys.settings));
}

export async function saveSettings(settings: PersistedSettings): Promise<void> {
  await ensureStorageMigrated();
  await writeJson(keys.settings, normalizeSettings(settings));
}

export async function loadLibraryCache(): Promise<LibraryCache | undefined> {
  await ensureStorageMigrated();
  const cache = await readJson<Partial<LibraryCache>>(keys.libraryCache);
  if (!cache || !Array.isArray(cache.tracks)) {
    return undefined;
  }
  return {
    scannedAt: cache.scannedAt,
    minDurationMs: cache.minDurationMs || defaultSettings.minAudioDurationMs,
    tracks: cache.tracks,
  };
}

export async function saveLibraryCache(cache: LibraryCache): Promise<void> {
  await ensureStorageMigrated();
  await writeJson(keys.libraryCache, cache);
}

export async function loadPlaylists(): Promise<Playlist[]> {
  await ensureStorageMigrated();
  return (await readJson<Playlist[]>(keys.playlists)) || [];
}

export async function savePlaylists(playlists: Playlist[]): Promise<void> {
  await ensureStorageMigrated();
  await writeJson(keys.playlists, playlists);
}

export async function loadLikedTrackIds(): Promise<string[]> {
  await ensureStorageMigrated();
  return (await readJson<string[]>(keys.likedTrackIds)) || [];
}

export async function saveLikedTrackIds(trackIds: string[]): Promise<void> {
  await ensureStorageMigrated();
  await writeJson(keys.likedTrackIds, [...new Set(trackIds)]);
}

export async function loadPlayHistory(): Promise<PlayHistoryItem[]> {
  await ensureStorageMigrated();
  return (await readJson<PlayHistoryItem[]>(keys.playHistory)) || [];
}

export async function savePlayHistory(history: PlayHistoryItem[]): Promise<void> {
  await ensureStorageMigrated();
  await writeJson(keys.playHistory, history.slice(0, 500));
}

export async function loadDownloadTasks(): Promise<DownloadTask[]> {
  await ensureStorageMigrated();
  return (await readJson<DownloadTask[]>(keys.downloadTasks)) || [];
}

export async function saveDownloadTasks(tasks: DownloadTask[]): Promise<void> {
  await ensureStorageMigrated();
  await writeJson(keys.downloadTasks, tasks);
}

export async function loadStorageSnapshot(): Promise<AppStorageSnapshot> {
  await ensureStorageMigrated();
  const [player, settings, libraryCache, playlists, likedTrackIds, playHistory, downloadTasks, cloudCache] = await Promise.all([
    loadPlayerState(),
    loadSettings(),
    loadLibraryCache(),
    readJson<Playlist[]>(keys.playlists),
    readJson<string[]>(keys.likedTrackIds),
    readJson<PlayHistoryItem[]>(keys.playHistory),
    readJson<DownloadTask[]>(keys.downloadTasks),
    readJson<Record<string, unknown>>(keys.cloudCache),
  ]);
  return {
    schemaVersion,
    player,
    settings,
    libraryCache,
    playlists: Array.isArray(playlists) ? playlists : [],
    likedTrackIds: Array.isArray(likedTrackIds) ? likedTrackIds : [],
    playHistory: Array.isArray(playHistory) ? playHistory : [],
    downloadTasks: Array.isArray(downloadTasks) ? downloadTasks : [],
    cloudCache: cloudCache || {},
  };
}

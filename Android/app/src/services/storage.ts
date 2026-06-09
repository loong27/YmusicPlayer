import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RepeatMode } from '../models/Player';
import type { Playlist } from '../models/Playlist';
import type { DownloadTask } from '../models/DownloadTask';
import type { Track } from '../models/Track';

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
  restoreQueueOnLaunch: boolean;
  cloudEnabled: boolean;
  cloudBaseUrl: string;
  aiEnabled: boolean;
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
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
  restoreQueueOnLaunch: true,
  cloudEnabled: false,
  cloudBaseUrl: '',
  aiEnabled: false,
  aiBaseUrl: '',
  aiModel: '',
  aiApiKey: '',
};

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

function migrateSettings(value?: Partial<PersistedSettings>): PersistedSettings {
  return {
    ...defaultSettings,
    ...(value || {}),
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

  const settings = migrateSettings(await readJson<Partial<PersistedSettings>>(keys.settings));
  await writeJson(keys.settings, settings);
  await writeJson(keys.meta, { schemaVersion });
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
  return migrateSettings(await readJson<Partial<PersistedSettings>>(keys.settings));
}

export async function saveSettings(settings: PersistedSettings): Promise<void> {
  await ensureStorageMigrated();
  await writeJson(keys.settings, migrateSettings(settings));
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

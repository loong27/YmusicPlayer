import type { Track, CloudProvider, AudioQuality } from '../models/Track';
import type { PersistedSettings } from './storage';

export type CloudSearchOptions = {
  provider?: CloudProvider;
  quality?: AudioQuality;
};

export type CloudMusicProvider = {
  id: CloudProvider;
  searchTracks: (query: string, options?: CloudSearchOptions) => Promise<Track[]>;
  getPlayableUrl: (remoteId: string, quality?: AudioQuality) => Promise<string>;
  getLyrics: (remoteId: string) => Promise<string | undefined>;
};

type CloudSearchResponse = {
  tracks?: Array<Partial<Track> & { remoteId?: string; provider?: CloudProvider; streamUri?: string }>;
};

export async function searchCloudTracks(query: string, settings: PersistedSettings, options?: CloudSearchOptions): Promise<Track[]> {
  const trimmed = query.trim();
  if (!trimmed || !settings.cloudEnabled || !settings.cloudBaseUrl.trim()) {
    return [];
  }

  const endpoint = new URL('/search', settings.cloudBaseUrl.trim());
  endpoint.searchParams.set('q', trimmed);
  if (options?.provider) {
    endpoint.searchParams.set('provider', options.provider);
  }
  if (options?.quality) {
    endpoint.searchParams.set('quality', options.quality);
  }

  const response = await fetch(endpoint.toString());
  if (!response.ok) {
    throw new Error(`云搜索失败：${response.status}`);
  }
  const payload = await response.json() as CloudSearchResponse;
  return (payload.tracks || []).map((track, index) => {
    const provider = track.provider || options?.provider || 'netease';
    const remoteId = track.remoteId || track.id || `${provider}-${index}`;
    return {
      id: `remote-${provider}-${remoteId}`,
      source: 'remote',
      title: track.title || '未知歌曲',
      artist: track.artist || '未知艺术家',
      album: track.album,
      durationSeconds: track.durationSeconds,
      artworkUri: track.artworkUri,
      streamUri: track.streamUri,
      cloudMatch: {
        provider,
        remoteId,
        matchedAt: new Date().toISOString(),
      },
    };
  });
}

export async function resolvePlayableUrl(track: Track, settings: PersistedSettings, quality: AudioQuality = 'MP3_320'): Promise<string | undefined> {
  if (track.streamUri) {
    return track.streamUri;
  }
  if (!track.cloudMatch || !settings.cloudEnabled || !settings.cloudBaseUrl.trim()) {
    return undefined;
  }
  const endpoint = new URL(`/tracks/${encodeURIComponent(track.cloudMatch.remoteId)}/url`, settings.cloudBaseUrl.trim());
  endpoint.searchParams.set('provider', track.cloudMatch.provider);
  endpoint.searchParams.set('quality', quality);
  const response = await fetch(endpoint.toString());
  if (!response.ok) {
    throw new Error(`播放地址解析失败：${response.status}`);
  }
  const payload = await response.json() as { url?: string };
  return payload.url;
}

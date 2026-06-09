import type { Track, CloudProvider, AudioQuality } from '../models/Track';
import type { PersistedSettings } from './storage';

export type CloudSearchOptions = {
  provider?: CloudProvider;
  quality?: AudioQuality;
  pageSize?: number;
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

export function buildCloudHeaders(settings: PersistedSettings): Record<string, string> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const apiKey = settings.cloudApiKey.trim();
  const headerName = settings.cloudAuthHeader.trim() || 'Authorization';
  const scheme = settings.cloudAuthScheme.trim();
  if (apiKey && headerName) {
    headers[headerName] = scheme ? `${scheme} ${apiKey}` : apiKey;
  }
  return headers;
}

export async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络或增大超时时间');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function assertCloudConfigured(settings: PersistedSettings) {
  if (!settings.cloudEnabled) {
    throw new Error('云搜索未启用');
  }
  if (!settings.cloudBaseUrl.trim()) {
    throw new Error('请先配置云搜索 Base URL');
  }
}

function createEndpoint(path: string, settings: PersistedSettings): URL {
  try {
    return new URL(path, settings.cloudBaseUrl.trim());
  } catch {
    throw new Error('云搜索 Base URL 格式不正确');
  }
}

function statusError(status: number, fallback: string): Error {
  if (status === 401 || status === 403) {
    return new Error('鉴权失败，请检查密钥/Header');
  }
  if (status === 404) {
    return new Error('接口路径不匹配，请检查云服务地址');
  }
  return new Error(`${fallback}：${status}`);
}

export async function searchCloudTracks(query: string, settings: PersistedSettings, options?: CloudSearchOptions): Promise<Track[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  assertCloudConfigured(settings);

  const provider = options?.provider || settings.cloudActiveProvider;
  const quality = options?.quality || settings.cloudDefaultQuality;
  const pageSize = options?.pageSize || settings.cloudPageSize;
  const endpoint = createEndpoint('/search', settings);
  endpoint.searchParams.set('q', trimmed);
  endpoint.searchParams.set('provider', provider);
  endpoint.searchParams.set('quality', quality);
  endpoint.searchParams.set('limit', String(pageSize));
  endpoint.searchParams.set('pageSize', String(pageSize));
  endpoint.searchParams.set('mode', settings.cloudSearchMode);

  const response = await fetchWithTimeout(endpoint.toString(), { headers: buildCloudHeaders(settings) }, settings.cloudTimeoutMs);
  if (!response.ok) {
    throw statusError(response.status, '云搜索失败');
  }
  const payload = await response.json() as CloudSearchResponse;
  return (payload.tracks || []).map((track, index) => {
    const trackProvider = track.provider || provider;
    const remoteId = track.remoteId || track.id || `${trackProvider}-${index}`;
    return {
      id: `remote-${trackProvider}-${remoteId}`,
      source: 'remote',
      title: track.title || '未知歌曲',
      artist: track.artist || '未知艺术家',
      album: track.album,
      durationSeconds: track.durationSeconds,
      artworkUri: track.artworkUri,
      streamUri: track.streamUri,
      cloudMatch: {
        provider: trackProvider,
        remoteId,
        matchedAt: new Date().toISOString(),
      },
    };
  });
}

export async function resolvePlayableUrl(track: Track, settings: PersistedSettings, quality: AudioQuality = settings.cloudDefaultQuality): Promise<string | undefined> {
  if (track.streamUri) {
    return track.streamUri;
  }
  if (track.source === 'local') {
    return track.localUri;
  }
  assertCloudConfigured(settings);
  if (!track.cloudMatch) {
    return undefined;
  }
  const endpoint = createEndpoint(`/tracks/${encodeURIComponent(track.cloudMatch.remoteId)}/url`, settings);
  endpoint.searchParams.set('provider', track.cloudMatch.provider);
  endpoint.searchParams.set('quality', quality);
  const response = await fetchWithTimeout(endpoint.toString(), { headers: buildCloudHeaders(settings) }, settings.cloudTimeoutMs);
  if (!response.ok) {
    throw statusError(response.status, '播放地址解析失败');
  }
  const payload = await response.json() as { url?: string };
  return payload.url;
}

export async function ensurePlayableTrack(track: Track, settings: PersistedSettings, quality: AudioQuality = settings.cloudDefaultQuality): Promise<Track> {
  if (track.source === 'local' || track.streamUri) {
    return track;
  }
  const streamUri = await resolvePlayableUrl(track, settings, quality);
  if (!streamUri) {
    throw new Error('未获取到可播放地址，请检查云服务配置');
  }
  return { ...track, streamUri };
}

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
  items?: unknown[];
  list?: unknown[];
  songs?: unknown[];
  records?: unknown[];
  rows?: unknown[];
  data?: unknown;
  result?: unknown;
  code?: string | number;
  message?: string;
};

const providerOptions: CloudProvider[] = ['qqmusic', 'netease', 'kugou'];

function safeProvider(provider?: string): CloudProvider {
  return providerOptions.includes(provider as CloudProvider) ? provider as CloudProvider : 'qqmusic';
}

function normalizeApiKey(apiKey: string): string {
  const text = apiKey.trim().replace(/^Bearer\s+/i, '').trim();
  const cookie = text.match(/(?:^|;\s*)sid=([^;]+)/i);
  if (cookie?.[1]) {
    return cookie[1].trim();
  }
  return text.replace(/^sid=/i, '').trim();
}

function isValidHeaderName(value: string): boolean {
  return /^[A-Za-z0-9!#$%&'*+./=?^_`{|}~-]+$/.test(value);
}

export function buildCloudHeaders(settings: PersistedSettings): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const normalized = normalizeApiKey(settings.cloudApiKey);
  if (!normalized) {
    return headers;
  }

  headers.Authorization = `Bearer ${normalized}`;
  headers['X-API-Key'] = normalized;
  headers.Cookie = `sid=${normalized}`;

  const customHeader = settings.cloudAuthHeader.trim();
  if (isValidHeaderName(customHeader) && customHeader && customHeader !== 'Authorization' && customHeader !== 'X-API-Key' && customHeader !== 'Cookie') {
    const scheme = settings.cloudAuthScheme.trim();
    headers[customHeader] = scheme ? `${scheme} ${normalized}` : normalized;
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
    const base = new URL(settings.cloudBaseUrl.trim());
    if (!['http:', 'https:'].includes(base.protocol)) {
      throw new Error('invalid protocol');
    }
    const basePath = base.hostname === 'gateway.karpov.cn' && /^\/?$/.test(base.pathname) ? '/api/docs-proxy' : base.pathname;
    const prefix = basePath.replace(/\/+$/, '');
    const rawPath = path.replace(/^\/+/, '');
    const pathPart = prefix.endsWith('/v1') && rawPath.startsWith('v1/') ? rawPath.slice(3) : rawPath;
    return new URL(`${base.protocol}//${base.host}${prefix}/${pathPart}`);
  } catch {
    throw new Error('云搜索 Base URL 格式不正确');
  }
}

function statusError(status: number, fallback: string, message?: string): Error {
  if (status === 401 || status === 403) {
    return new Error(message || '鉴权失败，请检查 API Key 是否和 PC 端一致');
  }
  if (status === 404) {
    return new Error(message || '接口路径不匹配，请检查云服务地址');
  }
  return new Error(`${message || fallback}：${status}`);
}

function firstValue(...values: unknown[]): string {
  for (const value of values) {
    if (value != null && `${value}`.trim() !== '') {
      return `${value}`.trim();
    }
  }
  return '';
}

function isSuccessCode(code: unknown): boolean {
  if (code == null) {
    return true;
  }
  const text = `${code}`.trim().toLowerCase();
  return text === '0' || text === '200' || text === 'ok' || text === 'success';
}

function unwrapResponseData(body: unknown): unknown {
  if (!body || typeof body !== 'object') {
    return body;
  }
  const record = body as Record<string, unknown>;
  if ('data' in record) {
    return record.data;
  }
  if ('result' in record) {
    return record.result;
  }
  return body;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function extractSongItems(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (!data || typeof data !== 'object') {
    return [];
  }
  const record = data as Record<string, unknown>;
  return [
    record.tracks,
    record.items,
    record.list,
    record.songs,
    record.records,
    record.rows,
    (record.result as Record<string, unknown> | undefined)?.items,
    (record.result as Record<string, unknown> | undefined)?.list,
    (record.result as Record<string, unknown> | undefined)?.songs,
    (record.data as Record<string, unknown> | undefined)?.items,
    (record.data as Record<string, unknown> | undefined)?.list,
    (record.data as Record<string, unknown> | undefined)?.songs,
  ].map(arrayValue).find(items => items.length > 0) || [];
}

function normalizeDurationSeconds(song: Record<string, unknown>): number | undefined {
  const raw = Number(firstValue(song.duration, song.durationSeconds, song.duration_seconds, song.interval, song.time, song.dt, 0));
  if (!Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return Math.round(raw > 1000 ? raw / 1000 : raw);
}

function normalizeArtists(song: Record<string, unknown>): string {
  const candidates = [song.artists, song.singer, song.singers, song.ar];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    const names = candidate.map(item => {
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return firstValue(record.name, record.title);
      }
      return firstValue(item);
    }).filter(Boolean);
    if (names.length > 0) {
      return names.join(' / ');
    }
  }
  return firstValue(song.artist, song.artistName, song.singerName, song.singername, '未知艺术家');
}

function normalizeCloudTrack(song: unknown, fallbackProvider: CloudProvider, index: number): Track | undefined {
  if (!song || typeof song !== 'object') {
    return undefined;
  }
  const record = song as Record<string, unknown>;
  const provider = safeProvider(firstValue(record.provider, fallbackProvider));
  const remoteId = firstValue(record.remoteId, record.id, record.songId, record.songid, record.mid, record.songMid, record.songmid, record.hash, record.rid);
  if (!remoteId) {
    return undefined;
  }
  const albumRecord = record.album && typeof record.album === 'object' && !Array.isArray(record.album) ? record.album as Record<string, unknown> : {};
  return {
    id: `remote-${provider}-${remoteId || index}`,
    source: 'remote',
    title: firstValue(record.title, record.name, record.songName, record.songname, '未知歌曲'),
    artist: normalizeArtists(record),
    album: firstValue(albumRecord.name, albumRecord.title, typeof record.album === 'string' ? record.album : '', record.albumName, record.albumname, '未知专辑'),
    durationSeconds: normalizeDurationSeconds(record),
    artworkUri: firstValue(albumRecord.picUrl, albumRecord.pic, albumRecord.cover, record.albumPicUrl, record.picUrl, record.cover) || undefined,
    streamUri: firstValue(record.streamUri, record.url, record.playUrl, record.play_url) || undefined,
    cloudMatch: {
      provider,
      remoteId,
      matchedAt: new Date().toISOString(),
    },
  };
}

async function parseJsonResponse(response: Response): Promise<CloudSearchResponse | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as CloudSearchResponse;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

async function requestJson(endpoint: URL, settings: PersistedSettings, fallback: string): Promise<unknown> {
  const response = await fetchWithTimeout(endpoint.toString(), { method: 'GET', headers: buildCloudHeaders(settings) }, settings.cloudTimeoutMs);
  const body = await parseJsonResponse(response);
  if (!response.ok) {
    throw statusError(response.status, fallback, body?.message);
  }
  if (body && typeof body === 'object' && 'code' in body && !isSuccessCode(body.code)) {
    throw statusError(Number(body.code) || 0, fallback, body.message);
  }
  return unwrapResponseData(body);
}

export async function searchCloudTracks(query: string, settings: PersistedSettings, options?: CloudSearchOptions): Promise<Track[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  assertCloudConfigured(settings);

  const provider = options?.provider || settings.cloudActiveProvider;
  const pageSize = options?.pageSize || settings.cloudPageSize;
  const endpoint = createEndpoint(`/v1/${encodeURIComponent(provider)}/search/songs`, settings);
  endpoint.searchParams.set('q', trimmed);
  endpoint.searchParams.set('page', '1');
  endpoint.searchParams.set('page_size', String(pageSize));

  const data = await requestJson(endpoint, settings, '云搜索失败');
  return extractSongItems(data).map((track, index) => normalizeCloudTrack(track, provider, index)).filter((track): track is Track => Boolean(track));
}

function normalizeHttpUrl(value: unknown): string {
  const text = firstValue(value);
  if (!text) {
    return '';
  }
  if (text.startsWith('//')) {
    return `https:${text}`;
  }
  return /^https?:\/\//i.test(text) ? text : '';
}

function findSongUrl(value: unknown, seen = new Set<unknown>(), depth = 0): string {
  if (value == null || depth > 6) {
    return '';
  }
  if (typeof value === 'string') {
    return normalizeHttpUrl(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findSongUrl(item, seen, depth + 1);
      if (url) {
        return url;
      }
    }
    return '';
  }
  if (typeof value !== 'object' || seen.has(value)) {
    return '';
  }
  seen.add(value);
  const record = value as Record<string, unknown>;
  for (const field of ['url', 'playUrl', 'play_url', 'downloadUrl', 'download_url', 'musicUrl', 'music_url', 'fileUrl', 'file_url', 'src', 'source', 'link', 'location']) {
    const url = findSongUrl(record[field], seen, depth + 1);
    if (url) {
      return url;
    }
  }
  for (const field of ['data', 'result', 'audio', 'songUrl', 'song_url', 'song', 'file', 'info', 'urlInfo', 'url_info', 'midurlinfo']) {
    const url = findSongUrl(record[field], seen, depth + 1);
    if (url) {
      return url;
    }
  }
  for (const [key, nested] of Object.entries(record)) {
    const lower = key.toLowerCase();
    if (!lower.includes('url') && !lower.includes('link')) {
      continue;
    }
    const url = findSongUrl(nested, seen, depth + 1);
    if (url) {
      return url;
    }
  }
  return '';
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
  const endpoint = createEndpoint(`/v1/${encodeURIComponent(track.cloudMatch.provider)}/songs/${encodeURIComponent(track.cloudMatch.remoteId)}/url`, settings);
  endpoint.searchParams.set('quality', quality);
  const data = await requestJson(endpoint, settings, '播放地址解析失败');
  return findSongUrl(data) || undefined;
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

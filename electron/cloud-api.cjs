const { normalizeCloudSong, safeProvider } = require('./cloud-track.cjs');

class CloudApiError extends Error {
  constructor(message, options = {}) {
    super(message || '云音乐请求失败');
    this.name = 'CloudApiError';
    this.status = options.status || 0;
    this.code = options.code || options.status || 'CLOUD_API_ERROR';
    this.provider = options.provider || '';
    this.retryAfter = options.retryAfter || '';
    this.data = options.data;
  }
}

function serializeCloudError(error) {
  if (error instanceof CloudApiError) {
    return {
      code: error.code,
      status: error.status,
      message: error.message,
      provider: error.provider,
      retryAfter: error.retryAfter || ''
    };
  }
  return {
    code: 'UNKNOWN',
    status: 0,
    message: error?.message || String(error || '未知错误')
  };
}

function normalizeApiKey(apiKey) {
  const text = `${apiKey || ''}`.trim().replace(/^Bearer\s+/i, '').trim();
  const cookie = text.match(/(?:^|;\s*)sid=([^;]+)/i);
  if (cookie?.[1]) return cookie[1].trim();
  return text.replace(/^sid=/i, '').trim();
}

function authHeaders(apiKey, extra = {}) {
  const normalized = normalizeApiKey(apiKey);
  return {
    ...extra,
    Authorization: `Bearer ${normalized}`,
    'X-API-Key': normalized,
    Cookie: `sid=${normalized}`
  };
}

function isRedirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(Number(status));
}

function buildUrl(baseUrl, apiPath, query = {}) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch (_) {
    throw new CloudApiError('API Base URL 无效，请在设置中填写完整 http(s) 地址', { code: 'INVALID_BASE_URL' });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new CloudApiError('API Base URL 仅支持 http/https', { code: 'INVALID_BASE_URL' });
  }
  if (url.hostname === 'gateway.karpov.cn' && /^\/?$/.test(url.pathname)) {
    url.pathname = '/api/docs-proxy';
  }
  const prefix = url.pathname.replace(/\/+$/, '');
  const rawPath = `${apiPath || ''}`.replace(/^\/+/, '');
  const pathPart = prefix.endsWith('/v1') && rawPath.startsWith('v1/') ? rawPath.slice(3) : rawPath;
  url.pathname = `${prefix}/${pathPart}`;
  url.search = '';
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null || value === '') continue;
    url.searchParams.set(key, `${value}`);
  }
  return url.toString();
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return { message: text };
  }
}

function isSuccessCode(code) {
  if (code == null) return true;
  const text = `${code}`.trim().toLowerCase();
  return text === '0' || text === '200' || text === 'ok' || text === 'success';
}

function unwrapResponseData(body) {
  if (!body || typeof body !== 'object') return body;
  if ('data' in body) return body.data;
  if ('result' in body) return body.result;
  return body;
}

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function extractSongItems(data) {
  if (Array.isArray(data)) return data;
  return firstArray(
    data?.items,
    data?.list,
    data?.songs,
    data?.records,
    data?.rows,
    data?.result?.items,
    data?.result?.list,
    data?.result?.songs,
    data?.result?.records,
    data?.data?.items,
    data?.data?.list,
    data?.data?.songs,
    data?.data?.records
  );
}

function extractTotal(data, fallback) {
  const total = data?.total ?? data?.count ?? data?.totalCount ?? data?.result?.total ?? data?.data?.total;
  const n = Number(total);
  return Number.isFinite(n) ? n : fallback;
}

function firstValue(...values) {
  for (const value of values) {
    if (value != null && `${value}`.trim() !== '') return value;
  }
  return '';
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeHttpUrl(value) {
  const text = `${value || ''}`.trim();
  if (!text) return '';
  if (text.startsWith('//')) return `https:${text}`;
  if (/^https?:\/\//i.test(text)) return text;
  return '';
}

function arrayValue(value) {
  return Array.isArray(value) ? value : (value == null ? [] : [value]);
}

function buildPurlUrl(item) {
  if (!item || typeof item !== 'object') return '';
  const purl = firstValue(
    item.purl,
    item.pUrl,
    item.playUrl,
    item.fileUrl,
    item.midurlinfo?.[0]?.purl,
    item.url_mid?.purl,
    item.urlInfo?.purl,
    item.url_info?.purl
  );
  const direct = normalizeHttpUrl(purl);
  if (direct) return direct;
  if (!purl) return '';
  const hosts = [
    ...arrayValue(item.sip),
    ...arrayValue(item.domain),
    ...arrayValue(item.host),
    ...arrayValue(item.baseUrl),
    ...arrayValue(item.base_url),
    ...arrayValue(item.server),
    ...arrayValue(item.servers)
  ];
  for (const host of hosts) {
    const base = normalizeHttpUrl(host);
    if (!base) continue;
    try {
      return new URL(purl, base.endsWith('/') ? base : `${base}/`).toString();
    } catch (_) {
      // try next host
    }
  }
  return '';
}

function pickFromQualityMap(map, quality, seen, depth) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return '';
  const preferredKeys = [quality, `${quality || ''}`.toLowerCase(), `${quality || ''}`.toUpperCase()].filter(Boolean);
  for (const key of preferredKeys) {
    const url = findSongUrl(map[key], quality, seen, depth + 1);
    if (url) return url;
  }
  for (const value of Object.values(map)) {
    const url = findSongUrl(value, quality, seen, depth + 1);
    if (url) return url;
  }
  return '';
}

function findSongUrl(value, quality, seen = new Set(), depth = 0) {
  if (value == null || depth > 6) return '';
  if (typeof value === 'string') return normalizeHttpUrl(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findSongUrl(item, quality, seen, depth + 1);
      if (url) return url;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  if (seen.has(value)) return '';
  seen.add(value);

  const directFields = [
    'url',
    'playUrl',
    'play_url',
    'downloadUrl',
    'download_url',
    'musicUrl',
    'music_url',
    'fileUrl',
    'file_url',
    'src',
    'source',
    'link',
    'location'
  ];
  for (const field of directFields) {
    const url = findSongUrl(value[field], quality, seen, depth + 1);
    if (url) return url;
  }

  for (const field of ['urls', 'urlMap', 'url_map', 'qualityUrls', 'quality_urls', 'downloadUrls', 'download_urls']) {
    const url = pickFromQualityMap(value[field], quality, seen, depth + 1);
    if (url) return url;
  }

  const purl = buildPurlUrl(value);
  if (purl) return purl;

  for (const field of ['data', 'result', 'audio', 'songUrl', 'song_url', 'song', 'file', 'info', 'urlInfo', 'url_info', 'midurlinfo']) {
    const url = findSongUrl(value[field], quality, seen, depth + 1);
    if (url) return url;
  }

  for (const [key, nested] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (!lower.includes('url') && !lower.includes('purl') && !lower.includes('link')) continue;
    const url = findSongUrl(nested, quality, seen, depth + 1);
    if (url) return url;
  }
  return '';
}

function normalizeSongUrl(data, { provider, songId, quality } = {}) {
  const source = data?.audio || data?.songUrl || data?.song_url || data?.urlInfo || data?.url_info || (Array.isArray(data) ? (data.find((item) => findSongUrl(item, quality)) || data[0] || {}) : (data || {}));
  const url = findSongUrl(data, quality);
  if (!url) {
    throw new CloudApiError('未获取到歌曲下载直链', {
      code: 'MISSING_SONG_URL',
      provider,
      data
    });
  }
  const base = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const format = firstValue(base.format, base.type, base.ext, base.fileType, base.file_type, base.mediaType, base.media_type);
  const expiresAt = firstValue(base.expiresAt, base.expires_at, base.expireAt, base.expire_at, base.expireTime, base.expire_time, null);
  const expiresInSeconds = asNumber(firstValue(base.expiresInSeconds, base.expires_in_seconds, base.expires, base.ttl), 0);
  return {
    ...base,
    id: `${firstValue(base.id, base.songId, base.songid, data?.song?.id, songId)}`,
    url,
    format,
    bitrate: asNumber(firstValue(base.bitrate, base.bitRate, base.br, base.quality), 0),
    size: asNumber(firstValue(base.size, base.sizeBytes, base.size_bytes, base.fileSize, base.filesize, base.file_size, base.length), 0),
    expiresAt: expiresAt || (expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000).toISOString() : null)
  };
}

class CloudApiClient {
  constructor({ getConfig, fetchImpl } = {}) {
    this.getConfig = getConfig || (async () => ({}));
    this.fetchImpl = fetchImpl || fetch;
  }

  async resolveConfig(options = {}) {
    const cfg = {
      ...((await this.getConfig()) || {}),
      ...(options.config || {})
    };
    if (!options.allowDisabled && cfg.enabled === false) {
      throw new CloudApiError('云音乐功能未启用', { code: 'CLOUD_DISABLED' });
    }
    if (!cfg.baseUrl) {
      throw new CloudApiError('未配置 API Base URL', { code: 'MISSING_BASE_URL' });
    }
    if (!normalizeApiKey(cfg.apiKey)) {
      throw new CloudApiError('未配置 API Key', { code: 'MISSING_API_KEY' });
    }
    cfg.apiKey = normalizeApiKey(cfg.apiKey);
    return cfg;
  }

  async fetchWithAuth(url, { apiKey, accept = 'application/json', provider = '' } = {}) {
    let currentUrl = url;
    for (let i = 0; i < 5; i += 1) {
      const response = await this.fetchImpl(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: authHeaders(apiKey, { Accept: accept })
      });
      if (!isRedirectStatus(response.status)) return response;
      const location = response.headers.get('location');
      if (!location) return response;
      const from = new URL(currentUrl);
      const to = new URL(location, currentUrl);
      if (!['http:', 'https:'].includes(to.protocol)) return response;
      if (to.hostname !== from.hostname) {
        throw new CloudApiError('API 请求被重定向到不同域名，请在设置中填写最终网关地址', {
          code: 'CROSS_HOST_REDIRECT',
          status: response.status,
          provider
        });
      }
      currentUrl = to.toString();
    }
    throw new CloudApiError('API 请求重定向次数过多，请检查 Base URL', { code: 'TOO_MANY_REDIRECTS', provider });
  }

  async request(apiPath, { provider, query, config, allowDisabled = false, raw = false } = {}) {
    const cfg = await this.resolveConfig({ config, allowDisabled });
    const url = buildUrl(cfg.baseUrl, apiPath, query);
    let response;
    try {
      response = await this.fetchWithAuth(url, {
        apiKey: cfg.apiKey,
        accept: raw ? '*/*' : 'application/json',
        provider
      });
    } catch (error) {
      throw new CloudApiError('网络连接失败，请检查网关地址', {
        code: 'NETWORK_ERROR',
        provider,
        data: error?.message || String(error)
      });
    }

    if (raw) return response;

    const body = await parseJsonResponse(response);
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after') || '';
      throw new CloudApiError(body?.message || `云音乐请求失败 (${response.status})`, {
        status: response.status,
        code: body?.code || response.status,
        provider,
        retryAfter,
        data: body?.data
      });
    }
    if (body && typeof body === 'object' && 'code' in body && !isSuccessCode(body.code)) {
      throw new CloudApiError(body.message || '云音乐接口返回错误', {
        status: Number(body.code) || 0,
        code: body.code,
        provider,
        data: body.data
      });
    }
    return unwrapResponseData(body);
  }

  async testConnection(config) {
    const cfg = await this.resolveConfig({ config, allowDisabled: true });
    const url = buildUrl(cfg.baseUrl, '/v1/usage/summary');
    let response;
    const start = Date.now();
    try {
      response = await this.fetchWithAuth(url, {
        apiKey: cfg.apiKey,
        accept: 'application/json'
      });
    } catch (error) {
      throw new CloudApiError('连接失败，请检查 API Base URL', {
        code: 'NETWORK_ERROR',
        data: error?.message || String(error)
      });
    }
    if (!response.ok) {
      const body = await parseJsonResponse(response);
      throw new CloudApiError(body?.message || `连接失败 (${response.status})`, {
        status: response.status,
        code: body?.code || response.status
      });
    }
    return { ok: true, latencyMs: Date.now() - start };
  }

  async searchSongsForProvider(provider, { query, page = 1, pageSize = 20, config } = {}) {
    const safe = safeProvider(provider);
    const data = await this.request(`/v1/${encodeURIComponent(safe)}/search/songs`, {
      provider: safe,
      query: { q: query, page, page_size: pageSize },
      config
    });
    const itemsRaw = extractSongItems(data);
    const items = itemsRaw.map((song) => normalizeCloudSong(song, safe)).filter((song) => song.remoteId);
    return {
      provider: safe,
      items,
      total: extractTotal(data, items.length),
      page: Number(data?.page ?? data?.currentPage ?? data?.result?.page) || page,
      pageSize: Number(data?.pageSize || data?.page_size || data?.perPage || data?.result?.pageSize) || pageSize,
      hasMore: !!(data?.hasMore ?? data?.has_more ?? data?.result?.hasMore)
    };
  }

  async searchSongs(payload = {}) {
    const cfg = await this.resolveConfig({ config: payload.config });
    const query = `${payload.query || payload.q || ''}`.trim();
    if (!query) return { items: [], total: 0, providers: [], errors: [] };
    const page = Math.max(1, Number(payload.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(payload.pageSize || cfg.pageSize) || 20));
    const activeProvider = safeProvider(payload.provider || cfg.activeProvider);
    const configuredProviders = Array.isArray(payload.providers) && payload.providers.length
      ? payload.providers
      : (Array.isArray(cfg.enabledProviders) && cfg.enabledProviders.length ? cfg.enabledProviders : [activeProvider]);
    const providers = (payload.searchMode || cfg.searchMode) === 'multi'
      ? [...new Set(configuredProviders.map(safeProvider))]
      : [activeProvider];

    const settled = await Promise.allSettled(
      providers.map((provider) => this.searchSongsForProvider(provider, { query, page, pageSize, config: cfg }))
    );
    const results = [];
    const errors = [];
    settled.forEach((item, idx) => {
      if (item.status === 'fulfilled') results.push(item.value);
      else errors.push({ provider: providers[idx], error: serializeCloudError(item.reason) });
    });
    if (!results.length && errors.length === 1) {
      const error = settled[0].reason;
      throw error;
    }
    return {
      items: results.flatMap((r) => r.items),
      total: results.reduce((sum, r) => sum + (Number(r.total) || r.items.length), 0),
      page,
      pageSize,
      providers: results,
      errors
    };
  }

  async getSongDetail({ provider, songId, id, config } = {}) {
    const safe = safeProvider(provider);
    const targetId = encodeURIComponent(`${songId || id || ''}`);
    const song = await this.request(`/v1/${encodeURIComponent(safe)}/songs/${targetId}`, { provider: safe, config });
    return {
      song,
      track: normalizeCloudSong(song, safe)
    };
  }

  async getSongUrl({ provider, songId, id, quality, config } = {}) {
    const safe = safeProvider(provider);
    const targetId = encodeURIComponent(`${songId || id || ''}`);
    const data = await this.request(`/v1/${encodeURIComponent(safe)}/songs/${targetId}/url`, {
      provider: safe,
      query: { quality },
      config
    });
    return normalizeSongUrl(data, { provider: safe, songId: songId || id, quality });
  }

  async getSongLyric({ provider, songId, id, config } = {}) {
    const safe = safeProvider(provider);
    const targetId = encodeURIComponent(`${songId || id || ''}`);
    return this.request(`/v1/${encodeURIComponent(safe)}/songs/${targetId}/lyric`, { provider: safe, config });
  }

  async fetchImageDataUrl(imageUrl) {
    let parsed;
    try {
      parsed = new URL(imageUrl);
    } catch (_) {
      return null;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    let response;
    try {
      response = await this.fetchImpl(parsed.toString(), {
        method: 'GET',
        headers: { Accept: 'image/*' }
      });
    } catch (_) {
      return null;
    }
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) return null;
    const len = Number(response.headers.get('content-length')) || 0;
    if (len > 10 * 1024 * 1024) return null;
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > 10 * 1024 * 1024) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  }
}

module.exports = {
  CloudApiClient,
  CloudApiError,
  serializeCloudError
};

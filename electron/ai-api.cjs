'use strict';

class AiApiError extends Error {
  constructor(message, options = {}) {
    super(message || 'AI 推荐请求失败');
    this.name = 'AiApiError';
    this.code = options.code || 'AI_API_ERROR';
    this.status = Number(options.status) || 0;
    this.data = options.data;
  }
}

function sanitizeErrorMessage(message) {
  return `${message || ''}`
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer ***')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/x-api-key\s*[:=]\s*[^\s,;]+/gi, 'x-api-key: ***')
    .trim();
}

function serializeAiError(error) {
  if (error instanceof AiApiError) {
    return {
      code: error.code,
      status: error.status,
      message: sanitizeErrorMessage(error.message) || 'AI 推荐请求失败'
    };
  }
  return {
    code: 'UNKNOWN',
    status: 0,
    message: sanitizeErrorMessage(error?.message || String(error || '未知错误')) || '未知错误'
  };
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function textValue(value, fallback = '') {
  return `${value == null ? fallback : value}`.replace(/\s+/g, ' ').trim();
}

function limitedString(value, maxLen = 600) {
  const text = textValue(value);
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

function safeEvidence(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map((item) => limitedString(item, 160)).filter(Boolean).slice(0, 6);
}

function normalizeProviderType(providerType) {
  const type = `${providerType || 'openai'}`.trim().toLowerCase();
  if (type === 'openai' || type === 'anthropic') return type;
  throw new AiApiError('不支持的 AI API 格式', { code: 'INVALID_PROVIDER_TYPE' });
}

function buildApiUrl(baseUrl, apiPath) {
  let url;
  try {
    url = new URL(`${baseUrl || ''}`.trim());
  } catch (_) {
    throw new AiApiError('AI API Base URL 无效，请填写完整 http(s) 地址', { code: 'INVALID_BASE_URL' });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AiApiError('AI API Base URL 仅支持 http/https', { code: 'INVALID_BASE_URL' });
  }
  const prefix = url.pathname.replace(/\/+$/, '');
  const rawPath = `${apiPath || ''}`.replace(/^\/+/, '');
  const pathPart = prefix.endsWith('/v1') && rawPath.startsWith('v1/') ? rawPath.slice(3) : rawPath;
  url.pathname = `${prefix}/${pathPart}`;
  url.search = '';
  return url.toString();
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return { message: text };
  }
}

function responseMessage(body) {
  return limitedString(
    body?.error?.message ||
    body?.error?.error?.message ||
    body?.message ||
    body?.detail ||
    body?.error ||
    '',
    500
  );
}

function abortMessage(error) {
  if (error?.name === 'AbortError') return true;
  return /abort|timeout/i.test(`${error?.message || ''}`);
}

function firstBalancedJsonObject(text) {
  const source = `${text || ''}`.trim();
  const start = source.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

function parseAiJson(text) {
  const raw = `${text || ''}`.trim();
  if (!raw) throw new AiApiError('模型未返回内容', { code: 'AI_PARSE_ERROR' });
  try {
    return JSON.parse(raw);
  } catch (_) {
    const jsonText = firstBalancedJsonObject(raw);
    if (!jsonText) throw new AiApiError('模型未返回有效 JSON', { code: 'AI_PARSE_ERROR' });
    try {
      return JSON.parse(jsonText);
    } catch (error) {
      throw new AiApiError('模型返回的 JSON 无法解析', { code: 'AI_PARSE_ERROR', data: error?.message });
    }
  }
}

function cleanRemoteQuery(item) {
  const title = limitedString(item?.title, 160);
  const artist = limitedString(item?.artist, 160);
  const album = limitedString(item?.album, 160);
  const searchQuery = limitedString(item?.searchQuery || [artist, title].filter(Boolean).join(' '), 220);
  if (!searchQuery && !title) return null;
  return {
    title,
    artist,
    album,
    confidence: clampNumber(item?.confidence, 0, 1, 0),
    reason: limitedString(item?.reason, 500),
    evidence: safeEvidence(item?.evidence),
    searchQuery: searchQuery || title
  };
}

function normalizeRecommendationResponse(value, limits = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AiApiError('模型返回结构不是 JSON object', { code: 'AI_SCHEMA_ERROR' });
  }
  const maxRemote = clampNumber(limits.maxRemoteRecommendations, 0, 20, 6);
  const seenRemote = new Set();
  const remoteQueries = [];
  for (const item of Array.isArray(value.remoteQueries) ? value.remoteQueries : []) {
    const rec = cleanRemoteQuery(item);
    if (!rec) continue;
    const key = `${rec.artist || ''}|${rec.title || ''}|${rec.searchQuery || ''}`.toLowerCase();
    if (seenRemote.has(key)) continue;
    seenRemote.add(key);
    remoteQueries.push(rec);
    if (remoteQueries.length >= maxRemote) break;
  }
  return {
    summary: limitedString(value.summary, 1200),
    localRecommendations: [],
    remoteQueries,
    warnings: (Array.isArray(value.warnings) ? value.warnings : []).map((item) => limitedString(item, 240)).filter(Boolean).slice(0, 8)
  };
}

const SYSTEM_PROMPT = `You are a professional music recommendation analyst for a local music player.

Your task is to infer the user's likely music taste from the provided evidence and output only cloud-searchable song candidates.

Use these inputs only as preference evidence:
1. meaningful listening history,
2. liked songs and playlist membership,
3. local library metadata for songs the user owns or has heard,
4. scraped cloud metadata and limited lyric snippets when available.

The final recommendations must be songs suitable for cloud music search. Local library presence does not matter: a recommended song may already exist locally or may be new to the user. Do not output local trackId recommendations, local file paths, provider IDs, remote IDs, download URLs, or any cloud identifiers. Those IDs and download links must come only from the app's cloud search resolver.

Each remoteQueries item must include precise title, artist, optional album, searchQuery, reason, evidence, and confidence. Search queries should be specific enough for a cloud music API to find the intended recording.

Be conservative:
- If evidence is weak, lower confidence and explain uncertainty.
- Avoid too many songs by the same artist unless the user's history strongly supports it.
- Avoid songs similar to low-engagement or skipped tracks.
- Use lyric snippets only as weak supporting evidence for language, mood, or theme; do not overfit to a single line.
- Do not invent facts about the user's library or cloud availability.

Return only valid JSON matching the requested schema. No markdown. No commentary outside JSON.`;

function trimPromptArray(items, maxItems) {
  return (Array.isArray(items) ? items : []).slice(0, maxItems);
}

function buildRecommendationUserPrompt(payload = {}, limits = {}) {
  const maxRemote = clampNumber(limits.maxRemoteRecommendations, 0, 20, 6);
  const library = trimPromptArray(payload.libraryProfile || payload.library || [], 180);
  const promptData = {
    preferenceEvidence: {
      localLibrary: library,
      localLibraryNote: 'Songs the user owns or has listened to. Use only as preference evidence, not as local recommendation candidates.',
      userPreferenceSummary: payload.preferenceSummary || payload.listeningSummary || {}
    },
    outputLimits: {
      maxRemoteRecommendations: maxRemote
    },
    outputSchema: {
      summary: 'string',
      remoteQueries: [
        {
          title: 'string: exact song title for cloud search',
          artist: 'string: primary artist name for cloud search',
          album: 'string, optional if unknown',
          confidence: 'number from 0 to 1',
          reason: 'string, concise recommendation reason in the user interface language',
          evidence: ['string: concrete evidence from listening history, liked songs, playlists, metadata, or lyric snippets'],
          searchQuery: 'string: precise cloud music search query, usually artist + title'
        }
      ],
      warnings: ['string']
    }
  };
  return `Analyze the following local music player data as preference evidence and return cloud-searchable song recommendations only. Do not include local file paths, local trackId recommendations, provider IDs, remote IDs, download URLs, or any local recommendation list. If evidence is weak, explain uncertainty in warnings and lower confidence.\n\n${JSON.stringify(promptData, null, 2)}`;
}

class AiApiClient {
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
      throw new AiApiError('AI 推荐功能未启用', { code: 'AI_NOT_CONFIGURED' });
    }
    cfg.providerType = normalizeProviderType(cfg.providerType);
    if (!textValue(cfg.baseUrl) || !textValue(cfg.apiKey) || !textValue(cfg.model)) {
      throw new AiApiError('请先完整配置 AI Base URL、API Key 和模型名称', { code: 'AI_NOT_CONFIGURED' });
    }
    cfg.baseUrl = textValue(cfg.baseUrl);
    cfg.apiKey = `${cfg.apiKey || ''}`.trim();
    cfg.model = textValue(cfg.model);
    cfg.temperature = clampNumber(cfg.temperature, 0, 2, 0.2);
    cfg.maxTokens = Math.round(clampNumber(cfg.maxTokens, 64, 12000, 1800));
    cfg.timeoutMs = Math.round(clampNumber(cfg.timeoutMs, 1000, 120000, 30000));
    buildApiUrl(cfg.baseUrl, cfg.providerType === 'anthropic' ? '/v1/messages' : '/chat/completions');
    return cfg;
  }

  async fetchJson(url, { headers, body, timeoutMs }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      if (abortMessage(error)) {
        throw new AiApiError('AI 请求超时，请检查网络或调大超时时间', { code: 'AI_TIMEOUT' });
      }
      throw new AiApiError('AI 网络连接失败，请检查 Base URL 和网络', { code: 'AI_NETWORK_ERROR' });
    } finally {
      clearTimeout(timer);
    }

    const parsed = await parseResponseBody(response);
    if (!response.ok) {
      throw new AiApiError(responseMessage(parsed) || `AI 请求失败 (${response.status})`, {
        code: 'AI_HTTP_ERROR',
        status: response.status
      });
    }
    return parsed;
  }

  async requestOpenAi(config, { systemPrompt, userPrompt, maxTokens }) {
    const url = buildApiUrl(config.baseUrl, '/chat/completions');
    const body = {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: config.temperature,
      max_tokens: maxTokens || config.maxTokens,
      response_format: { type: 'json_object' }
    };
    const data = await this.fetchJson(url, {
      timeoutMs: config.timeoutMs,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
        Accept: 'application/json'
      },
      body
    });
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new AiApiError('OpenAI-compatible 响应缺少 message.content', { code: 'AI_PARSE_ERROR' });
    }
    return content;
  }

  async requestAnthropic(config, { systemPrompt, userPrompt, maxTokens }) {
    const url = buildApiUrl(config.baseUrl, '/v1/messages');
    const body = {
      model: config.model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: config.temperature,
      max_tokens: maxTokens || config.maxTokens
    };
    const data = await this.fetchJson(url, {
      timeoutMs: config.timeoutMs,
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        Accept: 'application/json'
      },
      body
    });
    const content = Array.isArray(data?.content)
      ? data.content.find((part) => part?.type === 'text')?.text
      : data?.content;
    if (typeof content !== 'string') {
      throw new AiApiError('Anthropic-compatible 响应缺少 text content', { code: 'AI_PARSE_ERROR' });
    }
    return content;
  }

  async requestModel(config, prompt, options = {}) {
    if (config.providerType === 'anthropic') return this.requestAnthropic(config, { ...prompt, maxTokens: options.maxTokens });
    return this.requestOpenAi(config, { ...prompt, maxTokens: options.maxTokens });
  }

  async testConnection(config) {
    const cfg = await this.resolveConfig({ config, allowDisabled: true });
    const start = Date.now();
    const content = await this.requestModel(cfg, {
      systemPrompt: 'Return only valid JSON. No markdown.',
      userPrompt: 'Return exactly {"ok":true} as JSON.'
    }, { maxTokens: 64 });
    const parsed = parseAiJson(content);
    if (!parsed || parsed.ok !== true) {
      throw new AiApiError('模型测试未返回预期 JSON', { code: 'AI_SCHEMA_ERROR' });
    }
    return { ok: true, latencyMs: Date.now() - start, model: cfg.model };
  }

  async recommendSongs(payload = {}) {
    const cfg = await this.resolveConfig({ config: payload.config });
    const limits = {
      maxLocalRecommendations: 0,
      maxRemoteRecommendations: payload.limits?.maxRemoteRecommendations ?? cfg.maxRemoteRecommendations
    };
    const start = Date.now();
    const content = await this.requestModel(cfg, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildRecommendationUserPrompt(payload, limits)
    });
    const parsed = parseAiJson(content);
    return {
      ...normalizeRecommendationResponse(parsed, limits),
      model: cfg.model,
      latencyMs: Date.now() - start
    };
  }
}

module.exports = {
  AiApiClient,
  AiApiError,
  serializeAiError
};

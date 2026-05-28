const { app, BrowserWindow, dialog, ipcMain, Menu, Tray, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { existsSync, mkdirSync, appendFileSync } = require('fs');
const { execFile } = require('child_process');
const mm = require('music-metadata');
const { CloudApiClient, CloudApiError, serializeCloudError } = require('./cloud-api.cjs');
const { AiApiClient, serializeAiError } = require('./ai-api.cjs');
const { createCloudDownloadManager, getDefaultDownloadDirectory } = require('./download-manager.cjs');
const { safeProvider } = require('./cloud-track.cjs');

const AUDIO_EXT = new Set(['.mp3', '.flac', '.wma', '.wav', '.m4a', '.aac', '.ogg']);
const LYRIC_EXT = new Set(['.lrc', '.txt']);

let mainWindow;
let lyricWindow;
let lyricFinderWindow;
let appTray = null;
let isQuitting = false;
let isHandlingClose = false;
let lyricWindowOptions = {
  locked: false,
  clickThrough: false
};
let mainLogFile = '';
const coverDataUrlCache = new Map();
let lyricDownloadTarget = null;
const hookedSessions = new WeakSet();
let cloudApiClient = null;
let aiApiClient = null;
let cloudDownloadManager = null;

const DEFAULT_CLOUD_SETTINGS = {
  enabled: false,
  baseUrl: '',
  apiKey: '',
  activeProvider: 'qqmusic',
  enabledProviders: ['qqmusic'],
  searchMode: 'single',
  pageSize: 20,
  scrapeOverwriteMetadata: true,
  scrapeDownloadLyric: true
};

const DEFAULT_AI_SETTINGS = {
  enabled: false,
  providerType: 'openai',
  baseUrl: '',
  apiKey: '',
  model: '',
  temperature: 0.2,
  maxTokens: 1800,
  timeoutMs: 30000,
  includeLyricSnippets: true,
  resolveCloudResults: true,
  maxLocalRecommendations: 12,
  maxRemoteRecommendations: 6
};

const DEFAULT_DOWNLOAD_SETTINGS = {
  directory: '',
  quality: 'MP3_320',
  maxConcurrentTasks: 2,
  enableSegmentedDownload: true,
  segmentCount: 4,
  autoImportAfterDownload: true,
  autoDownloadLyric: true,
  autoQualityFallback: true
};

function resolveAppIconPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(__dirname, '..', 'public', 'icon.png'),
    path.join(__dirname, '..', 'icon.png')
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || candidates[candidates.length - 1];
}

function logMain(level, message, extra) {
  const ts = new Date().toISOString();
  const detail = extra ? ` ${JSON.stringify(extra)}` : '';
  const line = `[${ts}] [${level}] ${message}${detail}`;
  console.log(line);
  if (!mainLogFile) return;
  try {
    appendFileSync(mainLogFile, `${line}\n`, 'utf8');
  } catch (_) {
    // ignore file logging errors
  }
}

function initMainLogger() {
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    mkdirSync(dir, { recursive: true });
    mainLogFile = path.join(dir, 'main.log');
    logMain('INFO', 'logger initialized', {
      logFile: mainLogFile,
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      packaged: app.isPackaged
    });
  } catch (err) {
    console.error('[logger] init failed', err);
  }
}

function getTrackCoverCacheKey(filePath) {
  return normalizeId(filePath || '');
}

async function readTrackCoverDataUrl(filePath) {
  try {
    if (!filePath || !existsSync(filePath)) return null;
    const cacheKey = getTrackCoverCacheKey(filePath);
    if (coverDataUrlCache.has(cacheKey)) return coverDataUrlCache.get(cacheKey);
    const metadata = await mm.parseFile(filePath, { skipCovers: false });
    const pic = metadata?.common?.picture?.[0];
    if (!pic?.data?.length) {
      coverDataUrlCache.set(cacheKey, null);
      return null;
    }
    const fmt = `${pic.format || ''}`.toLowerCase();
    const mime = fmt.includes('png') ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mime};base64,${Buffer.from(pic.data).toString('base64')}`;
    coverDataUrlCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch (_) {
    return null;
  }
}

function attachMainWindowDebugHooks(win) {
  if (!win) return;
  win.webContents.on('did-start-loading', () => {
    logMain('INFO', 'main webContents did-start-loading');
  });
  win.webContents.on('did-finish-load', () => {
    logMain('INFO', 'main webContents did-finish-load', { url: win.webContents.getURL() });
  });
  win.webContents.on('did-fail-load', (_, code, desc, url, isMainFrame) => {
    logMain('ERROR', 'main webContents did-fail-load', { code, desc, url, isMainFrame });
  });
  win.webContents.on('render-process-gone', (_, details) => {
    logMain('ERROR', 'main webContents render-process-gone', details || {});
  });
  win.webContents.on('console-message', (_, level, message, line, sourceId) => {
    if (level <= 1) return;
    logMain('WARN', 'renderer console-message', { level, message, line, sourceId });
  });
  win.on('unresponsive', () => {
    logMain('ERROR', 'main window unresponsive');
  });
  win.on('responsive', () => {
    logMain('INFO', 'main window responsive');
  });
}

function bindLyricAutoDownloadHook(webContents) {
  if (!webContents?.session) return;
  const ses = webContents.session;
  if (hookedSessions.has(ses)) return;
  hookedSessions.add(ses);
  ses.on('will-download', (_, item) => {
    const target = lyricDownloadTarget;
    if (!target?.trackPath) return;
    try {
      const trackParsed = path.parse(target.trackPath);
      const originalName = item.getFilename() || '';
      const originalExt = path.extname(originalName).toLowerCase();
      const ext = originalExt === '.txt' ? '.txt' : '.lrc';
      const targetPath = path.join(trackParsed.dir, `${trackParsed.name}${ext}`);
      item.setSavePath(targetPath);
      logMain('INFO', 'auto lyric download save path set', { from: originalName, to: targetPath });
      item.once('done', (_, state) => {
        const ok = state === 'completed';
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('lyrics:downloaded', {
            ok,
            state,
            trackPath: target.trackPath,
            targetPath
          });
        }
        if (ok) {
          logMain('INFO', 'auto lyric download completed', { targetPath });
        } else {
          logMain('WARN', 'auto lyric download not completed', { state, targetPath });
        }
      });
    } catch (err) {
      logMain('ERROR', 'auto lyric download hook failed', { error: err?.message || String(err) });
    }
  });
}

function execFileAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: 'buffer', maxBuffer: 1024 * 1024 * 512 }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function transcodeWmaToWavBuffer(filePath) {
  const args = ['-v', 'error', '-i', filePath, '-f', 'wav', '-acodec', 'pcm_s16le', '-ac', '2', '-ar', '44100', 'pipe:1'];
  try {
    const { stdout } = await execFileAsync('ffmpeg', args);
    return stdout;
  } catch (_) {
    return null;
  }
}

function ensureDataShape(raw) {
  const base = {
    scanFolders: [],
    tracks: [],
    playlists: [{ id: 'favorites', name: '我喜欢', fixed: true, trackIds: [] }],
    listeningHistory: [],
    discoverCache: {
      generatedAt: '',
      summary: '',
      localRecommendations: [],
      remoteRecommendations: [],
      remoteQueries: [],
      resolvedRemoteQueries: [],
      warnings: []
    },
    settings: {
      showLyrics: true,
      minimizedShowLyrics: false,
      playMode: 'sequence',
      lyricLocked: false,
      lyricClickThrough: false,
      closeBehavior: 'ask',
      backgroundImagePath: '',
      backgroundBlur: 8,
      volume: 0.8,
      lyricEncodingMap: {},
      cloud: DEFAULT_CLOUD_SETTINGS,
      ai: DEFAULT_AI_SETTINGS,
      download: DEFAULT_DOWNLOAD_SETTINGS
    }
  };
  const merged = {
    ...base,
    ...(raw || {}),
    settings: {
      ...base.settings,
      ...((raw && raw.settings) || {})
    }
  };
  merged.settings.cloud = {
    ...DEFAULT_CLOUD_SETTINGS,
    ...((raw?.settings?.cloud) || {})
  };
  merged.settings.ai = {
    ...DEFAULT_AI_SETTINGS,
    ...((raw?.settings?.ai) || {})
  };
  merged.settings.download = {
    ...DEFAULT_DOWNLOAD_SETTINGS,
    ...((raw?.settings?.download) || {})
  };
  if (!Array.isArray(merged.settings.cloud.enabledProviders) || !merged.settings.cloud.enabledProviders.length) {
    merged.settings.cloud.enabledProviders = [merged.settings.cloud.activeProvider || 'qqmusic'];
  }
  if (!Array.isArray(merged.listeningHistory)) merged.listeningHistory = [];
  merged.listeningHistory = merged.listeningHistory.slice(-800);
  merged.discoverCache = {
    ...base.discoverCache,
    ...((raw && raw.discoverCache) || {})
  };
  if (!Array.isArray(merged.discoverCache.localRecommendations)) merged.discoverCache.localRecommendations = [];
  if (!Array.isArray(merged.discoverCache.remoteRecommendations)) merged.discoverCache.remoteRecommendations = [];
  if (!Array.isArray(merged.discoverCache.remoteQueries)) merged.discoverCache.remoteQueries = [];
  if (!Array.isArray(merged.discoverCache.resolvedRemoteQueries)) merged.discoverCache.resolvedRemoteQueries = [];
  if (!Array.isArray(merged.discoverCache.warnings)) merged.discoverCache.warnings = [];
  const playlistList = Array.isArray(merged.playlists) ? merged.playlists : [];
  if (!playlistList.find((p) => p.id === 'favorites')) {
    merged.playlists = [{ id: 'favorites', name: '我喜欢', fixed: true, trackIds: [] }, ...playlistList];
  } else {
    merged.playlists = playlistList;
  }
  const trackMap = new Map();
  for (const t of merged.tracks || []) {
    if (!t?.id) continue;
    if (!trackMap.has(t.id)) trackMap.set(t.id, t);
  }
  merged.tracks = [...trackMap.values()];
  const validTrackIds = new Set(merged.tracks.map((t) => t.id));
  merged.playlists = (merged.playlists || []).map((p) => ({
    ...p,
    trackIds: [...new Set((p.trackIds || []).filter((id) => validTrackIds.has(id)))]
  }));
  return merged;
}

function userDataFile() {
  return path.join(app.getPath('userData'), 'player-data.json');
}

async function loadData() {
  const fp = userDataFile();
  if (!existsSync(fp)) {
    return ensureDataShape(null);
  }
  const raw = await fs.readFile(fp, 'utf8');
  return ensureDataShape(JSON.parse(raw));
}

async function saveData(data) {
  await fs.writeFile(userDataFile(), JSON.stringify(ensureDataShape(data), null, 2), 'utf8');
}

async function walk(dir, result = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, result);
    } else {
      result.push(full);
    }
  }
  return result;
}

function normalizeId(fp) {
  return fp.replaceAll('\\\\', '/').toLowerCase();
}

function decodeUtf16be(buf) {
  if (buf.length < 2) return '';
  const evenLen = buf.length - (buf.length % 2);
  const swapped = Buffer.allocUnsafe(evenLen);
  for (let i = 0; i < evenLen; i += 2) {
    swapped[i] = buf[i + 1];
    swapped[i + 1] = buf[i];
  }
  return new TextDecoder('utf-16le').decode(swapped);
}

function scoreDecodedText(txt) {
  if (!txt) return -1e9;
  const bad = (txt.match(/\uFFFD/g) || []).length;
  const nul = (txt.match(/\u0000/g) || []).length;
  const hasLrcTag = /\[\d{1,2}:\d{1,2}(?:\.\d+)?\]/.test(txt);
  const cjk = (txt.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) || []).length;
  return (hasLrcTag ? 1000 : 0) + cjk * 0.1 - bad * 40 - nul * 3;
}

function decodeTextSmart(buf) {
  if (!buf || !buf.length) return '';

  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf.subarray(3));
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buf.subarray(2));
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return decodeUtf16be(buf.subarray(2));
  }

  const encodings = ['utf-8', 'gb18030', 'gbk', 'big5', 'shift_jis', 'euc-kr', 'utf-16le'];
  let best = '';
  let bestScore = -1e9;
  let bestTagged = '';
  let bestTaggedScore = -1e9;
  for (const enc of encodings) {
    try {
      const txt = new TextDecoder(enc).decode(buf);
      const score = scoreDecodedText(txt);
      const tagged = /\[\d{1,2}:\d{1,2}(?:\.\d+)?\]/.test(txt);
      if (tagged && score > bestTaggedScore) {
        bestTaggedScore = score;
        bestTagged = txt;
      }
      if (score > bestScore) {
        bestScore = score;
        best = txt;
      }
    } catch (_) {
      // ignore unsupported encoding in runtime
    }
  }
  return bestTagged || best || new TextDecoder('utf-8').decode(buf);
}

function decodeTextWithEncoding(buf, encoding) {
  if (!buf || !buf.length) return '';
  const enc = `${encoding || ''}`.toLowerCase();
  if (!enc || enc === 'auto') return decodeTextSmart(buf);
  if (enc === 'utf-16be') {
    if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return decodeUtf16be(buf.subarray(2));
    return decodeUtf16be(buf);
  }
  if (enc === 'utf-16le') {
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
    return new TextDecoder('utf-16le').decode(buf);
  }
  return new TextDecoder(enc).decode(buf);
}

function shiftLrcTimestamps(raw, shiftSec) {
  const text = `${raw || ''}`;
  return text.replace(/\[(\d+):(\d+(?:\.(\d+))?)\]/g, (_, mmStr, secStr, fracStr) => {
    const total = Number(mmStr) * 60 + Number(secStr);
    const shifted = Math.max(0, total - shiftSec);
    const precision = fracStr ? fracStr.length : 0;
    if (precision > 0) {
      const scale = 10 ** precision;
      const ticks = Math.round(shifted * scale);
      const mm = Math.floor(ticks / (60 * scale));
      const rest = ticks - mm * 60 * scale;
      const sec = rest / scale;
      const secFixed = sec.toFixed(precision).padStart(precision + 3, '0');
      return `[${String(mm).padStart(2, '0')}:${secFixed}]`;
    }
    const mm = Math.floor(shifted / 60);
    const sec = Math.floor(shifted % 60);
    return `[${String(mm).padStart(2, '0')}:${String(sec).padStart(2, '0')}]`;
  });
}

function findLyricsForAudio(audioFile, lyricFiles) {
  const parsed = path.parse(audioFile);
  const audioDir = normalizeId(parsed.dir);
  const audioStem = `${parsed.name || ''}`.normalize('NFKC').trim().toLowerCase();
  const audioStemLoose = audioStem.replace(/\s+/g, '');
  const candidates = lyricFiles.filter((f) => normalizeId(path.dirname(f)) === audioDir);
  if (!candidates.length) return null;

  let exact = null;
  for (const file of candidates) {
    const lp = path.parse(file);
    const stem = `${lp.name || ''}`.normalize('NFKC').trim().toLowerCase();
    if (stem === audioStem) {
      exact = file;
      if (lp.ext.toLowerCase() === '.lrc') return file;
    }
  }
  if (exact) return exact;

  let loose = null;
  for (const file of candidates) {
    const lp = path.parse(file);
    const stemLoose = `${lp.name || ''}`.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
    if (stemLoose === audioStemLoose) {
      loose = file;
      if (lp.ext.toLowerCase() === '.lrc') return file;
    }
  }
  if (loose) return loose;

  // Fallback: pick the closest same-folder lyric file by stem containment.
  const byContain = candidates.find((f) => {
    const stem = `${path.parse(f).name || ''}`.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
    return stem.includes(audioStemLoose) || audioStemLoose.includes(stem);
  });
  return byContain || null;
}

function normalizeComparableText(value) {
  return `${value || ''}`
    .normalize('NFKC')
    .toLowerCase()
    .replace(/unknown\s+(artist|album|title)/gi, ' ')
    .replace(/[（(][^）)]*(?:320|128|flac|mp3|无损|高品|标准|伴奏|live|mv|official|hq|sq)[^）)]*[）)]/gi, ' ')
    .replace(/[【\[][^[\]【】]*(?:320|128|flac|mp3|无损|高品|标准|伴奏|live|mv|official|hq|sq)[^\]【】]*[】\]]/gi, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactComparableText(value) {
  return normalizeComparableText(value).replace(/\s+/g, '');
}

function isUnknownMetadata(value, fallback = '') {
  const text = `${value || ''}`.trim();
  if (!text) return true;
  const normalized = text.toLowerCase();
  if (normalized === 'unknown title' || normalized === 'unknown artist' || normalized === 'unknown album') return true;
  return fallback && compactComparableText(text) === compactComparableText(fallback);
}

function cleanFileStem(stem) {
  return `${stem || ''}`
    .normalize('NFKC')
    .replace(/[【\[][^[\]【】]*(?:320|128|flac|mp3|无损|高品|标准|hq|sq|mqms|kgm|ncm)[^\]【】]*[】\]]/gi, ' ')
    .replace(/[（(][^）)]*(?:320|128|flac|mp3|无损|高品|标准|hq|sq|mqms|kgm|ncm)[^）)]*[）)]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitArtistTitleFromStem(stem) {
  const clean = cleanFileStem(stem);
  const match = clean.match(/^(.{1,80}?)(?:\s+-\s+|\s+–\s+|\s+—\s+|_+)(.{1,120})$/);
  if (!match) return { artist: '', title: clean };
  return { artist: match[1].trim(), title: match[2].trim() };
}

function uniqueNonEmpty(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = `${value || ''}`.replace(/\s+/g, ' ').trim();
    const key = compactComparableText(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function buildScrapeProfile(track) {
  const stem = path.parse(track?.path || '').name;
  const split = splitArtistTitleFromStem(stem);
  const rawTitle = `${track?.title || ''}`.trim();
  const rawArtist = `${track?.artist || ''}`.trim();
  const title = isUnknownMetadata(rawTitle, stem) ? split.title : rawTitle;
  const artist = isUnknownMetadata(rawArtist) ? split.artist : rawArtist;
  return {
    title,
    artist,
    album: isUnknownMetadata(track?.album) ? '' : `${track?.album || ''}`.trim(),
    duration: Number(track?.duration) || 0,
    stem: cleanFileStem(stem),
    split
  };
}

function buildScrapeQueries(track) {
  const profile = buildScrapeProfile(track);
  return uniqueNonEmpty([
    profile.artist && profile.title ? `${profile.artist} ${profile.title}` : '',
    profile.split.artist && profile.split.title ? `${profile.split.artist} ${profile.split.title}` : '',
    profile.title,
    profile.stem
  ]).slice(0, 4);
}

function tokenOverlapScore(a, b, weight) {
  const tokens = normalizeComparableText(a).split(' ').filter((token) => token.length > 1);
  if (!tokens.length) return 0;
  const target = compactComparableText(b);
  if (!target) return 0;
  const matched = tokens.filter((token) => target.includes(compactComparableText(token))).length;
  return Math.round((matched / tokens.length) * weight);
}

function textMatchScore(expected, actual, exactWeight, containWeight, overlapWeight) {
  const a = compactComparableText(expected);
  const b = compactComparableText(actual);
  if (!a || !b) return 0;
  if (a === b) return exactWeight;
  if (a.includes(b) || b.includes(a)) return containWeight;
  return tokenOverlapScore(expected, actual, overlapWeight);
}

function scoreScrapeCandidate(track, candidate) {
  if (!candidate?.remoteId) return -999;
  const profile = buildScrapeProfile(track);
  const titleScore = Math.max(
    textMatchScore(profile.title, candidate.title, 48, 34, 22),
    textMatchScore(profile.stem, `${candidate.artist} ${candidate.title}`, 38, 28, 18),
    textMatchScore(profile.split.title, candidate.title, 44, 30, 18)
  );
  const artistScore = Math.max(
    textMatchScore(profile.artist, candidate.artist, 26, 18, 12),
    textMatchScore(profile.split.artist, candidate.artist, 22, 15, 10)
  );
  const albumScore = textMatchScore(profile.album, candidate.album, 8, 5, 3);
  let durationScore = 0;
  if (profile.duration > 0 && candidate.duration > 0) {
    const diff = Math.abs(profile.duration - candidate.duration);
    if (diff <= 2) durationScore = 24;
    else if (diff <= 5) durationScore = 18;
    else if (diff <= 10) durationScore = 10;
    else if (diff <= 20) durationScore = 3;
    else durationScore = -14;
  }
  const providerBonus = candidate.provider === track?.cloudMatch?.provider ? 4 : 0;
  return titleScore + artistScore + albumScore + durationScore + providerBonus;
}

function shouldUpdateMetadataField(track, field, nextValue, overwriteMetadata) {
  const next = field === 'duration' ? Number(nextValue) : `${nextValue || ''}`.trim();
  if (field === 'duration') return Number.isFinite(next) && next > 0 && (overwriteMetadata || !(Number(track?.duration) > 0));
  if (!next || /^unknown\s+/i.test(next)) return false;
  if (overwriteMetadata) return `${track?.[field] || ''}`.trim() !== next;
  const stem = field === 'title' ? path.parse(track?.path || '').name : '';
  return isUnknownMetadata(track?.[field], stem);
}

function mergeCloudScrapeFields(parsedTrack, previousTrack) {
  if (!previousTrack || previousTrack.metadataSource !== 'cloud') return parsedTrack;
  return {
    ...parsedTrack,
    title: previousTrack.title || parsedTrack.title,
    artist: previousTrack.artist || parsedTrack.artist,
    album: previousTrack.album || parsedTrack.album,
    duration: previousTrack.duration || parsedTrack.duration,
    albumPicUrl: previousTrack.albumPicUrl || parsedTrack.albumPicUrl,
    publishTime: previousTrack.publishTime || parsedTrack.publishTime,
    cloudMatch: previousTrack.cloudMatch || parsedTrack.cloudMatch,
    metadataSource: previousTrack.metadataSource,
    scrapedAt: previousTrack.scrapedAt || parsedTrack.scrapedAt
  };
}

function buildLyricText(lyric) {
  const lrc = `${lyric?.lrc || ''}`.trim();
  if (lrc) return `${lrc}\n`;
  const trans = `${lyric?.trans || ''}`.trim();
  return trans ? `${trans}\n` : '';
}

async function writeScrapedLyric(track, lyric, { overwriteLyric = true } = {}) {
  const text = buildLyricText(lyric);
  if (!text.trim()) return { lyricPath: track.lyricPath || '', downloaded: false };
  if (track.lyricPath && !overwriteLyric && existsSync(track.lyricPath)) {
    return { lyricPath: track.lyricPath, downloaded: false };
  }
  const parsed = path.parse(track.path);
  const lyricPath = path.join(parsed.dir, `${parsed.name}.lrc`);
  await fs.writeFile(lyricPath, text, 'utf8');
  return { lyricPath, downloaded: true };
}

async function findBestCloudMatchForTrack(track, options = {}) {
  const cfg = {
    ...DEFAULT_CLOUD_SETTINGS,
    ...(options.cloudSettings || {}),
    ...(options.config || {})
  };
  const queries = buildScrapeQueries(track);
  if (!queries.length) {
    throw new CloudApiError('缺少可用于匹配的歌曲名或文件名', { code: 'MISSING_SCRAPE_QUERY' });
  }
  const activeProvider = safeProvider(options.provider || cfg.activeProvider);
  const providers = options.providers || cfg.enabledProviders;
  const searchMode = options.searchMode || cfg.searchMode || 'single';
  const pageSize = Math.max(5, Math.min(30, Number(options.pageSize || cfg.pageSize) || 20));
  const client = getCloudApiClient();
  const candidates = new Map();
  const errors = [];
  for (const query of queries) {
    try {
      const result = await client.searchSongs({
        query,
        page: 1,
        pageSize,
        provider: activeProvider,
        providers,
        searchMode,
        config: cfg
      });
      for (const item of result.items || []) {
        const key = `${item.provider}:${item.remoteId}`;
        if (!item.remoteId || candidates.has(key)) continue;
        candidates.set(key, item);
      }
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }
  let best = null;
  let bestScore = -999;
  for (const candidate of candidates.values()) {
    const score = scoreScrapeCandidate(track, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  const threshold = Number(options.minScore ?? 56);
  if (!best || bestScore < threshold) {
    throw new CloudApiError(errors[0] || '未找到可信的云端匹配歌曲', {
      code: 'NO_SCRAPE_MATCH',
      data: { queries, bestScore, threshold }
    });
  }
  return { match: best, score: bestScore, queries };
}

async function scrapeTrackWithData(data, targetTrack, options = {}) {
  const trackId = `${options.trackId || targetTrack?.id || ''}`;
  const targetPath = `${options.path || targetTrack?.path || ''}`.replaceAll('\\', '/');
  const idx = (data.tracks || []).findIndex((track) => (trackId && track.id === trackId) || (targetPath && normalizeId(track.path) === normalizeId(targetPath)));
  if (idx < 0) throw new CloudApiError('未找到本地歌曲', { code: 'TRACK_NOT_FOUND' });
  const current = data.tracks[idx];
  if (!current?.path || !existsSync(current.path)) throw new CloudApiError('本地歌曲文件不存在', { code: 'TRACK_FILE_NOT_FOUND' });

  const cloudSettings = {
    ...DEFAULT_CLOUD_SETTINGS,
    ...(data.settings?.cloud || {}),
    ...(options.config || {})
  };
  const overwriteMetadata = options.overwriteMetadata ?? cloudSettings.scrapeOverwriteMetadata !== false;
  const downloadLyric = options.downloadLyric ?? cloudSettings.scrapeDownloadLyric !== false;
  const overwriteLyric = options.overwriteLyric ?? true;
  const { match, score, queries } = await findBestCloudMatchForTrack(current, {
    ...options,
    cloudSettings,
    config: cloudSettings
  });

  let detailTrack = match;
  try {
    const detail = await getCloudApiClient().getSongDetail({ provider: match.provider, songId: match.remoteId, config: cloudSettings });
    detailTrack = detail?.track?.remoteId ? detail.track : match;
  } catch (error) {
    logMain('WARN', 'cloud scrape detail failed', { trackId: current.id, error: error?.message || String(error) });
  }

  let lyricResult = { lyricPath: current.lyricPath || '', downloaded: false };
  let lyric = null;
  if (downloadLyric) {
    try {
      lyric = await getCloudApiClient().getSongLyric({ provider: detailTrack.provider, songId: detailTrack.remoteId, config: cloudSettings });
      lyricResult = await writeScrapedLyric(current, lyric, { overwriteLyric });
    } catch (error) {
      logMain('WARN', 'cloud scrape lyric failed', { trackId: current.id, error: error?.message || String(error) });
    }
  }

  const updatedFields = [];
  const nextTrack = { ...current };
  for (const [field, value] of [
    ['title', detailTrack.title],
    ['artist', detailTrack.artist],
    ['album', detailTrack.album],
    ['duration', detailTrack.duration]
  ]) {
    if (!shouldUpdateMetadataField(current, field, value, overwriteMetadata)) continue;
    nextTrack[field] = field === 'duration' ? Number(value) : `${value}`.trim();
    updatedFields.push(field);
  }
  if (detailTrack.albumPicUrl) nextTrack.albumPicUrl = detailTrack.albumPicUrl;
  if (detailTrack.publishTime) nextTrack.publishTime = detailTrack.publishTime;
  if (lyricResult.lyricPath) nextTrack.lyricPath = lyricResult.lyricPath;
  nextTrack.metadataSource = 'cloud';
  nextTrack.scrapedAt = new Date().toISOString();
  nextTrack.cloudMatch = {
    provider: detailTrack.provider,
    remoteId: detailTrack.remoteId,
    title: detailTrack.title,
    artist: detailTrack.artist,
    album: detailTrack.album,
    duration: detailTrack.duration,
    score,
    queries
  };
  data.tracks[idx] = nextTrack;
  return {
    track: nextTrack,
    match: nextTrack.cloudMatch,
    score,
    updatedFields,
    lyricPath: lyricResult.lyricPath || '',
    lyricDownloaded: lyricResult.downloaded,
    lyricAvailable: !!buildLyricText(lyric).trim()
  };
}

async function scrapeCloudTrack(payload = {}) {
  const data = await loadData();
  const result = await scrapeTrackWithData(data, null, payload);
  await saveData(data);
  return result;
}

async function scrapeCloudLibrary(payload = {}) {
  const data = await loadData();
  const onlyMissingLyric = payload.onlyMissingLyric === true;
  const limit = Math.max(1, Math.min(Number(payload.limit) || data.tracks.length || 1, data.tracks.length || 1));
  const targets = (data.tracks || [])
    .filter((track) => !onlyMissingLyric || !track.lyricPath)
    .slice(0, limit);
  const results = [];
  const errors = [];
  for (const track of targets) {
    try {
      const result = await scrapeTrackWithData(data, track, {
        ...payload,
        trackId: track.id,
        overwriteLyric: payload.overwriteLyric ?? !track.lyricPath
      });
      results.push(result);
    } catch (error) {
      errors.push({ trackId: track.id, title: track.title, message: error?.message || String(error) });
    }
  }
  if (results.length) await saveData(data);
  return {
    total: targets.length,
    updated: results.length,
    failed: errors.length,
    results,
    errors,
    tracks: data.tracks
  };
}

async function parseTrack(file, lyricFiles) {
  let metadata = null;
  try {
    metadata = await mm.parseFile(file);
  } catch (_) {
    metadata = null;
  }

  const common = metadata?.common || {};
  const format = metadata?.format || {};
  return {
    id: normalizeId(file),
    path: file,
    title: common.title || path.parse(file).name,
    artist: common.artist || 'Unknown Artist',
    album: common.album || 'Unknown Album',
    duration: Number.isFinite(format.duration) ? Math.round(format.duration) : 0,
    folder: path.dirname(file),
    ext: path.extname(file).toLowerCase(),
    lyricPath: findLyricsForAudio(file, lyricFiles),
    liked: false
  };
}

async function scanFolders(folders, prevData) {
  const allFiles = [];
  for (const folder of folders) {
    if (existsSync(folder)) {
      const files = await walk(folder);
      allFiles.push(...files);
    }
  }

  const normalized = allFiles.map((f) => f.replaceAll('\\\\', '/'));
  const lyricFiles = normalized.filter((f) => LYRIC_EXT.has(path.extname(f).toLowerCase()));
  const audioFiles = normalized.filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase()));

  const prevLiked = new Set((prevData.tracks || []).filter((t) => t.liked).map((t) => t.id));
  const prevTrackById = new Map((prevData.tracks || []).filter((t) => t?.id).map((t) => [t.id, t]));
  const uniqAudioById = new Map();
  for (const af of audioFiles) {
    const id = normalizeId(af);
    if (!uniqAudioById.has(id)) uniqAudioById.set(id, af);
  }

  const tracks = [];
  for (const af of uniqAudioById.values()) {
    let track = await parseTrack(af, lyricFiles);
    track = mergeCloudScrapeFields(track, prevTrackById.get(track.id));
    track.liked = prevLiked.has(track.id);
    tracks.push(track);
  }

  const favorites = prevData.playlists.find((p) => p.id === 'favorites') || {
    id: 'favorites',
    name: '我喜欢',
    fixed: true,
    trackIds: []
  };
  favorites.trackIds = tracks.filter((t) => t.liked).map((t) => t.id);

  const otherPlaylists = prevData.playlists.filter((p) => p.id !== 'favorites').map((p) => ({
    ...p,
    trackIds: p.trackIds.filter((id) => tracks.some((t) => t.id === id))
  }));

  return {
    ...prevData,
    scanFolders: folders,
    tracks,
    playlists: [favorites, ...otherPlaylists]
  };
}

async function importTrackFromFile(trackPath) {
  const normalizedTrackPath = `${trackPath || ''}`.replaceAll('\\\\', '/');
  if (!normalizedTrackPath || !existsSync(normalizedTrackPath)) return null;
  const data = await loadData();
  const files = await walk(path.dirname(normalizedTrackPath));
  const normalized = files.map((f) => f.replaceAll('\\\\', '/'));
  const lyricFiles = normalized.filter((f) => LYRIC_EXT.has(path.extname(f).toLowerCase()));
  let track = await parseTrack(normalizedTrackPath, lyricFiles);
  const idx = data.tracks.findIndex((t) => t.id === track.id);
  if (idx >= 0) {
    track = mergeCloudScrapeFields(track, data.tracks[idx]);
    track.liked = data.tracks[idx].liked;
    data.tracks[idx] = track;
  } else {
    data.tracks.push(track);
  }
  await saveData(data);
  return track;
}

function getCloudApiClient() {
  if (!cloudApiClient) {
    cloudApiClient = new CloudApiClient({
      getConfig: async () => {
        const data = await loadData();
        return {
          ...DEFAULT_CLOUD_SETTINGS,
          ...(data.settings?.cloud || {})
        };
      },
      fetchImpl: fetch
    });
  }
  return cloudApiClient;
}

function getAiApiClient() {
  if (!aiApiClient) {
    aiApiClient = new AiApiClient({
      getConfig: async () => {
        const data = await loadData();
        return {
          ...DEFAULT_AI_SETTINGS,
          ...(data.settings?.ai || {})
        };
      },
      fetchImpl: fetch
    });
  }
  return aiApiClient;
}

function scoreRemoteRecommendationCandidate(query, candidate) {
  if (!candidate?.remoteId) return -999;
  const titleScore = Math.max(
    textMatchScore(query?.title, candidate.title, 48, 34, 20),
    textMatchScore(query?.searchQuery, `${candidate.artist} ${candidate.title}`, 28, 18, 12)
  );
  const artistScore = textMatchScore(query?.artist, candidate.artist, 28, 18, 10);
  const albumScore = textMatchScore(query?.album, candidate.album, 8, 5, 3);
  return titleScore + artistScore + albumScore;
}

async function resolveAiRemoteRecommendations(remoteQueries, data, payload = {}) {
  const cloudSettings = {
    ...DEFAULT_CLOUD_SETTINGS,
    ...(data.settings?.cloud || {}),
    ...(payload.cloudConfig || {})
  };
  const queries = Array.isArray(remoteQueries) ? remoteQueries : [];
  if (!queries.length) return { remoteRecommendations: [], resolvedQueries: [], warnings: [] };
  if (!cloudSettings.enabled || !cloudSettings.baseUrl || !cloudSettings.apiKey) {
    return { remoteRecommendations: [], resolvedQueries: [], warnings: ['云音乐未配置，已保留 AI 云端候选但未自动解析'] };
  }
  const warnings = [];
  const remoteRecommendations = [];
  const resolvedQueries = [];
  const seenResolved = new Set();
  const pageSize = Math.max(5, Math.min(30, Number(cloudSettings.pageSize) || 20));
  for (const query of queries) {
    const searchQuery = `${query.searchQuery || [query.artist, query.title].filter(Boolean).join(' ')}`.trim();
    if (!searchQuery) continue;
    try {
      const result = await getCloudApiClient().searchSongs({
        query: searchQuery,
        page: 1,
        pageSize,
        provider: cloudSettings.activeProvider,
        providers: cloudSettings.enabledProviders,
        searchMode: cloudSettings.searchMode,
        config: cloudSettings
      });
      let best = null;
      let bestScore = -999;
      for (const item of result.items || []) {
        const score = scoreRemoteRecommendationCandidate({ ...query, searchQuery }, item);
        if (score > bestScore) {
          best = item;
          bestScore = score;
        }
      }
      if (best && bestScore >= 42) {
        const queryRecord = { ...query, searchQuery };
        const resolvedKey = `${best.provider || ''}:${best.remoteId || ''}`;
        resolvedQueries.push(queryRecord);
        if (seenResolved.has(resolvedKey)) continue;
        seenResolved.add(resolvedKey);
        remoteRecommendations.push({
          query: queryRecord,
          reason: query.reason || '',
          evidence: query.evidence || [],
          confidence: Math.max(0, Math.min(1, Number(query.confidence) || 0)),
          matchScore: bestScore,
          track: best,
          alternatives: []
        });
      } else {
        warnings.push(`未找到可信云端匹配：${searchQuery}`);
      }
    } catch (error) {
      warnings.push(`云端解析失败：${searchQuery} · ${error?.message || '未知错误'}`);
    }
  }
  return { remoteRecommendations, resolvedQueries, warnings };
}

function normalizeAiResultText(value) {
  return `${value || ''}`.replace(/\s+/g, ' ').trim();
}

function validateDiscoverAiResult(result) {
  const warnings = [...(Array.isArray(result?.warnings) ? result.warnings : [])];
  const remoteQueries = [];
  const seenRemote = new Set();
  for (const query of Array.isArray(result?.remoteQueries) ? result.remoteQueries : []) {
    const title = normalizeAiResultText(query?.title);
    const artist = normalizeAiResultText(query?.artist);
    const album = normalizeAiResultText(query?.album);
    const searchQuery = normalizeAiResultText(query?.searchQuery || [artist, title].filter(Boolean).join(' '));
    const key = `${artist}|${title}|${searchQuery}`.toLowerCase();
    if (!searchQuery || seenRemote.has(key)) continue;
    seenRemote.add(key);
    remoteQueries.push({
      ...query,
      title,
      artist,
      album,
      searchQuery,
      reason: normalizeAiResultText(query?.reason),
      evidence: (Array.isArray(query?.evidence) ? query.evidence : []).map(normalizeAiResultText).filter(Boolean).slice(0, 6),
      confidence: Math.max(0, Math.min(1, Number(query?.confidence) || 0))
    });
  }
  return { ...result, localRecommendations: [], remoteQueries, warnings };
}

async function recommendDiscoverSongs(payload = {}) {
  const data = await loadData();
  const aiSettings = {
    ...DEFAULT_AI_SETTINGS,
    ...(data.settings?.ai || {}),
    ...(payload.config || {})
  };
  const limits = {
    ...(payload.limits || {}),
    maxLocalRecommendations: 0,
    maxRemoteRecommendations: payload.limits?.maxRemoteRecommendations ?? aiSettings.maxRemoteRecommendations
  };
  const raw = await getAiApiClient().recommendSongs({
    ...payload,
    config: aiSettings,
    limits
  });
  const checked = validateDiscoverAiResult(raw);
  const resolved = aiSettings.resolveCloudResults !== false
    ? await resolveAiRemoteRecommendations(checked.remoteQueries, data, payload)
    : { remoteRecommendations: [], resolvedQueries: [], warnings: [] };
  return {
    generatedAt: new Date().toISOString(),
    model: raw.model,
    latencyMs: raw.latencyMs,
    summary: checked.summary,
    localRecommendations: [],
    remoteQueries: checked.remoteQueries,
    resolvedRemoteQueries: resolved.resolvedQueries || [],
    remoteRecommendations: resolved.remoteRecommendations,
    warnings: [...checked.warnings, ...resolved.warnings]
  };
}

async function getDownloadSettings() {
  const data = await loadData();
  return {
    ...DEFAULT_DOWNLOAD_SETTINGS,
    ...(data.settings?.download || {})
  };
}

function getCloudDownloadManagerInstance() {
  if (!cloudDownloadManager) {
    cloudDownloadManager = createCloudDownloadManager({
      app,
      cloudApi: getCloudApiClient(),
      getSettings: getDownloadSettings,
      importTrackFromFile,
      sendEvent: (channel, payload) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(channel, payload);
        }
      },
      log: logMain
    });
  }
  return cloudDownloadManager;
}

async function cloudIpcResult(work) {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    return { ok: false, error: serializeCloudError(error) };
  }
}

async function aiIpcResult(work) {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    return { ok: false, error: serializeAiError(error) };
  }
}

function createWindow() {
  const appIconPath = resolveAppIconPath();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#101218',
    icon: appIconPath,
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  attachMainWindowDebugHooks(mainWindow);
  bindLyricAutoDownloadHook(mainWindow.webContents);

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
  if (!app.isPackaged) {
    mainWindow.loadURL(devUrl).catch((err) => {
      logMain('ERROR', 'loadURL failed in dev mode', { devUrl, error: err?.message || String(err) });
    });
  } else {
    const prodIndex = path.join(__dirname, '..', 'dist', 'index.html');
    if (existsSync(prodIndex)) {
      mainWindow.loadFile(prodIndex).catch((err) => {
        logMain('ERROR', 'loadFile failed in packaged mode', { prodIndex, error: err?.message || String(err) });
      });
    } else {
      logMain('WARN', 'dist index not found, fallback to dev url', { prodIndex, devUrl });
      mainWindow.loadURL(devUrl).catch((err) => {
        logMain('ERROR', 'fallback loadURL failed in packaged mode', { devUrl, error: err?.message || String(err) });
      });
    }
  }
  mainWindow.setMenuBarVisibility(false);
  const syncMaximizedState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window:maximizedChanged', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', syncMaximizedState);
  mainWindow.on('unmaximize', syncMaximizedState);
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    handleMainCloseRequest();
  });
  mainWindow.on('closed', () => {
    if (lyricWindow && !lyricWindow.isDestroyed()) lyricWindow.close();
    if (lyricFinderWindow && !lyricFinderWindow.isDestroyed()) lyricFinderWindow.close();
    mainWindow = null;
    lyricWindow = null;
    lyricFinderWindow = null;
  });
}

function createLyricFinderWindow(initialUrl) {
  if (lyricFinderWindow && !lyricFinderWindow.isDestroyed()) {
    if (initialUrl) lyricFinderWindow.webContents.send('lyric-finder:open-url', initialUrl);
    lyricFinderWindow.show();
    lyricFinderWindow.focus();
    return lyricFinderWindow;
  }
  lyricFinderWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 860,
    minHeight: 620,
    parent: mainWindow || undefined,
    autoHideMenuBar: true,
    backgroundColor: '#101218',
    icon: resolveAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'lyric-finder-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });
  lyricFinderWindow.setMenuBarVisibility(false);
  bindLyricAutoDownloadHook(lyricFinderWindow.webContents);
  lyricFinderWindow.on('closed', () => {
    lyricFinderWindow = null;
    lyricDownloadTarget = null;
  });
  lyricFinderWindow.loadFile(path.join(__dirname, 'lyric-finder-window.html')).then(() => {
    const url = initialUrl || 'https://www.toomic.com/';
    lyricFinderWindow?.webContents.send('lyric-finder:open-url', url);
  }).catch((err) => {
    logMain('ERROR', 'lyric finder load page failed', { error: err?.message || String(err) });
  });
  return lyricFinderWindow;
}

function createLyricWindow() {
  if (lyricWindow && !lyricWindow.isDestroyed()) return lyricWindow;
  const appIconPath = resolveAppIconPath();
  lyricWindow = new BrowserWindow({
    width: 720,
    height: 210,
    minWidth: 420,
    minHeight: 130,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    focusable: true,
    backgroundColor: '#00000000',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'lyric-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  lyricWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  lyricWindow.setMovable(!lyricWindowOptions.locked);
  lyricWindow.setResizable(!lyricWindowOptions.locked);
  lyricWindow.setIgnoreMouseEvents(!!lyricWindowOptions.clickThrough, { forward: true });
  lyricWindow.loadFile(path.join(__dirname, 'lyrics-window.html'));
  lyricWindow.on('closed', () => {
    lyricWindow = null;
  });
  return lyricWindow;
}

function createTray() {
  if (appTray) return appTray;
  const appIconPath = resolveAppIconPath();
  let trayIcon = nativeImage.createFromPath(appIconPath);
  if (trayIcon.isEmpty()) {
    trayIcon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAQAAAC1QeVaAAAAI0lEQVR42mP8z8Dwn4EIwDiqA0YxjGIMYxjDGBgYGNQAAHQDBf4l9f7wAAAAAElFTkSuQmCC'
    );
  }
  trayIcon = trayIcon.resize({ width: 18, height: 18 });
  appTray = new Tray(trayIcon);
  appTray.setToolTip('YMusicPlayer');
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开播放器',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        if (appTray) {
          appTray.destroy();
          appTray = null;
        }
        app.quit();
      }
    }
  ]);
  appTray.setContextMenu(contextMenu);
  appTray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  });
  return appTray;
}

async function persistCloseBehavior(nextBehavior) {
  try {
    const data = await loadData();
    data.settings = data.settings || {};
    data.settings.closeBehavior = nextBehavior;
    await saveData(data);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings:closeBehavior', nextBehavior);
    }
  } catch (_) {
    // ignore persist failure
  }
}

async function resolveCloseBehavior() {
  const data = await loadData();
  const current = data.settings?.closeBehavior || 'ask';
  if (current !== 'ask') return current;

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: '关闭播放器',
    message: '请选择关闭行为',
    detail: '可最小化到系统托盘（Windows 通知区域 / Ubuntu 顶栏托盘）或直接关闭。',
    buttons: ['最小化到托盘', '直接关闭', '取消'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    checkboxLabel: '记住我的选择',
    checkboxChecked: false
  });

  if (result.response === 2) return 'cancel';
  const selected = result.response === 0 ? 'tray' : 'exit';
  if (result.checkboxChecked) {
    await persistCloseBehavior(selected);
  }
  return selected;
}

async function handleMainCloseRequest() {
  if (isHandlingClose || !mainWindow || mainWindow.isDestroyed()) return;
  isHandlingClose = true;
  try {
    const behavior = await resolveCloseBehavior();
    if (behavior === 'cancel') return;
    if (behavior === 'tray') {
      createTray();
      if (lyricWindow && !lyricWindow.isDestroyed()) lyricWindow.hide();
      mainWindow.hide();
      return;
    }
    isQuitting = true;
    if (appTray) {
      appTray.destroy();
      appTray = null;
    }
    app.quit();
  } finally {
    isHandlingClose = false;
  }
}

app.whenReady().then(() => {
  initMainLogger();
  logMain('INFO', 'app ready');
  Menu.setApplicationMenu(null);
  app.on('web-contents-created', (_, contents) => {
    bindLyricAutoDownloadHook(contents);
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

process.on('uncaughtException', (err) => {
  logMain('ERROR', 'uncaughtException', { error: err?.stack || err?.message || String(err) });
});

process.on('unhandledRejection', (reason) => {
  const text = reason?.stack || reason?.message || String(reason);
  logMain('ERROR', 'unhandledRejection', { error: text });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) app.quit();
});

ipcMain.handle('dialog:pickFolders', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'multiSelections']
  });
  if (result.canceled) return [];
  return result.filePaths;
});

ipcMain.handle('dialog:pickBackgroundImage', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }
    ]
  });
  if (result.canceled || !result.filePaths?.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:pickLyricFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Lyrics', extensions: ['lrc', 'txt'] }
    ]
  });
  if (result.canceled || !result.filePaths?.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:pickDownloadDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths?.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('data:load', async () => loadData());
ipcMain.handle('data:save', async (_, data) => saveData(data));
ipcMain.handle('scan:folders', async (_, folders) => {
  const data = await loadData();
  const scanned = await scanFolders(folders, data);
  await saveData(scanned);
  return scanned;
});

ipcMain.handle('scan:singleTrack', async (_, trackPath) => {
  return importTrackFromFile(trackPath);
});

ipcMain.handle('cloud:testConnection', async (_, config) => cloudIpcResult(async () => {
  return getCloudApiClient().testConnection(config || {});
}));

ipcMain.handle('ai:testConnection', async (_, config) => aiIpcResult(async () => {
  return getAiApiClient().testConnection(config || {});
}));

ipcMain.handle('ai:recommendDiscoverSongs', async (_, payload) => aiIpcResult(async () => {
  return recommendDiscoverSongs(payload || {});
}));

ipcMain.handle('cloud:getDefaultDownloadDirectory', async () => {
  return getDefaultDownloadDirectory(app);
});

ipcMain.handle('cloud:searchSongs', async (_, payload) => cloudIpcResult(async () => {
  return getCloudApiClient().searchSongs(payload || {});
}));

ipcMain.handle('cloud:getSongDetail', async (_, payload) => cloudIpcResult(async () => {
  return getCloudApiClient().getSongDetail(payload || {});
}));

ipcMain.handle('cloud:getSongUrl', async (_, payload) => cloudIpcResult(async () => {
  return getCloudApiClient().getSongUrl(payload || {});
}));

ipcMain.handle('cloud:getSongLyric', async (_, payload) => cloudIpcResult(async () => {
  return getCloudApiClient().getSongLyric(payload || {});
}));

ipcMain.handle('cloud:scrapeTrack', async (_, payload) => cloudIpcResult(async () => {
  return scrapeCloudTrack(payload || {});
}));

ipcMain.handle('cloud:scrapeLibrary', async (_, payload) => cloudIpcResult(async () => {
  return scrapeCloudLibrary(payload || {});
}));

ipcMain.handle('cloud:readImageDataUrl', async (_, imageUrl) => cloudIpcResult(async () => {
  return getCloudApiClient().fetchImageDataUrl(imageUrl);
}));

ipcMain.handle('cloud:downloadSong', async (_, payload) => cloudIpcResult(async () => {
  return getCloudDownloadManagerInstance().start(payload || {});
}));

ipcMain.handle('cloud:getDownloadTasks', async () => cloudIpcResult(async () => {
  return getCloudDownloadManagerInstance().list();
}));

ipcMain.handle('cloud:pauseDownload', async (_, taskId) => cloudIpcResult(async () => {
  return getCloudDownloadManagerInstance().pause(taskId);
}));

ipcMain.handle('cloud:resumeDownload', async (_, taskId) => cloudIpcResult(async () => {
  return getCloudDownloadManagerInstance().resume(taskId);
}));

ipcMain.handle('cloud:cancelDownload', async (_, taskId) => cloudIpcResult(async () => {
  return getCloudDownloadManagerInstance().cancel(taskId);
}));

ipcMain.handle('cloud:deleteDownloadTask', async (_, taskId) => cloudIpcResult(async () => {
  return getCloudDownloadManagerInstance().deleteTask(taskId);
}));

ipcMain.handle('file:readText', async (_, filePath) => {
  try {
    const buf = await fs.readFile(filePath);
    return decodeTextSmart(buf);
  } catch (_) {
    return null;
  }
});

ipcMain.handle('file:readTextWithEncoding', async (_, filePath, encoding) => {
  try {
    const buf = await fs.readFile(filePath);
    return decodeTextWithEncoding(buf, encoding);
  } catch (_) {
    return null;
  }
});

ipcMain.handle('file:writeText', async (_, filePath, content) => {
  try {
    if (!filePath) return false;
    await fs.writeFile(filePath, `${content || ''}`, 'utf8');
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle('file:showInFolder', async (_, filePath) => {
  try {
    if (!filePath) return false;
    shell.showItemInFolder(filePath);
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle('external:open', async (_, url) => {
  try {
    if (!url) return false;
    await shell.openExternal(url);
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle('file:readImageDataUrl', async (_, filePath) => {
  try {
    if (!filePath) return null;
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.gif': 'image/gif'
    };
    const mime = mimeMap[ext] || 'image/png';
    const buf = await fs.readFile(filePath);
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (_) {
    return null;
  }
});

ipcMain.handle('audio:readBuffer', async (_, filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.wma') {
      const transcoded = await transcodeWmaToWavBuffer(filePath);
      if (transcoded) {
        return {
          kind: 'wav-transcoded',
          data: transcoded
        };
      }
      const raw = await fs.readFile(filePath);
      return {
        kind: 'wma-raw',
        data: raw
      };
    }
    const buf = await fs.readFile(filePath);
    return {
      kind: 'raw',
      data: buf
    };
  } catch (_) {
    return null;
  }
});

ipcMain.handle('track:readCoverDataUrl', async (_, filePath) => {
  return readTrackCoverDataUrl(filePath);
});

ipcMain.handle('lyrics:installForTrack', async (_, trackPath, lyricPath) => {
  try {
    if (!trackPath || !lyricPath) return null;
    const trackParsed = path.parse(trackPath);
    const srcExt = path.extname(lyricPath).toLowerCase();
    const ext = srcExt === '.txt' ? '.txt' : '.lrc';
    const targetPath = path.join(trackParsed.dir, `${trackParsed.name}${ext}`);
    await fs.copyFile(lyricPath, targetPath);
    return targetPath;
  } catch (_) {
    return null;
  }
});

ipcMain.handle('lyrics:setDownloadTarget', async (_, trackPath) => {
  if (!trackPath) return false;
  lyricDownloadTarget = { trackPath };
  return true;
});

ipcMain.handle('lyrics:clearDownloadTarget', async () => {
  lyricDownloadTarget = null;
  return true;
});

ipcMain.handle('lyrics:openFinderWindow', async (_, payload) => {
  const url = payload?.url || 'https://www.toomic.com/';
  const trackPath = payload?.trackPath || '';
  if (trackPath) lyricDownloadTarget = { trackPath };
  const win = createLyricFinderWindow(url);
  if (!win || win.isDestroyed()) return false;
  win.show();
  win.focus();
  return true;
});

ipcMain.handle('lyrics:shiftAndSave', async (_, lyricPath, offsetSec) => {
  try {
    if (!lyricPath || !existsSync(lyricPath)) return false;
    const buf = await fs.readFile(lyricPath);
    const decoded = decodeTextSmart(buf);
    const shifted = shiftLrcTimestamps(decoded, Number(offsetSec) || 0);
    await fs.writeFile(lyricPath, shifted, 'utf8');
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle('window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.handle('window:toggleMaximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});

ipcMain.handle('window:isMaximized', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return mainWindow.isMaximized();
});

ipcMain.handle('window:close', () => {
  handleMainCloseRequest();
});

ipcMain.handle('lyrics:showWindow', () => {
  const win = createLyricWindow();
  win.show();
  win.focus();
});

ipcMain.handle('lyrics:hideWindow', () => {
  if (lyricWindow && !lyricWindow.isDestroyed()) lyricWindow.hide();
});

ipcMain.handle('lyrics:update', (_, payload) => {
  if (!lyricWindow || lyricWindow.isDestroyed()) return;
  lyricWindow.webContents.send('lyrics:update', payload || {});
});

ipcMain.handle('lyrics:minimizeFromWindow', () => {
  if (lyricWindow && !lyricWindow.isDestroyed()) lyricWindow.hide();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lyrics:minimized');
  }
});

ipcMain.handle('lyrics:setOptions', (_, options) => {
  lyricWindowOptions = {
    ...lyricWindowOptions,
    ...(options || {})
  };
  if (!lyricWindow || lyricWindow.isDestroyed()) return lyricWindowOptions;
  lyricWindow.setMovable(!lyricWindowOptions.locked);
  lyricWindow.setResizable(!lyricWindowOptions.locked);
  lyricWindow.setIgnoreMouseEvents(!!lyricWindowOptions.clickThrough, { forward: true });
  lyricWindow.webContents.send('lyrics:options', lyricWindowOptions);
  return lyricWindowOptions;
});

const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { pipeline } = require('stream/promises');
const {
  QUALITY_FALLBACKS,
  sanitizeFileName,
  extensionForSongUrl,
  safeProvider
} = require('./cloud-track.cjs');
const { serializeCloudError } = require('./cloud-api.cjs');

const SEGMENT_THRESHOLD_BYTES = 20 * 1024 * 1024;
const URL_EXPIRY_GRACE_MS = 2 * 60 * 1000;
const ACTIVE_DUPLICATE_STATUSES = new Set(['queued', 'downloading', 'paused']);

function nowIso() {
  return new Date().toISOString();
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function pathExists(filePath) {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

async function fileSize(filePath) {
  try {
    const stat = await fsPromises.stat(filePath);
    return stat.size || 0;
  } catch (_) {
    return 0;
  }
}

async function unlinkQuiet(filePath) {
  try {
    if (filePath) await fsPromises.unlink(filePath);
  } catch (_) {
    // ignore cleanup failure
  }
}

function finishWriteStream(stream) {
  return new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.end(resolve);
  });
}

function getDefaultDownloadDirectory(app) {
  return path.join(app.getPath('music'), 'YMusicPlayer Downloads');
}

async function uniqueFilePath(directory, baseName, ext) {
  const cleanBase = sanitizeFileName(baseName);
  const cleanExt = ext.startsWith('.') ? ext : `.${ext || 'mp3'}`;
  let candidate = path.join(directory, `${cleanBase}${cleanExt}`);
  let index = 1;
  while (
    await pathExists(candidate) ||
    await pathExists(`${candidate}.ymusic.download`) ||
    await pathExists(`${candidate}.ymusic.download.meta.json`)
  ) {
    candidate = path.join(directory, `${cleanBase} (${index})${cleanExt}`);
    index += 1;
  }
  return candidate;
}

function parseTotalFromContentRange(value) {
  const match = `${value || ''}`.match(/\/([0-9]+)$/);
  return match ? Number(match[1]) || 0 : 0;
}

function isExpiringSoon(expiresAt) {
  if (!expiresAt) return false;
  const ts = Date.parse(expiresAt);
  return Number.isFinite(ts) && ts - Date.now() < URL_EXPIRY_GRACE_MS;
}

function getTaskKey(payload) {
  return `${safeProvider(payload.provider)}:${payload.songId || payload.remoteId || payload.id || ''}`;
}

function toPublicTask(task) {
  if (!task) return null;
  const {
    controller,
    songUrl,
    _lastProgressAt,
    _running,
    _config,
    _deleted,
    ...rest
  } = task;
  return {
    ...rest,
    progress: rest.total ? Math.min(100, Math.round((rest.downloaded / rest.total) * 1000) / 10) : 0,
    segments: Array.isArray(rest.segments)
      ? rest.segments.map(({ index, start, end, downloaded, status }) => ({ index, start, end, downloaded, status }))
      : []
  };
}

function createCloudDownloadManager({
  app,
  cloudApi,
  getSettings,
  importTrackFromFile,
  sendEvent,
  log
}) {
  const tasks = new Map();
  let loadPromise = null;
  let schedulePromise = null;

  const taskFile = () => path.join(app.getPath('userData'), 'download-tasks.json');

  async function loadPersisted() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const raw = await fsPromises.readFile(taskFile(), 'utf8');
        const list = JSON.parse(raw);
        for (const task of Array.isArray(list) ? list : []) {
          if (!task?.id) continue;
          const restored = {
            ...task,
            status: task.status === 'downloading' || task.status === 'queued' ? 'paused' : task.status,
            controller: null,
            _running: false
          };
          tasks.set(restored.id, restored);
        }
      } catch (_) {
        // no persisted tasks yet
      }
    })();
    return loadPromise;
  }

  async function persistTasks() {
    await fsPromises.mkdir(path.dirname(taskFile()), { recursive: true });
    const list = [...tasks.values()].map(toPublicTask);
    await fsPromises.writeFile(taskFile(), JSON.stringify(list, null, 2), 'utf8');
  }

  async function updateTask(task, patch = {}, { emit = true, persist = true } = {}) {
    Object.assign(task, patch, { updatedAt: nowIso() });
    tasks.set(task.id, task);
    if (emit) emitProgress(task, true);
    if (persist) await persistTasks();
    return toPublicTask(task);
  }

  function emitProgress(task, force = false) {
    const now = Date.now();
    if (!force && task._lastProgressAt && now - task._lastProgressAt < 180) return;
    task._lastProgressAt = now;
    sendEvent?.('cloud:download-progress', toPublicTask(task));
  }

  function emitDone(task, extra = {}) {
    sendEvent?.('cloud:download-done', {
      task: toPublicTask(task),
      ...extra
    });
  }

  async function resolveSongUrlWithFallback(task) {
    const settings = await getSettings();
    const requested = task.requestedQuality || task.quality || settings.quality || 'MP3_320';
    const qualities = settings.autoQualityFallback === false
      ? [requested]
      : (QUALITY_FALLBACKS[requested] || [requested, 'MP3_320', 'MP3_128']);
    let lastError = null;
    for (const quality of qualities) {
      try {
        const songUrl = await cloudApi.getSongUrl({
          provider: task.provider,
          songId: task.songId,
          quality,
          config: task._config
        });
        if (songUrl?.url) {
          task.songUrl = songUrl;
          task.actualQuality = quality;
          task.format = songUrl.format || task.format || '';
          task.expiresAt = songUrl.expiresAt || '';
          task.total = asNumber(songUrl.size, task.total || 0);
          return songUrl;
        }
      } catch (error) {
        lastError = error;
        const status = Number(error?.status || error?.code) || 0;
        if (status === 401 || status === 429 || error?.code === 'MISSING_BASE_URL' || error?.code === 'MISSING_API_KEY') {
          throw error;
        }
      }
    }
    throw lastError || new Error('未获取到歌曲下载直链');
  }

  async function ensureFreshSongUrl(task) {
    if (!task.songUrl?.url || isExpiringSoon(task.songUrl.expiresAt)) {
      return resolveSongUrlWithFallback(task);
    }
    return task.songUrl;
  }

  async function prepareTarget(task) {
    const settings = await getSettings();
    const songUrl = await ensureFreshSongUrl(task);
    const directory = settings.directory || getDefaultDownloadDirectory(app);
    await fsPromises.mkdir(directory, { recursive: true });
    if (!task.targetPath) {
      const artist = sanitizeFileName(task.artist || 'Unknown Artist');
      const title = sanitizeFileName(task.title || task.songId || 'Unknown Title');
      const ext = extensionForSongUrl(songUrl, task.actualQuality);
      task.targetPath = await uniqueFilePath(directory, `${artist} - ${title}`, ext);
      task.tempPath = `${task.targetPath}.ymusic.download`;
      task.metaPath = `${task.targetPath}.ymusic.download.meta.json`;
    } else if (!task.tempPath) {
      task.tempPath = `${task.targetPath}.ymusic.download`;
      task.metaPath = `${task.targetPath}.ymusic.download.meta.json`;
    }
    return songUrl;
  }

  async function probeRange(task) {
    const songUrl = await ensureFreshSongUrl(task);
    let total = asNumber(songUrl.size, task.total || 0);
    let rangeSupported = false;

    try {
      const head = await fetch(songUrl.url, { method: 'HEAD' });
      if (head.ok) {
        const contentLength = asNumber(head.headers.get('content-length'), 0);
        if (contentLength) total = contentLength;
        rangeSupported = `${head.headers.get('accept-ranges') || ''}`.toLowerCase().includes('bytes');
      }
    } catch (_) {
      // Some hosts do not allow HEAD.
    }

    if (!rangeSupported) {
      try {
        const response = await fetch(songUrl.url, { headers: { Range: 'bytes=0-0' } });
        if (response.status === 206) {
          rangeSupported = true;
          total = parseTotalFromContentRange(response.headers.get('content-range')) || total;
        }
        await response.arrayBuffer().catch(() => null);
      } catch (_) {
        // leave range unsupported
      }
    }

    task.rangeSupported = rangeSupported;
    task.total = total || task.total || 0;
    return { rangeSupported, totalSize: task.total };
  }

  async function writeResponseToFile(response, filePath, { append, task, segment } = {}) {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    const stream = fs.createWriteStream(filePath, { flags: append ? 'a' : 'w' });
    let streamError = null;
    stream.on('error', (error) => {
      streamError = error;
    });
    try {
      for await (const chunk of response.body) {
        if (task.status === 'paused' || task.status === 'canceled' || task.status === 'deleted') {
          const error = new Error(task.status);
          error.name = 'AbortError';
          throw error;
        }
        const buf = Buffer.from(chunk);
        if (streamError) throw streamError;
        if (!stream.write(buf)) {
          await new Promise((resolve) => stream.once('drain', resolve));
        }
        if (streamError) throw streamError;
        if (segment) {
          segment.downloaded += buf.length;
          segment.status = 'downloading';
          task.downloaded = task.segments.reduce((sum, s) => sum + asNumber(s.downloaded), 0);
        } else {
          task.downloaded += buf.length;
        }
        emitProgress(task);
      }
      await finishWriteStream(stream);
    } catch (error) {
      stream.destroy();
      throw error;
    }
  }

  async function fetchWithRefresh(task, headers = {}) {
    let songUrl = await ensureFreshSongUrl(task);
    let response = await fetch(songUrl.url, {
      headers,
      signal: task.controller?.signal
    });
    if ([401, 403, 404].includes(response.status)) {
      task.songUrl = null;
      songUrl = await ensureFreshSongUrl(task);
      response = await fetch(songUrl.url, {
        headers,
        signal: task.controller?.signal
      });
    }
    return response;
  }

  async function downloadSingle(task) {
    task.mode = 'single';
    task.segments = [];
    const canResume = !!task.rangeSupported;
    let existing = canResume ? await fileSize(task.tempPath) : 0;
    let append = canResume && existing > 0;
    task.downloaded = append ? existing : 0;
    emitProgress(task, true);

    const headers = append ? { Range: `bytes=${existing}-` } : {};
    const response = await fetchWithRefresh(task, headers);
    if (append && response.status === 200) {
      append = false;
      existing = 0;
      task.downloaded = 0;
      await unlinkQuiet(task.tempPath);
    }
    if (!(response.ok || response.status === 206)) {
      throw new Error(`下载失败 (${response.status})`);
    }
    if (!task.total) {
      const len = asNumber(response.headers.get('content-length'), 0);
      task.total = append ? existing + len : len;
    }
    await writeResponseToFile(response, task.tempPath, { append, task });
    if (await pathExists(task.targetPath)) {
      const parsed = path.parse(task.targetPath);
      task.targetPath = await uniqueFilePath(parsed.dir, parsed.name, parsed.ext);
    }
    await fsPromises.rename(task.tempPath, task.targetPath);
  }

  function createSegments(task, count) {
    const total = task.total;
    const size = Math.ceil(total / count);
    const segments = [];
    for (let index = 0; index < count; index += 1) {
      const start = index * size;
      const end = Math.min(total - 1, start + size - 1);
      if (start > end) break;
      segments.push({
        index,
        start,
        end,
        downloaded: 0,
        status: 'pending',
        partPath: `${task.targetPath}.part${index}`
      });
    }
    return segments;
  }

  async function hydrateSegmentProgress(task) {
    for (const segment of task.segments || []) {
      if (!segment.partPath) segment.partPath = `${task.targetPath}.part${segment.index}`;
      const size = await fileSize(segment.partPath);
      segment.downloaded = Math.min(size, segment.end - segment.start + 1);
      segment.status = segment.downloaded >= segment.end - segment.start + 1 ? 'done' : 'pending';
    }
    task.downloaded = task.segments.reduce((sum, s) => sum + asNumber(s.downloaded), 0);
  }

  async function downloadSegment(task, segment) {
    const expected = segment.end - segment.start + 1;
    if (segment.downloaded >= expected) {
      segment.status = 'done';
      return;
    }
    const from = segment.start + segment.downloaded;
    const headers = { Range: `bytes=${from}-${segment.end}` };
    const response = await fetchWithRefresh(task, headers);
    if (response.status !== 206) {
      throw new Error(`分段下载失败 (${response.status})`);
    }
    await writeResponseToFile(response, segment.partPath, {
      append: segment.downloaded > 0,
      task,
      segment
    });
    segment.status = 'done';
  }

  async function mergeSegments(task) {
    if (await pathExists(task.targetPath)) {
      const parsed = path.parse(task.targetPath);
      task.targetPath = await uniqueFilePath(parsed.dir, parsed.name, parsed.ext);
    }
    await unlinkQuiet(task.targetPath);
    for (const segment of task.segments) {
      await pipeline(
        fs.createReadStream(segment.partPath),
        fs.createWriteStream(task.targetPath, { flags: segment.index === 0 ? 'w' : 'a' })
      );
    }
    for (const segment of task.segments) {
      await unlinkQuiet(segment.partPath);
    }
  }

  async function downloadSegmented(task) {
    const settings = await getSettings();
    task.mode = 'segmented';
    const count = Math.max(2, Math.min(8, Number(settings.segmentCount) || 4));
    if (!Array.isArray(task.segments) || !task.segments.length) {
      task.segments = createSegments(task, count);
    }
    await hydrateSegmentProgress(task);
    emitProgress(task, true);
    await Promise.all(task.segments.map((segment) => downloadSegment(task, segment)));
    await mergeSegments(task);
  }

  async function writeLyricIfNeeded(task) {
    const settings = await getSettings();
    if (!settings.autoDownloadLyric) return '';
    try {
      const lyric = await cloudApi.getSongLyric({ provider: task.provider, songId: task.songId, config: task._config });
      const text = lyric?.lrc || '';
      if (!text.trim()) return '';
      const parsed = path.parse(task.targetPath);
      const lyricPath = path.join(parsed.dir, `${parsed.name}.lrc`);
      await fsPromises.writeFile(lyricPath, text, 'utf8');
      return lyricPath;
    } catch (error) {
      log?.('WARN', 'cloud lyric download failed', { taskId: task.id, error: error?.message || String(error) });
      return '';
    }
  }

  async function finishTask(task) {
    const settings = await getSettings();
    await writeLyricIfNeeded(task);
    let importedTrack = null;
    if (settings.autoImportAfterDownload !== false && importTrackFromFile) {
      importedTrack = await importTrackFromFile(task.targetPath);
      task.track = importedTrack;
    }
    await updateTask(task, {
      status: 'completed',
      downloaded: task.total || task.downloaded,
      error: '',
      completedAt: nowIso()
    }, { emit: true, persist: true });
    emitDone(task, { track: importedTrack });
  }

  async function runTask(task) {
    task.controller = new AbortController();
    task._running = true;
    await updateTask(task, { status: 'downloading', error: '' }, { emit: true, persist: true });
    try {
      await prepareTarget(task);
      const probe = await probeRange(task);
      const settings = await getSettings();
      const segmentCount = Math.max(1, Number(settings.segmentCount) || 4);
      const useSegmented = !!settings.enableSegmentedDownload &&
        probe.rangeSupported &&
        task.total >= SEGMENT_THRESHOLD_BYTES &&
        segmentCount > 1 &&
        !isExpiringSoon(task.expiresAt);
      if (useSegmented) {
        try {
          await downloadSegmented(task);
        } catch (error) {
          if (task.status === 'paused' || task.status === 'canceled' || error?.name === 'AbortError') throw error;
          log?.('WARN', 'segmented download failed, fallback to single', { taskId: task.id, error: error?.message || String(error) });
          for (const segment of task.segments || []) await unlinkQuiet(segment.partPath);
          task.segments = [];
          task.downloaded = 0;
          await downloadSingle(task);
        }
      } else {
        await downloadSingle(task);
      }
      if (task.status === 'canceled') return;
      await finishTask(task);
    } catch (error) {
      if (task._deleted) return;
      if (task.status === 'paused' || task.status === 'canceled' || error?.name === 'AbortError') {
        await persistTasks();
        emitProgress(task, true);
        return;
      }
      const serialized = serializeCloudError(error);
      await updateTask(task, {
        status: 'failed',
        error: serialized.message || '下载失败'
      }, { emit: true, persist: true });
      emitDone(task, { error: serialized });
    } finally {
      task.controller = null;
      task._running = false;
    }
  }

  async function schedule() {
    await loadPersisted();
    if (schedulePromise) return schedulePromise;
    schedulePromise = (async () => {
      try {
        const settings = await getSettings();
        const limit = Math.max(1, Math.min(6, Number(settings.maxConcurrentTasks) || 2));
        const running = [...tasks.values()].filter((t) => t.status === 'downloading' && t._running).length;
        let slots = Math.max(0, limit - running);
        if (!slots) return;
        const queued = [...tasks.values()]
          .filter((t) => t.status === 'queued' && !t._running)
          .sort((a, b) => `${a.createdAt}`.localeCompare(`${b.createdAt}`));
        for (const task of queued) {
          if (slots <= 0) break;
          slots -= 1;
          runTask(task).finally(() => {
            schedulePromise = null;
            schedule();
          });
        }
      } finally {
        schedulePromise = null;
      }
    })();
    return schedulePromise;
  }

  async function start(payload = {}) {
    await loadPersisted();
    const provider = safeProvider(payload.provider);
    const songId = `${payload.songId || payload.remoteId || payload.id || ''}`;
    if (!songId) throw new Error('缺少歌曲 ID');
    const key = getTaskKey({ provider, songId });
    for (const task of tasks.values()) {
      if (task.key !== key) continue;
      if (ACTIVE_DUPLICATE_STATUSES.has(task.status)) return toPublicTask(task);
      if (task.status === 'completed' && (!task.targetPath || await pathExists(task.targetPath))) return toPublicTask(task);
    }
    const id = `download:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const settings = await getSettings();
    const task = {
      id,
      key,
      provider,
      songId,
      title: payload.title || 'Unknown Title',
      artist: payload.artist || 'Unknown Artist',
      album: payload.album || 'Unknown Album',
      requestedQuality: payload.quality || settings.quality || 'MP3_320',
      actualQuality: '',
      format: '',
      status: 'queued',
      _config: payload.config || null,
      mode: '',
      downloaded: 0,
      total: 0,
      progress: 0,
      targetPath: '',
      tempPath: '',
      metaPath: '',
      rangeSupported: false,
      segments: [],
      error: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      completedAt: ''
    };
    tasks.set(id, task);
    await persistTasks();
    emitProgress(task, true);
    schedule();
    return toPublicTask(task);
  }

  async function list() {
    await loadPersisted();
    return [...tasks.values()]
      .map(toPublicTask)
      .sort((a, b) => `${b.createdAt}`.localeCompare(`${a.createdAt}`));
  }

  async function pause(taskId) {
    await loadPersisted();
    const task = tasks.get(taskId);
    if (!task) return null;
    if (task.status === 'queued') {
      await updateTask(task, { status: 'paused' });
      return toPublicTask(task);
    }
    if (task.status !== 'downloading') return toPublicTask(task);
    task.status = 'paused';
    task.controller?.abort();
    await persistTasks();
    emitProgress(task, true);
    return toPublicTask(task);
  }

  async function resume(taskId) {
    await loadPersisted();
    const task = tasks.get(taskId);
    if (!task) return null;
    if (!['paused', 'failed'].includes(task.status)) return toPublicTask(task);
    await updateTask(task, { status: 'queued', error: '' });
    schedule();
    return toPublicTask(task);
  }

  async function cancel(taskId) {
    await loadPersisted();
    const task = tasks.get(taskId);
    if (!task) return null;
    task.status = 'canceled';
    task.controller?.abort();
    await unlinkQuiet(task.tempPath);
    for (const segment of task.segments || []) await unlinkQuiet(segment.partPath);
    await updateTask(task, { status: 'canceled', error: '' });
    emitDone(task);
    return toPublicTask(task);
  }

  async function deleteTask(taskId) {
    await loadPersisted();
    const task = tasks.get(taskId);
    if (!task) return null;
    task._deleted = true;
    task.status = 'deleted';
    task.controller?.abort();
    await unlinkQuiet(task.tempPath);
    await unlinkQuiet(task.metaPath);
    for (const segment of task.segments || []) await unlinkQuiet(segment.partPath);
    tasks.delete(taskId);
    await persistTasks();
    return toPublicTask(task);
  }

  return {
    start,
    list,
    pause,
    resume,
    cancel,
    deleteTask,
    getDefaultDownloadDirectory: () => getDefaultDownloadDirectory(app)
  };
}

module.exports = {
  createCloudDownloadManager,
  getDefaultDownloadDirectory
};

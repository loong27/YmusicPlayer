import { AnimatePresence, motion } from 'framer-motion';
import { pinyin } from 'pinyin-pro';
import {
  Heart,
  ListMusic,
  FolderTree,
  Users,
  ListOrdered,
  Shuffle,
  Repeat,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Search,
  X,
  Square,
  Settings2,
  ChevronDown,
  Disc3,
  Volume2,
  Moon,
  Sun,
  Download,
  Info,
  Cloud,
  Sparkles,
  FolderOpen,
  Loader2,
  Trash2
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const SPRING = { type: 'spring', stiffness: 300, damping: 30 };
const DEFAULT_DATA = {
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
    cloud: {
      enabled: false,
      baseUrl: '',
      apiKey: '',
      activeProvider: 'qqmusic',
      enabledProviders: ['qqmusic'],
      searchMode: 'single',
      pageSize: 20,
      scrapeOverwriteMetadata: true,
      scrapeDownloadLyric: true
    },
    ai: {
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
    },
    download: {
      directory: '',
      quality: 'MP3_320',
      maxConcurrentTasks: 2,
      enableSegmentedDownload: true,
      segmentCount: 4,
      autoImportAfterDownload: true,
      autoDownloadLyric: true,
      autoQualityFallback: true
    }
  }
};

const electronAPI = window.electronAPI;
const MIME_BY_EXT = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wma': 'audio/x-ms-wma',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg'
};
const PROVIDERS = {
  qqmusic: { label: 'QQ音乐', shortLabel: 'QQ' },
  netease: { label: '网易云音乐', shortLabel: '网易' },
  kugou: { label: '酷狗音乐', shortLabel: '酷狗' }
};
const QUALITY_OPTIONS = ['MP3_128', 'MP3_320', 'FLAC', 'ATMOS', 'ATMOS2'];
const QUALITY_LABELS = {
  MP3_128: '标准音质 MP3 128K（体积小）',
  MP3_320: '高品质 MP3 320K（推荐）',
  FLAC: '无损音质 FLAC（文件较大）',
  ATMOS: '全景声 ATMOS（需要音源支持）',
  ATMOS2: '全景声 2.0 ATMOS2（需要音源支持）'
};
const SONG_ROW_GRID_CLASS = 'grid-cols-[56px_minmax(0,2fr)_minmax(96px,1fr)_minmax(96px,1fr)_72px_128px]';
const SELECT_CLASS = 'w-full rounded-[5px] px-2 py-1.5 bg-white text-black dark:bg-[#303030] dark:text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] outline-none focus:ring-4 focus:ring-blue-500/20';
const INPUT_CLASS = 'w-full rounded-[5px] px-2 py-1.5 bg-white text-black placeholder:text-black/35 dark:bg-[#303030] dark:text-white dark:placeholder:text-white/35 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] outline-none focus:ring-4 focus:ring-blue-500/20';
const SELECT_OPTION_CLASS = 'bg-white text-black dark:bg-[#303030] dark:text-white';
const ACTIVE_DOWNLOAD_STATUSES = new Set(['queued', 'downloading', 'paused']);
const DOWNLOAD_TASK_PAGE_SIZE = 8;

function formatDuration(seconds) {
  const s = Number.isFinite(seconds) ? seconds : 0;
  const m = Math.floor(s / 60);
  const sec = `${Math.floor(s % 60)}`.padStart(2, '0');
  return `${m}:${sec}`;
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (!n) return '未知大小';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function qualityLabel(quality) {
  return QUALITY_LABELS[quality] || quality || '';
}

function toRemoteTrack(song, fallbackProvider = 'qqmusic') {
  if (!song) return null;
  if (song.sourceType === 'remote') return song;
  const provider = PROVIDERS[song.provider] ? song.provider : fallbackProvider;
  const artists = Array.isArray(song.artists) ? song.artists : [];
  const artist = artists.map((a) => a?.name).filter(Boolean).join(' / ') || song.artist || song.artistName || 'Unknown Artist';
  const remoteId = `${song.id || song.songId || song.songid || song.mid || ''}`;
  const album = song.album && typeof song.album === 'object' ? song.album : {};
  const rawDuration = Number(song.duration ?? song.durationSeconds ?? song.duration_seconds ?? 0);
  return {
    id: `remote:${provider}:${remoteId}`,
    sourceType: 'remote',
    provider,
    providerLabel: PROVIDERS[provider].label,
    providerShortLabel: PROVIDERS[provider].shortLabel,
    remoteId,
    title: song.title || song.name || song.songName || 'Unknown Title',
    subtitle: song.subtitle || song.subTitle || '',
    artist,
    album: album.name || (typeof song.album === 'string' ? song.album : '') || song.albumName || 'Unknown Album',
    albumPicUrl: album.picUrl || album.pic || song.albumPicUrl || song.picUrl || '',
    duration: rawDuration ? Math.round(rawDuration > 1000 ? rawDuration / 1000 : rawDuration) : 0,
    publishTime: song.publishTime || song.publishDate || null,
    downloadable: true,
    raw: song
  };
}

function ipcErrorMessage(result, fallback = '操作失败') {
  return result?.error?.message || fallback;
}

function remoteTaskKey(track) {
  return `${track?.provider || 'qqmusic'}:${track?.remoteId || track?.songId || ''}`;
}

function downloadStatusLabel(status) {
  const map = {
    queued: '排队中',
    downloading: '下载中',
    paused: '已暂停',
    completed: '已完成',
    failed: '失败',
    canceled: '已取消'
  };
  return map[status] || status || '未知';
}

function downloadStatusDotClass(status) {
  const map = {
    queued: 'bg-black/30 dark:bg-white/35',
    downloading: 'bg-[#007aff]',
    paused: 'bg-amber-500',
    completed: 'bg-emerald-500',
    failed: 'bg-red-500',
    canceled: 'bg-black/20 dark:bg-white/25'
  };
  return map[status] || 'bg-black/25 dark:bg-white/30';
}

function parseLyrics(raw) {
  if (!raw) return [];
  const text = `${raw}`.replace(/^\uFEFF/, '');
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      const matches = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      if (!matches.length) return [];
      const content = line.replace(/\[(\d+):(\d+(?:\.\d+)?)\]/g, '').trim();
      return matches.map((m) => {
        const time = Number(m[1]) * 60 + Number(m[2]);
        return { time, text: content };
      });
    })
    .sort((a, b) => a.time - b.time);
}

function nextSort(prev, key) {
  if (prev.key !== key) return { key, dir: 'asc' };
  return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
}

function normalizeSearchText(value) {
  return `${value || ''}`
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSearchTokens(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  return normalized.split(' ').map((x) => x.trim()).filter(Boolean);
}

function trackMatchesTokens(track, tokens) {
  if (!tokens.length) return true;
  const searchable = `${normalizeSearchText(track?.title)} ${normalizeSearchText(track?.artist)}`.trim();
  if (!searchable) return false;
  return tokens.every((token) => searchable.includes(token));
}

function dedupeTracksById(tracks) {
  const map = new Map();
  for (const t of tracks || []) {
    if (!t?.id) continue;
    if (!map.has(t.id)) map.set(t.id, t);
  }
  return [...map.values()];
}

function cyclePlayMode(mode) {
  if (mode === 'sequence') return 'random';
  if (mode === 'random') return 'loop';
  return 'sequence';
}

const MIXED_COLLATOR = new Intl.Collator(['zh-Hans', 'en'], {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true
});

function toMixedSortKey(value) {
  const text = normalizeSearchText(value);
  if (!text) return '';
  const py = pinyin(text, { toneType: 'none' });
  return normalizeSearchText(py || text);
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function formatGeneratedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function topMapEntries(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([, value]) => value);
}

function lyricSnippetFromText(raw) {
  return `${raw || ''}`
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\[[^\]]+\]/g, '').replace(/^[\w-]+:\s*/i, '').trim())
    .filter((line) => line && !/^作词|^作曲|^编曲|^制作人/i.test(line))
    .slice(0, 10)
    .join('\n')
    .slice(0, 500);
}

function buildListeningSummary(data, tracks) {
  const trackMap = new Map((tracks || []).map((track) => [track.id, track]));
  const history = (data.listeningHistory || []).filter((item) => item?.trackId && trackMap.has(item.trackId));
  const meaningful = history.filter((item) => item.completed || Number(item.listenedSeconds) >= 30 || Number(item.listenRatio) >= 0.5);
  const addWeighted = (map, key, label, extra, weight) => {
    if (!key || !label) return;
    const current = map.get(key) || { label, score: 0, count: 0, ...extra };
    current.score += weight;
    current.count += 1;
    map.set(key, current);
  };
  const artistMap = new Map();
  const albumMap = new Map();
  const trackScoreMap = new Map();
  const now = Date.now();
  for (const item of meaningful) {
    const track = trackMap.get(item.trackId) || item;
    const playedAt = Date.parse(item.playedAt || '') || 0;
    const daysAgo = playedAt ? Math.max(0, (now - playedAt) / 86400000) : 365;
    const recency = daysAgo <= 7 ? 1.7 : daysAgo <= 30 ? 1.25 : 1;
    const completion = item.completed ? 1.35 : clampNumber(item.listenRatio, 0, 1, 0.5);
    const weight = recency * Math.max(0.4, completion);
    addWeighted(artistMap, normalizeSearchText(track.artist), track.artist, { artist: track.artist }, weight);
    addWeighted(albumMap, `${normalizeSearchText(track.artist)}|${normalizeSearchText(track.album)}`, track.album, { album: track.album, artist: track.artist }, weight);
    addWeighted(trackScoreMap, item.trackId, track.title, { trackId: item.trackId, title: track.title, artist: track.artist, album: track.album }, weight);
  }
  const likedTracks = (tracks || []).filter((track) => track.liked).map((track) => ({ trackId: track.id, title: track.title, artist: track.artist, album: track.album })).slice(0, 80);
  const playlistSignals = (data.playlists || []).map((playlist) => ({
    id: playlist.id,
    name: playlist.name,
    trackCount: (playlist.trackIds || []).filter((id) => trackMap.has(id)).length,
    sampleTracks: (playlist.trackIds || []).filter((id) => trackMap.has(id)).slice(0, 10).map((id) => {
      const track = trackMap.get(id);
      return { trackId: id, title: track.title, artist: track.artist };
    })
  })).filter((playlist) => playlist.trackCount > 0);
  const recentListens = meaningful.slice(-40).reverse().map((item) => {
    const track = trackMap.get(item.trackId) || item;
    return {
      trackId: item.trackId,
      title: track.title || item.title,
      artist: track.artist || item.artist,
      listenRatio: clampNumber(item.listenRatio, 0, 1, 0),
      listenedSeconds: Math.round(Number(item.listenedSeconds) || 0),
      completed: !!item.completed,
      playedAt: item.playedAt || ''
    };
  });
  const highCompletionTracks = meaningful
    .filter((item) => item.completed || Number(item.listenRatio) >= 0.82)
    .slice(-60)
    .reverse()
    .map((item) => trackMap.get(item.trackId))
    .filter(Boolean)
    .filter((track, idx, arr) => arr.findIndex((item) => item.id === track.id) === idx)
    .slice(0, 20)
    .map((track) => ({ trackId: track.id, title: track.title, artist: track.artist }));
  const lowEngagementTracks = history
    .filter((item) => !item.completed && Number(item.listenRatio) < 0.45)
    .slice(-40)
    .reverse()
    .map((item) => trackMap.get(item.trackId))
    .filter(Boolean)
    .filter((track, idx, arr) => arr.findIndex((item) => item.id === track.id) === idx)
    .slice(0, 12)
    .map((track) => ({ trackId: track.id, title: track.title, artist: track.artist }));

  return {
    totalMeaningfulListens: meaningful.length,
    recentListens,
    topArtists: topMapEntries(artistMap, 10),
    topAlbums: topMapEntries(albumMap, 8),
    topTracks: topMapEntries(trackScoreMap, 16),
    likedTracks,
    playlistSignals,
    highCompletionTracks,
    lowEngagementTracks,
    recentMomentum: topMapEntries(artistMap, 5).map((item) => item.artist || item.label),
    librarySize: (tracks || []).length
  };
}

function buildDiscoverStats(data, tracks, listeningSummary) {
  const likedCount = (tracks || []).filter((track) => track.liked).length;
  const lyricCount = (tracks || []).filter((track) => !!track.lyricPath).length;
  const cloudMetaCount = (tracks || []).filter((track) => track.metadataSource === 'cloud' || track.cloudMatch).length;
  const playlistCount = (data.playlists || []).filter((playlist) => playlist.id !== 'favorites' && (playlist.trackIds || []).length).length;
  return {
    likedCount,
    lyricCount,
    cloudMetaCount,
    playlistCount,
    meaningfulListens: listeningSummary.totalMeaningfulListens || 0,
    topArtists: (listeningSummary.topArtists || []).slice(0, 3).map((item) => item.artist || item.label).filter(Boolean),
    topTracks: (listeningSummary.topTracks || []).slice(0, 3).map((item) => `${item.title} · ${item.artist}`).filter(Boolean)
  };
}

async function buildRecommendationLibrary({ tracks, playlists, history, aiSettings, api }) {
  const playlistNamesByTrack = new Map();
  for (const playlist of playlists || []) {
    for (const id of playlist.trackIds || []) {
      const names = playlistNamesByTrack.get(id) || [];
      names.push(playlist.name);
      playlistNamesByTrack.set(id, names);
    }
  }
  const historyStats = new Map();
  for (const item of history || []) {
    if (!item?.trackId) continue;
    const current = historyStats.get(item.trackId) || { count: 0, completed: 0, lastPlayedAt: '' };
    current.count += 1;
    if (item.completed || Number(item.listenRatio) >= 0.8) current.completed += 1;
    if (`${item.playedAt || ''}` > current.lastPlayedAt) current.lastPlayedAt = item.playedAt || '';
    historyStats.set(item.trackId, current);
  }
  const scored = (tracks || []).map((track, idx) => {
    const stat = historyStats.get(track.id) || {};
    const playlistNames = playlistNamesByTrack.get(track.id) || [];
    const recent = stat.lastPlayedAt && Date.now() - (Date.parse(stat.lastPlayedAt) || 0) < 1000 * 60 * 60 * 24 * 30;
    const score =
      (track.liked ? 12 : 0) +
      playlistNames.length * 5 +
      (stat.count || 0) * 3 +
      (stat.completed || 0) * 4 +
      (recent ? 6 : 0) +
      (track.cloudMatch ? 2 : 0) +
      (track.lyricPath ? 1 : 0);
    return { track, playlistNames, stat, score, idx };
  }).sort((a, b) => b.score - a.score || a.idx - b.idx);
  const selected = scored.slice(0, Math.min(scored.length, 180));
  const lyricTargets = new Set(aiSettings.includeLyricSnippets === false ? [] : selected.slice(0, 30).map((item) => item.track.id));
  return Promise.all(selected.map(async ({ track, playlistNames }) => {
    let lyricSnippet = '';
    if (lyricTargets.has(track.id) && track.lyricPath && api?.readTextFile) {
      try {
        lyricSnippet = lyricSnippetFromText(await api.readTextFile(track.lyricPath));
      } catch (_) {
        lyricSnippet = '';
      }
    }
    return {
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: Math.round(Number(track.duration) || 0),
      liked: !!track.liked,
      playlists: playlistNames,
      metadataSource: track.metadataSource || '',
      cloudMatch: track.cloudMatch ? {
        provider: track.cloudMatch.provider || '',
        remoteId: track.cloudMatch.remoteId || '',
        title: track.cloudMatch.title || '',
        artist: track.cloudMatch.artist || '',
        album: track.cloudMatch.album || '',
        score: Number(track.cloudMatch.score) || 0
      } : null,
      hasLyric: !!track.lyricPath,
      lyricSnippet
    };
  }));
}

function App() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [loaded, setLoaded] = useState(false);
  const [dark, setDark] = useState(true);
  const [view, setView] = useState('songs');
  const [playlistId, setPlaylistId] = useState('all');
  const [sort, setSort] = useState({ key: 'title', dir: 'asc' });
  const [query, setQuery] = useState('');
  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [mini, setMini] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [lyricsRaw, setLyricsRaw] = useState('');
  const [pendingQueue, setPendingQueue] = useState([]);
  const [trackDuration, setTrackDuration] = useState(0);
  const [playError, setPlayError] = useState('');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [playlistToDelete, setPlaylistToDelete] = useState(null);
  const [bgDataUrl, setBgDataUrl] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playerPanelOpen, setPlayerPanelOpen] = useState(false);
  const [currentCoverDataUrl, setCurrentCoverDataUrl] = useState('');
  const [lyricDebugPath, setLyricDebugPath] = useState('');
  const [encodingMenuOpen, setEncodingMenuOpen] = useState(false);
  const [closeBehaviorMenuOpen, setCloseBehaviorMenuOpen] = useState(false);
  const [lyricOffsetSec, setLyricOffsetSec] = useState(0);
  const [lyricAdjustMode, setLyricAdjustMode] = useState(false);
  const [holdLyricIdx, setHoldLyricIdx] = useState(null);
  const [lyricLines, setLyricLines] = useState([]);
  const [lyricAlignNotice, setLyricAlignNotice] = useState('');
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [cloudSearchBusy, setCloudSearchBusy] = useState(false);
  const [cloudSearchError, setCloudSearchError] = useState('');
  const [cloudResults, setCloudResults] = useState([]);
  const [cloudDetail, setCloudDetail] = useState({ open: false, track: null, busy: false, error: '', detail: null, lyric: null, url: null, coverDataUrl: '', quality: '' });
  const [downloadTasks, setDownloadTasks] = useState([]);
  const [downloadPanelOpen, setDownloadPanelOpen] = useState(false);
  const [downloadTaskPage, setDownloadTaskPage] = useState(1);
  const [cloudTestMessage, setCloudTestMessage] = useState('');
  const [aiTestMessage, setAiTestMessage] = useState('');
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [discoverError, setDiscoverError] = useState('');
  const [discoverResult, setDiscoverResult] = useState(DEFAULT_DATA.discoverCache);
  const [scrapeBusyId, setScrapeBusyId] = useState('');
  const [scrapeMessage, setScrapeMessage] = useState('');

  const audioRef = useRef(null);
  const panelLyricsScrollRef = useRef(null);
  const sourceSwitchingRef = useRef(false);
  const cloudQuerySeqRef = useRef(0);
  const cloudDetailSeqRef = useRef(0);
  const discoverSeqRef = useRef(0);
  const listenSessionRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    const load = async () => {
      if (!electronAPI) {
        setLoaded(true);
        return;
      }
      const saved = await electronAPI.loadData();
      setData(saved);
      setLoaded(true);
    };
    load();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setDiscoverResult({ ...DEFAULT_DATA.discoverCache, ...(data.discoverCache || {}) });
  }, [loaded, data.discoverCache?.generatedAt]);

  useEffect(() => {
    if (!loaded || !electronAPI) return;
    const timer = setTimeout(() => {
      electronAPI.saveData(data);
    }, 250);
    return () => clearTimeout(timer);
  }, [data, loaded]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    const close = () => setEncodingMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    const close = () => setCloseBehaviorMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    let canceled = false;
    const loadBg = async () => {
      const bgPath = data.settings?.backgroundImagePath;
      if (!bgPath || !electronAPI?.readImageDataUrl) {
        setBgDataUrl('');
        return;
      }
      const dataUrl = await electronAPI.readImageDataUrl(bgPath);
      if (!canceled) setBgDataUrl(dataUrl || '');
    };
    loadBg();
    return () => {
      canceled = true;
    };
  }, [data.settings?.backgroundImagePath]);

  const uniqueTracks = useMemo(() => dedupeTracksById(data.tracks), [data.tracks]);

  const baseTracks = useMemo(() => {
    if (playlistId === 'all') return uniqueTracks;
    const p = data.playlists.find((x) => x.id === playlistId);
    if (!p) return uniqueTracks;
    const ids = new Set(p.trackIds);
    return uniqueTracks.filter((t) => ids.has(t.id));
  }, [uniqueTracks, data.playlists, playlistId]);

  const filteredTracks = useMemo(() => {
    const tokens = splitSearchTokens(query);
    if (!tokens.length) return baseTracks;
    return baseTracks.filter((t) => trackMatchesTokens(t, tokens));
  }, [baseTracks, query]);

  const queryTokens = useMemo(() => splitSearchTokens(query), [query]);

  const sortedTracks = useMemo(() => {
    const arr = [...filteredTracks];
    const dir = sort.dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      const ak = toMixedSortKey(av);
      const bk = toMixedSortKey(bv);
      const primary = MIXED_COLLATOR.compare(ak, bk) * dir;
      if (primary !== 0) return primary;
      return MIXED_COLLATOR.compare(`${av ?? ''}`, `${bv ?? ''}`) * dir;
    });
    return arr;
  }, [filteredTracks, sort]);

  const trackMap = useMemo(() => new Map(uniqueTracks.map((t) => [t.id, t])), [uniqueTracks]);
  const currentTrack = currentTrackId ? trackMap.get(currentTrackId) : null;
  const playMode = data.settings.playMode;
  const lyricsEnabled = !!currentTrack && isPlaying && data.settings.showLyrics && (!mini || data.settings.minimizedShowLyrics);
  const floatingLyricsEnabled = lyricsEnabled && !playerPanelOpen;
  const bgBlur = Number.isFinite(Number(data.settings.backgroundBlur)) ? Number(data.settings.backgroundBlur) : 8;
  const hasPlaybackBackgroundImage = !!(bgDataUrl || currentCoverDataUrl);
  const appShellSurfaceClass = bgDataUrl ? 'bg-white/80 dark:bg-[#282828]/70 backdrop-blur-3xl' : 'bg-[#f4f6fb] dark:bg-[#101218]';
  const playerPanelSurfaceClass = hasPlaybackBackgroundImage ? 'bg-white/78 dark:bg-[#1f1f1f]/86 backdrop-blur-3xl' : 'bg-[#f7f8fb] dark:bg-[#1d2026]';
  const volume = Math.max(0, Math.min(1, Number.isFinite(Number(data.settings.volume)) ? Number(data.settings.volume) : 0.8));
  const cloudSettings = { ...DEFAULT_DATA.settings.cloud, ...(data.settings.cloud || {}) };
  const aiSettings = { ...DEFAULT_DATA.settings.ai, ...(data.settings.ai || {}) };
  const downloadSettings = { ...DEFAULT_DATA.settings.download, ...(data.settings.download || {}) };
  const cloudConfigured = !!(cloudSettings.enabled && cloudSettings.baseUrl && cloudSettings.apiKey);
  const aiConfigured = !!(aiSettings.enabled && aiSettings.baseUrl && aiSettings.apiKey && aiSettings.model);
  const listeningSummary = useMemo(() => buildListeningSummary(data, uniqueTracks), [data.listeningHistory, data.playlists, uniqueTracks]);
  const discoverStats = useMemo(() => buildDiscoverStats(data, uniqueTracks, listeningSummary), [data.playlists, uniqueTracks, listeningSummary]);
  const lastDiscoverGeneratedAt = formatGeneratedAt(discoverResult?.generatedAt);
  const lyricEncoding = currentTrackId ? (data.settings.lyricEncodingMap?.[currentTrackId] || 'auto') : 'auto';
  const adjustedLyricTime = time + lyricOffsetSec;
  const encodingLabelMap = {
    auto: '编码: 自动',
    'utf-8': 'UTF-8',
    gb18030: 'GB18030',
    gbk: 'GBK',
    shift_jis: 'Shift_JIS',
    'euc-kr': 'EUC-KR',
    'utf-16le': 'UTF-16LE',
    'utf-16be': 'UTF-16BE'
  };
  const encodingOptions = Object.entries(encodingLabelMap);

  const upsertDownloadTask = (task) => {
    if (!task?.id) return;
    setDownloadTasks((prev) => {
      const map = new Map(prev.map((item) => [item.id, item]));
      map.set(task.id, { ...(map.get(task.id) || {}), ...task });
      return [...map.values()].sort((a, b) => `${b.createdAt || ''}`.localeCompare(`${a.createdAt || ''}`));
    });
  };

  const mergeImportedTrack = (track) => {
    if (!track?.id) return;
    setData((prev) => {
      const existing = prev.tracks.find((t) => t.id === track.id);
      const tracks = existing
        ? prev.tracks.map((t) => (t.id === track.id ? { ...track, liked: t.liked } : t))
        : [...prev.tracks, track];
      return { ...prev, tracks };
    });
  };

  useEffect(() => {
    const q = query.trim();
    if (!q || view !== 'songs' || !cloudConfigured || !electronAPI?.searchCloudSongs) {
      cloudQuerySeqRef.current += 1;
      setCloudSearchBusy(false);
      setCloudSearchError('');
      setCloudResults([]);
      return;
    }
    const seq = cloudQuerySeqRef.current + 1;
    cloudQuerySeqRef.current = seq;
    setCloudSearchBusy(true);
    setCloudSearchError('');
    const timer = setTimeout(async () => {
      const result = await electronAPI.searchCloudSongs({
        query: q,
        page: 1,
        pageSize: cloudSettings.pageSize,
        provider: cloudSettings.activeProvider,
        providers: cloudSettings.enabledProviders,
        searchMode: cloudSettings.searchMode,
        config: cloudSettings
      });
      if (cloudQuerySeqRef.current !== seq) return;
      if (result?.ok) {
        setCloudResults((result.data?.items || []).map((item) => toRemoteTrack(item, item.provider)).filter(Boolean));
        const providerError = result.data?.errors?.[0]?.error?.message || '';
        setCloudSearchError(providerError && !result.data?.items?.length ? providerError : '');
      } else {
        setCloudResults([]);
        setCloudSearchError(ipcErrorMessage(result, '云端搜索失败'));
      }
      setCloudSearchBusy(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, view, cloudConfigured, cloudSettings.pageSize, cloudSettings.activeProvider, cloudSettings.searchMode, (cloudSettings.enabledProviders || []).join('|')]);

  useEffect(() => {
    if (!electronAPI?.getCloudDownloadTasks) return;
    let canceled = false;
    const loadTasks = async () => {
      const result = await electronAPI.getCloudDownloadTasks();
      if (!canceled && result?.ok) setDownloadTasks(result.data || []);
    };
    loadTasks();
    const offProgress = electronAPI.onCloudDownloadProgress?.((task) => upsertDownloadTask(task));
    const offDone = electronAPI.onCloudDownloadDone?.((payload) => {
      if (payload?.task) upsertDownloadTask(payload.task);
      if (payload?.track) mergeImportedTrack(payload.track);
      if (payload?.error?.message) setCloudSearchError(payload.error.message);
    });
    return () => {
      canceled = true;
      if (typeof offProgress === 'function') offProgress();
      if (typeof offDone === 'function') offDone();
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    const loadSource = async () => {
      const audio = audioRef.current;
      if (!audio || !currentTrack || !electronAPI?.readAudioBuffer) return;
      sourceSwitchingRef.current = true;
      try {
        const raw = await electronAPI.readAudioBuffer(currentTrack.path);
        if (canceled) return;
        if (!raw) {
          setPlayError('该歌曲无法读取或解码');
          setIsPlaying(false);
          return;
        }
        const payload = raw?.data ?? raw;
        const mime = raw?.kind === 'wav-transcoded' ? 'audio/wav' : (MIME_BY_EXT[currentTrack.ext] || 'audio/mpeg');
        const bytes = payload?.type === 'Buffer' && Array.isArray(payload.data)
          ? new Uint8Array(payload.data)
          : payload instanceof Uint8Array
            ? payload
            : new Uint8Array(payload);
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
        const prevUrl = audio.dataset.blobUrl;
        if (prevUrl) URL.revokeObjectURL(prevUrl);
        audio.dataset.blobUrl = blobUrl;
        audio.pause();
        audio.src = blobUrl;
        audio.load();
        audio.volume = volume;
        audio.currentTime = 0;
        setTime(0);
        setTrackDuration(currentTrack.duration || 0);
        setPlayError(
          raw?.kind === 'wav-transcoded'
            ? 'WMA 已自动转码播放'
            : raw?.kind === 'wma-raw'
              ? '检测到 WMA 原始流，若无法播放请安装 ffmpeg'
              : ''
        );
        if (isPlaying) {
          await audio.play().catch(() => {
            setPlayError('当前格式暂不支持播放');
            setIsPlaying(false);
          });
        }
      } catch (_) {
        setPlayError('音频读取失败，请尝试重新扫描');
        setIsPlaying(false);
      } finally {
        sourceSwitchingRef.current = false;
      }
    };
    loadSource();
    return () => {
      const audio = audioRef.current;
      const prevUrl = audio?.dataset?.blobUrl;
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
        if (audio) delete audio.dataset.blobUrl;
      }
      sourceSwitchingRef.current = false;
      canceled = true;
    };
  }, [currentTrackId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (sourceSwitchingRef.current) return;
    if (isPlaying) {
      audio.play().catch(() => {
        setPlayError('当前格式暂不支持播放');
        setIsPlaying(false);
      });
    }
    else audio.pause();
  }, [isPlaying]);

  useEffect(() => {
    const loadLyrics = async () => {
      if (!currentTrack?.path || !electronAPI?.readTextFile) {
        setLyricsRaw('');
        setLyricLines([]);
        return;
      }
      const candidates = [];
      if (currentTrack.lyricPath) candidates.push(currentTrack.lyricPath);
      const dot = currentTrack.path.lastIndexOf('.');
      const base = dot > 0 ? currentTrack.path.slice(0, dot) : currentTrack.path;
      candidates.push(`${base}.lrc`, `${base}.LRC`, `${base}.txt`, `${base}.TXT`);
      const uniqueCandidates = [...new Set(candidates)];
      for (const lyricPath of uniqueCandidates) {
        const txt = electronAPI.readTextFileWithEncoding
          ? await electronAPI.readTextFileWithEncoding(lyricPath, lyricEncoding)
          : await electronAPI.readTextFile(lyricPath);
        if (!txt) continue;
        const parsed = parseLyrics(txt);
        if (parsed.length > 0) {
          setLyricDebugPath(lyricPath);
          setLyricsRaw(txt);
          setLyricLines(parsed);
          return;
        }
      }
      setLyricDebugPath(uniqueCandidates[0] || '');
      setLyricsRaw('');
      setLyricLines([]);
    };
    loadLyrics();
  }, [currentTrack?.lyricPath, currentTrack?.path, lyricEncoding]);

  useEffect(() => {
    setLyricOffsetSec(0);
    setLyricAdjustMode(false);
    setHoldLyricIdx(null);
    setLyricAlignNotice('');
  }, [currentTrackId]);

  useEffect(() => {
    let canceled = false;
    const loadCover = async () => {
      if (!currentTrack?.path || !electronAPI?.readTrackCoverDataUrl) {
        setCurrentCoverDataUrl('');
        return;
      }
      const dataUrl = await electronAPI.readTrackCoverDataUrl(currentTrack.path);
      if (!canceled) setCurrentCoverDataUrl(dataUrl || '');
    };
    loadCover();
    return () => {
      canceled = true;
    };
  }, [currentTrack?.path]);

  const activeLyricIdx = useMemo(() => {
    if (!lyricLines.length) return -1;
    for (let i = lyricLines.length - 1; i >= 0; i -= 1) {
      if (adjustedLyricTime >= lyricLines[i].time) return i;
    }
    return -1;
  }, [lyricLines, adjustedLyricTime]);

  const currentLyricLine = useMemo(() => {
    if (!lyricLines.length) return '';
    if (activeLyricIdx < 0) return lyricLines[0]?.text || '';
    return lyricLines[activeLyricIdx]?.text || '';
  }, [lyricLines, activeLyricIdx]);

  const heldLyricLineText = useMemo(() => {
    if (holdLyricIdx == null) return '';
    return lyricLines[holdLyricIdx]?.text || '';
  }, [holdLyricIdx, lyricLines]);

  const nextLyricLine = useMemo(() => {
    if (!lyricLines.length) return '';
    if (activeLyricIdx < 0) return lyricLines[1]?.text || '';
    return lyricLines[activeLyricIdx + 1]?.text || '';
  }, [lyricLines, activeLyricIdx]);

  useEffect(() => {
    if (!electronAPI?.showLyricsWindow || !electronAPI?.hideLyricsWindow) return;
    if (floatingLyricsEnabled) electronAPI.showLyricsWindow();
    else electronAPI.hideLyricsWindow();
    return () => {
      electronAPI.hideLyricsWindow();
    };
  }, [floatingLyricsEnabled]);

  useEffect(() => {
    if (!electronAPI?.updateLyricsWindow) return;
    if (!floatingLyricsEnabled) return;
    electronAPI.updateLyricsWindow({
      hasLyrics: lyricLines.length > 0,
      current: currentLyricLine,
      next: nextLyricLine,
      dark,
      title: currentTrack?.title || '',
      artist: currentTrack?.artist || ''
    });
  }, [floatingLyricsEnabled, lyricLines.length, currentLyricLine, nextLyricLine, dark, currentTrack?.title, currentTrack?.artist]);

  useEffect(() => {
    if (!electronAPI?.setLyricsWindowOptions) return;
    electronAPI.setLyricsWindowOptions({
      locked: !!data.settings.lyricLocked,
      clickThrough: !!data.settings.lyricClickThrough
    });
  }, [data.settings.lyricLocked, data.settings.lyricClickThrough]);

  useEffect(() => {
    if (!electronAPI?.onLyricsMinimized) return;
    const off = electronAPI.onLyricsMinimized(() => {
      setData((prev) => ({ ...prev, settings: { ...prev.settings, showLyrics: false } }));
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  useEffect(() => {
    if (!electronAPI?.onCloseBehaviorUpdated) return;
    const off = electronAPI.onCloseBehaviorUpdated((behavior) => {
      setData((prev) => ({ ...prev, settings: { ...prev.settings, closeBehavior: behavior || 'ask' } }));
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  useEffect(() => {
    if (!electronAPI?.onWindowMaximizedChanged) return;
    const off = electronAPI.onWindowMaximizedChanged((maxed) => {
      setIsWindowMaximized(!!maxed);
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    const loadWindowMax = async () => {
      if (!electronAPI?.windowIsMaximized) return;
      const maxed = await electronAPI.windowIsMaximized();
      if (!canceled) setIsWindowMaximized(!!maxed);
    };
    loadWindowMax();
    return () => {
      canceled = true;
    };
  }, []);

  const finalizeListenSession = (completed = false) => {
    const session = listenSessionRef.current;
    if (!session) return;
    listenSessionRef.current = null;
    const audio = audioRef.current;
    const duration = Math.max(0, Number(session.duration || audio?.duration || 0));
    const reached = Math.max(0, Number(session.maxTimeReached || 0), Number(audio?.currentTime || 0));
    const fallbackSeconds = Math.max(0, Math.min(reached, duration || reached) - (Number(session.startPosition) || 0));
    const effectiveSeconds = Number(session.listenedSeconds) > 0 ? Number(session.listenedSeconds) : fallbackSeconds;
    const listenedSeconds = completed && duration ? duration : Math.min(effectiveSeconds, duration || effectiveSeconds);
    const listenRatio = duration ? Math.min(1, listenedSeconds / duration) : 0;
    const valid = completed || listenedSeconds >= 30 || listenRatio >= 0.5;
    if (!valid) return;
    const record = {
      id: `hist:${Date.now()}:${session.trackId}`,
      trackId: session.trackId,
      title: session.title,
      artist: session.artist,
      album: session.album,
      duration: Math.round(duration || session.duration || 0),
      playedAt: new Date().toISOString(),
      listenedSeconds: Math.round(listenedSeconds),
      listenRatio: Number(listenRatio.toFixed(3)),
      completed: !!completed,
      source: 'local'
    };
    setData((prev) => ({
      ...prev,
      listeningHistory: [...(prev.listeningHistory || []), record].slice(-800)
    }));
  };

  const startListenSession = (track) => {
    if (!track || track.sourceType === 'remote') return;
    const existing = listenSessionRef.current;
    if (existing?.trackId === track.id) return;
    if (existing) finalizeListenSession(false);
    const audio = audioRef.current;
    const current = Math.max(0, Number(audio?.currentTime || 0));
    listenSessionRef.current = {
      trackId: track.id,
      title: track.title || '',
      artist: track.artist || '',
      album: track.album || '',
      duration: Number(audio?.duration || track.duration || 0),
      startPosition: current,
      lastTime: current,
      listenedSeconds: 0,
      maxTimeReached: current
    };
  };

  const updateListenSession = (audio) => {
    const session = listenSessionRef.current;
    const current = Math.max(0, Number(audio?.currentTime || 0));
    if (session) {
      const previous = Number(session.lastTime);
      const delta = current - (Number.isFinite(previous) ? previous : current);
      if (delta > 0 && delta <= 5) session.listenedSeconds = (Number(session.listenedSeconds) || 0) + delta;
      session.lastTime = current;
      session.maxTimeReached = Math.max(Number(session.maxTimeReached) || 0, current);
      session.duration = Math.max(Number(session.duration) || 0, Number(audio?.duration || 0), Number(currentTrack?.duration || 0));
    }
    setTime(current);
  };

  const clearListeningHistory = () => {
    listenSessionRef.current = null;
    setData((prev) => ({ ...prev, listeningHistory: [] }));
  };

  useEffect(() => () => finalizeListenSession(false), [currentTrackId]);

  useEffect(() => {
    const finalize = () => finalizeListenSession(false);
    window.addEventListener('beforeunload', finalize);
    return () => {
      window.removeEventListener('beforeunload', finalize);
      finalize();
    };
  }, []);

  const playTrack = (id) => {
    if (currentTrackId && currentTrackId !== id) finalizeListenSession(false);
    setCurrentTrackId(id);
    setLyricAdjustMode(false);
    setHoldLyricIdx(null);
    setLyricOffsetSec(0);
    setIsPlaying(true);
  };

  const playNext = () => {
    const activePlayList = view === 'folders' ? groupedByFolder.flatMap(([, tracks]) => tracks) : displayTracks;
    if (!activePlayList.length) return;
    if (pendingQueue.length > 0) {
      const [next, ...rest] = pendingQueue;
      setPendingQueue(rest);
      playTrack(next);
      return;
    }
    if (!currentTrackId) {
      playTrack(activePlayList[0].id);
      return;
    }
    if (playMode === 'random') {
      const pool = activePlayList.filter((t) => t.id !== currentTrackId);
      if (!pool.length) return;
      const next = pool[Math.floor(Math.random() * pool.length)];
      playTrack(next.id);
      return;
    }
    if (playMode === 'loop') {
      if (currentTrackId) {
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(() => setIsPlaying(false));
        } else {
          playTrack(currentTrackId);
        }
      }
      return;
    }
    const idx = activePlayList.findIndex((t) => t.id === currentTrackId);
    if (idx < 0) {
      playTrack(activePlayList[0].id);
      return;
    }
    if (idx >= activePlayList.length - 1) {
      setIsPlaying(false);
      return;
    }
    const next = activePlayList[idx + 1];
    playTrack(next.id);
  };

  const playPrev = () => {
    const activePlayList = view === 'folders' ? groupedByFolder.flatMap(([, tracks]) => tracks) : displayTracks;
    if (!activePlayList.length) return;
    if (!currentTrackId) {
      playTrack(activePlayList[0].id);
      return;
    }
    const idx = activePlayList.findIndex((t) => t.id === currentTrackId);
    if (idx < 0) {
      playTrack(activePlayList[0].id);
      return;
    }
    if (idx === 0) {
      if (playMode === 'loop') {
        playTrack(activePlayList[activePlayList.length - 1].id);
      }
      return;
    }
    const prev = activePlayList[idx - 1];
    playTrack(prev.id);
  };

  const toggleLike = (id) => {
    setData((prev) => {
      const tracks = prev.tracks.map((t) => (t.id === id ? { ...t, liked: !t.liked } : t));
      const likedSet = new Set(tracks.filter((t) => t.liked).map((t) => t.id));
      const playlists = prev.playlists.map((p) =>
        p.id === 'favorites' ? { ...p, trackIds: [...likedSet] } : p
      );
      return { ...prev, tracks, playlists };
    });
  };

  const addPlaylist = (nameInput) => {
    const name = `${nameInput || ''}`.trim();
    if (!name) return;
    const id = `playlist-${Date.now()}`;
    setData((prev) => ({ ...prev, playlists: [...prev.playlists, { id, name: name.trim(), fixed: false, trackIds: [] }] }));
    setNewPlaylistName('');
    setCreatingPlaylist(false);
  };

  const removePlaylist = (id) => {
    const target = data.playlists.find((p) => p.id === id);
    if (!target) return;
    setPlaylistToDelete(target);
  };

  const confirmRemovePlaylist = () => {
    if (!playlistToDelete) return;
    const id = playlistToDelete.id;
    setData((prev) => ({ ...prev, playlists: prev.playlists.filter((p) => p.id !== id) }));
    if (playlistId === id) setPlaylistId('all');
    setPlaylistToDelete(null);
  };

  const pickBackgroundImage = async () => {
    if (!electronAPI?.pickBackgroundImage) return;
    const selected = await electronAPI.pickBackgroundImage();
    if (!selected) return;
    setData((prev) => ({
      ...prev,
      settings: { ...prev.settings, backgroundImagePath: selected }
    }));
  };

  const clearBackgroundImage = () => {
    setData((prev) => ({
      ...prev,
      settings: { ...prev.settings, backgroundImagePath: '' }
    }));
  };

  const updateCloudSettings = (patch) => {
    setCloudTestMessage('');
    setData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        cloud: {
          ...DEFAULT_DATA.settings.cloud,
          ...(prev.settings.cloud || {}),
          ...patch
        }
      }
    }));
  };

  const updateAiSettings = (patch) => {
    setAiTestMessage('');
    setDiscoverError('');
    setData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ai: {
          ...DEFAULT_DATA.settings.ai,
          ...(prev.settings.ai || {}),
          ...patch
        }
      }
    }));
  };

  const updateDownloadSettings = (patch) => {
    setData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        download: {
          ...DEFAULT_DATA.settings.download,
          ...(prev.settings.download || {}),
          ...patch
        }
      }
    }));
  };

  const toggleCloudProvider = (provider) => {
    const current = new Set(cloudSettings.enabledProviders || []);
    if (current.has(provider)) current.delete(provider);
    else current.add(provider);
    const next = [...current];
    updateCloudSettings({
      enabledProviders: next.length ? next : [provider],
      activeProvider: current.has(cloudSettings.activeProvider) ? cloudSettings.activeProvider : (next[0] || provider)
    });
  };

  const pickDownloadDirectory = async () => {
    if (!electronAPI?.pickDownloadDirectory) return;
    const selected = await electronAPI.pickDownloadDirectory();
    if (selected) updateDownloadSettings({ directory: selected });
  };

  const fillDefaultDownloadDirectory = async () => {
    if (!electronAPI?.getDefaultDownloadDirectory) return;
    const directory = await electronAPI.getDefaultDownloadDirectory();
    if (directory) updateDownloadSettings({ directory });
  };

  const testCloudConnection = async () => {
    if (!electronAPI?.testCloudConnection) return;
    setCloudTestMessage('测试连接中...');
    const result = await electronAPI.testCloudConnection({
      baseUrl: cloudSettings.baseUrl,
      apiKey: cloudSettings.apiKey,
      enabled: true
    });
    setCloudTestMessage(result?.ok ? `连接成功 · ${result.data?.latencyMs || 0}ms` : ipcErrorMessage(result, '连接失败'));
  };

  const testAiConnection = async () => {
    if (!electronAPI?.testAiConnection) return;
    setAiTestMessage('测试模型中...');
    const result = await electronAPI.testAiConnection({
      ...aiSettings,
      enabled: true
    });
    setAiTestMessage(result?.ok ? `连接成功 · ${result.data?.latencyMs || 0}ms` : ipcErrorMessage(result, '连接失败'));
  };

  const loadCloudSongUrlForDetail = async (track, quality) => {
    if (!track || !electronAPI?.getCloudSongUrl) return null;
    const result = await electronAPI.getCloudSongUrl({ provider: track.provider, songId: track.remoteId, quality, config: cloudSettings });
    if (!result?.ok) {
      setCloudDetail((prev) => ({ ...prev, error: ipcErrorMessage(result, '获取下载信息失败'), url: null }));
      return null;
    }
    setCloudDetail((prev) => ({ ...prev, url: result.data, error: prev.error === '获取下载信息失败' ? '' : prev.error }));
    return result.data;
  };

  const openCloudDetail = async (inputTrack) => {
    const track = toRemoteTrack(inputTrack, inputTrack?.provider);
    if (!track) return;
    const seq = cloudDetailSeqRef.current + 1;
    cloudDetailSeqRef.current = seq;
    const quality = downloadSettings.quality || 'MP3_320';
    setCloudDetail({ open: true, track, busy: true, error: '', detail: null, lyric: null, url: null, coverDataUrl: '', quality });
    const [detailResult, lyricResult, urlResult] = await Promise.all([
      electronAPI?.getCloudSongDetail?.({ provider: track.provider, songId: track.remoteId, config: cloudSettings }),
      electronAPI?.getCloudSongLyric?.({ provider: track.provider, songId: track.remoteId, config: cloudSettings }),
      electronAPI?.getCloudSongUrl?.({ provider: track.provider, songId: track.remoteId, quality, config: cloudSettings })
    ]);
    if (cloudDetailSeqRef.current !== seq) return;
    const detailTrack = detailResult?.ok ? (detailResult.data?.track || track) : track;
    const coverUrl = detailTrack.albumPicUrl || track.albumPicUrl;
    let coverDataUrl = '';
    if (coverUrl && electronAPI?.readCloudImageDataUrl) {
      const coverResult = await electronAPI.readCloudImageDataUrl(coverUrl);
      if (cloudDetailSeqRef.current !== seq) return;
      if (coverResult?.ok) coverDataUrl = coverResult.data || '';
    }
    const errors = [detailResult, lyricResult, urlResult]
      .filter((result) => result && !result.ok)
      .map((result) => result.error?.message)
      .filter(Boolean);
    setCloudDetail({
      open: true,
      track: detailTrack,
      busy: false,
      error: errors[0] || '',
      detail: detailResult?.ok ? detailResult.data?.song : null,
      lyric: lyricResult?.ok ? lyricResult.data : null,
      url: urlResult?.ok ? urlResult.data : null,
      coverDataUrl,
      quality
    });
  };

  const startCloudDownload = async (inputTrack, quality) => {
    const track = toRemoteTrack(inputTrack, inputTrack?.provider);
    if (!track || !electronAPI?.downloadCloudSong) return;
    if (!cloudConfigured) {
      setCloudSearchError('请先在设置中启用并配置云音乐');
      return;
    }
    if (activeDownloadKeys.has(remoteTaskKey(track)) || completedDownloadKeys.has(remoteTaskKey(track))) return;
    const result = await electronAPI.downloadCloudSong({
      provider: track.provider,
      songId: track.remoteId,
      title: track.title,
      artist: track.artist,
      album: track.album,
      quality: quality || downloadSettings.quality || 'MP3_320',
      config: cloudSettings
    });
    if (result?.ok) {
      upsertDownloadTask(result.data);
      setCloudSearchError('');
      setCloudDetail((prev) => ({ ...prev, error: '' }));
    } else {
      const message = ipcErrorMessage(result, '下载任务创建失败');
      setCloudSearchError(message);
      setCloudDetail((prev) => ({ ...prev, error: message }));
    }
  };

  const pauseDownloadTask = async (taskId) => {
    const result = await electronAPI?.pauseCloudDownload?.(taskId);
    if (result?.ok) upsertDownloadTask(result.data);
  };

  const resumeDownloadTask = async (taskId) => {
    const result = await electronAPI?.resumeCloudDownload?.(taskId);
    if (result?.ok) upsertDownloadTask(result.data);
  };

  const cancelDownloadTask = async (taskId) => {
    const result = await electronAPI?.cancelCloudDownload?.(taskId);
    if (result?.ok) upsertDownloadTask(result.data);
  };

  const deleteDownloadTask = async (taskId) => {
    const result = await electronAPI?.deleteCloudDownloadTask?.(taskId);
    if (result?.ok) {
      setDownloadTasks((prev) => prev.filter((task) => task.id !== taskId));
      setDownloadTaskPage((page) => Math.max(1, page));
    }
  };

  const reloadLyricsFromTrack = async (track) => {
    if (!track?.lyricPath || currentTrackId !== track.id) return;
    const txt = electronAPI?.readTextFileWithEncoding
      ? await electronAPI.readTextFileWithEncoding(track.lyricPath, lyricEncoding)
      : await electronAPI?.readTextFile?.(track.lyricPath);
    setLyricDebugPath(track.lyricPath);
    setLyricsRaw(txt || '');
    setLyricLines(parseLyrics(txt || ''));
  };

  const scrapeLocalTrack = async (track, options = {}) => {
    if (!track || track.sourceType === 'remote' || !electronAPI?.scrapeCloudTrack) return;
    if (!cloudConfigured) {
      setScrapeMessage('请先在设置中启用并配置云音乐');
      return;
    }
    setScrapeBusyId(track.id);
    setScrapeMessage(`正在匹配「${track.title}」...`);
    const result = await electronAPI.scrapeCloudTrack({
      trackId: track.id,
      path: track.path,
      config: cloudSettings,
      overwriteMetadata: options.overwriteMetadata ?? cloudSettings.scrapeOverwriteMetadata !== false,
      downloadLyric: options.downloadLyric ?? cloudSettings.scrapeDownloadLyric !== false,
      overwriteLyric: options.overwriteLyric ?? true
    });
    if (result?.ok) {
      mergeImportedTrack(result.data.track);
      await reloadLyricsFromTrack(result.data.track);
      const parts = [];
      if (result.data.updatedFields?.length) parts.push('歌曲信息已更新');
      if (result.data.lyricDownloaded) parts.push('歌词已下载');
      if (!parts.length) parts.push('已匹配到云端歌曲');
      setScrapeMessage(`${parts.join('，')} · 匹配度 ${Math.round(result.data.score || 0)}`);
      setPlayError('');
    } else {
      const message = ipcErrorMessage(result, '自动匹配失败');
      setScrapeMessage(message);
      setPlayError(message);
    }
    setScrapeBusyId('');
  };

  const scrapeLibrary = async (options = {}) => {
    if (!electronAPI?.scrapeCloudLibrary) return;
    if (!cloudConfigured) {
      setScrapeMessage('请先在设置中启用并配置云音乐');
      return;
    }
    setScrapeBusyId('library');
    setScrapeMessage(options.onlyMissingLyric ? '正在为缺失歌词的歌曲自动匹配...' : '正在自动匹配曲库歌曲信息和歌词...');
    const result = await electronAPI.scrapeCloudLibrary({
      config: cloudSettings,
      overwriteMetadata: cloudSettings.scrapeOverwriteMetadata !== false,
      downloadLyric: cloudSettings.scrapeDownloadLyric !== false,
      overwriteLyric: options.overwriteLyric ?? false,
      onlyMissingLyric: !!options.onlyMissingLyric
    });
    if (result?.ok) {
      setData((prev) => ({ ...prev, tracks: result.data.tracks || prev.tracks }));
      const currentResult = result.data.results?.find((item) => item.track?.id === currentTrackId);
      if (currentResult?.track) await reloadLyricsFromTrack(currentResult.track);
      setScrapeMessage(`自动匹配完成：成功 ${result.data.updated || 0} 首，失败 ${result.data.failed || 0} 首`);
      setPlayError('');
    } else {
      const message = ipcErrorMessage(result, '曲库自动匹配失败');
      setScrapeMessage(message);
      setPlayError(message);
    }
    setScrapeBusyId('');
  };

  const refreshDiscoverRecommendations = async () => {
    if (!electronAPI?.recommendDiscoverSongs) {
      setDiscoverError('当前运行环境不支持 AI 推荐');
      return;
    }
    if (!aiConfigured) {
      setDiscoverError('请先在设置中启用并完整配置 AI 推荐模型');
      return;
    }
    if (!cloudConfigured) {
      setDiscoverError('请先在设置中启用并完整配置云音乐接口，发现推荐需要云端解析后才能查看详情和下载');
      return;
    }
    const seq = discoverSeqRef.current + 1;
    discoverSeqRef.current = seq;
    setDiscoverBusy(true);
    setDiscoverError('');
    try {
      const libraryProfile = uniqueTracks.length
        ? await buildRecommendationLibrary({
          tracks: uniqueTracks,
          playlists: data.playlists,
          history: data.listeningHistory,
          aiSettings,
          api: electronAPI
        })
        : [];
      if (discoverSeqRef.current !== seq) return;
      const result = await electronAPI.recommendDiscoverSongs({
        config: aiSettings,
        cloudConfig: cloudSettings,
        libraryProfile,
        preferenceSummary: listeningSummary,
        limits: {
          maxLocalRecommendations: 0,
          maxRemoteRecommendations: aiSettings.maxRemoteRecommendations
        }
      });
      if (discoverSeqRef.current !== seq) return;
      if (!result?.ok) {
        setDiscoverError(ipcErrorMessage(result, '生成推荐失败'));
        return;
      }
      const next = {
        ...DEFAULT_DATA.discoverCache,
        ...(result.data || {}),
        generatedAt: result.data?.generatedAt || new Date().toISOString()
      };
      setDiscoverResult(next);
      setData((prev) => ({ ...prev, discoverCache: next }));
    } catch (error) {
      if (discoverSeqRef.current === seq) setDiscoverError(error?.message || '生成推荐失败');
    } finally {
      if (discoverSeqRef.current === seq) setDiscoverBusy(false);
    }
  };

  const searchRemoteRecommendation = (query) => {
    const keyword = `${query?.searchQuery || [query?.artist, query?.title].filter(Boolean).join(' ') || ''}`.trim();
    if (!keyword) return;
    setView('songs');
    setQuery(keyword);
  };

  const addTrackToPlaylist = (trackId, targetId) => {
    setData((prev) => {
      const playlists = prev.playlists.map((p) => {
        if (p.id !== targetId) return p;
        if (p.trackIds.includes(trackId)) return p;
        return { ...p, trackIds: [...p.trackIds, trackId] };
      });
      return { ...prev, playlists };
    });
  };

  const removeTrack = (trackId) => {
    setData((prev) => {
      const tracks = prev.tracks.filter((t) => t.id !== trackId);
      const playlists = prev.playlists.map((p) => ({ ...p, trackIds: p.trackIds.filter((id) => id !== trackId) }));
      return { ...prev, tracks, playlists };
    });
    if (currentTrackId === trackId) {
      setCurrentTrackId(null);
      setIsPlaying(false);
    }
  };

  const pickAndScanFolders = async () => {
    if (!electronAPI) return;
    const folders = await electronAPI.pickFolders();
    if (!folders?.length) return;
    const prev = data.scanFolders || [];
    const merged = [...new Set([...prev, ...folders])];
    setScanBusy(true);
    try {
      const scanned = await electronAPI.scanFolders(merged);
      setData(scanned);
    } finally {
      setScanBusy(false);
    }
  };

  const rescanManagedFolders = async () => {
    if (!electronAPI) return;
    setScanBusy(true);
    try {
      const scanned = await electronAPI.scanFolders(data.scanFolders || []);
      setData(scanned);
    } finally {
      setScanBusy(false);
    }
  };

  const removeManagedFolder = async (folderPath) => {
    if (!electronAPI) return;
    const nextFolders = (data.scanFolders || []).filter((f) => f !== folderPath);
    setScanBusy(true);
    try {
      const scanned = await electronAPI.scanFolders(nextFolders);
      setData(scanned);
      if (currentTrackId && !scanned.tracks.some((t) => t.id === currentTrackId)) {
        setCurrentTrackId(scanned.tracks[0]?.id || null);
        if (!scanned.tracks.length) setIsPlaying(false);
      }
    } finally {
      setScanBusy(false);
    }
  };

  const rescanSingle = async (track) => {
    if (!electronAPI) return;
    const fresh = await electronAPI.rescanTrack(track.path);
    setData((prev) => ({ ...prev, tracks: prev.tracks.map((t) => (t.id === fresh.id ? { ...fresh, liked: t.liked } : t)) }));
    return fresh;
  };

  const openLyricFinder = () => {
    if (!currentTrack || !electronAPI?.openLyricFinderWindow) return;
    const keyword = `${currentTrack.artist || ''} - ${currentTrack.title || ''}`.trim();
    const searchUrl = `https://www.toomic.com/?search=${encodeURIComponent(keyword)}`;
    electronAPI.openLyricFinderWindow({
      url: searchUrl,
      trackPath: currentTrack.path
    });
  };

  const adjustLyricOffset = (delta) => {
    setLyricOffsetSec((v) => {
      const next = Math.max(-30, Math.min(30, Number((v + delta).toFixed(2))));
      return next;
    });
    const audio = audioRef.current;
    if (audio) {
      setTime(audio.currentTime || 0);
    }
  };

  const saveLyricOffsetToFile = async () => {
    if (!electronAPI?.writeTextFile || !lyricDebugPath || !lyricLines.length) return;
    const shiftedLines = lyricLines.map((line) => ({
      ...line,
      time: Math.max(0, line.time - lyricOffsetSec)
    }));
    const toLrc = shiftedLines
      .map((line) => {
        const ms = Math.round(line.time * 1000);
        const mm = Math.floor(ms / 60000);
        const sec = (ms - mm * 60000) / 1000;
        return `[${String(mm).padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}]${line.text || ''}`;
      })
      .join('\n');
    const ok = await electronAPI.writeTextFile(lyricDebugPath, toLrc);
    if (!ok) {
      setPlayError('歌词偏移保存失败');
      return;
    }
    setLyricsRaw(toLrc);
    setLyricLines(shiftedLines);
    setLyricOffsetSec(0);
    setLyricAdjustMode(false);
    setHoldLyricIdx(null);
    setPlayError('');
  };

  const applyAlignAtCurrent = (idx) => {
    let appliedDelta = 0;
    setLyricLines((prev) => {
      if (!prev.length || idx < 0 || idx >= prev.length) return prev;
      const currentAtRelease = (audioRef.current?.currentTime ?? time) + lyricOffsetSec;
      const roundedCurrent = Math.max(0, Math.round(currentAtRelease * 10) / 10);
      const base = prev[idx].time;
      const minTarget = idx > 0 ? prev[idx - 1].time + 0.1 : 0;
      const target = Math.max(minTarget, roundedCurrent);
      const delta = target - base;
      if (Math.abs(delta) < 0.001) return prev;
      appliedDelta = delta;
      return prev.map((line, i) => (i < idx ? line : { ...line, time: Math.max(0, line.time + delta) }));
    });
    if (Math.abs(appliedDelta) >= 0.001) {
      const sign = appliedDelta > 0 ? '+' : '';
      setLyricAlignNotice(`已调整：从该句开始整体 ${sign}${appliedDelta.toFixed(1)}s`);
    } else {
      setLyricAlignNotice('已调整：该句时间无需变化');
    }
  };

  useEffect(() => {
    if (!lyricAlignNotice) return;
    const t = setTimeout(() => setLyricAlignNotice(''), 2400);
    return () => clearTimeout(t);
  }, [lyricAlignNotice]);

  useEffect(() => {
    if (!electronAPI?.onLyricDownloaded) return;
    const off = electronAPI.onLyricDownloaded(async (payload) => {
      if (!payload?.ok || !payload?.trackPath) {
        setPlayError('歌词下载失败，请重试');
        return;
      }
      const fresh = await electronAPI.rescanTrack(payload.trackPath);
      if (fresh?.id) {
        setData((prev) => ({ ...prev, tracks: prev.tracks.map((t) => (t.id === fresh.id ? { ...fresh, liked: t.liked } : t)) }));
      }
      if (currentTrack?.path === payload.trackPath && fresh?.lyricPath && electronAPI.readTextFile) {
        const txt = await electronAPI.readTextFile(fresh.lyricPath);
        setLyricsRaw(txt || '');
        setLyricLines(parseLyrics(txt || ''));
      }
      setPlayError('');
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, [currentTrack?.path]);

  const displayTracks = useMemo(
    () => sortedTracks.filter((t) => trackMatchesTokens(t, queryTokens)),
    [sortedTracks, queryTokens]
  );

  const activeDownloadKeys = useMemo(
    () => new Set(downloadTasks.filter((task) => ACTIVE_DOWNLOAD_STATUSES.has(task.status)).map((task) => task.key || `${task.provider}:${task.songId}`)),
    [downloadTasks]
  );
  const completedDownloadKeys = useMemo(
    () => new Set(downloadTasks.filter((task) => task.status === 'completed').map((task) => task.key || `${task.provider}:${task.songId}`)),
    [downloadTasks]
  );
  const activeDownloadTaskCount = useMemo(
    () => downloadTasks.filter((task) => ACTIVE_DOWNLOAD_STATUSES.has(task.status)).length,
    [downloadTasks]
  );
  const visibleDownloadTasks = useMemo(
    () => downloadTasks.slice(0, Math.max(1, downloadTaskPage) * DOWNLOAD_TASK_PAGE_SIZE),
    [downloadTasks, downloadTaskPage]
  );
  const hasMoreDownloadTasks = visibleDownloadTasks.length < downloadTasks.length;
  const showCloudSection = view === 'songs' && !!query.trim() && cloudConfigured;
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(downloadTasks.length / DOWNLOAD_TASK_PAGE_SIZE));
    setDownloadTaskPage((page) => Math.min(page, maxPage));
  }, [downloadTasks.length]);
  const cloudSearchStatusLabel = query.trim()
    ? cloudConfigured
      ? cloudSearchError
        ? `本地 ${displayTracks.length} · ${cloudSearchError}`
        : cloudSearchBusy
          ? `本地 ${displayTracks.length} · 云端搜索中`
          : `本地 ${displayTracks.length} · 云端 ${cloudResults.length}`
      : `本地 ${displayTracks.length}`
    : '';

  const groupedByFolder = useMemo(() => {
    const map = new Map();
    for (const t of displayTracks) {
      const arr = map.get(t.folder) || [];
      arr.push(t);
      map.set(t.folder, arr);
    }
    return [...map.entries()].sort((a, b) => {
      const primary = MIXED_COLLATOR.compare(toMixedSortKey(a[0]), toMixedSortKey(b[0]));
      if (primary !== 0) return primary;
      return MIXED_COLLATOR.compare(a[0], b[0]);
    });
  }, [displayTracks]);

  const groupedByArtist = useMemo(() => {
    const map = new Map();
    for (const t of displayTracks) {
      const arr = map.get(t.artist) || [];
      arr.push(t);
      map.set(t.artist, arr);
    }
    return [...map.entries()].sort((a, b) => {
      const primary = MIXED_COLLATOR.compare(toMixedSortKey(a[0]), toMixedSortKey(b[0]));
      if (primary !== 0) return primary;
      return MIXED_COLLATOR.compare(a[0], b[0]);
    });
  }, [displayTracks]);

  const PlayModeIcon = playMode === 'sequence' ? ListOrdered : playMode === 'random' ? Shuffle : Repeat;
  const activePanelLyricId = activeLyricIdx >= 0 ? `panel-lyric-${activeLyricIdx}` : '';

  useEffect(() => {
    if (!playerPanelOpen || !activePanelLyricId || holdLyricIdx != null) return;
    const scroller = panelLyricsScrollRef.current;
    const el = document.getElementById(activePanelLyricId);
    if (!scroller || !el) return;
    const nextTop = Math.max(0, el.offsetTop - scroller.clientHeight * 0.45);
    scroller.scrollTo({ top: nextTop, behavior: 'smooth' });
  }, [activePanelLyricId, playerPanelOpen, currentTrackId, lyricOffsetSec, holdLyricIdx]);

  const renderDownloadTaskRow = (task) => {
    const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
    const canPause = task.status === 'downloading';
    const canResume = ['paused', 'failed'].includes(task.status);
    const canCancel = ACTIVE_DOWNLOAD_STATUSES.has(task.status);
    const canOpen = !!task.targetPath;
    return (
      <div
        key={task.id}
        className="group border-b border-black/5 px-2 py-2 text-xs last:border-b-0 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10"
        onDoubleClick={() => canOpen && electronAPI?.showItemInFolder?.(task.targetPath)}
        title={canOpen ? '双击打开所在位置' : ''}
      >
        <div className="flex items-center gap-2">
          <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${downloadStatusDotClass(task.status)} ${task.status === 'downloading' ? 'animate-pulse' : ''}`} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-black/80 dark:text-white/85">{task.title || '未知歌曲'}</div>
            <div className="truncate text-[11px] text-black/45 dark:text-white/45">{task.artist || 'Unknown Artist'}</div>
          </div>
          <div className="shrink-0 tabular-nums text-[11px] text-black/45 dark:text-white/45">{Math.round(progress)}%</div>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/12">
          <div className="h-full rounded-full bg-[#007aff] transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-black/50 dark:text-white/55">
          <span className="min-w-0 truncate">{downloadStatusLabel(task.status)} · {qualityLabel(task.actualQuality || task.requestedQuality)}</span>
          <div className="flex shrink-0 items-center gap-0.5 opacity-75 transition-opacity group-hover:opacity-100">
            {canPause && (
              <button className="rounded p-1 hover:bg-black/8 dark:hover:bg-white/12" title="暂停" onClick={(e) => { e.stopPropagation(); pauseDownloadTask(task.id); }}>
                <Pause size={12} />
              </button>
            )}
            {canResume && (
              <button className="rounded p-1 hover:bg-black/8 dark:hover:bg-white/12" title="继续" onClick={(e) => { e.stopPropagation(); resumeDownloadTask(task.id); }}>
                <Play size={12} />
              </button>
            )}
            {canCancel && (
              <button className="rounded p-1 hover:bg-red-500/10 hover:text-red-500" title="取消" onClick={(e) => { e.stopPropagation(); cancelDownloadTask(task.id); }}>
                <X size={12} />
              </button>
            )}
            {canOpen && (
              <button className="rounded p-1 hover:bg-black/8 dark:hover:bg-white/12" title="打开所在位置" onClick={(e) => { e.stopPropagation(); electronAPI?.showItemInFolder?.(task.targetPath); }}>
                <FolderOpen size={12} />
              </button>
            )}
            <button className="rounded p-1 hover:bg-red-500/10 hover:text-red-500" title="删除任务" onClick={(e) => { e.stopPropagation(); deleteDownloadTask(task.id); }}>
              <Trash2 size={12} />
            </button>
          </div>
        </div>
        {task.error && <div className="mt-1 truncate text-[11px] text-red-500" title={task.error}>{task.error}</div>}
      </div>
    );
  };

  const renderRow = (track, rowKey) => {
    const isRemote = track.sourceType === 'remote';
    const isActive = !isRemote && currentTrackId === track.id;
    const taskKey = isRemote ? remoteTaskKey(track) : '';
    const isDownloading = isRemote && activeDownloadKeys.has(taskKey);
    const isDownloaded = isRemote && completedDownloadKeys.has(taskKey);
    return (
      <div
        key={rowKey}
        className={`relative grid ${SONG_ROW_GRID_CLASS} items-center gap-2 px-2 py-1.5 text-sm border-b border-black/5 dark:border-white/10 even:bg-black/[0.02] dark:even:bg-white/[0.03] hover:bg-black/5 dark:hover:bg-white/10 apple-pointer select-none ${
          isActive ? 'bg-[#007aff]/12 dark:bg-[#007aff]/22' : ''
        }`}
        onClick={() => (isRemote ? openCloudDetail(track) : playTrack(track.id))}
        onDoubleClick={() => (isRemote ? openCloudDetail(track) : playTrack(track.id))}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, trackId: track.id, track });
        }}
      >
        {isActive && <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r bg-[#007aff]" />}
        {isRemote ? (
          <div className="mx-auto rounded-full px-2 py-0.5 text-[11px] font-medium bg-[#007aff]/12 text-[#0066d6] dark:bg-[#007aff]/22 dark:text-[#8ec1ff]">
            {PROVIDERS[track.provider]?.shortLabel || '云'}
          </div>
        ) : (
          <button
            className="mx-auto"
            onClick={(e) => {
              e.stopPropagation();
              toggleLike(track.id);
            }}
          >
            <Heart size={16} className={track.liked ? 'fill-red-500 text-red-500' : 'text-black/40 dark:text-white/40'} />
          </button>
        )}
        <div className={`min-w-0 truncate apple-pointer ${isActive ? 'text-[#0066d6] dark:text-[#86bcff] font-medium' : ''}`}>
          <span>{track.title}</span>
          {isRemote && track.subtitle && <span className="ml-2 text-xs text-black/45 dark:text-white/45">{track.subtitle}</span>}
        </div>
        <div className="truncate text-black/60 dark:text-white/60 apple-pointer">{track.artist}</div>
        <div className="truncate text-black/60 dark:text-white/60 apple-pointer">{track.album}</div>
        <div className="text-right text-black/60 dark:text-white/60 apple-pointer">{track.duration ? formatDuration(track.duration) : '—'}</div>
        {isRemote ? (
          <div className="flex items-center justify-end gap-1 pr-1">
            <button
              className="rounded-md p-1.5 text-black/55 dark:text-white/60 hover:bg-black/8 dark:hover:bg-white/12"
              title="查看详情"
              onClick={(e) => {
                e.stopPropagation();
                openCloudDetail(track);
              }}
            >
              <Info size={15} />
            </button>
            {isDownloaded ? (
              <span className="min-w-[56px] rounded-md px-2 py-1 text-center text-xs bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/18 dark:text-emerald-300">
                已下载
              </span>
            ) : (
              <button
                className={`min-w-[56px] rounded-md px-2 py-1 text-xs ${isDownloading ? 'bg-black/5 dark:bg-white/10 text-black/45 dark:text-white/45' : 'bg-[#007aff] text-white'}`}
                title="下载"
                disabled={isDownloading}
                onClick={(e) => {
                  e.stopPropagation();
                  startCloudDownload(track);
                }}
              >
                {isDownloading ? '下载中' : '下载'}
              </button>
            )}
          </div>
        ) : (
          <div aria-hidden="true" className="pr-2" />
        )}
      </div>
    );
  };

  const renderRecommendationEvidence = (rec) => (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {(rec.evidence || []).slice(0, 5).map((item, idx) => (
        <span key={`${item}-${idx}`} className="rounded-full border border-black/10 bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/65 dark:border-white/12 dark:bg-white/[0.08] dark:text-white/70">
          {item}
        </span>
      ))}
    </div>
  );

  const renderRemoteRecommendation = (item, idx) => {
    const query = item.query || item;
    const track = item.track ? toRemoteTrack(item.track, item.track.provider) : null;
    return (
      <div key={`remote-rec-${query.searchQuery || idx}`} className="overflow-hidden rounded-xl border border-black/10 bg-white/50 shadow-sm backdrop-blur-md dark:border-white/15 dark:bg-[#1e1e1e]/50">
        {track ? renderRow(track, `discover-remote-row-${track.id}-${idx}`) : (
          <div className="flex items-center justify-between gap-3 px-3 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-black/85 dark:text-white/90">{query.title || query.searchQuery}</div>
              <div className="truncate text-xs text-black/58 dark:text-white/65">{query.artist || '未知歌手'} {query.album ? `· ${query.album}` : ''}</div>
            </div>
            <button className="rounded-md px-2 py-1 text-xs bg-[#007aff] text-white" onClick={() => searchRemoteRecommendation(query)}>搜索云端</button>
          </div>
        )}
        <div className="px-3 py-3 text-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="leading-5 text-black/75 dark:text-white/78">{item.reason || query.reason || '基于偏好生成的云端搜索候选'}</div>
            <span className="shrink-0 rounded-full bg-purple-500/12 px-2 py-0.5 text-[11px] text-purple-700 dark:bg-purple-500/20 dark:text-purple-200">
              云端 {Math.round((Number(item.confidence ?? query.confidence) || 0) * 100)}%
            </span>
          </div>
          {renderRecommendationEvidence(item.evidence ? item : query)}
          {!track && <div className="mt-2 text-[11px] text-black/55 dark:text-white/62">搜索词：{query.searchQuery}</div>}
        </div>
      </div>
    );
  };

  const renderDiscoverPage = () => {
    const remoteRecommendations = discoverResult?.remoteRecommendations || [];
    const resolvedKeys = new Set([
      ...remoteRecommendations.map((item) => item.query?.searchQuery || ''),
      ...(discoverResult?.resolvedRemoteQueries || []).map((item) => item?.searchQuery || item || '')
    ].map((item) => `${item}`.toLowerCase()).filter(Boolean));
    const unresolvedRemote = (discoverResult?.remoteQueries || []).filter((query) => !resolvedKeys.has(`${query.searchQuery || ''}`.toLowerCase()));
    const hasResult = !!discoverResult?.generatedAt;
    const settingsReady = aiConfigured && cloudConfigured;
    const statusLabel = !aiConfigured
      ? 'AI 未配置'
      : !cloudConfigured
        ? '云音乐未配置'
        : discoverBusy
          ? '正在分析...'
          : listeningSummary.totalMeaningfulListens < 3
            ? '样本较少，建议先听几首歌'
            : lastDiscoverGeneratedAt
              ? `上次生成：${lastDiscoverGeneratedAt}`
              : '准备就绪';
    return (
      <div className="discover-page space-y-4 py-4">
        <section className="overflow-hidden rounded-2xl border border-black/10 bg-gradient-to-br from-[#007aff]/16 via-white/82 to-purple-500/12 p-5 shadow-sm dark:border-white/15 dark:from-[#007aff]/18 dark:via-[#1e1e1e]/70 dark:to-purple-500/16">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xl font-semibold tracking-tight text-black/85 dark:text-white/90"><Sparkles size={22} /> 发现音乐</div>
              <div className="mt-1 max-w-2xl text-sm leading-6 text-black/70 dark:text-white/72">根据最近播放、喜欢、歌单和本地元数据推断偏好，由 AI 生成可在云端搜索和下载的歌曲推荐。</div>
              <div className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs ${discoverBusy ? 'bg-[#007aff]/14 text-[#0066d6] dark:text-[#8ec1ff]' : 'bg-black/5 text-black/56 dark:bg-white/10 dark:text-white/60'}`}>{statusLabel}</div>
            </div>
            <button
              className="shrink-0 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm disabled:opacity-55"
              disabled={discoverBusy}
              onClick={() => {
                if (!settingsReady) {
                  setSettingsOpen(true);
                  return;
                }
                refreshDiscoverRecommendations();
              }}
            >
              {discoverBusy ? '正在生成...' : settingsReady ? (hasResult ? '重新生成' : '生成推荐') : '打开设置'}
            </button>
          </div>
        </section>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-black/10 bg-white/50 p-3 text-xs shadow-sm backdrop-blur-md dark:border-white/12 dark:bg-[#1e1e1e]/50">
            <div className="mb-1 text-black/60 dark:text-white/62">最近常听</div>
            <div className="text-sm font-medium text-black/85 dark:text-white/90">{discoverStats.topArtists.join(' / ') || '暂无明显歌手偏好'}</div>
            <div className="mt-1 truncate text-black/58 dark:text-white/62">{discoverStats.topTracks.join('；') || '播放几首歌后会更准确'}</div>
          </div>
          <div className="rounded-xl border border-black/10 bg-white/50 p-3 text-xs shadow-sm backdrop-blur-md dark:border-white/12 dark:bg-[#1e1e1e]/50">
            <div className="mb-1 text-black/60 dark:text-white/62">收藏倾向</div>
            <div className="text-sm font-medium text-black/85 dark:text-white/90">{discoverStats.likedCount} 首喜欢 · {discoverStats.playlistCount} 个自建歌单</div>
            <div className="mt-1 text-black/58 dark:text-white/62">收藏和歌单会作为强偏好信号</div>
          </div>
          <div className="rounded-xl border border-black/10 bg-white/50 p-3 text-xs shadow-sm backdrop-blur-md dark:border-white/12 dark:bg-[#1e1e1e]/50">
            <div className="mb-1 text-black/60 dark:text-white/62">偏好证据</div>
            <div className="text-sm font-medium text-black/85 dark:text-white/90">{discoverStats.meaningfulListens} 条有效记录 · {uniqueTracks.length} 首本地元数据</div>
            <div className="mt-1 text-black/58 dark:text-white/62">歌词 {discoverStats.lyricCount} 首 · 云元数据 {discoverStats.cloudMetaCount} 首</div>
          </div>
        </div>

        {discoverError && (
          <div className="rounded-xl border border-red-500/15 bg-red-500/10 px-3 py-2 text-sm text-red-500">{discoverError}</div>
        )}
        {!uniqueTracks.length && (
          <div className="rounded-xl bg-black/[0.04] p-6 text-center text-sm text-black/62 dark:bg-white/[0.08] dark:text-white/64">暂无本地元数据；添加播放、收藏或歌单后，AI 推断偏好会更准确。</div>
        )}
        {!aiConfigured && (
          <div className="rounded-xl bg-black/[0.04] p-6 text-center text-sm text-black/64 dark:bg-white/[0.08] dark:text-white/66">
            需要先在设置中配置 OpenAI-compatible 或 Anthropic-compatible 模型。API Key 仅保存到本机配置。
            <button className="ml-3 rounded-md bg-[#007aff] px-2 py-1 text-xs text-white" onClick={() => setSettingsOpen(true)}>打开设置</button>
          </div>
        )}
        {aiConfigured && !cloudConfigured && (
          <div className="rounded-xl bg-black/[0.04] p-6 text-center text-sm text-black/64 dark:bg-white/[0.08] dark:text-white/66">
            需要先在设置中启用并完整配置云音乐接口，AI 候选解析为可查看详情和下载的云端歌曲后才会展示。
            <button className="ml-3 rounded-md bg-[#007aff] px-2 py-1 text-xs text-white" onClick={() => setSettingsOpen(true)}>打开设置</button>
          </div>
        )}
        {settingsReady && !hasResult && !discoverBusy && (
          <div className="rounded-xl bg-black/[0.04] p-6 text-center text-sm text-black/62 dark:bg-white/[0.08] dark:text-white/64">点击“生成推荐”开始分析。样本较少时会降低置信度，并给出更保守的云端候选。</div>
        )}

        {hasResult && (
          <>
            {discoverResult.summary && <section className="rounded-xl bg-black/[0.04] p-3 text-sm leading-6 text-black/75 dark:bg-white/[0.08] dark:text-white/72">{discoverResult.summary}</section>}
            <section className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <div className="text-sm font-medium text-black/85 dark:text-white/90">AI 云端推荐</div>
                <div className="text-xs text-black/55 dark:text-white/62">已通过云音乐搜索解析，可查看详情或下载；未解析项可手动搜索。</div>
              </div>
              {remoteRecommendations.map(renderRemoteRecommendation)}
              {unresolvedRemote.map((query, idx) => renderRemoteRecommendation(query, idx + 1000))}
              {!remoteRecommendations.length && !unresolvedRemote.length && (
                <div className="rounded-xl bg-black/[0.04] p-5 text-center text-sm text-black/55 dark:bg-white/[0.08] dark:text-white/62">本次没有生成可信的云端候选，可增加播放/收藏偏好后重试。</div>
              )}
            </section>
            {!!discoverResult.warnings?.length && (
              <section className="rounded-xl bg-amber-500/10 p-3 text-xs leading-6 text-amber-700 dark:text-amber-200">
                {discoverResult.warnings.map((warning, idx) => <div key={`${warning}-${idx}`}>{warning}</div>)}
              </section>
            )}
          </>
        )}

        <div className="rounded-xl border border-black/10 bg-white/70 p-3 text-[11px] leading-5 text-black/58 shadow-sm dark:border-white/12 dark:bg-white/[0.08] dark:text-white/62">
          隐私提示：本地数据只用于推断偏好，模型请求只发送歌曲元数据、收藏/歌单、播放统计和可选短歌词片段；不发送本地文件路径。最终推荐只展示云端搜索解析结果，不会自动下载。
        </div>
      </div>
    );
  };

  const cloudDetailTaskKey = cloudDetail.track ? remoteTaskKey(cloudDetail.track) : '';
  const cloudDetailDownloading = !!cloudDetailTaskKey && activeDownloadKeys.has(cloudDetailTaskKey);
  const cloudDetailDownloaded = !!cloudDetailTaskKey && completedDownloadKeys.has(cloudDetailTaskKey);

  return (
    <div className="h-full w-full p-0 text-black/85 dark:text-white/90">
      <audio
        ref={audioRef}
        onPlay={() => {
          if (sourceSwitchingRef.current) return;
          startListenSession(currentTrack);
          setIsPlaying(true);
        }}
        onPause={() => {
          if (sourceSwitchingRef.current) return;
          finalizeListenSession(false);
          setIsPlaying(false);
        }}
        onTimeUpdate={(e) => updateListenSession(e.currentTarget)}
        onLoadedMetadata={(e) => {
          setTrackDuration(e.currentTarget.duration || currentTrack?.duration || 0);
          if (listenSessionRef.current) listenSessionRef.current.duration = e.currentTarget.duration || currentTrack?.duration || 0;
        }}
        onEnded={() => {
          finalizeListenSession(true);
          playNext();
        }}
        onError={() => {
          finalizeListenSession(false);
          setPlayError('音频播放失败，请尝试 MP3/FLAC');
          setIsPlaying(false);
        }}
      />

      <div className={`relative h-full w-full rounded-[8px] ${appShellSurfaceClass} shadow-[0px_14px_30px_-10px_rgba(0,0,0,0.16)] noise-layer overflow-hidden`}>
        {!!bgDataUrl && (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-[0.16] dark:opacity-[0.06] transition-opacity duration-200"
              style={{ backgroundImage: `url("${bgDataUrl}")` }}
            />
            <div
              className="absolute inset-[-10%] bg-cover bg-center"
              style={{
                backgroundImage: `url("${bgDataUrl}")`,
                filter: `blur(${Math.max(0, bgBlur * 1.6)}px) saturate(108%) brightness(${dark ? 0.62 : 0.98}) contrast(${dark ? 0.92 : 1})`,
                transform: 'scale(1.1)'
              }}
            />
            <div className="absolute inset-0 bg-white/8 dark:bg-black/38" />
          </div>
        )}
        <div className="relative z-10 grid h-full min-h-0 grid-cols-[280px_1fr]">
          <aside className="relative flex min-h-0 flex-col p-4 bg-white/20 dark:bg-black/22 backdrop-blur-2xl border-r border-black/5 dark:border-white/10">
            <div className="mb-2 no-drag flex items-center gap-2 text-xs shrink-0">
              <button onClick={() => setSettingsOpen(true)} className="no-drag rounded-md p-1.5 bg-black/5 dark:bg-white/10" title="设置"><Settings2 size={16} /></button>
              <button onClick={() => setDark((v) => !v)} className="no-drag rounded-md p-1.5 bg-black/5 dark:bg-white/10" title="主题">
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>
            <div className="mb-3 shrink-0">
              <div className="text-xs tracking-wide uppercase text-black/50 dark:text-white/40">Library</div>
            </div>

            <div className="apple-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              <nav className="space-y-1 text-sm">
                <button className={`w-full rounded-md px-2 py-1.5 text-left ${playlistId === 'all' ? 'bg-[#007aff] text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`} onClick={() => setPlaylistId('all')}>所有歌曲 ({uniqueTracks.length})</button>
                {data.playlists.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <button className={`flex-1 rounded-md px-2 py-1.5 text-left ${playlistId === p.id ? 'bg-[#007aff] text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'}`} onClick={() => setPlaylistId(p.id)}>{p.name} ({p.trackIds.length})</button>
                    {!p.fixed && (
                      <button onClick={() => removePlaylist(p.id)} className="p-1 text-black/40 dark:text-white/40 hover:text-red-400"><X size={14} /></button>
                    )}
                  </div>
                ))}
              </nav>
            </div>

            <div className="mt-3 shrink-0">
              {!creatingPlaylist && (
                <button
                  className="w-full rounded-md px-2 py-1.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20"
                  onClick={() => setCreatingPlaylist(true)}
                >
                  新建歌单
                </button>
              )}
              {creatingPlaylist && (
                <div className="rounded-md bg-white/60 dark:bg-white/5 p-2 space-y-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
                  <input
                    autoFocus
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addPlaylist(newPlaylistName);
                      if (e.key === 'Escape') {
                        setCreatingPlaylist(false);
                        setNewPlaylistName('');
                      }
                    }}
                    placeholder="输入歌单名称"
                    className="w-full rounded-[5px] px-2 py-1.5 text-sm bg-white dark:bg-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] outline-none focus:ring-4 focus:ring-blue-500/20"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      className="flex-1 rounded-md py-1.5 text-xs bg-gradient-to-b from-blue-500 to-blue-600 text-white border border-white/20"
                      onClick={() => addPlaylist(newPlaylistName)}
                    >
                      创建
                    </button>
                    <button
                      className="flex-1 rounded-md py-1.5 text-xs bg-black/5 dark:bg-white/10"
                      onClick={() => {
                        setCreatingPlaylist(false);
                        setNewPlaylistName('');
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 shrink-0 overflow-hidden rounded-xl bg-white/35 dark:bg-white/[0.06] border border-black/5 dark:border-white/10">
              <button
                className="flex w-full items-center justify-between gap-2 px-2 py-2 text-xs text-black/60 dark:text-white/65 hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setDownloadPanelOpen((open) => !open)}
              >
                <span className="flex items-center gap-1.5"><Download size={13} /> 下载任务</span>
                <span className="flex items-center gap-1.5">
                  {activeDownloadTaskCount ? `${activeDownloadTaskCount} 个进行中` : `${downloadTasks.length} 个`}
                  <ChevronDown size={13} className={`transition-transform ${downloadPanelOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {downloadPanelOpen && (
                <div
                  className="apple-scroll max-h-64 overflow-auto border-t border-black/5 dark:border-white/10"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    if (hasMoreDownloadTasks && el.scrollTop + el.clientHeight >= el.scrollHeight - 16) {
                      setDownloadTaskPage((page) => page + 1);
                    }
                  }}
                >
                  {downloadTasks.length ? visibleDownloadTasks.map(renderDownloadTaskRow) : (
                    <div className="px-2 py-4 text-center text-xs text-black/45 dark:text-white/45">暂无下载任务</div>
                  )}
                  {hasMoreDownloadTasks && (
                    <button
                      className="w-full px-2 py-2 text-center text-xs text-[#007aff] hover:bg-black/5 dark:text-[#8ec1ff] dark:hover:bg-white/10"
                      onClick={() => setDownloadTaskPage((page) => page + 1)}
                    >
                      加载更多（{downloadTasks.length - visibleDownloadTasks.length}）
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 rounded-lg bg-gray-200/50 dark:bg-white/10 p-[2px] flex gap-1 shrink-0">
              {[
                ['songs', <ListMusic size={16} />, '歌曲'],
                ['artists', <Users size={16} />, '作者'],
                ['folders', <FolderTree size={16} />, '文件夹'],
                ['discover', <Sparkles size={16} />, '发现']
              ].map(([id, icon, label]) => (
                <button key={id} onClick={() => setView(id)} className="relative flex-1 rounded-[6px] py-1.5 text-xs tracking-wide">
                  {view === id && (
                    <motion.div
                      layoutId="view-tab"
                      transition={SPRING}
                      className="absolute inset-0 rounded-[6px] bg-white dark:bg-gray-600 shadow-sm"
                    />
                  )}
                  <span className="relative z-10 flex items-center justify-center gap-1">{icon}{label}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="relative flex min-h-0 flex-col min-w-0">
            <div className="drag-region relative flex items-center justify-between px-5 pt-4 pb-3 border-b border-black/5 dark:border-white/10">
              <div className="no-drag flex items-center gap-2 rounded-lg bg-white/60 dark:bg-white/5 px-3 py-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
                <Search size={16} className="text-black/40 dark:text-white/40" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索本地与云端歌曲" className="no-drag bg-transparent outline-none text-sm w-56" />
                {query.trim() && (
                  <button
                    className="no-drag rounded-full p-0.5 text-black/45 dark:text-white/45 hover:bg-black/10 dark:hover:bg-white/10"
                    onClick={() => setQuery('')}
                    title="清空搜索"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {query.trim() && (
                <div className={`no-drag rounded-md px-2 py-1 text-xs bg-black/5 dark:bg-white/10 ${cloudSearchError ? 'text-red-500' : 'text-black/55 dark:text-white/55'}`}>
                  {cloudSearchStatusLabel || `搜索中: ${query.trim()}`}
                </div>
              )}
              <div className="no-drag pointer-events-none absolute left-[44%] top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs text-black/50 dark:text-white/50">
                已扫描 {uniqueTracks.length} 首
              </div>
              <div className="no-drag -mr-2 -mt-2 flex items-center text-black/70 dark:text-white/75">
                <button
                  className="no-drag flex h-8 w-11 items-center justify-center hover:bg-black/8 dark:hover:bg-white/12"
                  onClick={() => electronAPI?.windowMinimize?.()}
                  title="最小化"
                >
                  <span className="block h-[1.5px] w-3 rounded-full bg-current" />
                </button>
                <button
                  className="no-drag flex h-8 w-11 items-center justify-center hover:bg-black/8 dark:hover:bg-white/12"
                  onClick={async () => {
                    const next = await electronAPI?.windowToggleMaximize?.();
                    if (typeof next === 'boolean') setIsWindowMaximized(next);
                  }}
                  title="最大化/还原"
                >
                  {isWindowMaximized ? (
                    <Square size={12} strokeWidth={1.8} />
                  ) : (
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <rect x="5" y="3" width="8" height="8" />
                      <rect x="3" y="5" width="8" height="8" />
                    </svg>
                  )}
                </button>
                <button
                  className="no-drag flex h-8 w-12 items-center justify-center hover:bg-[#e81123] hover:text-white"
                  onClick={() => electronAPI?.windowClose?.()}
                  title="关闭"
                >
                  <X size={15} strokeWidth={1.8} />
                </button>
              </div>
            </div>

            {!mini && (
              <div className="apple-scroll flex-1 min-h-0 overflow-auto px-3 pb-40">
                {view === 'discover' ? renderDiscoverPage() : (
                  <>
                    <div className={`sticky top-0 z-10 grid ${SONG_ROW_GRID_CLASS} items-center gap-2 px-2 py-2 text-xs tracking-wide bg-white/70 dark:bg-[#2a2a2a]/80 backdrop-blur-xl border-b border-black/5 dark:border-white/10`}>
                      <span className="text-center">标记</span>
                      <button className="text-left apple-pointer" onClick={() => setSort((s) => nextSort(s, 'title'))}>歌曲</button>
                      <button className="text-left apple-pointer" onClick={() => setSort((s) => nextSort(s, 'artist'))}>歌手</button>
                      <button className="text-left apple-pointer" onClick={() => setSort((s) => nextSort(s, 'album'))}>专辑</button>
                      <button className="text-right apple-pointer" onClick={() => setSort((s) => nextSort(s, 'duration'))}>时长</button>
                      <span className="text-right pr-2">操作</span>
                    </div>

                    {view === 'songs' && displayTracks.map((track, idx) => renderRow(track, `songs-${track.id}-${idx}`))}

                    {showCloudSection && (
                      <section className="mt-3 mb-4 overflow-hidden rounded-xl bg-white/50 dark:bg-[#1e1e1e]/50 backdrop-blur-md border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)]">
                        <div className="flex items-center justify-between px-3 py-2 text-sm tracking-tight font-medium bg-black/[0.03] dark:bg-white/[0.04]">
                          <span className="flex items-center gap-2"><Cloud size={15} /> 云端结果 {cloudResults.length ? `(${cloudResults.length})` : ''}</span>
                          <span className={`text-xs ${cloudSearchError ? 'text-red-500' : 'text-black/50 dark:text-white/50'}`}>
                            {cloudSearchBusy ? '搜索中...' : cloudSearchError || (cloudResults.length ? '下载后可加入本地曲库播放' : '无结果')}
                          </span>
                        </div>
                        {cloudResults.map((track, idx) => renderRow(track, `cloud-${track.id}-${idx}`))}
                        {!cloudResults.length && !cloudSearchBusy && !cloudSearchError && (
                          <div className="px-3 py-5 text-center text-sm text-black/45 dark:text-white/45">云端没有匹配结果</div>
                        )}
                      </section>
                    )}

                    {view === 'artists' && groupedByArtist.map(([artist, tracks]) => (
                      <section key={artist} className="mb-4 overflow-hidden rounded-xl bg-white/50 dark:bg-[#1e1e1e]/50 backdrop-blur-md border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)]">
                        <div className="px-3 py-2 text-sm tracking-tight font-medium bg-black/[0.03] dark:bg-white/[0.04]">{artist} ({tracks.length})</div>
                        {tracks.map((track, idx) => renderRow(track, `artists-${artist}-${track.id}-${idx}`))}
                      </section>
                    ))}

                    {view === 'folders' && groupedByFolder.map(([folder, tracks]) => (
                      <section key={folder} className="mb-4 overflow-hidden rounded-2xl bg-white/50 dark:bg-[#1e1e1e]/50 backdrop-blur-md border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)]">
                        <div className="px-3 py-2 text-sm tracking-tight font-medium bg-black/[0.03] dark:bg-white/[0.04] border-b border-black/5 dark:border-white/10 truncate">
                          {folder}
                        </div>
                        {tracks.map((track, idx) => renderRow(track, `folders-${folder}-${track.id}-${idx}`))}
                      </section>
                    ))}
                    {(view !== 'songs' ? displayTracks.length === 0 : displayTracks.length === 0 && !(showCloudSection && (cloudResults.length || cloudSearchBusy))) && (
                      <div className="py-16 text-center text-sm text-black/45 dark:text-white/45">
                        没有匹配歌曲，请按歌曲名或歌手名搜索
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <AnimatePresence>
              {playerPanelOpen && currentTrack && (
                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={SPRING}
                  className={`absolute inset-x-4 top-4 bottom-[128px] z-[95] rounded-2xl border border-black/8 dark:border-white/12 ${playerPanelSurfaceClass} shadow-2xl shadow-black/20 overflow-hidden`}
                >
                  <div className="flex h-full flex-col p-5">
                    <div className="relative z-10 flex shrink-0 items-center justify-between">
                      <div className="relative z-20 flex items-center gap-2">
                        <button
                          className="no-drag rounded-lg p-3 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15"
                          onClick={() => setPlayerPanelOpen(false)}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="收起"
                        >
                          <ChevronDown size={22} />
                        </button>
                        <button
                          className="no-drag rounded-lg px-4 py-2 text-sm font-medium bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15"
                          onClick={openLyricFinder}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="手动查找并导入歌词"
                        >
                          查找歌词
                        </button>
                        <button
                          className="no-drag rounded-lg px-4 py-2 text-sm font-medium bg-[#007aff]/12 text-[#0066d6] dark:bg-[#007aff]/22 dark:text-[#8ec1ff] hover:bg-[#007aff]/18 disabled:opacity-55"
                          disabled={scrapeBusyId === currentTrack?.id || scrapeBusyId === 'library'}
                          onClick={() => scrapeLocalTrack(currentTrack)}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="使用云音乐接口自动匹配歌曲信息并下载适配歌词"
                        >
                          {scrapeBusyId === currentTrack?.id ? '匹配中...' : '自动匹配'}
                        </button>
                        <div className="relative no-drag" onMouseDown={(e) => e.stopPropagation()}>
                          <button
                            className="no-drag rounded-lg px-3 py-2 text-sm bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEncodingMenuOpen((v) => !v);
                            }}
                            title="歌词编码"
                          >
                            {encodingLabelMap[lyricEncoding] || '编码: 自动'}
                          </button>
                          {encodingMenuOpen && (
                            <div
                              className="absolute left-0 top-[calc(100%+6px)] z-30 w-44 rounded-lg border border-black/10 dark:border-white/15 bg-white/95 dark:bg-[#2a2a2a]/95 backdrop-blur-xl shadow-xl overflow-hidden"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {encodingOptions.map(([value, label]) => (
                                <button
                                  key={value}
                                  className={`w-full text-left px-3 py-2 text-sm ${
                                    lyricEncoding === value
                                      ? 'bg-[#007aff] text-white'
                                      : 'text-black/85 dark:text-white/90 hover:bg-black/5 dark:hover:bg-white/10'
                                  }`}
                                  onClick={() => {
                                    if (!currentTrackId) return;
                                    setData((prev) => ({
                                      ...prev,
                                      settings: {
                                        ...prev.settings,
                                        lyricEncodingMap: {
                                          ...(prev.settings.lyricEncodingMap || {}),
                                          [currentTrackId]: value
                                        }
                                      }
                                    }));
                                    setEncodingMenuOpen(false);
                                  }}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="no-drag flex items-center gap-1 rounded-lg px-2 py-1.5 bg-black/5 dark:bg-white/10" onMouseDown={(e) => e.stopPropagation()}>
                          <button
                            className={`rounded-md px-2 py-1 text-xs ${lyricAdjustMode ? 'bg-[#007aff] text-white' : 'hover:bg-black/10 dark:hover:bg-white/15'}`}
                            onClick={() => {
                              setLyricAdjustMode((v) => !v);
                              setHoldLyricIdx(null);
                              setLyricAlignNotice('');
                            }}
                            title="调整歌词：点一下按住，再点一下放开并生效"
                          >
                            调整歌词 {lyricAdjustMode ? '开' : '关'}
                          </button>
                          <button
                            className="rounded-md px-2 py-1 text-xs hover:bg-black/10 dark:hover:bg-white/15"
                            onClick={() => adjustLyricOffset(-0.5)}
                            title="歌词延后 0.5 秒"
                          >
                            延后
                          </button>
                          <div className="w-16 text-center text-xs text-black/70 dark:text-white/75">
                            {lyricOffsetSec > 0 ? `+${lyricOffsetSec.toFixed(1)}` : lyricOffsetSec.toFixed(1)}s
                          </div>
                          <button
                            className="rounded-md px-2 py-1 text-xs hover:bg-black/10 dark:hover:bg-white/15"
                            onClick={() => adjustLyricOffset(0.5)}
                            title="歌词提前 0.5 秒"
                          >
                            提前
                          </button>
                          <button
                            className={`rounded-md px-2 py-1 text-xs ${lyricDebugPath && lyricLines.length ? 'bg-[#007aff] text-white' : 'bg-black/5 dark:bg-white/10 text-black/45 dark:text-white/45'}`}
                            disabled={!lyricDebugPath || !lyricLines.length}
                            onClick={saveLyricOffsetToFile}
                            title="保存当前偏移到 LRC 文件"
                          >
                            保存到LRC
                          </button>
                        </div>
                      </div>
                      {(lyricAdjustMode || lyricAlignNotice) && (
                        <div className="mt-2 px-2 text-xs">
                          {lyricAlignNotice ? (
                            <div className="text-[#007aff] dark:text-[#8ec1ff]">{lyricAlignNotice}</div>
                          ) : holdLyricIdx != null ? (
                            <div className="text-black/65 dark:text-white/72">
                              已按住第 {holdLyricIdx + 1} 句：{heldLyricLineText || '...'}。再次点击同一句即可放开并在当前位置生效
                            </div>
                          ) : (
                            <div className="text-black/55 dark:text-white/62">调整歌词已开启：点一下某句按住，到目标播放时间再点一次该句放开并生效</div>
                          )}
                        </div>
                      )}
                      {scrapeMessage && (
                        <div className="mt-2 px-2 text-xs text-[#007aff] dark:text-[#8ec1ff]">{scrapeMessage}</div>
                      )}
                    </div>

                    <div className="mt-4 grid min-h-0 flex-1 grid-cols-[190px_minmax(0,1fr)] gap-4">
                      <div className="flex min-h-0 flex-col justify-start">
                        <div className="relative mx-auto w-[170px] overflow-hidden rounded-2xl border border-black/8 dark:border-white/12 bg-white/22 dark:bg-white/8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.28)]">
                          <div className="aspect-square w-full">
                            {currentCoverDataUrl ? (
                              <img
                                src={currentCoverDataUrl}
                                alt="cover"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <motion.div
                                  animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
                                  transition={isPlaying ? { repeat: Infinity, duration: 6, ease: 'linear' } : { duration: 0.2 }}
                                >
                                  <Disc3 size={64} className="text-black/65 dark:text-white/80" />
                                </motion.div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 px-2 text-center text-sm text-black/60 dark:text-white/65 truncate">{currentTrack.album}</div>
                      </div>

                      <div className="min-h-0 pr-1 flex flex-col">
                        <div className="shrink-0 px-2 pb-2">
                          <div className="text-[30px] leading-tight tracking-tight font-semibold">{currentTrack.title}</div>
                          <div className="mt-1 text-[19px] font-medium leading-snug text-black/68 dark:text-white/86 drop-shadow-[0_1px_8px_rgba(0,0,0,0.28)]">{currentTrack.artist} · {currentTrack.album}</div>
                          {!!lyricDebugPath && (
                            <div className="mt-1 text-[11px] text-black/45 dark:text-white/45 truncate" title={lyricDebugPath}>
                              歌词文件: {lyricDebugPath}
                            </div>
                          )}
                        </div>
                        <div ref={panelLyricsScrollRef} className="apple-scroll min-h-0 flex-1 overflow-auto">
                          {!lyricLines.length && (
                            <div className="h-full flex flex-col items-center justify-center gap-4 text-sm text-black/45 dark:text-white/45">
                              <div>未找到可用歌词</div>
                              {!!lyricsRaw && (
                                <pre className="max-w-[90%] max-h-28 overflow-auto text-[11px] text-left whitespace-pre-wrap bg-black/5 dark:bg-white/10 rounded-md p-2">
                                  {lyricsRaw.split(/\r?\n/).slice(0, 4).join('\n')}
                                </pre>
                              )}
                              <div className="flex flex-wrap justify-center gap-2">
                                <button
                                  className="no-drag rounded-lg px-5 py-2.5 text-lg font-medium bg-[#007aff]/12 text-[#0066d6] dark:bg-[#007aff]/22 dark:text-[#8ec1ff] hover:bg-[#007aff]/18 disabled:opacity-55"
                                  disabled={scrapeBusyId === currentTrack?.id || scrapeBusyId === 'library'}
                                  onClick={() => scrapeLocalTrack(currentTrack)}
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  {scrapeBusyId === currentTrack?.id ? '自动匹配中...' : '自动匹配歌词'}
                                </button>
                                <button
                                  className="no-drag rounded-lg px-5 py-2.5 text-lg font-medium bg-black/6 dark:bg-white/12 hover:bg-black/10 dark:hover:bg-white/18 text-black/80 dark:text-white/90"
                                  onClick={openLyricFinder}
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  手动查找
                                </button>
                              </div>
                            </div>
                          )}
                          {!!lyricLines.length && (
                            <div className="space-y-2 pt-2 pb-12">
                              {lyricLines.map((line, idx) => (
                                <div
                                  key={`${line.time}-${idx}`}
                                  id={`panel-lyric-${idx}`}
                                  className={`px-2 py-1.5 text-[15px] ${
                                    holdLyricIdx === idx ? 'bg-[#007aff]/20 rounded-md ring-1 ring-[#007aff]/40' : ''
                                  } ${
                                    idx === activeLyricIdx
                                      ? 'text-[#0069e5] dark:text-[#9accff] font-semibold'
                                      : 'text-black/62 dark:text-white/62'
                                  }`}
                                  onClick={(e) => {
                                    if (!lyricAdjustMode) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (holdLyricIdx == null) {
                                      setHoldLyricIdx(idx);
                                      setLyricAlignNotice('已按住这句歌词');
                                      return;
                                    }
                                    if (holdLyricIdx === idx) {
                                      applyAlignAtCurrent(idx);
                                      setHoldLyricIdx(null);
                                      return;
                                    }
                                    setHoldLyricIdx(idx);
                                    setLyricAlignNotice('已切换按住目标歌词');
                                  }}
                                >
                                  <span>{line.text || '...'}</span>
                                  {holdLyricIdx === idx && (
                                    <span className="ml-2 text-[11px] text-[#007aff] dark:text-[#9accff]">按住中，再点一次生效</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute bottom-0 inset-x-0 px-4 pb-4">
              <div className="rounded-xl bg-white/90 dark:bg-[#323232]/90 backdrop-blur-xl shadow-2xl shadow-black/20 p-3">
                <div className="flex items-center justify-between gap-4">
                  <button
                    className="min-w-0 flex-1 text-left rounded-lg px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    onClick={() => {
                      if (currentTrack) setPlayerPanelOpen((v) => !v);
                    }}
                    title="打开正在播放详情"
                  >
                    <div className="truncate text-sm tracking-tight">{currentTrack?.title || '未选择歌曲'}</div>
                    <div className="truncate text-xs text-black/50 dark:text-white/50">{currentTrack ? `${currentTrack.artist} · ${currentTrack.album}` : '扫描本地文件夹开始播放'}</div>
                  </button>
                  <div className="flex items-center justify-center gap-3 flex-1">
                    <button className="rounded-xl p-3.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15" onClick={playPrev}><SkipBack size={26} /></button>
                    <motion.button whileTap={{ scale: 0.96 }} transition={SPRING} className="rounded-xl px-6 py-3.5 bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm border border-white/20" onClick={() => (currentTrack ? setIsPlaying((v) => !v) : sortedTracks[0] && playTrack(sortedTracks[0].id))}>{isPlaying ? <Pause size={28} /> : <Play size={28} />}</motion.button>
                    <button className="rounded-xl p-3.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15" onClick={playNext}><SkipForward size={26} /></button>
                  </div>
                  <div className="flex items-center justify-end gap-2 flex-1">
                    <button
                      className="rounded-md p-2 bg-black/5 dark:bg-white/10"
                      title={playMode === 'sequence' ? '顺序播放' : playMode === 'random' ? '随机播放' : '循环播放'}
                      onClick={() => setData((prev) => ({ ...prev, settings: { ...prev.settings, playMode: cyclePlayMode(prev.settings.playMode) } }))}
                    >
                      <PlayModeIcon size={16} />
                    </button>
                    <button className={`rounded-md p-2 ${data.settings.showLyrics ? 'bg-[#007aff] text-white' : 'bg-black/5 dark:bg-white/10'}`} onClick={() => setData((prev) => ({ ...prev, settings: { ...prev.settings, showLyrics: !prev.settings.showLyrics } }))}>词</button>
                    <button
                      className={`rounded-md p-2 ${data.settings.lyricClickThrough ? 'bg-[#007aff] text-white' : 'bg-black/5 dark:bg-white/10'}`}
                      onClick={() => setData((prev) => ({ ...prev, settings: { ...prev.settings, lyricClickThrough: !prev.settings.lyricClickThrough } }))}
                    >
                      穿
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="w-10 text-right text-xs text-black/50 dark:text-white/50">{formatDuration(time)}</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(trackDuration || currentTrack?.duration || 0, 1)}
                    step={1}
                    value={Math.min(time, trackDuration || currentTrack?.duration || 0)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      const audio = audioRef.current;
                      if (!audio) return;
                      audio.currentTime = next;
                      setTime(next);
                    }}
                    className="h-1.5 flex-1 appearance-none rounded-full bg-black/10 dark:bg-white/15 accent-[#007aff]"
                  />
                  <span className="w-10 text-xs text-black/50 dark:text-white/50">{formatDuration(trackDuration || currentTrack?.duration || 0)}</span>
                  <div className="ml-2 flex items-center gap-2 rounded-md px-2 py-1 bg-black/5 dark:bg-white/10">
                    <Volume2 size={14} className="text-black/55 dark:text-white/60" />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(volume * 100)}
                      onChange={(e) => {
                        const next = Math.max(0, Math.min(100, Number(e.target.value)));
                        setData((prev) => ({ ...prev, settings: { ...prev.settings, volume: next / 100 } }));
                      }}
                      className="h-1.5 w-24 appearance-none rounded-full bg-black/10 dark:bg-white/15 accent-[#007aff]"
                      title="音量"
                    />
                    <span className="w-9 text-right text-[11px] text-black/55 dark:text-white/60">{Math.round(volume * 100)}%</span>
                  </div>
                </div>
                {playError && (
                  <div className="mt-1 text-xs text-red-500">{playError}</div>
                )}
              </div>
            </div>
          </main>
        </div>

        <AnimatePresence>
          {cloudDetail.open && cloudDetail.track && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={SPRING}
              className="absolute inset-x-4 top-4 bottom-[128px] z-[100] rounded-2xl border border-black/8 dark:border-white/12 bg-white/86 dark:bg-[#1f1f1f]/90 backdrop-blur-3xl shadow-2xl shadow-black/20 overflow-hidden"
            >
              <div className="flex h-full flex-col p-5">
                <div className="flex shrink-0 items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <button className="rounded-lg p-3 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15" onClick={() => setCloudDetail((prev) => ({ ...prev, open: false }))} title="关闭详情">
                      <ChevronDown size={22} />
                    </button>
                    <div className="min-w-0">
                      <div className="truncate text-lg font-semibold tracking-tight">{cloudDetail.track.title}</div>
                      <div className="truncate text-sm text-black/55 dark:text-white/60">{cloudDetail.track.artist} · {cloudDetail.track.album}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-black/50 dark:text-white/55">
                    {cloudDetail.busy && <span className="flex items-center gap-1"><Loader2 size={13} className="animate-spin" /> 加载中</span>}
                    <span className="rounded-full px-2 py-1 bg-[#007aff]/12 text-[#0066d6] dark:bg-[#007aff]/22 dark:text-[#8ec1ff]">{PROVIDERS[cloudDetail.track.provider]?.label || '云音乐'}</span>
                  </div>
                </div>

                <div className="mt-5 grid min-h-0 flex-1 grid-cols-[210px_minmax(0,1fr)_260px] gap-5">
                  <div className="min-h-0">
                    <div className="overflow-hidden rounded-2xl border border-black/8 dark:border-white/12 bg-white/22 dark:bg-white/8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.28)]">
                      <div className="aspect-square w-full">
                        {cloudDetail.coverDataUrl ? (
                          <img src={cloudDetail.coverDataUrl} alt="cover" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center"><Disc3 size={70} className="text-black/55 dark:text-white/70" /></div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-black/55 dark:text-white/60">
                      <div>发布时间：{cloudDetail.track.publishTime ? new Date(cloudDetail.track.publishTime).toLocaleDateString() : '未知'}</div>
                      <div>时长：{formatDuration(cloudDetail.track.duration)}</div>
                      {cloudDetail.url?.size ? <div>预估大小：{formatBytes(cloudDetail.url.size)}</div> : <div>预估大小：未知</div>}
                      {cloudDetail.url?.bitrate ? <div>码率：{cloudDetail.url.bitrate} kbps</div> : null}
                    </div>
                  </div>

                  <div className="min-h-0 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] p-3">
                    <div className="mb-2 text-sm font-medium">歌词预览</div>
                    <div className="apple-scroll h-full max-h-[calc(100%-28px)] overflow-auto whitespace-pre-wrap text-sm leading-7 text-black/70 dark:text-white/75">
                      {cloudDetail.lyric?.lrc?.trim() || (cloudDetail.busy ? '正在获取歌词...' : '暂无歌词')}
                    </div>
                  </div>

                  <div className="min-h-0 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] p-3">
                    <div className="text-sm font-medium text-black/85 dark:text-white/90">下载</div>
                    <div className="mt-3 space-y-3 text-xs">
                      <label className="block">
                        <span className="mb-1 block text-black/60 dark:text-white/65">音质</span>
                        <select
                          value={cloudDetail.quality || downloadSettings.quality}
                          onChange={(e) => {
                            const next = e.target.value;
                            setCloudDetail((prev) => ({ ...prev, quality: next, url: null }));
                            loadCloudSongUrlForDetail(cloudDetail.track, next);
                          }}
                          className={SELECT_CLASS}
                        >
                          {QUALITY_OPTIONS.map((quality) => (
                            <option key={quality} value={quality} className={SELECT_OPTION_CLASS}>{qualityLabel(quality)}</option>
                          ))}
                        </select>
                      </label>
                      {cloudDetailDownloaded ? (
                        <div className="flex w-full items-center justify-center rounded-md py-2 text-sm bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/18 dark:text-emerald-300">
                          已下载到本地
                        </div>
                      ) : (
                        <button
                          className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-sm text-white bg-gradient-to-b from-blue-500 to-blue-600 border border-white/20 disabled:opacity-55"
                          disabled={cloudDetailDownloading}
                          onClick={() => startCloudDownload(cloudDetail.track, cloudDetail.quality || downloadSettings.quality)}
                        >
                          <Download size={16} /> {cloudDetailDownloading ? '已在下载队列' : '下载到本地'}
                        </button>
                      )}
                      {downloadSettings.directory ? (
                        <div className="break-all text-black/50 dark:text-white/55">保存到：{downloadSettings.directory}</div>
                      ) : (
                        <div className="text-black/50 dark:text-white/55">未设置目录时将保存到系统音乐目录下的 YMusicPlayer Downloads</div>
                      )}
                      {cloudDetail.error && <div className="rounded-md bg-red-500/10 px-2 py-1.5 text-red-500">{cloudDetail.error}</div>}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {contextMenu && (() => {
            const t = contextMenu.track?.sourceType === 'remote' ? contextMenu.track : trackMap.get(contextMenu.trackId);
            if (!t) return null;
            const isRemote = t.sourceType === 'remote';
            const isRemoteDownloaded = isRemote && completedDownloadKeys.has(remoteTaskKey(t));
            const isRemoteDownloading = isRemote && activeDownloadKeys.has(remoteTaskKey(t));
            return (
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING} style={{ left: contextMenu.x, top: contextMenu.y }} className="absolute z-50 w-52 rounded-lg border border-black/10 dark:border-white/15 bg-white/80 dark:bg-[#323232]/90 backdrop-blur-xl shadow-2xl">
                {isRemote ? (
                  <>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { openCloudDetail(t); setContextMenu(null); }}>查看详情</button>
                    {isRemoteDownloaded ? (
                      <div className="px-3 py-2 text-sm text-emerald-600 dark:text-emerald-300">已下载到本地</div>
                    ) : isRemoteDownloading ? (
                      <div className="px-3 py-2 text-sm text-black/50 dark:text-white/55">已在下载队列</div>
                    ) : (
                      <button className="w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { startCloudDownload(t); setContextMenu(null); }}>下载到本地</button>
                    )}
                    <div className="h-px bg-black/5 dark:bg-white/10 my-1" />
                    <button
                      className="w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                      onClick={() => {
                        navigator.clipboard?.writeText(`${t.artist} - ${t.title}`);
                        setContextMenu(null);
                      }}
                    >
                      复制歌曲信息
                    </button>
                  </>
                ) : (
                  <>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { setPendingQueue((q) => [t.id, ...q]); setContextMenu(null); }}>下一首播放</button>
                    <div className="h-px bg-black/5 dark:bg-white/10 my-1" />
                    {data.playlists.map((p) => (
                      <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { addTrackToPlaylist(t.id, p.id); setContextMenu(null); }}>添加到 {p.name}</button>
                    ))}
                    <div className="h-px bg-black/5 dark:bg-white/10 my-1" />
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { electronAPI?.showItemInFolder?.(t.path); setContextMenu(null); }}>打开文件所在位置</button>
                    <button
                      className="w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10 disabled:text-black/35 dark:disabled:text-white/35"
                      disabled={scrapeBusyId === t.id || scrapeBusyId === 'library'}
                      onClick={() => { scrapeLocalTrack(t); setContextMenu(null); }}
                    >
                      {scrapeBusyId === t.id ? '自动匹配中...' : '自动匹配信息/歌词'}
                    </button>
                    <button className="w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { rescanSingle(t); setContextMenu(null); }}>重新扫描这首歌曲</button>
                    <button className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-500/10" onClick={() => { removeTrack(t.id); setContextMenu(null); }}>从播放器移除</button>
                  </>
                )}
              </motion.div>
            );
          })()}
        </AnimatePresence>

      </div>

      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SPRING}
            className={`absolute inset-0 z-[110] flex items-center justify-center ${dark ? 'bg-black/32' : 'bg-black/10'}`}
            onClick={() => setSettingsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.97, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.98, y: 6 }}
              transition={SPRING}
              onClick={(e) => e.stopPropagation()}
              className={`w-[720px] max-h-[86vh] rounded-2xl border shadow-2xl shadow-black/20 p-5 overflow-hidden ${
                dark ? 'border-[#3a3a3a] bg-[#242424] text-white' : 'border-black/10 bg-[#f7f8fa] text-black'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-base tracking-tight font-medium">设置</div>
                <button className="rounded-md p-1.5 bg-black/5 dark:bg-white/10" onClick={() => setSettingsOpen(false)}><X size={16} /></button>
              </div>

              <div className="apple-scroll mt-4 max-h-[72vh] space-y-4 overflow-auto pr-1">
                <section className="rounded-xl p-3 bg-black/[0.03] dark:bg-white/[0.06]">
                  <div className="mb-1 text-xs text-black/60 dark:text-white/70">文件夹管理</div>
                  <div className="flex items-center gap-2 mb-2">
                    <button className="rounded px-2 py-1 text-xs bg-black/5 dark:bg-white/10" onClick={pickAndScanFolders} disabled={scanBusy}>
                      {scanBusy ? '扫描中...' : '添加文件夹'}
                    </button>
                    <button className="rounded px-2 py-1 text-xs bg-black/5 dark:bg-white/10" onClick={rescanManagedFolders} disabled={scanBusy || !(data.scanFolders || []).length}>
                      重扫全部
                    </button>
                  </div>
                  <div className="apple-scroll max-h-32 overflow-auto space-y-1 pr-1">
                    {(data.scanFolders || []).map((folder) => (
                      <div key={folder} className="flex items-center gap-2 rounded-md px-2 py-1 bg-black/[0.04] dark:bg-white/[0.08]">
                        <div className="flex-1 truncate text-xs text-black/70 dark:text-white/75" title={folder}>{folder}</div>
                        <button className="rounded px-1.5 py-0.5 text-xs bg-black/5 dark:bg-white/10" onClick={() => removeManagedFolder(folder)} disabled={scanBusy}>移除</button>
                      </div>
                    ))}
                    {!(data.scanFolders || []).length && <div className="text-xs text-black/50 dark:text-white/55">未添加目录</div>}
                  </div>
                </section>

                <section className="rounded-xl p-3 bg-black/[0.03] dark:bg-white/[0.06]">
                  <div className="mb-1 text-xs text-black/60 dark:text-white/70">背景图</div>
                  <div className="flex items-center gap-2 mb-2">
                    <button className="rounded px-2 py-1 text-xs bg-black/5 dark:bg-white/10" onClick={pickBackgroundImage}>更换背景图</button>
                    <button className="rounded px-2 py-1 text-xs bg-black/5 dark:bg-white/10" onClick={clearBackgroundImage}>清除</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-black/60 dark:text-white/70 w-20">模糊度</span>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={1}
                      value={bgBlur}
                      onChange={(e) =>
                        setData((prev) => ({
                          ...prev,
                          settings: { ...prev.settings, backgroundBlur: Number(e.target.value) }
                        }))
                      }
                      className="h-1.5 flex-1 appearance-none rounded-full bg-black/10 dark:bg-white/15 accent-[#007aff]"
                    />
                    <span className="text-xs text-black/60 dark:text-white/70 w-8 text-right">{bgBlur}</span>
                  </div>
                </section>

                <section className="rounded-xl p-3 bg-black/[0.03] dark:bg-white/[0.06]">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-black/60 dark:text-white/70"><Cloud size={14} /> 云音乐</div>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={!!cloudSettings.enabled} onChange={(e) => updateCloudSettings({ enabled: e.target.checked })} />
                      启用云端搜索
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">API Base URL</span>
                      <input value={cloudSettings.baseUrl || ''} onChange={(e) => updateCloudSettings({ baseUrl: e.target.value })} placeholder="https://gateway.karpov.cn/api/docs-proxy" className={INPUT_CLASS} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">API Key / sid（仅保存到本机配置）</span>
                      <input type="password" value={cloudSettings.apiKey || ''} onChange={(e) => updateCloudSettings({ apiKey: e.target.value })} placeholder="填写 API Key 或 sid，不需要 Bearer" className={INPUT_CLASS} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">默认来源</span>
                      <select value={cloudSettings.activeProvider || 'qqmusic'} onChange={(e) => updateCloudSettings({ activeProvider: e.target.value, enabledProviders: [...new Set([...(cloudSettings.enabledProviders || []), e.target.value])] })} className={SELECT_CLASS}>
                        {Object.entries(PROVIDERS).map(([value, item]) => <option key={value} value={value} className={SELECT_OPTION_CLASS}>{item.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">搜索模式</span>
                      <select value={cloudSettings.searchMode || 'single'} onChange={(e) => updateCloudSettings({ searchMode: e.target.value })} className={SELECT_CLASS}>
                        <option value="single" className={SELECT_OPTION_CLASS}>单来源搜索（当前默认）</option>
                        <option value="multi" className={SELECT_OPTION_CLASS}>多来源并发（同时搜索已启用来源）</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {Object.entries(PROVIDERS).map(([value, item]) => (
                      <label key={value} className="flex items-center gap-1 rounded-md px-2 py-1 bg-black/5 dark:bg-white/10">
                        <input type="checkbox" checked={(cloudSettings.enabledProviders || []).includes(value)} onChange={() => toggleCloudProvider(value)} />
                        {item.label}
                      </label>
                    ))}
                    <label className="ml-auto flex items-center gap-1">
                      每页
                      <input type="number" min={1} max={100} value={cloudSettings.pageSize || 20} onChange={(e) => updateCloudSettings({ pageSize: Math.max(1, Math.min(100, Number(e.target.value) || 20)) })} className="w-16 rounded px-2 py-1 bg-white text-black dark:bg-[#303030] dark:text-white outline-none" />
                    </label>
                    <button className="rounded px-2 py-1 bg-black/5 dark:bg-white/10" onClick={testCloudConnection}>测试连接</button>
                  </div>
                  {cloudTestMessage && <div className={`mt-2 text-xs ${cloudTestMessage.includes('成功') ? 'text-[#007aff] dark:text-[#8ec1ff]' : 'text-red-500'}`}>{cloudTestMessage}</div>}
                  <div className="mt-3 rounded-lg bg-black/[0.035] p-2 text-xs dark:bg-white/[0.055]">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-black/60 dark:text-white/70">歌曲信息刮削与歌词适配</div>
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded px-2 py-1 bg-black/5 dark:bg-white/10 disabled:opacity-50"
                          disabled={!currentTrack || scrapeBusyId === currentTrack?.id || scrapeBusyId === 'library'}
                          onClick={() => scrapeLocalTrack(currentTrack)}
                        >
                          {scrapeBusyId === currentTrack?.id ? '当前匹配中...' : '匹配当前歌曲'}
                        </button>
                        <button
                          className="rounded px-2 py-1 bg-[#007aff]/12 text-[#0066d6] dark:bg-[#007aff]/22 dark:text-[#8ec1ff] disabled:opacity-50"
                          disabled={scrapeBusyId === 'library' || !data.tracks.length}
                          onClick={() => scrapeLibrary()}
                        >
                          {scrapeBusyId === 'library' ? '全库匹配中...' : '一键匹配曲库'}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={cloudSettings.scrapeOverwriteMetadata !== false} onChange={(e) => updateCloudSettings({ scrapeOverwriteMetadata: e.target.checked })} /> 匹配后覆盖歌曲名/歌手/专辑</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={cloudSettings.scrapeDownloadLyric !== false} onChange={(e) => updateCloudSettings({ scrapeDownloadLyric: e.target.checked })} /> 匹配后自动下载同名 LRC</label>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <button
                        className="rounded px-2 py-1 bg-black/5 dark:bg-white/10 disabled:opacity-50"
                        disabled={scrapeBusyId === 'library' || !data.tracks.length}
                        onClick={() => scrapeLibrary({ onlyMissingLyric: true })}
                      >
                        只补齐缺失歌词
                      </button>
                      {scrapeMessage && <div className="min-w-0 flex-1 truncate text-right text-[#007aff] dark:text-[#8ec1ff]" title={scrapeMessage}>{scrapeMessage}</div>}
                    </div>
                    <div className="mt-1 text-[11px] text-black/45 dark:text-white/45">根据接口文档的搜索、详情、歌词接口自动评分匹配；全库模式不会覆盖已有歌词文件。</div>
                  </div>
                </section>

                <section className="rounded-xl p-3 bg-black/[0.03] dark:bg-white/[0.06]">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-black/60 dark:text-white/70"><Sparkles size={14} /> AI 推荐模型</div>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={!!aiSettings.enabled} onChange={(e) => updateAiSettings({ enabled: e.target.checked })} />
                      启用发现音乐
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">API 格式</span>
                      <select value={aiSettings.providerType || 'openai'} onChange={(e) => updateAiSettings({ providerType: e.target.value })} className={SELECT_CLASS}>
                        <option value="openai" className={SELECT_OPTION_CLASS}>OpenAI 兼容 /chat/completions</option>
                        <option value="anthropic" className={SELECT_OPTION_CLASS}>Anthropic 兼容 /v1/messages</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">模型名称</span>
                      <input value={aiSettings.model || ''} onChange={(e) => updateAiSettings({ model: e.target.value })} placeholder={aiSettings.providerType === 'anthropic' ? 'claude-3-5-sonnet-latest' : 'gpt-4o-mini'} className={INPUT_CLASS} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">API Base URL</span>
                      <input value={aiSettings.baseUrl || ''} onChange={(e) => updateAiSettings({ baseUrl: e.target.value })} placeholder={aiSettings.providerType === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'} className={INPUT_CLASS} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">API Key（仅保存到本机配置）</span>
                      <input type="password" value={aiSettings.apiKey || ''} onChange={(e) => updateAiSettings({ apiKey: e.target.value })} placeholder="填写模型服务 API Key" className={INPUT_CLASS} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">Temperature（推荐 0.1-0.3）</span>
                      <input type="number" min={0} max={2} step={0.1} value={aiSettings.temperature ?? 0.2} onChange={(e) => updateAiSettings({ temperature: clampNumber(e.target.value, 0, 2, 0.2) })} className={INPUT_CLASS} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">Max Tokens</span>
                      <input type="number" min={300} max={8000} value={aiSettings.maxTokens || 1800} onChange={(e) => updateAiSettings({ maxTokens: Math.round(clampNumber(e.target.value, 300, 8000, 1800)) })} className={INPUT_CLASS} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">超时（毫秒）</span>
                      <input type="number" min={3000} max={120000} step={1000} value={aiSettings.timeoutMs || 30000} onChange={(e) => updateAiSettings({ timeoutMs: Math.round(clampNumber(e.target.value, 3000, 120000, 30000)) })} className={INPUT_CLASS} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">推荐数量上限</span>
                      <input type="number" min={0} max={20} value={aiSettings.maxRemoteRecommendations ?? 6} onChange={(e) => updateAiSettings({ maxRemoteRecommendations: Math.round(clampNumber(e.target.value, 0, 20, 6)) })} className={INPUT_CLASS} />
                    </label>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={aiSettings.includeLyricSnippets !== false} onChange={(e) => updateAiSettings({ includeLyricSnippets: e.target.checked })} /> 读取精选短歌词片段</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={aiSettings.resolveCloudResults !== false} onChange={(e) => updateAiSettings({ resolveCloudResults: e.target.checked })} /> 自动解析云端候选</label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <button className="rounded px-2 py-1 bg-black/5 dark:bg-white/10" onClick={testAiConnection}>测试模型</button>
                    <button className="rounded px-2 py-1 bg-black/5 dark:bg-white/10" onClick={clearListeningHistory} disabled={!(data.listeningHistory || []).length}>清空听歌历史</button>
                    <span className="text-black/45 dark:text-white/45">已记录 {data.listeningHistory?.length || 0} 条有效播放，最多保留 800 条。</span>
                  </div>
                  {aiTestMessage && <div className={`mt-2 text-xs ${aiTestMessage.includes('成功') ? 'text-[#007aff] dark:text-[#8ec1ff]' : 'text-red-500'}`}>{aiTestMessage}</div>}
                  <div className="mt-3 rounded-lg bg-black/[0.04] p-2 text-[11px] leading-5 text-black/58 dark:bg-white/[0.08] dark:text-white/62">
                    发现音乐请求只发送歌曲元数据、收藏/歌单、播放统计和可选短歌词片段；不发送本地文件路径。AI 只返回搜索候选，实际可查看详情和下载的歌曲由云音乐接口解析，不会自动下载。
                  </div>
                </section>

                <section className="rounded-xl p-3 bg-black/[0.03] dark:bg-white/[0.06]">
                  <div className="mb-2 flex items-center gap-2 text-xs text-black/60 dark:text-white/70"><Download size={14} /> 下载</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="mb-1 text-black/60 dark:text-white/70">下载目录</div>
                      <div className="flex gap-2">
                        <input value={downloadSettings.directory || ''} onChange={(e) => updateDownloadSettings({ directory: e.target.value })} placeholder="默认使用系统音乐目录/YMusicPlayer Downloads" className="min-w-0 flex-1 rounded-[5px] px-2 py-1.5 bg-white dark:bg-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] outline-none" />
                        <button className="rounded px-2 py-1 bg-black/5 dark:bg-white/10" onClick={pickDownloadDirectory}>选择</button>
                        <button className="rounded px-2 py-1 bg-black/5 dark:bg-white/10" onClick={fillDefaultDownloadDirectory}>默认</button>
                      </div>
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">默认音质</span>
                      <select value={downloadSettings.quality || 'MP3_320'} onChange={(e) => updateDownloadSettings({ quality: e.target.value })} className={SELECT_CLASS}>
                        {QUALITY_OPTIONS.map((quality) => (
                          <option key={quality} value={quality} className={SELECT_OPTION_CLASS}>{qualityLabel(quality)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">最大同时下载任务</span>
                      <input type="number" min={1} max={6} value={downloadSettings.maxConcurrentTasks || 2} onChange={(e) => updateDownloadSettings({ maxConcurrentTasks: Math.max(1, Math.min(6, Number(e.target.value) || 2)) })} className={INPUT_CLASS} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-black/60 dark:text-white/70">分段数</span>
                      <input type="number" min={1} max={8} value={downloadSettings.segmentCount || 4} onChange={(e) => updateDownloadSettings({ segmentCount: Math.max(1, Math.min(8, Number(e.target.value) || 4)) })} className={INPUT_CLASS} />
                    </label>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={!!downloadSettings.enableSegmentedDownload} onChange={(e) => updateDownloadSettings({ enableSegmentedDownload: e.target.checked })} /> 分段加速</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={downloadSettings.autoImportAfterDownload !== false} onChange={(e) => updateDownloadSettings({ autoImportAfterDownload: e.target.checked })} /> 下载完成自动加入曲库</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={downloadSettings.autoDownloadLyric !== false} onChange={(e) => updateDownloadSettings({ autoDownloadLyric: e.target.checked })} /> 自动下载歌词</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={downloadSettings.autoQualityFallback !== false} onChange={(e) => updateDownloadSettings({ autoQualityFallback: e.target.checked })} /> 音质不可用自动降级</label>
                  </div>
                </section>

                <section className="rounded-xl p-3 bg-black/[0.03] dark:bg-white/[0.06]">
                  <div className="mb-1 text-xs text-black/60 dark:text-white/70">关闭按钮行为</div>
                  <div className="relative no-drag" onMouseDown={(e) => e.stopPropagation()}>
                    <button
                      className="w-full rounded-[5px] px-2 py-1.5 text-xs text-left bg-white dark:bg-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:bg-black/5 dark:hover:bg-white/15"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCloseBehaviorMenuOpen((v) => !v);
                      }}
                    >
                      {data.settings.closeBehavior === 'tray'
                        ? '最小化到托盘'
                        : data.settings.closeBehavior === 'exit'
                          ? '直接关闭'
                          : '每次询问'}
                    </button>
                    {closeBehaviorMenuOpen && (
                      <div
                        className="absolute left-0 top-[calc(100%+6px)] z-30 w-full rounded-lg border border-black/10 dark:border-white/15 bg-white/95 dark:bg-[#2a2a2a]/95 backdrop-blur-xl shadow-xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {[
                          ['ask', '每次询问'],
                          ['tray', '最小化到托盘'],
                          ['exit', '直接关闭']
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            className={`w-full text-left px-3 py-2 text-xs ${
                              (data.settings.closeBehavior || 'ask') === value
                                ? 'bg-[#007aff] text-white'
                                : 'text-black/85 dark:text-white/90 hover:bg-black/5 dark:hover:bg-white/10'
                            }`}
                            onClick={() => {
                              setData((prev) => ({
                                ...prev,
                                settings: { ...prev.settings, closeBehavior: value }
                              }));
                              setCloseBehaviorMenuOpen(false);
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!!playlistToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SPRING}
            className={`absolute inset-0 z-[120] flex items-center justify-center ${
              dark ? 'bg-black/32' : 'bg-black/10'
            }`}
            onClick={() => setPlaylistToDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.97, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.98, y: 6 }}
              transition={SPRING}
              onClick={(e) => e.stopPropagation()}
              className={`w-[420px] rounded-2xl border shadow-2xl shadow-black/20 p-4 ${
                dark
                  ? 'border-[#3a3a3a] bg-[#242424] text-white'
                  : 'border-black/10 bg-[#f7f8fa] text-black'
              }`}
            >
              <div className="text-base tracking-tight font-medium">删除歌单</div>
              <div className={`mt-2 text-sm ${dark ? 'text-white/82' : 'text-black/70'}`}>
                确定删除歌单「{playlistToDelete.name}」吗？该操作不会删除本地歌曲文件。
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  className={`rounded-md px-3 py-1.5 text-sm ${dark ? 'bg-white/10 text-white' : 'bg-black/5 text-black'}`}
                  onClick={() => setPlaylistToDelete(null)}
                >
                  取消
                </button>
                <button
                  className="rounded-md px-3 py-1.5 text-sm text-white bg-gradient-to-b from-red-500 to-red-600 border border-white/20"
                  onClick={confirmRemovePlaylist}
                >
                  删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;

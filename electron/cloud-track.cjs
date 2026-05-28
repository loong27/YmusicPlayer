const PROVIDERS = {
  qqmusic: { label: 'QQ音乐', shortLabel: 'QQ' },
  netease: { label: '网易云音乐', shortLabel: '网易' },
  kugou: { label: '酷狗音乐', shortLabel: '酷狗' }
};

const AUDIO_QUALITIES = ['MP3_128', 'MP3_320', 'FLAC', 'ATMOS', 'ATMOS2'];

const QUALITY_FALLBACKS = {
  ATMOS2: ['ATMOS2', 'ATMOS', 'FLAC', 'MP3_320', 'MP3_128'],
  ATMOS: ['ATMOS', 'FLAC', 'MP3_320', 'MP3_128'],
  FLAC: ['FLAC', 'MP3_320', 'MP3_128'],
  MP3_320: ['MP3_320', 'MP3_128'],
  MP3_128: ['MP3_128']
};

function safeProvider(provider) {
  return PROVIDERS[provider] ? provider : 'qqmusic';
}

function firstValue(...values) {
  for (const value of values) {
    if (value != null && `${value}`.trim() !== '') return value;
  }
  return '';
}

function normalizeArtists(song) {
  const arrays = [song?.artists, song?.singer, song?.singers, song?.ar].filter(Array.isArray);
  for (const arr of arrays) {
    const names = arr.map((item) => item?.name || item?.title || item).filter(Boolean).map((item) => `${item}`.trim()).filter(Boolean);
    if (names.length) return names.join(' / ');
  }
  return firstValue(song?.artist, song?.artistName, song?.singerName, song?.singername, 'Unknown Artist');
}

function normalizeDurationSeconds(song) {
  const raw = Number(firstValue(song?.duration, song?.durationSeconds, song?.duration_seconds, song?.interval, song?.time, song?.dt, 0));
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.round(raw > 1000 ? raw / 1000 : raw);
}

function normalizeCloudSong(song, fallbackProvider = 'qqmusic') {
  const provider = safeProvider(song?.provider || fallbackProvider);
  const remoteId = `${firstValue(song?.id, song?.songId, song?.songid, song?.mid, song?.songMid, song?.songmid, song?.hash, song?.rid)}`;
  const album = song?.album && typeof song.album === 'object' ? song.album : (song?.al || {});
  const albumText = typeof song?.album === 'string' ? song.album : '';
  return {
    id: `remote:${provider}:${remoteId}`,
    sourceType: 'remote',
    provider,
    providerLabel: PROVIDERS[provider].label,
    providerShortLabel: PROVIDERS[provider].shortLabel,
    remoteId,
    title: firstValue(song?.title, song?.name, song?.songName, song?.songname, 'Unknown Title'),
    subtitle: firstValue(song?.subtitle, song?.subTitle, song?.transName, song?.alias?.[0], ''),
    artist: normalizeArtists(song),
    album: firstValue(album?.name, album?.title, albumText, song?.albumName, song?.albumname, 'Unknown Album'),
    albumPicUrl: firstValue(album?.picUrl, album?.pic, album?.cover, song?.albumPicUrl, song?.picUrl, song?.cover, ''),
    duration: normalizeDurationSeconds(song),
    publishTime: song?.publishTime || song?.publish_time || song?.publishDate || song?.publish_date || song?.time_public || null,
    downloadable: true,
    raw: song || null
  };
}

function sanitizeFileName(value) {
  return `${value || ''}`
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '') || 'Unknown';
}

function extensionForSongUrl(songUrl, quality) {
  const format = `${songUrl?.format || ''}`.toLowerCase().replace(/^\./, '');
  if (format) return `.${format}`;
  return `${quality || ''}`.startsWith('FLAC') || `${quality || ''}`.startsWith('ATMOS') ? '.flac' : '.mp3';
}

module.exports = {
  PROVIDERS,
  AUDIO_QUALITIES,
  QUALITY_FALLBACKS,
  normalizeCloudSong,
  sanitizeFileName,
  extensionForSongUrl,
  safeProvider
};

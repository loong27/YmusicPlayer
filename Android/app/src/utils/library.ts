import type { Track } from '../models/Track';

export type LibraryGroup = {
  key: string;
  title: string;
  tracks: Track[];
};

export function getTrackFolder(track: Track): string {
  const path = track.relativePath?.replace(/\/$/, '');
  if (!path) {
    return '未知文件夹';
  }
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] || path;
}

export function getTrackArtistName(track: Track): string {
  return track.artist || '未知艺术家';
}

export function getTrackAlbumName(track: Track): string {
  return track.album || '未知专辑';
}

export function formatTrackMeta(track: Track): string {
  return `${getTrackArtistName(track)} · ${getTrackAlbumName(track)}`;
}

export function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function groupTracks(tracks: Track[], mode: 'artist' | 'album' | 'folder'): LibraryGroup[] {
  const groups = new Map<string, Track[]>();
  tracks.forEach(track => {
    const key = mode === 'artist' ? getTrackArtistName(track) : mode === 'album' ? getTrackAlbumName(track) : getTrackFolder(track);
    groups.set(key, [...(groups.get(key) || []), track]);
  });
  return [...groups.entries()]
    .map(([key, value]) => ({ key, title: key, tracks: value }))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans'));
}

export function recentlyAddedTracks(tracks: Track[], limit = 100): Track[] {
  return [...tracks]
    .sort((a, b) => (b.dateModified || 0) - (a.dateModified || 0))
    .slice(0, limit);
}

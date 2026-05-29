import type { DiscoverRecommendation } from '../models/Discover';
import type { Track } from '../models/Track';
import { runAiRequest } from './aiClient';
import type { PersistedSettings, PlayHistoryItem } from './storage';

export function buildLocalRecommendations(tracks: Track[], likedTrackIds: string[], history: PlayHistoryItem[]): DiscoverRecommendation[] {
  const likedSet = new Set(likedTrackIds);
  const candidates = tracks
    .filter(track => !likedSet.has(track.id))
    .sort((a, b) => scoreTrack(b, likedSet, history) - scoreTrack(a, likedSet, history))
    .slice(0, 8);

  return candidates.map(track => ({
    track,
    query: {
      title: track.title,
      artist: track.artist,
      album: track.album,
      searchQuery: `${track.artist} ${track.title}`.trim(),
      reason: '基于本地曲库、喜欢和最近播放生成的本地推荐。',
      evidence: [track.album || '本地曲库', track.artist || '未知艺术家'],
      confidence: 0.62,
    },
    reason: '本地优先推荐，不发送本地路径或 content URI。',
    confidence: 0.62,
    evidence: ['local-library', history.length ? 'play-history' : 'metadata'],
  }));
}

export async function buildAiRecommendationSummary(tracks: Track[], likedTrackIds: string[], history: PlayHistoryItem[], settings: PersistedSettings): Promise<string | undefined> {
  const likedSet = new Set(likedTrackIds);
  const metadata = {
    librarySize: tracks.length,
    likedCount: likedTrackIds.length,
    recentCount: history.length,
    topArtists: topValues(tracks.map(track => track.artist).filter(Boolean)),
    likedArtists: topValues(tracks.filter(track => likedSet.has(track.id)).map(track => track.artist).filter(Boolean)),
  };
  return runAiRequest({
    prompt: '基于这些匿名音乐偏好摘要，给出 5 条可用于云搜索的推荐关键词和简短理由。不要引用本地路径。',
    metadata,
  }, settings);
}

function topValues(values: string[]): string[] {
  const counts = new Map<string, number>();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value]) => value);
}

function scoreTrack(track: Track, likedSet: Set<string>, history: PlayHistoryItem[]) {
  const artistLiked = history.some(item => item.trackId === track.id) ? 2 : 0;
  return (track.dateModified || 0) / 1_000_000 + artistLiked + (likedSet.has(track.id) ? -100 : 0);
}

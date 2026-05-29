import type { ParsedLyrics } from '../models/Lyric';
import type { Track } from '../models/Track';
import { parseLrc } from '../utils/lrc';

const memoryLyrics = new Map<string, string>();

export function associateLyrics(trackId: string, lrcText: string) {
  memoryLyrics.set(trackId, lrcText);
}

export async function loadLyricsForTrack(track?: Track): Promise<ParsedLyrics | undefined> {
  if (!track) {
    return undefined;
  }
  const text = memoryLyrics.get(track.id);
  if (!text) {
    return undefined;
  }
  return parseLrc(text);
}

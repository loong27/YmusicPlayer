import type { ParsedLyrics } from '../models/Lyric';

const timeTagPattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

export function parseLrc(input: string): ParsedLyrics {
  const lines = input.split(/\r?\n/);
  let offsetMs = 0;
  const parsedLines: ParsedLyrics['lines'] = [];

  lines.forEach(rawLine => {
    const offsetMatch = rawLine.match(/^\[offset:([+-]?\d+)\]/i);
    if (offsetMatch) {
      offsetMs = Number(offsetMatch[1]) || 0;
      return;
    }

    const matches = [...rawLine.matchAll(timeTagPattern)];
    if (matches.length === 0) {
      return;
    }

    const text = rawLine.replace(timeTagPattern, '').trim();
    matches.forEach(match => {
      const minutes = Number(match[1]) || 0;
      const seconds = Number(match[2]) || 0;
      const fraction = match[3] || '0';
      const fractionMs = Number(fraction.padEnd(3, '0').slice(0, 3)) || 0;
      parsedLines.push({
        timeMs: Math.max(0, minutes * 60_000 + seconds * 1000 + fractionMs + offsetMs),
        text,
      });
    });
  });

  return {
    offsetMs,
    lines: parsedLines.sort((a, b) => a.timeMs - b.timeMs),
  };
}

export function getActiveLyricIndex(lines: ParsedLyrics['lines'], positionMs: number): number {
  let activeIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].timeMs > positionMs) {
      break;
    }
    activeIndex = index;
  }
  return activeIndex;
}

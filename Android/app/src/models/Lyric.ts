export type LyricLine = {
  timeMs: number;
  text: string;
};

export type ParsedLyrics = {
  offsetMs: number;
  lines: LyricLine[];
};

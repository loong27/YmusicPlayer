export type TrackSource = 'local' | 'remote';

export type Track = {
  id: string;
  source: TrackSource;
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  trackNumber?: number;
  year?: number;
  mimeType?: string;
  size?: number;
  dateModified?: number;
  relativePath?: string;
  artworkUri?: string;
  streamUri?: string;
  localUri?: string;
  lyricUri?: string;
  liked?: boolean;
  cloudMatch?: CloudMatch;
};

export type CloudMatch = {
  provider: CloudProvider;
  remoteId: string;
  score?: number;
  matchedAt: string;
};

export type CloudProvider = 'qqmusic' | 'netease' | 'kugou';

export type AudioQuality = 'MP3_128' | 'MP3_320' | 'FLAC' | 'ATMOS' | 'ATMOS2';

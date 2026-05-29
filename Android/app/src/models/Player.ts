import type { Track } from './Track';

export type PlaybackState =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'ended'
  | 'error';

export type RepeatMode = 'off' | 'one' | 'all';

export type NativePlayerState = {
  playbackState: PlaybackState;
  positionMs: number;
  durationMs: number;
  currentIndex: number;
  currentTrackId?: string;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
};

export type PlayerSnapshot = NativePlayerState & {
  queue: Track[];
  currentTrack?: Track;
  error?: string;
};

export const emptyPlayerSnapshot: PlayerSnapshot = {
  playbackState: 'idle',
  positionMs: 0,
  durationMs: 0,
  currentIndex: -1,
  repeatMode: 'off',
  shuffleEnabled: false,
  queue: [],
};

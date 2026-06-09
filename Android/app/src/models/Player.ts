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
  error?: string;
};

export type PlayerDiagnostic = {
  type: string;
  playbackState?: string;
  nativePlaybackState?: string;
  isPlaying?: boolean;
  currentIndex?: number;
  positionMs?: number;
  durationMs?: number;
  message?: string;
  errorCode?: number;
  errorCodeName?: string;
  cause?: string;
  reason?: string;
  foreground?: boolean;
  exception?: string;
  hasBluetoothA2dp?: boolean;
  hasBluetoothSco?: boolean;
  hasWiredHeadset?: boolean;
  hasBuiltInSpeaker?: boolean;
  audioFocusChange?: string;
  audioRouteEvent?: string;
  routeType?: string;
  mediaSessionController?: string;
  command?: string;
};

export type PlayerSnapshot = NativePlayerState & {
  queue: Track[];
  currentTrack?: Track;
  lastDiagnostic?: PlayerDiagnostic;
  diagnosticHistory: PlayerDiagnostic[];
};

export const emptyPlayerSnapshot: PlayerSnapshot = {
  playbackState: 'idle',
  positionMs: 0,
  durationMs: 0,
  currentIndex: -1,
  repeatMode: 'off',
  shuffleEnabled: false,
  queue: [],
  diagnosticHistory: [],
};

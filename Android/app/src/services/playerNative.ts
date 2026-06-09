import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { EmitterSubscription } from 'react-native';
import type { NativePlayerState, RepeatMode } from '../models/Player';
import type { Track } from '../models/Track';

const nativePlayer = NativeModules.Player as
  | {
      setQueue(tracks: Track[], startIndex: number): Promise<NativePlayerState>;
      restoreQueue(tracks: Track[], currentIndex: number, positionMs: number, repeatMode: RepeatMode, shuffleEnabled: boolean, playWhenReady: boolean): Promise<NativePlayerState>;
      playTrack(track: Track): Promise<NativePlayerState>;
      play(): Promise<NativePlayerState>;
      pause(): Promise<NativePlayerState>;
      stop(): Promise<NativePlayerState>;
      seekTo(positionMs: number): Promise<NativePlayerState>;
      skipToNext(): Promise<NativePlayerState>;
      skipToPrevious(): Promise<NativePlayerState>;
      setRepeatMode(mode: RepeatMode): Promise<NativePlayerState>;
      setShuffleEnabled(enabled: boolean): Promise<NativePlayerState>;
      getState(): Promise<NativePlayerState>;
    }
  | undefined;

const emitter = nativePlayer ? new NativeEventEmitter(NativeModules.Player) : undefined;

function ensurePlayer() {
  if (Platform.OS !== 'android' || !nativePlayer) {
    throw new Error('Player native module is not registered. Rebuild the Android app and verify PlayerPackage is added to MainApplication.');
  }
  return nativePlayer;
}

export const playerNative = {
  setQueue: (tracks: Track[], startIndex: number) => ensurePlayer().setQueue(tracks, startIndex),
  restoreQueue: (tracks: Track[], currentIndex: number, positionMs: number, repeatMode: RepeatMode, shuffleEnabled: boolean, playWhenReady: boolean) =>
    ensurePlayer().restoreQueue(tracks, currentIndex, positionMs, repeatMode, shuffleEnabled, playWhenReady),
  playTrack: (track: Track) => ensurePlayer().playTrack(track),
  play: () => ensurePlayer().play(),
  pause: () => ensurePlayer().pause(),
  stop: () => ensurePlayer().stop(),
  seekTo: (positionMs: number) => ensurePlayer().seekTo(positionMs),
  skipToNext: () => ensurePlayer().skipToNext(),
  skipToPrevious: () => ensurePlayer().skipToPrevious(),
  setRepeatMode: (mode: RepeatMode) => ensurePlayer().setRepeatMode(mode),
  setShuffleEnabled: (enabled: boolean) => ensurePlayer().setShuffleEnabled(enabled),
  getState: () => ensurePlayer().getState(),
};

export function addPlayerEventListener<T>(eventName: string, listener: (event: T) => void): EmitterSubscription | undefined {
  return emitter?.addListener(eventName, listener);
}

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { EmitterSubscription } from 'react-native';
import type { NativePlayerState, RepeatMode } from '../models/Player';
import type { Track } from '../models/Track';

export type PlaybackComfortConfig = {
  audioFocusDuckOnTransient: boolean;
  audioFocusPauseOnLoss: boolean;
  audioFocusResumeAfterGain: boolean;
  bluetoothAutoResumeOnReconnect: boolean;
  bluetoothAutoResumeWindowMs: number;
};

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
      configurePlaybackComfort(config: PlaybackComfortConfig): Promise<NativePlayerState>;
      getState(): Promise<NativePlayerState>;
    }
  | undefined;

const emitter = nativePlayer ? new NativeEventEmitter(NativeModules.Player) : undefined;

function ensurePlayer() {
  if (Platform.OS !== 'android' || !nativePlayer) {
    return undefined;
  }
  return nativePlayer;
}

function withPlayer<T>(call: (player: NonNullable<typeof nativePlayer>) => Promise<T>): Promise<T> {
  const player = ensurePlayer();
  if (!player) {
    return Promise.reject(new Error('Player native module is not registered. Rebuild the Android app and verify PlayerPackage is added to MainApplication.'));
  }
  try {
    return call(player);
  } catch (error) {
    return Promise.reject(error);
  }
}

export const playerNative = {
  setQueue: (tracks: Track[], startIndex: number) => withPlayer(player => player.setQueue(tracks, startIndex)),
  restoreQueue: (tracks: Track[], currentIndex: number, positionMs: number, repeatMode: RepeatMode, shuffleEnabled: boolean, playWhenReady: boolean) =>
    withPlayer(player => player.restoreQueue(tracks, currentIndex, positionMs, repeatMode, shuffleEnabled, playWhenReady)),
  playTrack: (track: Track) => withPlayer(player => player.playTrack(track)),
  play: () => withPlayer(player => player.play()),
  pause: () => withPlayer(player => player.pause()),
  stop: () => withPlayer(player => player.stop()),
  seekTo: (positionMs: number) => withPlayer(player => player.seekTo(positionMs)),
  skipToNext: () => withPlayer(player => player.skipToNext()),
  skipToPrevious: () => withPlayer(player => player.skipToPrevious()),
  setRepeatMode: (mode: RepeatMode) => withPlayer(player => player.setRepeatMode(mode)),
  setShuffleEnabled: (enabled: boolean) => withPlayer(player => player.setShuffleEnabled(enabled)),
  configurePlaybackComfort: (config: PlaybackComfortConfig) => withPlayer(player => player.configurePlaybackComfort(config)),
  getState: () => withPlayer(player => player.getState()),
};

export function addPlayerEventListener<T>(eventName: string, listener: (event: T) => void): EmitterSubscription | undefined {
  return emitter?.addListener(eventName, listener);
}

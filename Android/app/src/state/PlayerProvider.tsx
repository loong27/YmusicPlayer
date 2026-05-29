import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { NativePlayerState, PlayerSnapshot, RepeatMode } from '../models/Player';
import { emptyPlayerSnapshot } from '../models/Player';
import type { Track } from '../models/Track';
import { requestNotificationPermission } from '../services/androidPermissions';
import { addPlayerEventListener, playerNative } from '../services/playerNative';
import { loadPlayerState, savePlayerState } from '../services/storage';
import { useCollection } from './CollectionProvider';
import { useSettings } from './SettingsProvider';

export type PlayerContextValue = PlayerSnapshot & {
  playQueue: (queue: Track[], startIndex: number) => Promise<void>;
  replaceQueue: (queue: Track[], startIndex: number, autoPlay?: boolean) => Promise<void>;
  addToQueue: (track: Track) => Promise<void>;
  playNext: (track: Track) => Promise<void>;
  removeFromQueue: (index: number) => Promise<void>;
  moveQueueItem: (fromIndex: number, toIndex: number) => Promise<void>;
  clearQueue: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  setRepeatMode: (mode: RepeatMode) => Promise<void>;
  setShuffleEnabled: (enabled: boolean) => Promise<void>;
};

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);
const POSITION_SAVE_INTERVAL_MS = 15_000;

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { settings, isLoading: isSettingsLoading } = useSettings();
  const { recordPlay } = useCollection();
  const [snapshot, setSnapshot] = useState<PlayerSnapshot>(emptyPlayerSnapshot);
  const snapshotRef = useRef(snapshot);
  const lastPositionSaveAtRef = useRef(0);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const persistSnapshot = useCallback((state: PlayerSnapshot = snapshotRef.current) => {
    if (state.queue.length === 0) {
      return Promise.resolve();
    }
    lastPositionSaveAtRef.current = Date.now();
    return savePlayerState({
      queue: state.queue,
      currentIndex: Math.max(0, state.currentIndex),
      positionMs: state.positionMs,
      repeatMode: state.repeatMode,
      shuffleEnabled: state.shuffleEnabled,
    }).catch(() => undefined);
  }, []);

  const applyNativeState = useCallback((state: NativePlayerState) => {
    setSnapshot(previous => {
      const currentIndex = state.currentIndex >= 0 ? state.currentIndex : previous.currentIndex;
      const currentTrack = previous.queue[currentIndex];
      return { ...previous, ...state, currentIndex, currentTrack, error: undefined };
    });
  }, []);

  useEffect(() => {
    if (isSettingsLoading) {
      return undefined;
    }

    let isMounted = true;

    async function restore() {
      let persistedQueue: Track[] | undefined;
      if (settings.restoreQueueOnLaunch) {
        const persisted = await loadPlayerState();
        if (persisted && persisted.queue.length > 0) {
          persistedQueue = persisted.queue;
          const restoredNativeState = await playerNative.restoreQueue(
            persisted.queue,
            persisted.currentIndex,
            persisted.positionMs,
            persisted.repeatMode,
            persisted.shuffleEnabled,
          );
          if (isMounted) {
            setSnapshot(previous => ({
              ...previous,
              ...restoredNativeState,
              queue: persisted.queue,
              currentIndex: restoredNativeState.currentIndex,
              currentTrack: persisted.queue[restoredNativeState.currentIndex],
              playbackState: 'paused',
            }));
          }
        }
      }

      const nativeState = await playerNative.getState();
      if (isMounted) {
        setSnapshot(previous => {
          const queue = previous.queue.length > 0 ? previous.queue : (persistedQueue || []);
          const currentIndex = nativeState.currentIndex >= 0 ? nativeState.currentIndex : previous.currentIndex;
          return {
            ...previous,
            ...nativeState,
            queue,
            currentIndex,
            currentTrack: queue[currentIndex],
            playbackState: nativeState.playbackState === 'playing' ? 'playing' : previous.playbackState === 'paused' ? 'paused' : nativeState.playbackState,
          };
        });
      }
    }

    restore().catch(error => {
      setSnapshot(previous => ({ ...previous, error: error instanceof Error ? error.message : '恢复播放状态失败' }));
    });

    const subscriptions = [
      addPlayerEventListener<NativePlayerState>('PlayerStateChanged', applyNativeState),
      addPlayerEventListener<{ positionMs: number; durationMs: number }>('PlayerPositionChanged', event => {
        setSnapshot(previous => ({ ...previous, ...event }));
      }),
      addPlayerEventListener<{ currentIndex: number; currentTrackId?: string }>('PlayerTrackChanged', event => {
        setSnapshot(previous => ({
          ...previous,
          currentIndex: event.currentIndex,
          currentTrackId: event.currentTrackId,
          currentTrack: previous.queue[event.currentIndex],
        }));
      }),
      addPlayerEventListener<{ message?: string }>('PlayerError', event => {
        setSnapshot(previous => ({ ...previous, playbackState: 'error', error: event.message || '播放失败' }));
      }),
    ];

    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        persistSnapshot();
      }
    });

    return () => {
      isMounted = false;
      subscriptions.forEach(subscription => subscription?.remove());
      appStateSubscription.remove();
      persistSnapshot();
    };
  }, [applyNativeState, isSettingsLoading, persistSnapshot, settings.restoreQueueOnLaunch]);

  useEffect(() => {
    if (snapshot.queue.length === 0) {
      return;
    }
    const shouldSaveImmediately = snapshot.playbackState === 'paused' || snapshot.playbackState === 'ended' || snapshot.playbackState === 'error';
    const shouldSaveThrottled = Date.now() - lastPositionSaveAtRef.current >= POSITION_SAVE_INTERVAL_MS;
    if (shouldSaveImmediately || shouldSaveThrottled) {
      persistSnapshot(snapshot);
    }
  }, [persistSnapshot, snapshot]);

  const runCommand = useCallback(async (command: () => Promise<NativePlayerState>) => {
    const previousPlaybackState = snapshotRef.current.playbackState;
    setSnapshot(previous => ({ ...previous, playbackState: previous.playbackState === 'idle' ? 'loading' : previous.playbackState, error: undefined }));
    try {
      applyNativeState(await command());
    } catch (error) {
      setSnapshot(previous => ({
        ...previous,
        playbackState: previousPlaybackState === 'loading' ? 'idle' : previousPlaybackState,
        error: error instanceof Error ? error.message : '播放命令失败',
      }));
    }
  }, [applyNativeState]);

  const replaceQueue = useCallback(async (queue: Track[], startIndex: number, autoPlay = true) => {
    if (queue.length === 0) {
      setSnapshot(previous => ({ ...previous, ...emptyPlayerSnapshot }));
      await playerNative.stop().catch(() => undefined);
      return;
    }
    const safeIndex = Math.min(Math.max(startIndex, 0), queue.length - 1);
    setSnapshot(previous => ({
      ...previous,
      queue,
      currentIndex: safeIndex,
      currentTrack: queue[safeIndex],
      playbackState: autoPlay ? 'loading' : 'paused',
      error: undefined,
    }));
    if (autoPlay) {
      await runCommand(() => playerNative.setQueue(queue, safeIndex));
    } else {
      await runCommand(() => playerNative.restoreQueue(queue, safeIndex, 0, snapshotRef.current.repeatMode, snapshotRef.current.shuffleEnabled));
    }
    await persistSnapshot({ ...snapshotRef.current, queue, currentIndex: safeIndex, currentTrack: queue[safeIndex], positionMs: 0 });
  }, [persistSnapshot, runCommand]);

  const playQueue = useCallback(async (queue: Track[], startIndex: number) => {
    if (queue.length === 0) {
      return;
    }
    requestNotificationPermission().catch(() => undefined);
    const safeIndex = Math.min(Math.max(startIndex, 0), queue.length - 1);
    const selectedTrack = queue[safeIndex];
    await replaceQueue(queue, safeIndex, true);
    await recordPlay({
      trackId: selectedTrack.id,
      playedAt: new Date().toISOString(),
      durationPlayedMs: 0,
      completedRatio: 0,
      source: 'library',
    });
  }, [recordPlay, replaceQueue]);

  const syncQueue = useCallback(async (queue: Track[], currentIndex: number) => {
    const safeIndex = queue.length === 0 ? -1 : Math.min(Math.max(currentIndex, 0), queue.length - 1);
    setSnapshot(previous => ({
      ...previous,
      queue,
      currentIndex: safeIndex,
      currentTrack: safeIndex >= 0 ? queue[safeIndex] : undefined,
    }));
    if (queue.length === 0) {
      await playerNative.stop().catch(() => undefined);
      return;
    }
    await playerNative.restoreQueue(queue, safeIndex, snapshotRef.current.positionMs, snapshotRef.current.repeatMode, snapshotRef.current.shuffleEnabled).catch(() => undefined);
    await persistSnapshot({ ...snapshotRef.current, queue, currentIndex: safeIndex, currentTrack: queue[safeIndex] });
  }, [persistSnapshot]);

  const value = useMemo<PlayerContextValue>(() => ({
    ...snapshot,
    playQueue,
    replaceQueue,
    addToQueue: (track: Track) => syncQueue([...snapshot.queue, track], snapshot.currentIndex >= 0 ? snapshot.currentIndex : 0),
    playNext: (track: Track) => {
      const insertIndex = Math.max(0, snapshot.currentIndex + 1);
      const nextQueue = [...snapshot.queue.slice(0, insertIndex), track, ...snapshot.queue.slice(insertIndex)];
      return syncQueue(nextQueue, snapshot.currentIndex >= 0 ? snapshot.currentIndex : 0);
    },
    removeFromQueue: (index: number) => {
      if (index < 0 || index >= snapshot.queue.length) {
        return Promise.resolve();
      }
      const nextQueue = snapshot.queue.filter((_, itemIndex) => itemIndex !== index);
      const nextIndex = index < snapshot.currentIndex ? snapshot.currentIndex - 1 : Math.min(snapshot.currentIndex, nextQueue.length - 1);
      return syncQueue(nextQueue, nextIndex);
    },
    moveQueueItem: (fromIndex: number, toIndex: number) => {
      if (fromIndex < 0 || fromIndex >= snapshot.queue.length || toIndex < 0 || toIndex >= snapshot.queue.length || fromIndex === toIndex) {
        return Promise.resolve();
      }
      const nextQueue = [...snapshot.queue];
      const [item] = nextQueue.splice(fromIndex, 1);
      nextQueue.splice(toIndex, 0, item);
      const nextIndex = snapshot.currentIndex === fromIndex
        ? toIndex
        : fromIndex < snapshot.currentIndex && toIndex >= snapshot.currentIndex
          ? snapshot.currentIndex - 1
          : fromIndex > snapshot.currentIndex && toIndex <= snapshot.currentIndex
            ? snapshot.currentIndex + 1
            : snapshot.currentIndex;
      return syncQueue(nextQueue, nextIndex);
    },
    clearQueue: () => syncQueue([], -1),
    togglePlayPause: () => {
      if (snapshot.playbackState === 'playing') {
        return runCommand(playerNative.pause).then(() => persistSnapshot());
      }
      if (snapshot.queue.length > 0 && snapshot.durationMs === 0) {
        return playQueue(snapshot.queue, Math.max(0, snapshot.currentIndex));
      }
      return runCommand(playerNative.play);
    },
    play: () => snapshot.queue.length > 0 && snapshot.durationMs === 0
      ? playQueue(snapshot.queue, Math.max(0, snapshot.currentIndex))
      : runCommand(playerNative.play),
    pause: () => runCommand(playerNative.pause).then(() => persistSnapshot()),
    seekTo: (positionMs: number) => runCommand(() => playerNative.seekTo(positionMs)).then(() => persistSnapshot()),
    next: () => runCommand(playerNative.skipToNext).then(() => persistSnapshot()),
    previous: () => runCommand(playerNative.skipToPrevious).then(() => persistSnapshot()),
    setRepeatMode: (mode: RepeatMode) => runCommand(() => playerNative.setRepeatMode(mode)).then(() => persistSnapshot()),
    setShuffleEnabled: (enabled: boolean) => runCommand(() => playerNative.setShuffleEnabled(enabled)).then(() => persistSnapshot()),
  }), [persistSnapshot, playQueue, replaceQueue, runCommand, snapshot, syncQueue]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) {
    throw new Error('usePlayer must be used inside PlayerProvider');
  }
  return value;
}

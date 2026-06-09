import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import type { NativePlayerState, PlayerDiagnostic, PlayerSnapshot, RepeatMode } from '../models/Player';
import { emptyPlayerSnapshot } from '../models/Player';
import type { Track } from '../models/Track';
import { ensurePlayableTrack } from '../services/cloudMusic';
import { requestNotificationPermission } from '../services/androidPermissions';
import { addPlayerEventListener, playerNative } from '../services/playerNative';
import { clearPlayerState, loadPlayerState, savePlayerState } from '../services/storage';
import { useCollection } from './CollectionProvider';
import { useSettings } from './SettingsProvider';

export type PlayerContextValue = PlayerSnapshot & {
  playQueue: (queue: Track[], startIndex: number) => Promise<void>;
  playQueueItem: (index: number) => Promise<void>;
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
const DIAGNOSTIC_HISTORY_LIMIT = 20;

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { settings, isLoading: isSettingsLoading } = useSettings();
  const { recordPlay } = useCollection();
  const [snapshot, setSnapshot] = useState<PlayerSnapshot>(emptyPlayerSnapshot);
  const snapshotRef = useRef(snapshot);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const mountedRef = useRef(true);
  const resyncRequestRef = useRef(0);
  const lastPositionSaveAtRef = useRef(0);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      resyncRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const persistSnapshot = useCallback((state: PlayerSnapshot = snapshotRef.current) => {
    if (state.queue.length === 0) {
      return clearPlayerState().catch(() => undefined);
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

  const safeSetSnapshot = useCallback((updater: React.SetStateAction<PlayerSnapshot>) => {
    if (mountedRef.current) {
      setSnapshot(updater);
    }
  }, []);

  const applyNativeState = useCallback((state: NativePlayerState) => {
    const normalized = normalizeNativeState(state, snapshotRef.current.queue);
    safeSetSnapshot(previous => {
      const currentIndex = normalized.currentIndex >= 0 ? normalized.currentIndex : previous.currentIndex;
      const currentTrack = previous.queue[currentIndex];
      const shouldClearError = normalized.playbackState === 'playing' || normalized.playbackState === 'buffering' || (normalized.playbackState === 'paused' && previous.playbackState !== 'error');
      const error = normalized.error || (shouldClearError ? undefined : previous.error);
      return { ...previous, ...normalized, currentIndex, currentTrack, error };
    });
  }, [safeSetSnapshot]);

  const resyncNativeState = useCallback(async () => {
    const requestId = resyncRequestRef.current + 1;
    resyncRequestRef.current = requestId;
    try {
      const state = await playerNative.getState();
      if (mountedRef.current && requestId === resyncRequestRef.current) {
        applyNativeState(state);
      }
    } catch (error) {
      if (mountedRef.current && requestId === resyncRequestRef.current) {
        safeSetSnapshot(previous => ({
          ...previous,
          lastDiagnostic: {
            type: 'getStateFailed',
            message: error instanceof Error ? error.message : '同步原生播放状态失败',
          },
        }));
      }
    }
  }, [applyNativeState, safeSetSnapshot]);

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
          const restorableQueue = persisted.queue.filter(track => track.localUri || track.streamUri);
          if (restorableQueue.length === 0) {
            return;
          }
          const restoredTrackId = persisted.queue[persisted.currentIndex]?.id;
          const restoredIndex = Math.max(0, restorableQueue.findIndex(track => track.id === restoredTrackId));
          persistedQueue = restorableQueue;
          const restoredNativeState = await playerNative.restoreQueue(
            restorableQueue,
            restoredIndex,
            persisted.positionMs,
            persisted.repeatMode,
            persisted.shuffleEnabled,
            false,
          );
          const normalizedNativeState = normalizeNativeState(restoredNativeState, restorableQueue);
          if (isMounted) {
            safeSetSnapshot(previous => ({
              ...previous,
              ...normalizedNativeState,
              queue: restorableQueue,
              currentIndex: normalizedNativeState.currentIndex,
              currentTrack: normalizedNativeState.currentIndex >= 0 ? restorableQueue[normalizedNativeState.currentIndex] : undefined,
              playbackState: 'paused',
            }));
          }
        }
      }

      const nativeState = await playerNative.getState();
      if (isMounted) {
        safeSetSnapshot(previous => {
          const queue = previous.queue.length > 0 ? previous.queue : (persistedQueue || []);
          const normalizedNativeState = normalizeNativeState(nativeState, queue);
          const currentIndex = normalizedNativeState.currentIndex >= 0 ? normalizedNativeState.currentIndex : previous.currentIndex;
          return {
            ...previous,
            ...normalizedNativeState,
            queue,
            currentIndex,
            currentTrack: currentIndex >= 0 ? queue[currentIndex] : undefined,
            playbackState: normalizedNativeState.playbackState === 'playing' ? 'playing' : previous.playbackState === 'paused' ? 'paused' : normalizedNativeState.playbackState,
          };
        });
      }
    }

    restore().catch(error => {
      if (isMounted) {
        safeSetSnapshot(previous => ({ ...previous, error: error instanceof Error ? error.message : '恢复播放状态失败' }));
      }
    });

    const subscriptions = [
      addPlayerEventListener<NativePlayerState>('PlayerStateChanged', applyNativeState),
      addPlayerEventListener<{ positionMs: number; durationMs: number }>('PlayerPositionChanged', event => {
        safeSetSnapshot(previous => ({ ...previous, ...normalizePositionEvent(event) }));
      }),
      addPlayerEventListener<{ currentIndex: number; currentTrackId?: string }>('PlayerTrackChanged', event => {
        safeSetSnapshot(previous => {
          const currentIndex = event.currentIndex >= 0 && event.currentIndex < previous.queue.length
            ? event.currentIndex
            : event.currentTrackId ? previous.queue.findIndex(track => track.id === event.currentTrackId) : -1;
          return {
            ...previous,
            currentIndex,
            currentTrackId: typeof event.currentTrackId === 'string' ? event.currentTrackId : undefined,
            currentTrack: currentIndex >= 0 ? previous.queue[currentIndex] : undefined,
          };
        });
      }),
      addPlayerEventListener<{ message?: string }>('PlayerError', event => {
        const diagnostic: PlayerDiagnostic = { type: 'playerError', message: event.message || '播放失败' };
        safeSetSnapshot(previous => ({
          ...previous,
          playbackState: 'error',
          error: event.message || '播放失败',
          lastDiagnostic: diagnostic,
          diagnosticHistory: [diagnostic, ...previous.diagnosticHistory].slice(0, DIAGNOSTIC_HISTORY_LIMIT),
        }));
      }),
      addPlayerEventListener<PlayerDiagnostic>('PlayerDiagnostic', event => {
        const diagnostic = normalizeDiagnostic(event);
        safeSetSnapshot(previous => ({ ...previous, lastDiagnostic: diagnostic, diagnosticHistory: [diagnostic, ...previous.diagnosticHistory].slice(0, DIAGNOSTIC_HISTORY_LIMIT) }));
      }),
      addPlayerEventListener<{ currentIndex: number; queueSize: number }>('PlayerQueueChanged', event => {
        safeSetSnapshot(previous => {
          const queueSize = Number.isFinite(event.queueSize) ? Math.max(0, Math.trunc(event.queueSize)) : previous.queue.length;
          if (queueSize === 0) {
            return { ...previous, ...emptyPlayerSnapshot, currentTrack: undefined, error: undefined };
          }
          const currentIndex = event.currentIndex >= 0 && event.currentIndex < previous.queue.length ? event.currentIndex : previous.currentIndex;
          return {
            ...previous,
            currentIndex,
            currentTrack: previous.queue[currentIndex],
            lastDiagnostic: queueSize !== previous.queue.length
              ? { type: 'queueSizeMismatch', currentIndex: event.currentIndex, message: `Native queue size ${queueSize} differs from JS queue size ${previous.queue.length}` }
              : previous.lastDiagnostic,
          };
        });
        const queueSize = Number.isFinite(event.queueSize) ? Math.max(0, Math.trunc(event.queueSize)) : snapshotRef.current.queue.length;
        if (queueSize === 0) {
          clearPlayerState().catch(() => undefined);
        } else if (queueSize !== snapshotRef.current.queue.length) {
          resyncNativeState();
        }
      }),
    ];

    const appStateSubscription = AppState.addEventListener('change', state => {
      const previousState = appStateRef.current;
      appStateRef.current = state;
      if (state !== 'active') {
        persistSnapshot();
      } else if (previousState === 'background' || previousState === 'inactive') {
        resyncNativeState();
      }
    });

    return () => {
      isMounted = false;
      subscriptions.forEach(subscription => subscription?.remove());
      appStateSubscription.remove();
      persistSnapshot();
    };
  }, [applyNativeState, isSettingsLoading, persistSnapshot, resyncNativeState, safeSetSnapshot, settings.restoreQueueOnLaunch]);

  useEffect(() => {
    if (snapshot.queue.length === 0) {
      persistSnapshot(snapshot);
      return;
    }
    const shouldSaveImmediately = snapshot.playbackState === 'paused' || snapshot.playbackState === 'ended' || snapshot.playbackState === 'error';
    const shouldSaveThrottled = Date.now() - lastPositionSaveAtRef.current >= POSITION_SAVE_INTERVAL_MS;
    if (shouldSaveImmediately || shouldSaveThrottled) {
      persistSnapshot(snapshot);
    }
  }, [persistSnapshot, snapshot]);

  useEffect(() => {
    playerNative.configurePlaybackComfort({
      audioFocusDuckOnTransient: settings.audioFocusDuckOnTransient,
      audioFocusPauseOnLoss: settings.audioFocusPauseOnLoss,
      audioFocusResumeAfterGain: settings.audioFocusResumeAfterGain,
      bluetoothAutoResumeOnReconnect: settings.bluetoothAutoResumeOnReconnect,
      bluetoothAutoResumeWindowMs: settings.bluetoothAutoResumeWindowMs,
    }).then(state => {
      if (mountedRef.current) {
        applyNativeState(state);
      }
    }).catch(error => {
      safeSetSnapshot(previous => ({
        ...previous,
        lastDiagnostic: {
          type: 'configurePlaybackComfortFailed',
          message: error instanceof Error ? error.message : '播放舒适性配置同步失败',
        },
      }));
    });
  }, [applyNativeState, safeSetSnapshot, settings.audioFocusDuckOnTransient, settings.audioFocusPauseOnLoss, settings.audioFocusResumeAfterGain, settings.bluetoothAutoResumeOnReconnect, settings.bluetoothAutoResumeWindowMs]);

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
      throw error;
    }
  }, [applyNativeState]);

  const replaceQueue = useCallback(async (queue: Track[], startIndex: number, autoPlay = true) => {
    if (queue.length === 0) {
      setSnapshot(previous => ({ ...previous, ...emptyPlayerSnapshot, currentTrack: undefined, error: undefined }));
      await playerNative.stop().catch(() => undefined);
      await clearPlayerState().catch(() => undefined);
      return;
    }
    const safeIndex = Math.min(Math.max(startIndex, 0), queue.length - 1);
    const previousSnapshot = snapshotRef.current;
    setSnapshot(previous => ({
      ...previous,
      queue,
      currentIndex: safeIndex,
      currentTrack: queue[safeIndex],
      playbackState: autoPlay ? 'loading' : 'paused',
      error: undefined,
    }));
    try {
      if (autoPlay) {
        await runCommand(() => playerNative.setQueue(queue, safeIndex));
      } else {
        await runCommand(() => playerNative.restoreQueue(queue, safeIndex, 0, snapshotRef.current.repeatMode, snapshotRef.current.shuffleEnabled, false));
      }
      await persistSnapshot({ ...snapshotRef.current, queue, currentIndex: safeIndex, currentTrack: queue[safeIndex], positionMs: 0 });
    } catch (error) {
      setSnapshot({
        ...previousSnapshot,
        error: error instanceof Error ? error.message : '播放命令失败',
      });
      throw error;
    }
  }, [persistSnapshot, runCommand]);

  const prepareQueueForNative = useCallback(async (queue: Track[], startIndex: number) => {
    const safeIndex = Math.min(Math.max(startIndex, 0), queue.length - 1);
    const preparedQueue = [...queue];
    const selectedTrack = await ensurePlayableTrack(preparedQueue[safeIndex], settings, settings.cloudDefaultQuality);
    preparedQueue[safeIndex] = selectedTrack;
    const nativeQueue = preparedQueue.filter(track => track.localUri || track.streamUri || track.id === selectedTrack.id);
    const nativeIndex = nativeQueue.findIndex(track => track.id === selectedTrack.id);
    if (nativeIndex < 0) {
      throw new Error('当前曲目缺少可播放地址');
    }
    return { queue: nativeQueue, startIndex: nativeIndex, selectedTrack };
  }, [settings]);

  const playQueue = useCallback(async (queue: Track[], startIndex: number) => {
    if (queue.length === 0) {
      return;
    }
    requestNotificationPermission().catch(() => undefined);
    const prepared = await prepareQueueForNative(queue, startIndex);
    await replaceQueue(prepared.queue, prepared.startIndex, true);
    await recordPlay({
      trackId: prepared.selectedTrack.id,
      playedAt: new Date().toISOString(),
      durationPlayedMs: 0,
      completedRatio: 0,
      source: 'library',
    });
  }, [prepareQueueForNative, recordPlay, replaceQueue]);

  const syncQueue = useCallback(async (queue: Track[], currentIndex: number) => {
    const previousSnapshot = snapshotRef.current;
    const safeIndex = queue.length === 0 ? -1 : Math.min(Math.max(currentIndex, 0), queue.length - 1);
    const nextTrack = safeIndex >= 0 ? queue[safeIndex] : undefined;
    const wasPlaying = previousSnapshot.playbackState === 'playing' || previousSnapshot.playbackState === 'buffering';
    const shouldKeepPosition = Boolean(previousSnapshot.currentTrack?.id && nextTrack?.id === previousSnapshot.currentTrack.id);
    const positionMs = shouldKeepPosition ? previousSnapshot.positionMs : 0;
    setSnapshot(previous => ({
      ...previous,
      queue,
      currentIndex: safeIndex,
      currentTrack: nextTrack,
      positionMs,
    }));
    if (queue.length === 0) {
      await playerNative.stop().catch(() => undefined);
      await clearPlayerState().catch(() => undefined);
      return;
    }
    try {
      await playerNative.restoreQueue(queue, safeIndex, positionMs, previousSnapshot.repeatMode, previousSnapshot.shuffleEnabled, wasPlaying);
      await persistSnapshot({ ...snapshotRef.current, queue, currentIndex: safeIndex, currentTrack: nextTrack, positionMs });
    } catch (error) {
      setSnapshot(previous => ({ ...previous, error: error instanceof Error ? error.message : '同步播放队列失败' }));
      throw error;
    }
  }, [persistSnapshot]);

  const playQueueItem = useCallback(async (index: number) => {
    const currentSnapshot = snapshotRef.current;
    if (currentSnapshot.queue.length === 0 || index < 0 || index >= currentSnapshot.queue.length) {
      return;
    }
    await playQueue(currentSnapshot.queue, index);
  }, [playQueue]);

  const enqueueTrack = useCallback(async (track: Track) => {
    const playableTrack = await ensurePlayableTrack(track, settings, settings.cloudDefaultQuality);
    return syncQueue([...snapshotRef.current.queue, playableTrack], snapshotRef.current.currentIndex >= 0 ? snapshotRef.current.currentIndex : 0);
  }, [settings, syncQueue]);

  const playNextTrack = useCallback(async (track: Track) => {
    const currentSnapshot = snapshotRef.current;
    const playableTrack = await ensurePlayableTrack(track, settings, settings.cloudDefaultQuality);
    const insertIndex = Math.max(0, currentSnapshot.currentIndex + 1);
    const nextQueue = [...currentSnapshot.queue.slice(0, insertIndex), playableTrack, ...currentSnapshot.queue.slice(insertIndex)];
    return syncQueue(nextQueue, currentSnapshot.currentIndex >= 0 ? currentSnapshot.currentIndex : 0);
  }, [settings, syncQueue]);

  const value = useMemo<PlayerContextValue>(() => ({
    ...snapshot,
    playQueue,
    playQueueItem,
    replaceQueue,
    addToQueue: enqueueTrack,
    playNext: playNextTrack,
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
  }), [enqueueTrack, persistSnapshot, playNextTrack, playQueue, playQueueItem, replaceQueue, runCommand, snapshot, syncQueue]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

function normalizeNativeState(state: NativePlayerState, queue: Track[]): NativePlayerState {
  const playbackStates = new Set(['idle', 'loading', 'playing', 'paused', 'buffering', 'ended', 'error']);
  const repeatModes = new Set<RepeatMode>(['off', 'one', 'all']);
  const currentIndex = Number.isFinite(state.currentIndex) ? Math.trunc(state.currentIndex) : -1;
  return {
    playbackState: playbackStates.has(state.playbackState) ? state.playbackState : 'idle',
    positionMs: Number.isFinite(state.positionMs) ? Math.max(0, state.positionMs) : 0,
    durationMs: Number.isFinite(state.durationMs) ? Math.max(0, state.durationMs) : 0,
    currentIndex: currentIndex >= 0 && currentIndex < queue.length ? currentIndex : -1,
    currentTrackId: typeof state.currentTrackId === 'string' ? state.currentTrackId : undefined,
    repeatMode: repeatModes.has(state.repeatMode) ? state.repeatMode : 'off',
    shuffleEnabled: Boolean(state.shuffleEnabled),
    error: typeof state.error === 'string' ? state.error.slice(0, 500) : undefined,
  };
}

function normalizePositionEvent(event: { positionMs: number; durationMs: number }) {
  return {
    positionMs: Number.isFinite(event.positionMs) ? Math.max(0, event.positionMs) : 0,
    durationMs: Number.isFinite(event.durationMs) ? Math.max(0, event.durationMs) : 0,
  };
}

function normalizeDiagnostic(event: unknown): PlayerDiagnostic {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { type: 'invalidDiagnostic' };
  }
  const record = event as Record<string, unknown>;
  return {
    type: typeof record.type === 'string' ? record.type : 'diagnostic',
    message: typeof record.message === 'string' ? record.message.slice(0, 500) : undefined,
    playbackState: typeof record.playbackState === 'string' ? record.playbackState : undefined,
    nativePlaybackState: typeof record.nativePlaybackState === 'string' ? record.nativePlaybackState : undefined,
    isPlaying: typeof record.isPlaying === 'boolean' ? record.isPlaying : undefined,
    currentIndex: typeof record.currentIndex === 'number' && Number.isFinite(record.currentIndex) ? record.currentIndex : undefined,
    positionMs: typeof record.positionMs === 'number' && Number.isFinite(record.positionMs) ? Math.max(0, record.positionMs) : undefined,
    durationMs: typeof record.durationMs === 'number' && Number.isFinite(record.durationMs) ? Math.max(0, record.durationMs) : undefined,
    errorCode: typeof record.errorCode === 'number' && Number.isFinite(record.errorCode) ? record.errorCode : undefined,
    errorCodeName: typeof record.errorCodeName === 'string' ? record.errorCodeName : undefined,
    cause: typeof record.cause === 'string' ? record.cause : undefined,
    reason: typeof record.reason === 'string' ? record.reason : undefined,
    foreground: typeof record.foreground === 'boolean' ? record.foreground : undefined,
    exception: typeof record.exception === 'string' ? record.exception : undefined,
    hasBluetoothA2dp: typeof record.hasBluetoothA2dp === 'boolean' ? record.hasBluetoothA2dp : undefined,
    hasBluetoothSco: typeof record.hasBluetoothSco === 'boolean' ? record.hasBluetoothSco : undefined,
    hasWiredHeadset: typeof record.hasWiredHeadset === 'boolean' ? record.hasWiredHeadset : undefined,
    hasBuiltInSpeaker: typeof record.hasBuiltInSpeaker === 'boolean' ? record.hasBuiltInSpeaker : undefined,
    audioFocusChange: typeof record.audioFocusChange === 'string' ? record.audioFocusChange : undefined,
    audioRouteEvent: typeof record.audioRouteEvent === 'string' ? record.audioRouteEvent : undefined,
    routeType: typeof record.routeType === 'string' ? record.routeType : undefined,
    mediaSessionController: typeof record.mediaSessionController === 'string' ? record.mediaSessionController : undefined,
    command: typeof record.command === 'string' ? record.command : undefined,
  };
}

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) {
    throw new Error('usePlayer must be used inside PlayerProvider');
  }
  return value;
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { DownloadTask, DownloadTaskStatus } from '../models/DownloadTask';
import type { Track } from '../models/Track';
import { ensurePlayableTrack } from '../services/cloudMusic';
import { addDownloadEventListener, createDownloadTask, downloadNative } from '../services/downloadNative';
import { loadDownloadTasks, saveDownloadTasks } from '../services/storage';
import { useSettings } from './SettingsProvider';

type NativeDownloadEvent = Partial<DownloadTask> & { id: string; status: DownloadTaskStatus };

type DownloadContextValue = {
  tasks: DownloadTask[];
  enqueue: (track: Track) => Promise<void>;
  pause: (taskId: string) => Promise<void>;
  resume: (taskId: string) => Promise<void>;
  cancel: (taskId: string) => Promise<void>;
  retry: (taskId: string) => Promise<void>;
  retryFailed: () => Promise<void>;
  clearCompleted: () => Promise<void>;
  clearFailed: () => Promise<void>;
};

const DownloadContext = createContext<DownloadContextValue | undefined>(undefined);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const tasksRef = useRef<DownloadTask[]>([]);
  const mountedRef = useRef(true);
  const { settings } = useSettings();

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const updateTasks = useCallback(async (updater: (current: DownloadTask[]) => DownloadTask[]) => {
    const current = tasksRef.current;
    const next = updater(current);
    if (next === current || !mountedRef.current) {
      return;
    }
    tasksRef.current = next;
    setTasks(next);
    await saveDownloadTasks(next);
  }, []);

  useEffect(() => {
    loadDownloadTasks().then(storedTasks => {
      if (!mountedRef.current) {
        return;
      }
      const recoveredTasks = storedTasks.map(task => task.status === 'downloading' ? { ...task, status: 'paused' as const, updatedAt: new Date().toISOString(), error: task.error || '上次下载已中断，请手动恢复' } : task);
      tasksRef.current = recoveredTasks;
      setTasks(recoveredTasks);
      if (recoveredTasks !== storedTasks) {
        saveDownloadTasks(recoveredTasks).catch(() => undefined);
      }
    }).catch(() => undefined);
    const subscription = addDownloadEventListener<NativeDownloadEvent>('DownloadTaskChanged', event => {
      const safeEvent = normalizeDownloadEvent(event);
      if (safeEvent) {
        updateTasks(current => current.map(task => task.id === safeEvent.id ? mergeTaskEvent(task, safeEvent) : task)).catch(() => undefined);
      }
    });
    return () => {
      mountedRef.current = false;
      subscription?.remove();
    };
  }, [updateTasks]);

  const updateTask = useCallback((taskId: string, patch: Partial<DownloadTask>) => updateTasks(current => current.map(task => task.id === taskId ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task)), [updateTasks]);

  const startNative = useCallback(async (task: DownloadTask) => {
    try {
      const nativeState = await downloadNative.enqueue(task);
      await updateTask(task.id, { status: 'downloading', ...nativeState, error: undefined });
    } catch (error) {
      const message = error instanceof Error && error.message.includes('native module is not registered')
        ? '下载服务暂不可用，请稍后重试。'
        : error instanceof Error ? error.message : '启动下载失败';
      await updateTask(task.id, { status: 'failed', error: message });
    }
  }, [updateTask]);

  const value = useMemo<DownloadContextValue>(() => ({
    tasks,
    enqueue: async track => {
      if (track.source === 'local') {
        const task = createDownloadTask(track, settings.downloadQuality);
        await updateTasks(current => [{ ...task, status: 'failed', error: '本地文件无需下载', progress: 0 }, ...current]);
        return;
      }
      const playableTrack = await ensurePlayableTrack(track, settings, settings.downloadQuality);
      const task = createDownloadTask(playableTrack, settings.downloadQuality);
      const existing = tasksRef.current.find(item => item.remoteId === task.remoteId && item.quality === task.quality && item.status !== 'canceled');
      if (existing) {
        if (existing.status === 'failed') {
          await updateTask(existing.id, { status: 'queued', progress: 0, error: undefined });
          await startNative({ ...existing, status: 'queued', progress: 0, error: undefined });
        }
        return;
      }
      await updateTasks(current => [task, ...current]);
      await startNative(task);
    },
    pause: async taskId => {
      await downloadNative.pause(taskId).catch(() => undefined);
      await updateTask(taskId, { status: 'paused' });
    },
    resume: async taskId => {
      const task = tasksRef.current.find(item => item.id === taskId);
      if (task) {
        await startNative(task);
      }
    },
    cancel: async taskId => {
      await downloadNative.cancel(taskId).catch(() => undefined);
      await updateTask(taskId, { status: 'canceled' });
    },
    retry: async taskId => {
      const task = tasksRef.current.find(item => item.id === taskId);
      if (task) {
        await updateTask(taskId, { status: 'queued', progress: 0, error: undefined });
        await startNative({ ...task, status: 'queued', progress: 0, error: undefined });
      }
    },
    retryFailed: async () => {
      const failedTasks = tasksRef.current.filter(task => task.status === 'failed');
      for (const task of failedTasks) {
        await updateTask(task.id, { status: 'queued', progress: 0, error: undefined });
        await startNative({ ...task, status: 'queued', progress: 0, error: undefined });
      }
    },
    clearCompleted: () => updateTasks(current => current.filter(task => task.status !== 'completed')),
    clearFailed: () => updateTasks(current => current.filter(task => task.status !== 'failed' && task.status !== 'canceled')),
  }), [settings, startNative, tasks, updateTask, updateTasks]);

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}

const downloadStatuses: DownloadTaskStatus[] = ['queued', 'downloading', 'paused', 'completed', 'failed', 'canceled'];

function normalizeDownloadEvent(event: unknown): NativeDownloadEvent | undefined {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return undefined;
  }
  const record = event as Record<string, unknown>;
  if (typeof record.id !== 'string' || !downloadStatuses.includes(record.status as DownloadTaskStatus)) {
    return undefined;
  }
  return {
    ...record,
    id: record.id,
    status: record.status as DownloadTaskStatus,
    progress: typeof record.progress === 'number' && Number.isFinite(record.progress) ? Math.min(Math.max(record.progress, 0), 1) : undefined,
    downloadedBytes: typeof record.downloadedBytes === 'number' && Number.isFinite(record.downloadedBytes) ? Math.max(0, record.downloadedBytes) : undefined,
    totalBytes: typeof record.totalBytes === 'number' && Number.isFinite(record.totalBytes) ? Math.max(0, record.totalBytes) : undefined,
    targetUri: typeof record.targetUri === 'string' ? record.targetUri : undefined,
    error: typeof record.error === 'string' ? record.error.slice(0, 500) : undefined,
  };
}

function mergeTaskEvent(task: DownloadTask, event: NativeDownloadEvent): DownloadTask {
  return {
    ...task,
    ...event,
    progress: typeof event.progress === 'number' ? event.progress : task.progress,
    updatedAt: new Date().toISOString(),
  };
}

export function useDownloads(): DownloadContextValue {
  const value = useContext(DownloadContext);
  if (!value) {
    throw new Error('useDownloads must be used inside DownloadProvider');
  }
  return value;
}

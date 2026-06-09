import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { EmitterSubscription } from 'react-native';
import type { DownloadTask } from '../models/DownloadTask';
import type { Track } from '../models/Track';

const nativeDownload = NativeModules.MusicDownload as
  | {
      enqueue(task: DownloadTask): Promise<Partial<DownloadTask>>;
      pause(taskId: string): Promise<Partial<DownloadTask>>;
      resume(taskId: string): Promise<Partial<DownloadTask>>;
      cancel(taskId: string): Promise<Partial<DownloadTask>>;
    }
  | undefined;

const emitter = nativeDownload ? new NativeEventEmitter(NativeModules.MusicDownload) : undefined;

function ensureDownload() {
  if (Platform.OS !== 'android' || !nativeDownload) {
    return undefined;
  }
  return nativeDownload;
}

function withDownload<T>(call: (module: NonNullable<typeof nativeDownload>) => Promise<T>): Promise<T> {
  const module = ensureDownload();
  if (!module) {
    return Promise.reject(new Error('MusicDownload native module is not registered.'));
  }
  try {
    return call(module);
  } catch (error) {
    return Promise.reject(error);
  }
}

export function createDownloadTask(track: Track, quality: DownloadTask['quality'] = 'MP3_320'): DownloadTask {
  const now = new Date().toISOString();
  return {
    id: `download-${Date.now()}-${track.id}`,
    provider: track.cloudMatch?.provider || 'netease',
    remoteId: track.cloudMatch?.remoteId || track.id,
    title: track.title,
    artist: track.artist,
    quality,
    status: 'queued',
    progress: 0,
    targetUri: undefined,
    sourceUrl: track.source === 'remote' ? track.streamUri : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export const downloadNative = {
  enqueue: (task: DownloadTask) => withDownload(module => module.enqueue(task)),
  pause: (taskId: string) => withDownload(module => module.pause(taskId)),
  resume: (taskId: string) => withDownload(module => module.resume(taskId)),
  cancel: (taskId: string) => withDownload(module => module.cancel(taskId)),
};

export function addDownloadEventListener<T>(eventName: string, listener: (event: T) => void): EmitterSubscription | undefined {
  return emitter?.addListener(eventName, listener);
}

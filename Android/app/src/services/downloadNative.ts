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
    throw new Error('MusicDownload native module is not registered.');
  }
  return nativeDownload;
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
  enqueue: (task: DownloadTask) => ensureDownload().enqueue(task),
  pause: (taskId: string) => ensureDownload().pause(taskId),
  resume: (taskId: string) => ensureDownload().resume(taskId),
  cancel: (taskId: string) => ensureDownload().cancel(taskId),
};

export function addDownloadEventListener<T>(eventName: string, listener: (event: T) => void): EmitterSubscription | undefined {
  return emitter?.addListener(eventName, listener);
}

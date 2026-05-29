import type { AudioQuality, CloudProvider } from './Track';

export type DownloadTaskStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'canceled';

export type DownloadTask = {
  id: string;
  provider: CloudProvider;
  remoteId: string;
  title: string;
  artist: string;
  quality: AudioQuality;
  status: DownloadTaskStatus;
  progress: number;
  totalBytes?: number;
  downloadedBytes?: number;
  targetUri?: string;
  sourceUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

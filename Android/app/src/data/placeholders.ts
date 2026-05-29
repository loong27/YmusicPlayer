import type { DownloadTask } from '../models/DownloadTask';
import type { Track } from '../models/Track';

export const sampleTracks: Track[] = [
  {
    id: 'local-demo-1',
    source: 'local',
    title: '本地曲库将在授权后显示',
    artist: 'YMusicPlayer',
    album: 'Android MVP',
    durationSeconds: 248,
    liked: true,
  },
  {
    id: 'local-demo-2',
    source: 'local',
    title: '支持 MediaStore 扫描',
    artist: '待接入',
    album: '本地音乐',
    durationSeconds: 196,
  },
];

export const sampleDownloadTasks: DownloadTask[] = [
  {
    id: 'download-demo-1',
    provider: 'qqmusic',
    remoteId: 'demo',
    title: '云端下载任务占位',
    artist: '等待接入网关 API',
    quality: 'MP3_320',
    status: 'queued',
    progress: 0,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
];

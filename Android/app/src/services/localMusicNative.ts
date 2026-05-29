import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { Permission } from 'react-native';
import type { Track } from '../models/Track';

export type LocalMusicPermissionStatus =
  | 'unavailable'
  | 'granted'
  | 'denied'
  | 'blocked';

export type NativeLocalTrack = {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  durationMs?: number;
  contentUri: string;
  artworkUri?: string;
  size?: number;
  mimeType?: string;
  dateModified?: number;
  relativePath?: string;
};

type LocalMusicNativeModule = {
  scanAudio(): Promise<NativeLocalTrack[]>;
};

const nativeLocalMusic = NativeModules.LocalMusic as
  | LocalMusicNativeModule
  | undefined;

const readMediaAudioPermission = ((
  PermissionsAndroid.PERMISSIONS as Record<string, string>
).READ_MEDIA_AUDIO || 'android.permission.READ_MEDIA_AUDIO') as Permission;

function getAndroidAudioPermission(): Permission {
  return Number(Platform.Version) >= 33
    ? readMediaAudioPermission
    : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
}

export async function getLocalMusicPermissionStatus(): Promise<LocalMusicPermissionStatus> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }

  if (Number(Platform.Version) < 23) {
    return 'granted';
  }

  const isGranted = await PermissionsAndroid.check(getAndroidAudioPermission());
  return isGranted ? 'granted' : 'denied';
}

export async function requestLocalMusicPermission(): Promise<LocalMusicPermissionStatus> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }

  if (Number(Platform.Version) < 23) {
    return 'granted';
  }

  const result = await PermissionsAndroid.request(getAndroidAudioPermission(), {
    title: '本地音乐权限',
    message: 'YMusicPlayer 需要读取本机音频文件，用于扫描并展示本地曲库。',
    buttonPositive: '允许',
    buttonNegative: '拒绝',
  });

  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return 'granted';
  }

  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    return 'blocked';
  }

  return 'denied';
}

export async function scanLocalMusic(): Promise<Track[]> {
  if (Platform.OS !== 'android') {
    return [];
  }

  if (!nativeLocalMusic) {
    throw new Error(
      'LocalMusic native module is not registered. Rebuild the Android app and verify LocalMusicPackage is added to MainApplication.',
    );
  }

  const nativeTracks = await nativeLocalMusic.scanAudio();
  return nativeTracks.map(mapNativeTrackToTrack);
}

function mapNativeTrackToTrack(nativeTrack: NativeLocalTrack): Track {
  return {
    id: `local-${nativeTrack.id}`,
    source: 'local',
    title: nativeTrack.title || '未知歌曲',
    artist: nativeTrack.artist || '未知艺术家',
    album: nativeTrack.album || undefined,
    durationSeconds: nativeTrack.durationMs
      ? Math.round(nativeTrack.durationMs / 1000)
      : undefined,
    localUri: nativeTrack.contentUri,
    artworkUri: nativeTrack.artworkUri,
  };
}

import { NativeModules, Platform } from 'react-native';
import type { Track } from '../models/Track';
import {
  getAudioPermissionStatus,
  requestAudioPermission,
  type AndroidPermissionStatus,
} from './androidPermissions';

export type LocalMusicPermissionStatus = AndroidPermissionStatus;

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
  trackNumber?: number;
  year?: number;
};

export type ScanLocalMusicOptions = {
  minDurationMs?: number;
  excludeNonMusicByName?: boolean;
  customExcludeKeywords?: string;
};

type LocalMusicNativeModule = {
  scanAudio(options?: ScanLocalMusicOptions): Promise<NativeLocalTrack[]>;
};

const nativeLocalMusic = NativeModules.LocalMusic as
  | LocalMusicNativeModule
  | undefined;

export const getLocalMusicPermissionStatus = getAudioPermissionStatus;
export const requestLocalMusicPermission = requestAudioPermission;

export async function scanLocalMusic(options?: ScanLocalMusicOptions): Promise<Track[]> {
  if (Platform.OS !== 'android') {
    return [];
  }

  if (!nativeLocalMusic) {
    throw new Error(
      'LocalMusic native module is not registered. Rebuild the Android app and verify LocalMusicPackage is added to MainApplication.',
    );
  }

  const nativeTracks = await nativeLocalMusic.scanAudio(options);
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
    trackNumber: nativeTrack.trackNumber,
    year: nativeTrack.year,
    mimeType: nativeTrack.mimeType,
    size: nativeTrack.size,
    dateModified: nativeTrack.dateModified,
    relativePath: nativeTrack.relativePath,
    localUri: nativeTrack.contentUri,
    artworkUri: nativeTrack.artworkUri,
  };
}

import { useCallback, useEffect, useState } from 'react';
import type { Track } from '../models/Track';
import { loadLibraryCache, loadSettings, saveLibraryCache } from '../services/storage';
import {
  getLocalMusicPermissionStatus,
  requestLocalMusicPermission,
  scanLocalMusic,
  type LocalMusicPermissionStatus,
} from '../services/localMusicNative';

export type LocalMusicLibraryPermissionStatus =
  | LocalMusicPermissionStatus
  | 'checking';

export type UseLocalMusicLibraryResult = {
  permissionStatus: LocalMusicLibraryPermissionStatus;
  tracks: Track[];
  isScanning: boolean;
  error?: string;
  lastScannedAt?: Date;
  requestPermissionAndScan: () => Promise<void>;
  refresh: (options?: { minDurationMs?: number }) => Promise<void>;
};

export function useLocalMusicLibrary(): UseLocalMusicLibraryResult {
  const [permissionStatus, setPermissionStatus] =
    useState<LocalMusicLibraryPermissionStatus>('checking');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>();
  const [lastScannedAt, setLastScannedAt] = useState<Date>();

  const scan = useCallback(async (options?: { minDurationMs?: number }) => {
    setIsScanning(true);
    setError(undefined);

    try {
      const scanOptions = options || { minDurationMs: (await loadSettings()).minAudioDurationMs };
      const scannedTracks = await scanLocalMusic(scanOptions);
      const scannedAt = new Date();
      setTracks(scannedTracks);
      setLastScannedAt(scannedAt);
      await saveLibraryCache({
        scannedAt: scannedAt.getTime(),
        minDurationMs: scanOptions.minDurationMs || 0,
        tracks: scannedTracks,
      });
    } catch (scanError) {
      setError(
        scanError instanceof Error ? scanError.message : '扫描本地音乐失败',
      );
    } finally {
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function checkPermission() {
      const cached = await loadLibraryCache();
      if (isMounted && cached) {
        setTracks(cached.tracks);
        setLastScannedAt(cached.scannedAt ? new Date(cached.scannedAt) : undefined);
      }

      try {
        const status = await getLocalMusicPermissionStatus();
        if (!isMounted) {
          return;
        }

        setPermissionStatus(status);
        if (status === 'granted') {
          await scan();
        }
      } catch (permissionError) {
        if (isMounted) {
          setPermissionStatus('denied');
          setError(
            permissionError instanceof Error
              ? permissionError.message
              : '检查本地音乐权限失败',
          );
        }
      }
    }

    checkPermission();

    return () => {
      isMounted = false;
    };
  }, [scan]);

  const requestPermissionAndScan = useCallback(async () => {
    setError(undefined);
    const status = await requestLocalMusicPermission();
    setPermissionStatus(status);

    if (status === 'granted') {
      await scan();
    }
  }, [scan]);

  return {
    permissionStatus,
    tracks,
    isScanning,
    error,
    lastScannedAt,
    requestPermissionAndScan,
    refresh: scan,
  };
}

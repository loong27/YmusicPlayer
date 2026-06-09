import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../models/Track';
import { loadLibraryCache, loadSettings, saveLibraryCache } from '../services/storage';
import {
  getLocalMusicPermissionStatus,
  requestLocalMusicPermission,
  scanLocalMusic,
  type LocalMusicPermissionStatus,
  type ScanLocalMusicOptions,
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
  refresh: (options?: ScanLocalMusicOptions) => Promise<void>;
};

export function useLocalMusicLibrary({ autoScanOnMount = true }: { autoScanOnMount?: boolean } = {}): UseLocalMusicLibraryResult {
  const [permissionStatus, setPermissionStatus] =
    useState<LocalMusicLibraryPermissionStatus>('checking');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>();
  const [lastScannedAt, setLastScannedAt] = useState<Date>();
  const isMountedRef = useRef(true);
  const isScanningRef = useRef(false);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const scan = useCallback(async (options?: ScanLocalMusicOptions) => {
    if (!isMountedRef.current || isScanningRef.current) {
      return;
    }
    isScanningRef.current = true;
    setIsScanning(true);
    setError(undefined);

    try {
      const storedSettings = await loadSettings();
      const scanOptions = options || {
        minDurationMs: storedSettings.minAudioDurationMs,
        excludeNonMusicByName: storedSettings.libraryExcludeNonMusicByName,
        customExcludeKeywords: storedSettings.libraryCustomExcludeKeywords,
      };
      const scannedTracks = await scanLocalMusic(scanOptions);
      const scannedAt = new Date();
      if (!isMountedRef.current) {
        return;
      }
      setTracks(scannedTracks);
      setLastScannedAt(scannedAt);
      await saveLibraryCache({
        scannedAt: scannedAt.getTime(),
        minDurationMs: scanOptions.minDurationMs || 0,
        tracks: scannedTracks,
      });
    } catch (scanError) {
      if (!isMountedRef.current) {
        return;
      }
      setError(
        scanError instanceof Error ? scanError.message : '扫描本地音乐失败',
      );
    } finally {
      isScanningRef.current = false;
      if (isMountedRef.current) {
        setIsScanning(false);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function checkPermission() {
      try {
        const cached = await loadLibraryCache();
        if (isMounted && cached) {
          setTracks(cached.tracks);
          setLastScannedAt(cached.scannedAt ? new Date(cached.scannedAt) : undefined);
        }

        const status = await getLocalMusicPermissionStatus();
        if (!isMounted) {
          return;
        }

        setPermissionStatus(status);
        if (status === 'granted' && autoScanOnMount) {
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
  }, [autoScanOnMount, scan]);

  const requestPermissionAndScan = useCallback(async () => {
    if (!isMountedRef.current) {
      return;
    }
    setError(undefined);
    try {
      const status = await requestLocalMusicPermission();
      if (!isMountedRef.current) {
        return;
      }
      setPermissionStatus(status);

      if (status === 'granted') {
        await scan();
      }
    } catch (permissionError) {
      if (isMountedRef.current) {
        setPermissionStatus('denied');
        setError(permissionError instanceof Error ? permissionError.message : '请求本地音乐权限失败');
      }
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

import type { PlaybackState } from '../models/Player';
import { clampProgress } from './library';

export function getPlaybackUiState(playbackState: PlaybackState) {
  const isLoading = playbackState === 'loading';
  const isBuffering = playbackState === 'buffering';
  const isErrored = playbackState === 'error';
  return {
    isLoading,
    isBuffering,
    isBusy: isLoading || isBuffering,
    isErrored,
    statusText: isLoading ? '加载中...' : isBuffering ? '缓冲中...' : isErrored ? '播放失败' : undefined,
  };
}

export function runPlayerAction(action: () => Promise<void>) {
  action().catch(() => undefined);
}

export function clampSeekPosition(positionMs: number, durationMs: number) {
  return durationMs * clampProgress(positionMs / durationMs);
}

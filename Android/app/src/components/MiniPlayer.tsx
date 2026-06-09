import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AccessibilityActionEvent } from 'react-native';
import { Artwork } from './Artwork';
import { playerGlyphs } from '../constants/playerGlyphs';
import { usePlayer } from '../state/PlayerProvider';
import type { AppColorScheme } from '../theme/colors';
import { formatDuration } from '../utils/format';
import { clampProgress } from '../utils/library';
import { clampSeekPosition, getPlaybackUiState, runPlayerAction } from '../utils/playerUi';

export function MiniPlayer({ colors, onOpen }: { colors: AppColorScheme; onOpen: () => void }) {
  const player = usePlayer();
  const progressWidthRef = useRef(1);

  if (!player.currentTrack) {
    return null;
  }

  const isPlaying = player.playbackState === 'playing';
  const { isBusy, isErrored, statusText } = getPlaybackUiState(player.playbackState);
  const durationMs = player.durationMs || (player.currentTrack.durationSeconds || 0) * 1000;
  const progress = durationMs > 0 ? clampProgress(player.positionMs / durationMs) : 0;
  const progressAccessibilityText = `${formatDuration(Math.floor(player.positionMs / 1000))} / ${formatDuration(Math.floor(durationMs / 1000))}`;
  const subtitle = isErrored
    ? `播放失败${player.error ? ` · ${player.error}` : ''}`
    : statusText || `${player.currentTrack.artist} · ${formatDuration(Math.floor(player.positionMs / 1000))}`;

  const seekToPosition = (positionMs: number) => {
    if (durationMs <= 0) {
      return;
    }
    runPlayerAction(() => player.seekTo(clampSeekPosition(positionMs, durationMs)));
  };

  const handleProgressAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') {
      seekToPosition(player.positionMs + 10_000);
    } else if (event.nativeEvent.actionName === 'decrement') {
      seekToPosition(player.positionMs - 10_000);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="打开播放页"
          onPress={onOpen}
          style={styles.openArea}
        >
          <Artwork track={player.currentTrack} colors={colors} size={46} radius={13} />
          <View style={styles.info}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {player.currentTrack.title}
            </Text>
            <Text style={[styles.meta, { color: isErrored ? colors.danger : colors.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? '暂停播放' : '开始播放'}
          accessibilityState={{ busy: isBusy }}
          onPress={() => runPlayerAction(player.togglePlayPause)}
          style={[styles.playButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.playText}>{isPlaying ? playerGlyphs.pause : playerGlyphs.play}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="播放下一首"
          onPress={() => runPlayerAction(player.next)}
          style={[styles.nextButton, { backgroundColor: colors.surfaceStrong, borderColor: colors.border }]}
        >
          <Text style={[styles.nextText, { color: colors.text }]}>{playerGlyphs.next}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel="迷你播放器进度"
          accessibilityValue={{ min: 0, max: Math.floor(durationMs / 1000), now: Math.floor(player.positionMs / 1000), text: progressAccessibilityText }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          accessibilityState={{ disabled: durationMs <= 0 }}
          disabled={durationMs <= 0}
          onAccessibilityAction={handleProgressAccessibilityAction}
          onLayout={event => {
            progressWidthRef.current = event.nativeEvent.layout.width;
          }}
          onPress={event => {
            if (durationMs <= 0) {
              return;
            }
            const nextProgress = clampProgress(event.nativeEvent.locationX / progressWidthRef.current);
            seekToPosition(durationMs * nextProgress);
          }}
          style={styles.progressTouch}
        >
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceStrong }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress * 100}%` }]} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
  },
  container: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  openArea: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  info: { flex: 1, gap: 3, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12 },
  playButton: { alignItems: 'center', borderRadius: 999, height: 38, justifyContent: 'center', width: 38 },
  nextButton: { alignItems: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, height: 34, justifyContent: 'center', width: 34 },
  playText: { color: '#ffffff', fontSize: 15, fontWeight: '900', marginLeft: 1 },
  nextText: { fontSize: 10, fontWeight: '900' },
  progressTouch: { bottom: 0, height: 14, left: 0, justifyContent: 'flex-end', position: 'absolute', right: 0 },
  progressTrack: { height: 3, width: '100%' },
  progressFill: { borderRadius: 999, height: 3 },
});

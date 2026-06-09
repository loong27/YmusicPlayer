import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AccessibilityActionEvent } from 'react-native';
import { Artwork } from '../components/Artwork';
import { LyricsView } from '../components/LyricsView';
import { Icon, iconNames } from '../constants/icons';
import type { ParsedLyrics } from '../models/Lyric';
import type { RepeatMode } from '../models/Player';
import { loadLyricsForTrack } from '../services/lyrics';
import { usePlayer } from '../state/PlayerProvider';
import type { AppColorScheme } from '../theme/colors';
import { formatDuration } from '../utils/format';
import { clampProgress, formatTrackMeta } from '../utils/library';
import { clampSeekPosition, getPlaybackUiState, runPlayerAction } from '../utils/playerUi';

export function NowPlayingScreen({ colors, onBack, onOpenQueue }: { colors: AppColorScheme; onBack?: () => void; onOpenQueue?: () => void }) {
  const player = usePlayer();
  const progressWidthRef = useRef(1);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<ParsedLyrics>();
  const track = player.currentTrack;
  const durationMs = player.durationMs || (track?.durationSeconds || 0) * 1000;
  const progress = durationMs > 0 ? clampProgress(player.positionMs / durationMs) : 0;
  const hasTrack = Boolean(track);
  const isPlaying = player.playbackState === 'playing';
  const { isBusy, isErrored, statusText } = getPlaybackUiState(player.playbackState);

  const seekToPosition = (positionMs: number) => {
    if (!durationMs) {
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

  const cycleRepeat = () => {
    const nextMode: RepeatMode = player.repeatMode === 'off' ? 'all' : player.repeatMode === 'all' ? 'one' : 'off';
    runPlayerAction(() => player.setRepeatMode(nextMode));
  };

  const repeatIconName = player.repeatMode === 'one'
    ? iconNames.repeatOnce
    : player.repeatMode === 'all'
      ? iconNames.repeat
      : iconNames.repeatOff;

  const isRepeatActive = player.repeatMode !== 'off';

  useEffect(() => {
    let isMounted = true;
    loadLyricsForTrack(track)
      .then(value => {
        if (isMounted) {
          setLyrics(value);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLyrics(undefined);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [track]);

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            {onBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="收起播放页"
                onPress={onBack}
                style={[styles.iconButtonSmall, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Icon name="chevron-down" size={24} color={colors.text} />
              </Pressable>
            ) : null}
            <View>
              <Text style={[styles.kicker, { color: colors.primary }]}>正在播放</Text>
              <Text style={[styles.queueText, { color: colors.textMuted }]}>本地队列 · {player.queue.length} 首</Text>
            </View>
          </View>
          {onOpenQueue ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="队列"
              onPress={onOpenQueue}
              style={[styles.iconButtonSmall, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Icon name={iconNames.queueMusic} size={20} color={colors.text} />
            </Pressable>
          ) : null}
        </View>

        {/* Stage card: artwork or lyrics */}
        <View style={[styles.stageCard, { backgroundColor: colors.primarySoft, borderColor: colors.border }]}>
          {showLyrics ? (
            <LyricsView lyrics={lyrics} positionMs={player.positionMs} colors={colors} onSeek={positionMs => runPlayerAction(() => player.seekTo(positionMs))} />
          ) : (
            <Artwork track={track} colors={colors} size="82%" radius={30} />
          )}
          {statusText ? <Text style={[styles.statusBadge, { backgroundColor: colors.surface, color: isErrored ? colors.danger : colors.primary }]}>{statusText}</Text> : null}
        </View>

        {/* Track info */}
        <View style={styles.trackInfo}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {track?.title || '暂无播放歌曲'}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={2}>
            {track ? formatTrackMeta(track) : '请从曲库选择歌曲开始播放'}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBlock}>
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="播放进度"
            accessibilityValue={{ min: 0, max: Math.floor(durationMs / 1000), now: Math.floor(player.positionMs / 1000), text: `${formatDuration(Math.floor(player.positionMs / 1000))} / ${formatDuration(Math.floor(durationMs / 1000))}` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={handleProgressAccessibilityAction}
            onLayout={event => {
              progressWidthRef.current = event.nativeEvent.layout.width;
            }}
            onPress={event => {
              if (!durationMs) {
                return;
              }
              const nextProgress = clampProgress(event.nativeEvent.locationX / progressWidthRef.current);
              seekToPosition(durationMs * nextProgress);
            }}
            style={styles.progressTouch}
          >
            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceStrong }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress * 100}%` }]} />
              <View style={[styles.progressThumb, { backgroundColor: colors.primary, left: `${progress * 100}%` }]} />
            </View>
          </Pressable>
          <View style={styles.timeRow}>
            <Text style={[styles.time, { color: colors.textMuted }]}>{formatDuration(Math.floor(player.positionMs / 1000))}</Text>
            <Text style={[styles.time, { color: colors.textMuted }]}>{formatDuration(Math.floor(durationMs / 1000))}</Text>
          </View>
        </View>

        {/* Main controls: shuffle | prev | play | next | repeat */}
        <View style={styles.mainControls}>
          {/* Shuffle */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={player.shuffleEnabled ? '关闭随机播放' : '开启随机播放'}
            accessibilityState={{ selected: player.shuffleEnabled }}
            onPress={() => runPlayerAction(() => player.setShuffleEnabled(!player.shuffleEnabled))}
            style={[
              styles.controlCircle48,
              { backgroundColor: player.shuffleEnabled ? colors.primarySoft : colors.surface, borderColor: colors.border },
            ]}
          >
            <Icon
              name={player.shuffleEnabled ? iconNames.shuffle : iconNames.shuffleDisabled}
              size={22}
              color={player.shuffleEnabled ? colors.primary : colors.textMuted}
            />
          </Pressable>

          {/* Previous */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="上一首"
            accessibilityState={{ disabled: !hasTrack, busy: isBusy }}
            disabled={!hasTrack}
            onPress={() => runPlayerAction(player.previous)}
            style={[styles.controlCircle52, { backgroundColor: colors.surface, borderColor: colors.border }, !hasTrack ? styles.disabled : null]}
          >
            <Icon name={iconNames.skipPrevious} size={28} color={colors.text} />
          </Pressable>

          {/* Play / Pause */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? '暂停播放' : '开始播放'}
            accessibilityState={{ disabled: !hasTrack, busy: isBusy }}
            disabled={!hasTrack}
            onPress={() => runPlayerAction(player.togglePlayPause)}
            style={[styles.controlCircle80, { backgroundColor: colors.primary }, !hasTrack ? styles.disabled : null]}
          >
            <Icon name={isPlaying ? iconNames.pause : iconNames.play} size={36} color="#ffffff" />
          </Pressable>

          {/* Next */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="下一首"
            accessibilityState={{ disabled: !hasTrack, busy: isBusy }}
            disabled={!hasTrack}
            onPress={() => runPlayerAction(player.next)}
            style={[styles.controlCircle52, { backgroundColor: colors.surface, borderColor: colors.border }, !hasTrack ? styles.disabled : null]}
          >
            <Icon name={iconNames.skipNext} size={28} color={colors.text} />
          </Pressable>

          {/* Repeat */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={repeatAccessibilityLabel(player.repeatMode)}
            accessibilityState={{ selected: isRepeatActive }}
            onPress={cycleRepeat}
            style={[
              styles.controlCircle48,
              { backgroundColor: isRepeatActive ? colors.primarySoft : colors.surface, borderColor: colors.border },
            ]}
          >
            <Icon
              name={repeatIconName}
              size={22}
              color={isRepeatActive ? colors.primary : colors.textMuted}
            />
          </Pressable>
        </View>

        {/* Lyrics / Queue toggle row */}
        <View style={styles.toggleRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showLyrics ? '显示封面' : '显示歌词'}
            accessibilityState={{ selected: showLyrics }}
            onPress={() => setShowLyrics(value => !value)}
            style={styles.toggleButton}
          >
            <Icon name={iconNames.lyrics} size={20} color={showLyrics ? colors.primary : colors.textMuted} />
            <Text style={[styles.toggleLabel, { color: showLyrics ? colors.primary : colors.textMuted }]}>
              {showLyrics ? '封面' : '歌词'}
            </Text>
          </Pressable>

          {onOpenQueue ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="打开播放队列"
              onPress={onOpenQueue}
              style={styles.toggleButton}
            >
              <Icon name={iconNames.queueMusic} size={20} color={colors.textMuted} />
              <Text style={[styles.toggleLabel, { color: colors.textMuted }]}>队列</Text>
            </Pressable>
          ) : null}
        </View>

        {player.error ? <Text style={[styles.error, { color: colors.danger }]}>{player.error}</Text> : null}
      </View>
    </View>
  );
}

function repeatAccessibilityLabel(mode: RepeatMode) {
  if (mode === 'one') {
    return '单曲循环';
  }
  if (mode === 'all') {
    return '列表循环';
  }
  return '关闭循环';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, gap: 14, padding: 20, paddingBottom: 18 },

  /* Top bar */
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  topLeft: { alignItems: 'center', flexDirection: 'row', gap: 12, minWidth: 0 },
  kicker: { fontSize: 22, fontWeight: '700' },
  queueText: { fontSize: 12, marginTop: 3 },
  iconButtonSmall: { alignItems: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, height: 38, justifyContent: 'center', width: 38 },

  /* Stage card */
  stageCard: { alignItems: 'center', borderRadius: 34, borderWidth: StyleSheet.hairlineWidth, flex: 1, justifyContent: 'center', minHeight: 0, overflow: 'hidden', width: '100%' },
  statusBadge: { borderRadius: 999, bottom: 16, fontSize: 13, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 8, position: 'absolute' },

  /* Track info */
  trackInfo: { alignItems: 'center', gap: 7 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  meta: { fontSize: 14, fontWeight: '400', lineHeight: 20, textAlign: 'center' },

  /* Progress */
  progressBlock: { gap: 2 },
  progressTouch: { justifyContent: 'center', minHeight: 30 },
  progressTrack: { borderRadius: 999, height: 5, overflow: 'visible', width: '100%' },
  progressFill: { borderRadius: 999, height: 5 },
  progressThumb: { borderRadius: 999, height: 13, marginLeft: -6.5, marginTop: -9, position: 'absolute', width: 13 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 12 },

  /* Main controls row */
  mainControls: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'center' },
  controlCircle48: { alignItems: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, height: 48, justifyContent: 'center', width: 48 },
  controlCircle52: { alignItems: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, height: 52, justifyContent: 'center', width: 52 },
  controlCircle80: { alignItems: 'center', borderRadius: 999, height: 80, justifyContent: 'center', width: 80 },

  /* Toggle row */
  toggleRow: { flexDirection: 'row', gap: 24, justifyContent: 'center', alignItems: 'center' },
  toggleButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 8 },
  toggleLabel: { fontSize: 12, fontWeight: '500' },

  /* Error */
  error: { fontSize: 13, textAlign: 'center' },

  /* Utility */
  disabled: { opacity: 0.38 },
});

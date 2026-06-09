import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Artwork } from '../components/Artwork';
import { LyricsView } from '../components/LyricsView';
import { playerGlyphs } from '../constants/playerGlyphs';
import type { ParsedLyrics } from '../models/Lyric';
import type { RepeatMode } from '../models/Player';
import { loadLyricsForTrack } from '../services/lyrics';
import { usePlayer } from '../state/PlayerProvider';
import type { AppColorScheme } from '../theme/colors';
import { formatDuration } from '../utils/format';
import { clampProgress, formatTrackMeta } from '../utils/library';

export function NowPlayingScreen({ colors, onOpenQueue }: { colors: AppColorScheme; onOpenQueue?: () => void }) {
  const player = usePlayer();
  const [progressWidth, setProgressWidth] = useState(1);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<ParsedLyrics>();
  const track = player.currentTrack;
  const durationMs = player.durationMs || (track?.durationSeconds || 0) * 1000;
  const progress = durationMs > 0 ? clampProgress(player.positionMs / durationMs) : 0;
  const hasTrack = Boolean(track);

  const cycleRepeat = () => {
    const nextMode: RepeatMode = player.repeatMode === 'off' ? 'all' : player.repeatMode === 'all' ? 'one' : 'off';
    player.setRepeatMode(nextMode);
  };

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
      <View style={styles.topBar}>
        <View>
          <Text style={[styles.kicker, { color: colors.primary }]}>正在播放</Text>
          <Text style={[styles.queueText, { color: colors.textMuted }]}>本地队列 · {player.queue.length} 首</Text>
        </View>
        {onOpenQueue ? <RoundButton label="队列" symbol="≡" colors={colors} onPress={onOpenQueue} /> : null}
      </View>

      <View style={[styles.stageCard, { backgroundColor: colors.primarySoft, borderColor: colors.border }]}>
        {showLyrics ? (
          <LyricsView lyrics={lyrics} positionMs={player.positionMs} colors={colors} onSeek={player.seekTo} />
        ) : (
          <Artwork track={track} colors={colors} size="82%" radius={30} />
        )}
      </View>

      <View style={styles.trackInfo}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {track?.title || '暂无播放歌曲'}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={2}>
          {track ? formatTrackMeta(track) : '请从曲库选择歌曲开始播放'}
        </Text>
      </View>

      <View style={styles.progressBlock}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel="播放进度"
          onLayout={event => setProgressWidth(event.nativeEvent.layout.width)}
          onPress={event => {
            if (!durationMs) {
              return;
            }
            const nextProgress = clampProgress(event.nativeEvent.locationX / progressWidth);
            player.seekTo(durationMs * nextProgress);
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

      <View style={styles.mainControls}>
        <RoundButton label="上一首" symbol={playerGlyphs.previous} colors={colors} disabled={!hasTrack} onPress={player.previous} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={player.playbackState === 'playing' ? '暂停播放' : '开始播放'}
          disabled={!hasTrack}
          onPress={player.togglePlayPause}
          style={[styles.primaryPlay, { backgroundColor: colors.primary }, !hasTrack ? styles.disabled : null]}
        >
          <Text style={styles.primaryPlayText}>{player.playbackState === 'playing' ? playerGlyphs.pause : playerGlyphs.play}</Text>
        </Pressable>
        <RoundButton label="下一首" symbol={playerGlyphs.nextLarge} colors={colors} disabled={!hasTrack} onPress={player.next} />
      </View>

      <View style={styles.secondaryControls}>
        <PillButton label={repeatLabel(player.repeatMode)} colors={colors} active={player.repeatMode !== 'off'} onPress={cycleRepeat} />
        <PillButton label={player.shuffleEnabled ? '随机开' : '随机'} colors={colors} active={player.shuffleEnabled} onPress={() => player.setShuffleEnabled(!player.shuffleEnabled)} />
        <PillButton label={showLyrics ? '封面' : '歌词'} colors={colors} active={showLyrics} onPress={() => setShowLyrics(value => !value)} />
        {onOpenQueue ? <PillButton label="队列" colors={colors} onPress={onOpenQueue} /> : null}
      </View>

      {player.error ? <Text style={[styles.error, { color: colors.danger }]}>{player.error}</Text> : null}
      </View>
    </View>
  );
}

function repeatLabel(mode: RepeatMode) {
  if (mode === 'one') {
    return '单曲循环';
  }
  if (mode === 'all') {
    return '列表循环';
  }
  return '循环';
}

function RoundButton({ label, symbol, colors, disabled, onPress }: { label: string; symbol: string; colors: AppColorScheme; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.roundButton, { backgroundColor: colors.surface, borderColor: colors.border }, disabled ? styles.disabled : null]}>
      <Text style={[styles.roundText, { color: colors.text }]}>{symbol}</Text>
    </Pressable>
  );
}

function PillButton({ label, colors, active, onPress }: { label: string; colors: AppColorScheme; active?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.pillButton, { backgroundColor: active ? colors.primarySoft : colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.pillText, { color: active ? colors.primary : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, gap: 14, padding: 20, paddingBottom: 18 },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  kicker: { fontSize: 22, fontWeight: '900' },
  queueText: { fontSize: 12, marginTop: 3 },
  stageCard: { alignItems: 'center', borderRadius: 34, borderWidth: StyleSheet.hairlineWidth, flex: 1, justifyContent: 'center', minHeight: 0, overflow: 'hidden', width: '100%' },
  trackInfo: { alignItems: 'center', gap: 7 },
  title: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  meta: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  progressBlock: { gap: 2 },
  progressTouch: { justifyContent: 'center', minHeight: 30 },
  progressTrack: { borderRadius: 999, height: 5, overflow: 'visible', width: '100%' },
  progressFill: { borderRadius: 999, height: 5 },
  progressThumb: { borderRadius: 999, height: 13, marginLeft: -6.5, marginTop: -9, position: 'absolute', width: 13 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 12 },
  mainControls: { alignItems: 'center', flexDirection: 'row', gap: 24, justifyContent: 'center' },
  secondaryControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  primaryPlay: { alignItems: 'center', borderRadius: 999, height: 76, justifyContent: 'center', width: 76 },
  primaryPlayText: { color: '#ffffff', fontSize: 28, fontWeight: '900', marginLeft: 2 },
  roundButton: { alignItems: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, height: 48, justifyContent: 'center', width: 48 },
  roundText: { fontSize: 22, fontWeight: '900' },
  pillButton: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 8 },
  pillText: { fontSize: 13, fontWeight: '800' },
  error: { fontSize: 13, textAlign: 'center' },
  disabled: { opacity: 0.38 },
});

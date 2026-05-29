import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Artwork } from '../components/Artwork';
import { LyricsView } from '../components/LyricsView';
import { ScreenHeader } from '../components/ScreenHeader';
import type { ParsedLyrics } from '../models/Lyric';
import type { RepeatMode } from '../models/Player';
import { loadLyricsForTrack } from '../services/lyrics';
import { usePlayer } from '../state/PlayerProvider';
import type { AppColorScheme } from '../theme/colors';
import { formatDuration } from '../utils/format';

export function NowPlayingScreen({ colors, onOpenQueue }: { colors: AppColorScheme; onOpenQueue?: () => void }) {
  const player = usePlayer();
  const [progressWidth, setProgressWidth] = useState(1);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<ParsedLyrics>();
  const track = player.currentTrack;
  const durationMs = player.durationMs || (track?.durationSeconds || 0) * 1000;
  const progress = durationMs > 0 ? Math.min(1, player.positionMs / durationMs) : 0;

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
      <ScreenHeader title="正在播放" subtitle="本地播放队列、进度、循环与随机控制。" colors={colors} />
      <View style={styles.content}>
        {showLyrics ? (
          <LyricsView lyrics={lyrics} positionMs={player.positionMs} colors={colors} onSeek={player.seekTo} />
        ) : (
          <Artwork track={track} colors={colors} size="76%" radius={28} />
        )}
        <Pressable accessibilityRole="button" onPress={() => setShowLyrics(value => !value)} style={[styles.toggleButton, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.buttonText, { color: colors.text }]}>{showLyrics ? '显示封面' : '显示歌词'}</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {track?.title || '暂无播放歌曲'}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={2}>
          {track ? `${track.artist} · ${track.album || '未知专辑'}` : '请从曲库选择歌曲开始播放'}
        </Text>
        <Pressable
          accessibilityRole="adjustable"
          onLayout={event => setProgressWidth(event.nativeEvent.layout.width)}
          onPress={event => {
            if (!durationMs) {
              return;
            }
            const nextProgress = Math.max(0, Math.min(1, event.nativeEvent.locationX / progressWidth));
            player.seekTo(durationMs * nextProgress);
          }}
          style={[styles.progressTrack, { backgroundColor: colors.surfaceStrong }]}
        >
          <View style={[styles.progressFill, { backgroundColor: colors.primary, flex: progress }]} />
          <View style={{ flex: 1 - progress }} />
        </Pressable>
        <View style={styles.timeRow}>
          <Text style={[styles.time, { color: colors.textMuted }]}>{formatDuration(Math.floor(player.positionMs / 1000))}</Text>
          <Text style={[styles.time, { color: colors.textMuted }]}>{formatDuration(Math.floor(durationMs / 1000))}</Text>
        </View>
        <View style={styles.controls}>
          <ControlButton label="上一首" colors={colors} onPress={player.previous} />
          <ControlButton label={player.playbackState === 'playing' ? '暂停' : '播放'} colors={colors} primary onPress={player.togglePlayPause} />
          <ControlButton label="下一首" colors={colors} onPress={player.next} />
        </View>
        <View style={styles.controls}>
          <ControlButton label={`循环 ${repeatLabel(player.repeatMode)}`} colors={colors} onPress={cycleRepeat} />
          <ControlButton label={player.shuffleEnabled ? '随机 开' : '随机 关'} colors={colors} onPress={() => player.setShuffleEnabled(!player.shuffleEnabled)} />
          {onOpenQueue ? <ControlButton label="队列" colors={colors} onPress={onOpenQueue} /> : null}
        </View>
        {player.error ? <Text style={[styles.error, { color: colors.danger }]}>{player.error}</Text> : null}
      </View>
    </View>
  );
}

function repeatLabel(mode: RepeatMode) {
  if (mode === 'one') {
    return '单曲';
  }
  if (mode === 'all') {
    return '全部';
  }
  return '关';
}

function ControlButton({ label, colors, primary, onPress }: { label: string; colors: AppColorScheme; primary?: boolean; onPress: () => void }) {
  const buttonColors = { backgroundColor: primary ? colors.primary : colors.surface, borderColor: colors.border };
  const textColors = { color: primary ? '#ffffff' : colors.text };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, buttonColors]}
    >
      <Text style={[styles.buttonText, textColors]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { alignItems: 'center', gap: 16, padding: 20 },
  artwork: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    width: '76%',
  },
  artworkText: { fontSize: 28, fontWeight: '800' },
  toggleButton: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 8 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  meta: { fontSize: 14, textAlign: 'center' },
  progressTrack: { borderRadius: 999, flexDirection: 'row', height: 8, overflow: 'hidden', width: '100%' },
  progressFill: { borderRadius: 999 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  time: { fontSize: 12 },
  controls: { flexDirection: 'row', gap: 10 },
  button: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingVertical: 10 },
  buttonText: { fontSize: 14, fontWeight: '700' },
  error: { fontSize: 13, textAlign: 'center' },
});

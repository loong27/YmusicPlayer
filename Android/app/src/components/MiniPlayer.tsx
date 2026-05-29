import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Artwork } from './Artwork';
import { usePlayer } from '../state/PlayerProvider';
import type { AppColorScheme } from '../theme/colors';
import { formatDuration } from '../utils/format';

export function MiniPlayer({ colors, onOpen }: { colors: AppColorScheme; onOpen: () => void }) {
  const player = usePlayer();

  if (!player.currentTrack) {
    return null;
  }

  const isPlaying = player.playbackState === 'playing';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Artwork track={player.currentTrack} colors={colors} size={44} radius={12} />
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {player.currentTrack.title}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {player.currentTrack.artist} · {formatDuration(Math.floor(player.positionMs / 1000))}
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={player.togglePlayPause} style={[styles.circleButton, { backgroundColor: colors.primary }]}>
        <Text style={styles.buttonText}>{isPlaying ? '暂停' : '播放'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={player.next} style={[styles.textButton, { borderColor: colors.border }]}>
        <Text style={[styles.nextText, { color: colors.text }]}>下一首</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  info: { flex: 1, gap: 3 },
  title: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12 },
  circleButton: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  textButton: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 8 },
  buttonText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  nextText: { fontSize: 12, fontWeight: '700' },
});

import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Artwork } from '../components/Artwork';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { playerGlyphs } from '../constants/playerGlyphs';
import { usePlayer } from '../state/PlayerProvider';
import type { AppColorScheme } from '../theme/colors';
import { formatTrackMeta } from '../utils/library';

export function QueueScreen({ colors, onBack }: { colors: AppColorScheme; onBack: () => void }) {
  const player = usePlayer();
  const clearQueue = () => {
    if (player.queue.length === 0) {
      return;
    }
    Alert.alert('清空队列', '确定清空当前播放队列吗？', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: () => player.clearQueue() },
    ]);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="播放队列" subtitle="按顺序播放；可上移、下移、移除或清空。" colors={colors} />
      <View style={styles.content}>
        <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View>
            <Text style={[styles.summaryTitle, { color: colors.text }]}>队列</Text>
            <Text style={[styles.summaryMeta, { color: colors.textMuted }]}>{player.queue.length} 首 · 当前第 {player.currentIndex >= 0 ? player.currentIndex + 1 : 0} 首</Text>
          </View>
          <View style={styles.row}>
            <ActionButton label="返回" colors={colors} onPress={onBack} />
            <ActionButton label="清空" colors={colors} muted disabled={player.queue.length === 0} onPress={clearQueue} />
          </View>
        </View>
        <FlatList
          data={player.queue}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          ListEmptyComponent={<InfoCard title="队列为空" body="从曲库、搜索或歌单选择歌曲后会出现在这里。" colors={colors} />}
          renderItem={({ item, index }) => {
            const active = index === player.currentIndex;
            return (
              <View style={[styles.item, { backgroundColor: active ? colors.primarySoft : colors.surface, borderColor: active ? colors.primary : colors.border }]}>
                <Artwork track={item} colors={colors} size={48} radius={13} />
                <View style={styles.info}>
                  <Text style={[styles.title, { color: active ? colors.primary : colors.text }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>{formatTrackMeta(item)}</Text>
                </View>
                <View style={styles.actions}>
                  <TextButton label={playerGlyphs.up} accessibilityLabel="上移" colors={colors} disabled={index === 0} onPress={() => player.moveQueueItem(index, Math.max(0, index - 1))} />
                  <TextButton label={playerGlyphs.down} accessibilityLabel="下移" colors={colors} disabled={index === player.queue.length - 1} onPress={() => player.moveQueueItem(index, Math.min(player.queue.length - 1, index + 1))} />
                  <TextButton label="移除" colors={colors} danger onPress={() => player.removeFromQueue(index)} />
                </View>
              </View>
            );
          }}
        />
      </View>
    </View>
  );
}

function ActionButton({ label, colors, muted, disabled, onPress }: { label: string; colors: AppColorScheme; muted?: boolean; disabled?: boolean; onPress: () => void }) {
  const textColor = { color: muted ? colors.text : '#ffffff' };
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, { backgroundColor: muted ? colors.surfaceStrong : colors.primary, borderColor: colors.border }, disabled ? styles.disabled : null]}>
      <Text style={[styles.buttonText, textColor]}>{label}</Text>
    </Pressable>
  );
}

function TextButton({ label, accessibilityLabel, colors, danger, disabled, onPress }: { label: string; accessibilityLabel?: string; colors: AppColorScheme; danger?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} disabled={disabled} onPress={onPress} style={[styles.textButton, { backgroundColor: colors.surfaceStrong, borderColor: colors.border }, disabled ? styles.disabled : null]}>
      <Text style={[styles.textButtonLabel, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, gap: 12, padding: 16 },
  summary: { alignItems: 'center', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, justifyContent: 'space-between', padding: 14 },
  summaryTitle: { fontSize: 18, fontWeight: '900' },
  summaryMeta: { fontSize: 12, marginTop: 3 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { alignItems: 'center', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, marginBottom: 10, padding: 12 },
  info: { flex: 1, gap: 4, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '900' },
  meta: { fontSize: 12 },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  button: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 8 },
  buttonText: { fontSize: 13, fontWeight: '900' },
  textButton: { alignItems: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, minHeight: 34, minWidth: 34, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 6 },
  textButtonLabel: { fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.38 },
});

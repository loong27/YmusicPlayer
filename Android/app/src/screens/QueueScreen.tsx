import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Artwork } from '../components/Artwork';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { usePlayer } from '../state/PlayerProvider';
import type { AppColorScheme } from '../theme/colors';

export function QueueScreen({ colors, onBack }: { colors: AppColorScheme; onBack: () => void }) {
  const player = usePlayer();

  return (
    <View style={styles.screen}>
      <ScreenHeader title="播放队列" subtitle="Up Next 队列，支持移除、上移、下移和清空。" colors={colors} />
      <View style={styles.content}>
        <View style={styles.row}>
          <ActionButton label="返回" colors={colors} onPress={onBack} />
          <ActionButton label="清空队列" colors={colors} muted onPress={player.clearQueue} />
        </View>
        <FlatList
          data={player.queue}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          ListEmptyComponent={<InfoCard title="队列为空" body="从曲库、搜索或歌单选择歌曲后会出现在这里。" colors={colors} />}
          renderItem={({ item, index }) => {
            const active = index === player.currentIndex;
            return (
              <View style={[styles.item, { backgroundColor: active ? colors.primarySoft : colors.surface, borderColor: colors.border }]}>
                <Artwork track={item} colors={colors} size={44} radius={12} />
                <View style={styles.info}>
                  <Text style={[styles.title, { color: active ? colors.primary : colors.text }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>{item.artist} · {item.album || '未知专辑'}</Text>
                </View>
                <View style={styles.actions}>
                  <TextButton label="上" colors={colors} onPress={() => player.moveQueueItem(index, Math.max(0, index - 1))} />
                  <TextButton label="下" colors={colors} onPress={() => player.moveQueueItem(index, Math.min(player.queue.length - 1, index + 1))} />
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

function ActionButton({ label, colors, muted, onPress }: { label: string; colors: AppColorScheme; muted?: boolean; onPress: () => void }) {
  const textColor = { color: muted ? colors.text : '#ffffff' };
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, { backgroundColor: muted ? colors.surfaceStrong : colors.primary, borderColor: colors.border }]}><Text style={[styles.buttonText, textColor]}>{label}</Text></Pressable>;
}

function TextButton({ label, colors, danger, onPress }: { label: string; colors: AppColorScheme; danger?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.textButton, { borderColor: colors.border }]}><Text style={[styles.textButtonLabel, { color: danger ? colors.danger : colors.text }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, gap: 12, padding: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { alignItems: 'center', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, marginBottom: 10, padding: 12 },
  info: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12 },
  actions: { alignItems: 'flex-end', gap: 6 },
  button: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 8 },
  buttonText: { fontSize: 13, fontWeight: '800' },
  textButton: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 5 },
  textButtonLabel: { fontSize: 11, fontWeight: '800' },
});

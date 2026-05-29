import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ParsedLyrics } from '../models/Lyric';
import type { AppColorScheme } from '../theme/colors';
import { getActiveLyricIndex } from '../utils/lrc';

export function LyricsView({ lyrics, positionMs, colors, onSeek }: { lyrics?: ParsedLyrics; positionMs: number; colors: AppColorScheme; onSeek: (positionMs: number) => void }) {
  const activeIndex = useMemo(() => getActiveLyricIndex(lyrics?.lines || [], positionMs), [lyrics, positionMs]);

  if (!lyrics || lyrics.lines.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>暂无歌词</Text>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>支持 LRC 解析、当前行高亮和点击歌词跳转，后续可关联同名 .lrc 或云歌词。</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={lyrics.lines}
      keyExtractor={(item, index) => `${item.timeMs}-${index}`}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      renderItem={({ item, index }) => {
        const active = index === activeIndex;
        return (
          <Pressable accessibilityRole="button" onPress={() => onSeek(item.timeMs)} style={styles.lineWrap}>
            <Text style={[styles.line, { color: active ? colors.primary : colors.textMuted }, active ? styles.activeLine : null]}>{item.text || '♪'}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, gap: 8, minHeight: 260, justifyContent: 'center', padding: 20, width: '100%' },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  list: { maxHeight: 320, width: '100%' },
  listContent: { gap: 8, paddingVertical: 16 },
  lineWrap: { paddingHorizontal: 12, paddingVertical: 4 },
  line: { fontSize: 15, lineHeight: 24, textAlign: 'center' },
  activeLine: { fontSize: 17, fontWeight: '800' },
});

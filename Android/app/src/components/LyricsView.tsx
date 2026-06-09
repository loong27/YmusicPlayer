import React, { useEffect, useRef, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FlatList as FlatListType } from 'react-native';
import type { LyricLine, ParsedLyrics } from '../models/Lyric';
import type { AppColorScheme } from '../theme/colors';
import { getActiveLyricIndex } from '../utils/lrc';

export function LyricsView({ lyrics, positionMs, colors, onSeek }: { lyrics?: ParsedLyrics; positionMs: number; colors: AppColorScheme; onSeek: (positionMs: number) => void }) {
  const listRef = useRef<FlatListType<LyricLine>>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const activeIndex = useMemo(() => getActiveLyricIndex(lyrics?.lines || [], positionMs), [lyrics, positionMs]);

  useEffect(() => {
    if (!lyrics || activeIndex < 0 || isUserScrolling) {
      return;
    }
    listRef.current?.scrollToIndex({ index: activeIndex, viewPosition: 0.45, animated: true });
  }, [activeIndex, isUserScrolling, lyrics]);

  useEffect(() => () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
    }
  }, []);

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
      ref={listRef}
      data={lyrics.lines}
      keyExtractor={(item, index) => `${item.timeMs}-${index}`}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      onScrollBeginDrag={() => setIsUserScrolling(true)}
      onMomentumScrollEnd={() => setIsUserScrolling(false)}
      onScrollEndDrag={() => setIsUserScrolling(false)}
      onScrollToIndexFailed={info => {
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
        }
        retryTimerRef.current = setTimeout(() => {
          listRef.current?.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index), animated: true });
        }, 80);
      }}
      renderItem={({ item, index }) => {
        const active = index === activeIndex;
        return (
          <Pressable accessibilityRole="button" accessibilityLabel={`跳转到歌词：${item.text || '音乐间奏'}`} onPress={() => onSeek(item.timeMs)} style={styles.lineWrap}>
            <Text style={[styles.line, { color: active ? colors.primary : colors.textMuted }, active ? styles.activeLine : null]}>{item.text || '♪'}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, gap: 8, minHeight: 310, justifyContent: 'center', padding: 20, width: '100%' },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  list: { flex: 1, width: '100%' },
  listContent: { paddingVertical: 120 },
  lineWrap: { paddingHorizontal: 18, paddingVertical: 8 },
  line: { fontSize: 15, lineHeight: 25, textAlign: 'center' },
  activeLine: { fontSize: 19, fontWeight: '700', lineHeight: 30 },
});

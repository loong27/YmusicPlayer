import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import { buildAiRecommendationSummary, buildLocalRecommendations } from '../services/recommendation';
import { useCollection } from '../state/CollectionProvider';
import { useSettings } from '../state/SettingsProvider';
import type { AppColorScheme } from '../theme/colors';

export function DiscoverScreen({ colors }: { colors: AppColorScheme }) {
  const library = useLocalMusicLibrary();
  const collection = useCollection();
  const { settings } = useSettings();
  const [aiSummary, setAiSummary] = useState<string>();
  const [aiError, setAiError] = useState<string>();
  const [isAiLoading, setIsAiLoading] = useState(false);
  const recommendations = useMemo(
    () => buildLocalRecommendations(library.tracks, collection.likedTrackIds, collection.playHistory),
    [collection.likedTrackIds, collection.playHistory, library.tracks],
  );

  const runAi = async () => {
    setAiError(undefined);
    setIsAiLoading(true);
    try {
      setAiSummary(await buildAiRecommendationSummary(library.tracks, collection.likedTrackIds, collection.playHistory, settings));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 推荐失败');
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="发现"
        subtitle="本地优先推荐；AI 开启并配置后只发送匿名偏好摘要。"
        colors={colors}
      />
      <View style={styles.content}>
        <InfoCard title="隐私要求" body="AI 关闭时不发请求。请求体只包含曲库数量、喜欢数量、最近播放聚合和艺术家摘要，不包含本地路径或 content URI。" colors={colors} />
        <Pressable accessibilityRole="button" onPress={runAi} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={styles.buttonText}>{isAiLoading ? 'AI 推荐中' : '生成 AI 推荐'}</Text>
        </Pressable>
        {aiSummary ? <InfoCard title="AI 推荐摘要" body={aiSummary} colors={colors} /> : null}
        {aiError ? <Text style={[styles.reason, { color: colors.danger }]}>{aiError}</Text> : null}
        <FlatList
          data={recommendations}
          keyExtractor={item => item.track?.id || item.query.searchQuery}
          scrollEnabled={false}
          ListEmptyComponent={<InfoCard title="暂无推荐" body="扫描曲库、播放或喜欢更多歌曲后会生成本地推荐。" colors={colors} />}
          renderItem={({ item }) => (
            <View style={[styles.recommendation, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.primary }]}>今日推荐 · {Math.round(item.confidence * 100)}%</Text>
              <Text style={[styles.title, { color: colors.text }]}>{item.track?.title || item.query.title}</Text>
              <Text style={[styles.reason, { color: colors.textMuted }]}>{item.reason}</Text>
              <Text style={[styles.reason, { color: colors.textMuted }]}>云搜索关键词：{item.query.searchQuery}</Text>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 14, padding: 16 },
  recommendation: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 8, padding: 16 },
  label: { fontSize: 12, fontWeight: '700' },
  title: { fontSize: 17, fontWeight: '800' },
  reason: { fontSize: 13, lineHeight: 20 },
  button: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
});

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Artwork } from '../components/Artwork';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import { buildAiRecommendationSummary, buildLocalRecommendations } from '../services/recommendation';
import { useCollection } from '../state/CollectionProvider';
import { useSettings } from '../state/SettingsProvider';
import type { AppColorScheme } from '../theme/colors';

export function DiscoverScreen({ colors }: { colors: AppColorScheme }) {
  const library = useLocalMusicLibrary({ autoScanOnMount: false });
  const collection = useCollection();
  const { settings } = useSettings();
  const [aiSummary, setAiSummary] = useState<string>();
  const [aiError, setAiError] = useState<string>();
  const [isAiLoading, setIsAiLoading] = useState(false);
  const recommendations = useMemo(
    () => buildLocalRecommendations(library.tracks, collection.likedTrackIds, collection.playHistory),
    [collection.likedTrackIds, collection.playHistory, library.tracks],
  );
  const topRecommendation = recommendations[0];

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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="发现" subtitle="基于本地曲库、喜欢和最近播放生成推荐。" colors={colors} />
      <View style={[styles.hero, { backgroundColor: colors.primary, borderColor: colors.border }]}>
        <Text style={styles.heroLabel}>今日推荐</Text>
        <Text style={styles.heroTitle} numberOfLines={2}>{topRecommendation?.track?.title || '扫描曲库后解锁推荐'}</Text>
        <Text style={styles.heroText} numberOfLines={2}>{topRecommendation?.reason || '播放或喜欢更多歌曲后，这里会展示更贴近口味的本地推荐。'}</Text>
        <Pressable accessibilityRole="button" onPress={runAi} style={styles.heroButton}>
          <Text style={[styles.heroButtonText, { color: colors.primary }]}>{isAiLoading ? '生成中' : '生成 AI 摘要'}</Text>
        </Pressable>
      </View>
      {aiSummary ? <InfoCard title="AI 推荐摘要" body={aiSummary} colors={colors} /> : null}
      {aiError ? <Text style={[styles.reason, { color: colors.danger }]}>{aiError}</Text> : null}
      {recommendations.length === 0 ? (
        <InfoCard title="暂无推荐" body="扫描曲库、播放或喜欢更多歌曲后会生成本地推荐。" colors={colors} />
      ) : recommendations.map(item => (
        <View key={item.track?.id || item.query.searchQuery} style={[styles.recommendation, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {item.track ? <Artwork track={item.track} colors={colors} size={58} radius={16} /> : null}
          <View style={styles.recommendationMain}>
            <View style={styles.badgeRow}>
              <Text style={[styles.badge, { color: colors.primary, backgroundColor: colors.primarySoft }]}>推荐 {Math.round(item.confidence * 100)}%</Text>
              <Text style={[styles.badge, { color: colors.textMuted, backgroundColor: colors.surfaceStrong }]}>本地优先</Text>
            </View>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{item.track?.title || item.query.title}</Text>
            <Text style={[styles.reason, { color: colors.textMuted }]} numberOfLines={2}>{item.reason}</Text>
            <Text style={[styles.query, { color: colors.textMuted }]} numberOfLines={1}>云搜索：{item.query.searchQuery}</Text>
          </View>
        </View>
      ))}
      <Text style={[styles.privacy, { color: colors.textMuted }]}>隐私：AI 关闭时不发请求；开启后只发送匿名偏好摘要，不包含本地路径、content URI 或完整歌词。</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 14, padding: 16, paddingBottom: 24 },
  hero: { borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 20 },
  heroLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '800' },
  heroTitle: { color: '#ffffff', fontSize: 27, fontWeight: '900' },
  heroText: { color: 'rgba(255,255,255,0.82)', fontSize: 14, lineHeight: 21 },
  heroButton: { alignSelf: 'flex-start', backgroundColor: '#ffffff', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  heroButtonText: { fontSize: 13, fontWeight: '900' },
  recommendation: { alignItems: 'center', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, marginBottom: 10, padding: 12 },
  recommendationMain: { flex: 1, gap: 6, minWidth: 0 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { borderRadius: 999, fontSize: 11, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3 },
  title: { fontSize: 17, fontWeight: '900' },
  reason: { fontSize: 13, lineHeight: 20 },
  query: { fontSize: 12 },
  privacy: { fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
});

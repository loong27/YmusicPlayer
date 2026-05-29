import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import type { AppColorScheme } from '../theme/colors';

export function DiscoverScreen({ colors }: { colors: AppColorScheme }) {
  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="发现"
        subtitle="基于本地曲库、收藏、歌单、播放历史和可选歌词片段生成云端可搜索推荐。"
        colors={colors}
      />
      <View style={styles.content}>
        <InfoCard title="隐私要求" body="AI 请求不发送本地文件路径，只发送歌曲元数据、偏好统计和可选短歌词片段。" colors={colors} />
        <View style={[styles.recommendation, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.primary }]}>AI 云端推荐占位</Text>
          <Text style={[styles.title, { color: colors.text }]}>等待接入推荐模型与云音乐解析</Text>
          <Text style={[styles.reason, { color: colors.textMuted }]}>后续展示推荐理由、证据、置信度，并提供查看详情和下载入口。</Text>
        </View>
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
});

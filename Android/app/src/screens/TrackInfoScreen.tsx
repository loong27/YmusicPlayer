import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Artwork } from '../components/Artwork';
import { ScreenHeader } from '../components/ScreenHeader';
import type { Track } from '../models/Track';
import type { AppColorScheme } from '../theme/colors';
import { formatDuration } from '../utils/format';
import { formatTrackMeta } from '../utils/library';

export function TrackInfoScreen({ track, colors }: { track: Track; colors: AppColorScheme }) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <ScreenHeader title="歌曲信息" subtitle="本地 MediaStore 元数据和播放来源信息。" colors={colors} />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Artwork track={track} colors={colors} size={112} radius={24} />
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{track.title}</Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={2}>{formatTrackMeta(track)}</Text>
      </View>
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>基础信息</Text>
        <Info label="来源" value={sourceText(track.source)} colors={colors} />
        <Info label="时长" value={formatDuration(track.durationSeconds)} colors={colors} />
        <Info label="大小" value={track.size ? `${(track.size / 1024 / 1024).toFixed(1)} MB` : '未知'} colors={colors} />
        <Info label="MIME" value={track.mimeType || '未知'} colors={colors} />
      </View>
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>文件与歌词</Text>
        <Info label="路径" value={track.relativePath || track.localUri || '未知'} colors={colors} selectable />
        <Info label="歌词" value={track.lyricUri || '未关联'} colors={colors} selectable />
        <Info label="ID" value={track.id} colors={colors} selectable />
      </View>
    </ScrollView>
  );
}

function sourceText(source: string): string {
  if (source === 'local') {
    return '本地曲库';
  }
  if (source === 'remote') {
    return '云端结果';
  }
  return source;
}

function Info({ label, value, colors, selectable }: { label: string; value: string; colors: AppColorScheme; selectable?: boolean }) {
  return (
    <View style={[styles.info, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <Text selectable={selectable} style={[styles.value, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 12, padding: 16, paddingBottom: 24 },
  card: { alignItems: 'center', borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, gap: 9, padding: 20 },
  title: { fontSize: 21, fontWeight: '900', textAlign: 'center' },
  meta: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  section: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '900' },
  info: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 5, padding: 12 },
  label: { fontSize: 12, fontWeight: '800' },
  value: { fontSize: 14, lineHeight: 20 },
});

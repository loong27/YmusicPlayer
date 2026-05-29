import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Artwork } from '../components/Artwork';
import { ScreenHeader } from '../components/ScreenHeader';
import type { Track } from '../models/Track';
import type { AppColorScheme } from '../theme/colors';
import { formatDuration } from '../utils/format';

export function TrackInfoScreen({ track, colors }: { track: Track; colors: AppColorScheme }) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <ScreenHeader title="歌曲信息" subtitle="本地 MediaStore 元数据和播放来源信息。" colors={colors} />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Artwork track={track} colors={colors} size={96} radius={20} />
        <Text style={[styles.title, { color: colors.text }]}>{track.title}</Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>{track.artist} · {track.album || '未知专辑'}</Text>
      </View>
      <Info label="ID" value={track.id} colors={colors} />
      <Info label="来源" value={track.source} colors={colors} />
      <Info label="时长" value={formatDuration(track.durationSeconds)} colors={colors} />
      <Info label="MIME" value={track.mimeType || '未知'} colors={colors} />
      <Info label="大小" value={track.size ? `${(track.size / 1024 / 1024).toFixed(1)} MB` : '未知'} colors={colors} />
      <Info label="路径" value={track.relativePath || track.localUri || '未知'} colors={colors} />
      <Info label="歌词" value={track.lyricUri || '未关联'} colors={colors} />
    </ScrollView>
  );
}

function Info({ label, value, colors }: { label: string; value: string; colors: AppColorScheme }) {
  return (
    <View style={[styles.info, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 12, padding: 16 },
  card: { alignItems: 'center', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, gap: 8, padding: 18 },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  meta: { fontSize: 13, textAlign: 'center' },
  info: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 6, padding: 14 },
  label: { fontSize: 12, fontWeight: '700' },
  value: { fontSize: 14, lineHeight: 20 },
});

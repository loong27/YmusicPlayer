import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Artwork } from '../components/Artwork';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import type { Track } from '../models/Track';
import { usePlayer } from '../state/PlayerProvider';
import type { AppColorScheme } from '../theme/colors';
import { formatTrackMeta, getTrackAlbumName, getTrackArtistName } from '../utils/library';

export function ArtistDetailScreen({ artist, colors, onBack }: { artist: string; colors: AppColorScheme; onBack: () => void }) {
  const library = useLocalMusicLibrary({ autoScanOnMount: false });
  const player = usePlayer();
  const tracks = useMemo(() => library.tracks.filter(track => getTrackArtistName(track) === artist), [artist, library.tracks]);
  const albums = useMemo(() => [...new Set(tracks.map(getTrackAlbumName))], [tracks]);
  return <TrackGroupScreen title={artist} subtitle={`${tracks.length} 首歌曲 · ${albums.length} 张专辑`} kind="艺人" tracks={tracks} colors={colors} onBack={onBack} onPlay={player.playQueue} />;
}

export function AlbumDetailScreen({ album, colors, onBack }: { album: string; colors: AppColorScheme; onBack: () => void }) {
  const library = useLocalMusicLibrary({ autoScanOnMount: false });
  const player = usePlayer();
  const tracks = useMemo(() => library.tracks.filter(track => getTrackAlbumName(track) === album), [album, library.tracks]);
  return <TrackGroupScreen title={album} subtitle={`${tracks.length} 首歌曲`} kind="专辑" tracks={tracks} colors={colors} onBack={onBack} onPlay={player.playQueue} />;
}

function TrackGroupScreen({ title, subtitle, kind, tracks, colors, onBack, onPlay }: { title: string; subtitle: string; kind: string; tracks: Track[]; colors: AppColorScheme; onBack: () => void; onPlay: (queue: Track[], index: number) => Promise<void> }) {
  const coverTrack = tracks[0];
  const header = (
    <View style={styles.headerContent}>
      <ScreenHeader title={title} subtitle={subtitle} colors={colors} />
      <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Artwork track={coverTrack} colors={colors} size={74} radius={18} />
        <View style={styles.heroInfo}>
          <Text style={[styles.kind, { color: colors.primary }]}>{kind}</Text>
          <Text style={[styles.heroTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.heroMeta, { color: colors.textMuted }]}>{subtitle}</Text>
          <View style={styles.row}>
            <ActionButton label="返回" colors={colors} muted onPress={onBack} />
            <ActionButton label="播放全部" colors={colors} disabled={tracks.length === 0} onPress={() => onPlay(tracks, 0)} />
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <FlatList
      data={tracks}
      keyExtractor={item => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={(
        <View style={styles.emptyWrap}>
          <InfoCard title="暂无歌曲" body="当前分组没有可播放歌曲。" colors={colors} />
        </View>
      )}
      contentContainerStyle={styles.listContent}
      renderItem={({ item, index }) => (
        <Pressable accessibilityRole="button" accessibilityLabel={`播放 ${item.title}`} onPress={() => onPlay(tracks, index)} style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Artwork track={item} colors={colors} size={44} radius={12} />
          <View style={styles.info}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>{formatTrackMeta(item)}</Text>
          </View>
        </Pressable>
      )}
    />
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

const styles = StyleSheet.create({
  listContent: { paddingBottom: 16 },
  headerContent: { gap: 14, padding: 16 },
  emptyWrap: { paddingHorizontal: 16 },
  hero: { alignItems: 'center', borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 14, padding: 14 },
  heroInfo: { flex: 1, gap: 5, minWidth: 0 },
  kind: { fontSize: 12, fontWeight: '700' },
  heroTitle: { fontSize: 20, fontWeight: '700' },
  heroMeta: { fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 3 },
  item: { alignItems: 'center', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 11, marginHorizontal: 16, marginBottom: 10, padding: 10 },
  info: { flex: 1, gap: 4, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12 },
  button: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 13, paddingVertical: 8 },
  buttonText: { fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.45 },
});

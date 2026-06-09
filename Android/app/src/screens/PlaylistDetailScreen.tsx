import React, { useMemo } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Artwork } from '../components/Artwork';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import type { Playlist } from '../models/Playlist';
import type { Track } from '../models/Track';
import { useCollection } from '../state/CollectionProvider';
import { usePlayer } from '../state/PlayerProvider';
import type { AppColorScheme } from '../theme/colors';
import { formatTrackMeta } from '../utils/library';

export function PlaylistDetailScreen({ playlist, colors, onBack }: { playlist: Playlist; colors: AppColorScheme; onBack: () => void }) {
  const library = useLocalMusicLibrary({ autoScanOnMount: false });
  const collection = useCollection();
  const player = usePlayer();
  const tracks = useMemo(() => {
    const trackById = new Map(library.tracks.map(track => [track.id, track]));
    return playlist.trackIds
      .map(id => trackById.get(id))
      .filter((track): track is Track => Boolean(track));
  }, [library.tracks, playlist.trackIds]);

  const remove = (track: Track) => {
    Alert.alert('移出歌单', `从「${playlist.name}」移出「${track.title}」吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '移出', style: 'destructive', onPress: () => collection.removeFromPlaylist(playlist.id, track.id).catch(() => undefined) },
    ]);
  };

  const header = (
    <View style={styles.headerContent}>
      <ScreenHeader title={playlist.name} subtitle={`${tracks.length} 首歌曲`} colors={colors} />
      <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.cover, { backgroundColor: playlist.fixed ? colors.primarySoft : colors.surfaceStrong, borderColor: colors.border }]}>
          <Text style={[styles.coverText, { color: playlist.fixed ? colors.primary : colors.text }]}>{playlist.fixed ? '♡' : '♪'}</Text>
        </View>
        <View style={styles.heroInfo}>
          <Text style={[styles.heroTitle, { color: colors.text }]} numberOfLines={1}>{playlist.name}</Text>
          <Text style={[styles.heroMeta, { color: colors.textMuted }]}>{playlist.fixed ? '固定歌单' : '自定义歌单'} · {tracks.length} 首</Text>
          <View style={styles.row}>
            <ActionButton label="返回" colors={colors} muted onPress={onBack} />
            <ActionButton label="播放全部" colors={colors} disabled={tracks.length === 0} onPress={() => player.playQueue(tracks, 0)} />
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
          <InfoCard title="歌单为空" body="可以从搜索结果或曲库更多操作中加入歌曲。" colors={colors} />
        </View>
      )}
      contentContainerStyle={styles.listContent}
      renderItem={({ item, index }) => (
        <View style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`播放 ${item.title}`} onPress={() => player.playQueue(tracks, index)} style={styles.itemMain}>
            <Artwork track={item} colors={colors} size={46} radius={13} />
            <View style={styles.info}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>{formatTrackMeta(item)}</Text>
            </View>
          </Pressable>
          {!playlist.fixed ? <ActionButton label="移出" colors={colors} muted onPress={() => remove(item)} /> : null}
        </View>
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
  cover: { alignItems: 'center', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, height: 74, justifyContent: 'center', width: 74 },
  coverText: { fontSize: 30, fontWeight: '900' },
  heroInfo: { flex: 1, gap: 7, minWidth: 0 },
  heroTitle: { fontSize: 20, fontWeight: '900' },
  heroMeta: { fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { alignItems: 'center', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 10, padding: 10 },
  itemMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 11, minWidth: 0 },
  info: { flex: 1, gap: 4, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '900' },
  meta: { fontSize: 12 },
  button: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 7 },
  buttonText: { fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});

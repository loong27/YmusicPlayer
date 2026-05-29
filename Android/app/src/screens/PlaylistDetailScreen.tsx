import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import type { Playlist } from '../models/Playlist';
import type { Track } from '../models/Track';
import { useCollection } from '../state/CollectionProvider';
import { usePlayer } from '../state/PlayerProvider';
import type { AppColorScheme } from '../theme/colors';

export function PlaylistDetailScreen({ playlist, colors, onBack }: { playlist: Playlist; colors: AppColorScheme; onBack: () => void }) {
  const library = useLocalMusicLibrary();
  const collection = useCollection();
  const player = usePlayer();
  const tracks = useMemo(() => playlist.trackIds
    .map(id => library.tracks.find(track => track.id === id))
    .filter((track): track is Track => Boolean(track)), [library.tracks, playlist.trackIds]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title={playlist.name} subtitle={`${tracks.length} 首歌曲`} colors={colors} />
      <View style={styles.content}>
        <View style={styles.row}>
          <ActionButton label="返回" colors={colors} onPress={onBack} />
          <ActionButton label="播放歌单" colors={colors} muted={tracks.length === 0} onPress={() => player.playQueue(tracks, 0)} />
        </View>
        <FlatList
          data={tracks}
          keyExtractor={item => item.id}
          ListEmptyComponent={<InfoCard title="歌单为空" body="可以从搜索结果或曲库操作中加入歌曲。" colors={colors} />}
          renderItem={({ item, index }) => (
            <View style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.info}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>{item.artist} · {item.album || '未知专辑'}</Text>
              </View>
              <ActionButton label="播放" colors={colors} onPress={() => player.playQueue(tracks, index)} />
              <ActionButton label="移除" colors={colors} muted onPress={() => collection.removeFromPlaylist(playlist.id, item.id)} />
            </View>
          )}
        />
      </View>
    </View>
  );
}

function ActionButton({ label, colors, muted, onPress }: { label: string; colors: AppColorScheme; muted?: boolean; onPress: () => void }) {
  const textColor = { color: muted ? colors.text : '#ffffff' };
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, { backgroundColor: muted ? colors.surfaceStrong : colors.primary, borderColor: colors.border }]}><Text style={[styles.buttonText, textColor]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, gap: 12, padding: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { alignItems: 'center', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, marginBottom: 10, padding: 12 },
  info: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12 },
  button: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 7 },
  buttonText: { fontSize: 12, fontWeight: '800' },
});

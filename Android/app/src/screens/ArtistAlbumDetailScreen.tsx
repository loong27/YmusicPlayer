import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import type { Track } from '../models/Track';
import { usePlayer } from '../state/PlayerProvider';
import type { AppColorScheme } from '../theme/colors';

export function ArtistDetailScreen({ artist, colors, onBack }: { artist: string; colors: AppColorScheme; onBack: () => void }) {
  const library = useLocalMusicLibrary();
  const player = usePlayer();
  const tracks = useMemo(() => library.tracks.filter(track => (track.artist || '未知艺术家') === artist), [artist, library.tracks]);
  const albums = [...new Set(tracks.map(track => track.album || '未知专辑'))];
  return <TrackGroupScreen title={artist} subtitle={`${tracks.length} 首歌曲 · ${albums.length} 张专辑`} tracks={tracks} colors={colors} onBack={onBack} onPlay={player.playQueue} />;
}

export function AlbumDetailScreen({ album, colors, onBack }: { album: string; colors: AppColorScheme; onBack: () => void }) {
  const library = useLocalMusicLibrary();
  const player = usePlayer();
  const tracks = useMemo(() => library.tracks.filter(track => (track.album || '未知专辑') === album), [album, library.tracks]);
  return <TrackGroupScreen title={album} subtitle={`${tracks.length} 首歌曲`} tracks={tracks} colors={colors} onBack={onBack} onPlay={player.playQueue} />;
}

function TrackGroupScreen({ title, subtitle, tracks, colors, onBack, onPlay }: { title: string; subtitle: string; tracks: Track[]; colors: AppColorScheme; onBack: () => void; onPlay: (queue: Track[], index: number) => Promise<void> }) {
  return (
    <View style={styles.screen}>
      <ScreenHeader title={title} subtitle={subtitle} colors={colors} />
      <View style={styles.content}>
        <View style={styles.row}>
          <ActionButton label="返回" colors={colors} onPress={onBack} />
          <ActionButton label="播放全部" colors={colors} onPress={() => onPlay(tracks, 0)} />
        </View>
        <FlatList
          data={tracks}
          keyExtractor={item => item.id}
          ListEmptyComponent={<InfoCard title="暂无歌曲" body="当前分组没有可播放歌曲。" colors={colors} />}
          renderItem={({ item, index }) => (
            <Pressable accessibilityRole="button" onPress={() => onPlay(tracks, index)} style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>{item.artist} · {item.album || '未知专辑'}</Text>
            </Pressable>
          )}
        />
      </View>
    </View>
  );
}

function ActionButton({ label, colors, onPress }: { label: string; colors: AppColorScheme; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, gap: 12, padding: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 5, marginBottom: 10, padding: 14 },
  title: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12 },
  button: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  buttonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
});

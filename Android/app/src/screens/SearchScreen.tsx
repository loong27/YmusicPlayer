import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Artwork } from '../components/Artwork';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import type { Track } from '../models/Track';
import { searchCloudTracks } from '../services/cloudMusic';
import { useDownloads } from '../state/DownloadProvider';
import { usePlayer } from '../state/PlayerProvider';
import { useSettings } from '../state/SettingsProvider';
import type { AppColorScheme } from '../theme/colors';

export function SearchScreen({ colors, onBack }: { colors: AppColorScheme; onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<Track[]>([]);
  const [remoteError, setRemoteError] = useState<string>();
  const [isRemoteLoading, setIsRemoteLoading] = useState(false);
  const library = useLocalMusicLibrary();
  const player = usePlayer();
  const downloads = useDownloads();
  const { settings } = useSettings();
  const localResults = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) {
      return [];
    }
    return library.tracks.filter(track => [track.title, track.artist, track.album]
      .filter(Boolean)
      .some(value => value?.toLocaleLowerCase().includes(normalized)));
  }, [library.tracks, query]);
  const results = [...localResults, ...remoteResults];

  const runRemoteSearch = async () => {
    setRemoteError(undefined);
    setIsRemoteLoading(true);
    try {
      setRemoteResults(await searchCloudTracks(query, settings));
    } catch (error) {
      setRemoteResults([]);
      setRemoteError(error instanceof Error ? error.message : '云搜索失败');
    } finally {
      setIsRemoteLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="搜索" subtitle="本地搜索可用；开启并配置云 baseUrl 后可追加远端搜索。" colors={colors} />
      <View style={styles.content}>
        <View style={styles.row}>
          <ActionButton label="返回" colors={colors} onPress={onBack} />
          <ActionButton label={isRemoteLoading ? '云搜索中' : '云搜索'} colors={colors} onPress={runRemoteSearch} />
        </View>
        <TextInput placeholder="搜索标题、艺术家、专辑" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]} />
        {remoteError ? <Text style={[styles.error, { color: colors.danger }]}>{remoteError}</Text> : null}
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          ListEmptyComponent={<InfoCard title={query ? '无结果' : '输入关键词'} body={query ? '当前本地曲库没有匹配结果，可尝试云搜索。' : '输入关键词后会搜索本地曲库。'} colors={colors} />}
          renderItem={({ item, index }) => <TrackResult track={item} colors={colors} onPlay={() => player.playQueue(results, index)} onPlayNext={() => player.playNext(item)} onDownload={() => downloads.enqueue(item)} />}
        />
      </View>
    </View>
  );
}

function TrackResult({ track, colors, onPlay, onPlayNext, onDownload }: { track: Track; colors: AppColorScheme; onPlay: () => void; onPlayNext: () => void; onDownload: () => void }) {
  return (
    <View style={[styles.result, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Artwork track={track} colors={colors} size={44} radius={12} />
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{track.title}</Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>{track.source === 'remote' ? '云端' : '本地'} · {track.artist} · {track.album || '未知专辑'}</Text>
      </View>
      <View style={styles.actions}>
        <TextButton label="播放" colors={colors} onPress={onPlay} />
        <TextButton label="下首" colors={colors} onPress={onPlayNext} />
        <TextButton label="下载" colors={colors} onPress={onDownload} />
      </View>
    </View>
  );
}

function ActionButton({ label, colors, onPress }: { label: string; colors: AppColorScheme; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

function TextButton({ label, colors, onPress }: { label: string; colors: AppColorScheme; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.textButton, { borderColor: colors.border }]}><Text style={[styles.textButtonLabel, { color: colors.text }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, gap: 12, padding: 16 },
  row: { flexDirection: 'row', gap: 8 },
  input: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, fontSize: 15, paddingHorizontal: 14, paddingVertical: 10 },
  error: { fontSize: 13 },
  result: { alignItems: 'center', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, marginBottom: 10, padding: 12 },
  info: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12 },
  actions: { alignItems: 'flex-end', gap: 6 },
  button: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  buttonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  textButton: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 5 },
  textButtonLabel: { fontSize: 11, fontWeight: '800' },
});

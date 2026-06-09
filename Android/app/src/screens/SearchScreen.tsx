import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Artwork } from '../components/Artwork';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { playerGlyphs } from '../constants/playerGlyphs';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import type { Track } from '../models/Track';
import { searchCloudTracks } from '../services/cloudMusic';
import { useDownloads } from '../state/DownloadProvider';
import { usePlayer } from '../state/PlayerProvider';
import { useSettings } from '../state/SettingsProvider';
import type { AppColorScheme } from '../theme/colors';
import { formatTrackMeta } from '../utils/library';

export function SearchScreen({ colors, onBack }: { colors: AppColorScheme; onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<Track[]>([]);
  const [remoteError, setRemoteError] = useState<string>();
  const [isRemoteLoading, setIsRemoteLoading] = useState(false);
  const library = useLocalMusicLibrary({ autoScanOnMount: false });
  const player = usePlayer();
  const downloads = useDownloads();
  const { settings } = useSettings();
  const trimmedQuery = query.trim();
  const localResults = useMemo(() => {
    const normalized = trimmedQuery.toLocaleLowerCase();
    if (!normalized) {
      return [];
    }
    return library.tracks.filter(track => [track.title, track.artist, track.album]
      .filter(Boolean)
      .some(value => value?.toLocaleLowerCase().includes(normalized)));
  }, [library.tracks, trimmedQuery]);
  const results = useMemo(() => [...localResults, ...remoteResults], [localResults, remoteResults]);
  const canCloudSearch = trimmedQuery.length > 0 && !isRemoteLoading;

  const runRemoteSearch = async () => {
    if (!canCloudSearch) {
      return;
    }
    setRemoteError(undefined);
    setIsRemoteLoading(true);
    try {
      setRemoteResults(await searchCloudTracks(trimmedQuery, settings));
    } catch (error) {
      setRemoteResults([]);
      setRemoteError(error instanceof Error ? error.message : '云搜索失败');
    } finally {
      setIsRemoteLoading(false);
    }
  };

  const header = (
    <View style={styles.headerContent}>
      <ScreenHeader title="搜索" subtitle="搜索本地缓存曲库；需要更多结果时再发起云搜索。" colors={colors} />
      <View style={[styles.searchCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          placeholder="搜索标题、艺术家、专辑"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          value={query}
          onChangeText={value => {
            setQuery(value);
            setRemoteError(undefined);
            if (!value.trim()) {
              setRemoteResults([]);
            }
          }}
          onSubmitEditing={runRemoteSearch}
          style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
        />
        <View style={styles.row}>
          <ActionButton label="返回" colors={colors} muted onPress={onBack} />
          <ActionButton label={isRemoteLoading ? '云搜索中' : '云搜索'} colors={colors} disabled={!canCloudSearch} onPress={runRemoteSearch} />
        </View>
        {remoteError ? <Text style={[styles.error, { color: colors.danger }]}>{remoteError}</Text> : null}
        <Text style={[styles.hint, { color: colors.textMuted }]}>本地 {localResults.length} 首 · 云端 {remoteResults.length} 首</Text>
      </View>
    </View>
  );

  return (
    <FlatList
      data={results}
      keyExtractor={(item, index) => `${item.source}-${item.id}-${index}`}
      ListHeaderComponent={header}
      ListEmptyComponent={(
        <View style={styles.emptyWrap}>
          <InfoCard
            title={trimmedQuery ? '暂无匹配结果' : '输入关键词开始搜索'}
            body={trimmedQuery ? '没有本地匹配结果，可尝试云搜索或换一个关键词。' : '不会自动联网，只有点击云搜索才会请求远端。'}
            colors={colors}
          />
        </View>
      )}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item, index }) => (
        <TrackResult
          track={item}
          colors={colors}
          onPlay={() => player.playQueue(results, index)}
          onPlayNext={() => player.playNext(item)}
          onDownload={() => downloads.enqueue(item)}
        />
      )}
    />
  );
}

function TrackResult({ track, colors, onPlay, onPlayNext, onDownload }: { track: Track; colors: AppColorScheme; onPlay: () => void; onPlayNext: () => void; onDownload: () => void }) {
  return (
    <View style={[styles.result, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`播放 ${track.title}`} onPress={onPlay} style={styles.resultMain}>
        <Artwork track={track} colors={colors} size={48} radius={13} />
        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{track.title}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>{track.source === 'remote' ? '云端' : '本地'} · {formatTrackMeta(track)}</Text>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <IconButton label="下首播放" text={playerGlyphs.next} colors={colors} onPress={onPlayNext} />
        <IconButton label="下载歌曲" text="⇩" colors={colors} onPress={onDownload} />
      </View>
    </View>
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

function IconButton({ label, text, colors, onPress }: { label: string; text: string; colors: AppColorScheme; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.iconButton, { backgroundColor: colors.surfaceStrong, borderColor: colors.border }]}>
      <Text style={[styles.iconText, { color: colors.text }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 16 },
  headerContent: { gap: 14, padding: 16 },
  searchCard: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, fontSize: 15, paddingHorizontal: 15, paddingVertical: 10 },
  error: { fontSize: 13, lineHeight: 19 },
  hint: { fontSize: 12 },
  emptyWrap: { paddingHorizontal: 16 },
  result: { alignItems: 'center', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 10, padding: 10 },
  resultMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 11, minWidth: 0 },
  info: { flex: 1, gap: 4, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '900' },
  meta: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: 6 },
  button: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 8 },
  buttonText: { fontSize: 13, fontWeight: '900' },
  iconButton: { alignItems: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, height: 34, justifyContent: 'center', width: 34 },
  iconText: { fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});

import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { DownloadTask } from '../models/DownloadTask';
import { Artwork } from '../components/Artwork';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { InlineNotice, StatusBadge } from '../components/SettingsControls';
import { playerGlyphs } from '../constants/playerGlyphs';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import type { Track } from '../models/Track';
import { searchCloudTracks } from '../services/cloudMusic';
import { useDownloads } from '../state/DownloadProvider';
import { usePlayer } from '../state/PlayerProvider';
import { useSettings } from '../state/SettingsProvider';
import type { AppColorScheme } from '../theme/colors';
import { getErrorMessage } from '../utils/errors';
import { formatTrackMeta } from '../utils/library';
import { runPlayerAction } from '../utils/playerUi';

export function SearchScreen({ colors, onBack }: { colors: AppColorScheme; onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<Track[]>([]);
  const [remoteQuery, setRemoteQuery] = useState('');
  const [remoteError, setRemoteError] = useState<string>();
  const [isRemoteLoading, setIsRemoteLoading] = useState(false);
  const remoteSearchRequestRef = useRef(0);
  const queryRef = useRef('');
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
  const cloudConfigMessage = getCloudConfigMessage(settings);

  const isLatestRemoteSearch = (requestId: number, searchQuery: string) => remoteSearchRequestRef.current === requestId && queryRef.current.trim() === searchQuery;

  const runRemoteSearch = async () => {
    if (!canCloudSearch) {
      return;
    }
    if (cloudConfigMessage) {
      setRemoteError(`${cloudConfigMessage}。请到“我的 > 云端搜索”完成配置。`);
      return;
    }
    const searchQuery = trimmedQuery;
    const requestId = remoteSearchRequestRef.current + 1;
    remoteSearchRequestRef.current = requestId;
    setRemoteError(undefined);
    setIsRemoteLoading(true);
    try {
      const tracks = await searchCloudTracks(searchQuery, settings);
      if (isLatestRemoteSearch(requestId, searchQuery)) {
        setRemoteResults(tracks);
        setRemoteQuery(searchQuery);
      }
    } catch (error) {
      if (isLatestRemoteSearch(requestId, searchQuery)) {
        setRemoteResults([]);
        setRemoteQuery('');
        setRemoteError(getErrorMessage(error, '云搜索失败'));
      }
    } finally {
      if (isLatestRemoteSearch(requestId, searchQuery)) {
        setIsRemoteLoading(false);
      }
    }
  };

  const updateQuery = (value: string) => {
    const nextQuery = value.trim();
    remoteSearchRequestRef.current += 1;
    queryRef.current = value;
    setQuery(value);
    setRemoteError(undefined);
    setIsRemoteLoading(false);
    if (nextQuery !== remoteQuery) {
      setRemoteResults([]);
      setRemoteQuery('');
    }
  };

  const clearSearch = () => {
    remoteSearchRequestRef.current += 1;
    queryRef.current = '';
    setQuery('');
    setRemoteResults([]);
    setRemoteQuery('');
    setRemoteError(undefined);
    setIsRemoteLoading(false);
  };

  const header = (
    <View style={styles.headerContent}>
      <ScreenHeader title="搜索" subtitle="搜索本地缓存曲库；需要更多结果时再发起云搜索。" colors={colors} />
      <View style={[styles.searchCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <TextInput
            placeholder="搜索标题、艺术家、专辑"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            value={query}
            onChangeText={updateQuery}
            onSubmitEditing={runRemoteSearch}
            style={[styles.input, { color: colors.text }]}
          />
          {trimmedQuery ? (
            <Pressable accessibilityRole="button" accessibilityLabel="清空搜索关键词" onPress={clearSearch} hitSlop={8} style={styles.clearButton}>
              <Text style={[styles.clearText, { color: colors.textMuted }]}>清空</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.row}>
          <ActionButton label="返回" colors={colors} muted onPress={onBack} />
          <ActionButton label={isRemoteLoading ? '搜索中' : '搜索云端'} colors={colors} disabled={!canCloudSearch} busy={isRemoteLoading} onPress={runRemoteSearch} />
        </View>
        {cloudConfigMessage ? <InlineNotice tone="warning" message={`${cloudConfigMessage}。点击“搜索云端”会提示去 我的 > 云端搜索 配置。`} colors={colors} /> : null}
        {remoteError ? <InlineNotice tone="error" message={remoteError} colors={colors} /> : null}
        <Text style={[styles.hint, { color: colors.textMuted }]}>本地 {localResults.length} 首 · 云端 {remoteResults.length} 首 · 云端来源 {settings.cloudActiveProvider}</Text>
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
            body={trimmedQuery ? '没有本地匹配结果。若云端已配置，可点击“搜索云端”；若未配置，请到 我的 > 云端搜索 设置 Base URL。' : '不会自动联网，只有点击“搜索云端”才会请求远端。'}
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
          downloadTask={getDownloadTaskForTrack(downloads.tasks, item, settings.downloadQuality)}
          onPlay={() => runPlayerAction(() => player.playQueue(results, index))}
          onPlayNext={() => runPlayerAction(() => player.playNext(item))}
          onDownload={() => downloads.enqueue(item).catch(error => setRemoteError(getErrorMessage(error, '下载失败')))}
        />
      )}
    />
  );
}

function getCloudConfigMessage(settings: ReturnType<typeof useSettings>['settings']): string | undefined {
  if (!settings.cloudEnabled) {
    return '云端搜索未启用';
  }
  if (!settings.cloudBaseUrl.trim()) {
    return '云端搜索缺少 Base URL';
  }
  return undefined;
}

function getDownloadTaskForTrack(tasks: DownloadTask[], track: Track, quality: DownloadTask['quality']) {
  const remoteId = track.cloudMatch?.remoteId || track.id;
  const provider = track.cloudMatch?.provider || 'netease';
  return tasks.find(task => task.remoteId === remoteId && task.provider === provider && task.quality === quality && task.status !== 'canceled');
}

function getDownloadButtonState(track: Track, task?: DownloadTask) {
  if (track.source === 'local') {
    return { label: '本地文件', text: '本地', disabled: true, busy: false, tone: 'info' as const };
  }
  if (!task) {
    return { label: '下载', text: '下载', disabled: false, busy: false, tone: 'info' as const };
  }
  if (task.status === 'queued') {
    return { label: '排队中', text: '排队', disabled: true, busy: false, tone: 'info' as const };
  }
  if (task.status === 'downloading') {
    return { label: '下载中', text: '下载中', disabled: true, busy: true, tone: 'info' as const };
  }
  if (task.status === 'paused') {
    return { label: '下载已暂停', text: '暂停', disabled: true, busy: false, tone: 'warning' as const };
  }
  if (task.status === 'completed') {
    return { label: '已下载', text: '已下载', disabled: true, busy: false, tone: 'success' as const };
  }
  return { label: '重试下载', text: '重试', disabled: false, busy: false, tone: 'error' as const };
}

function TrackResult({ track, colors, downloadTask, onPlay, onPlayNext, onDownload }: { track: Track; colors: AppColorScheme; downloadTask?: DownloadTask; onPlay: () => void; onPlayNext: () => void; onDownload: () => void }) {
  const downloadButton = getDownloadButtonState(track, downloadTask);
  return (
    <View style={[styles.result, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`播放 ${track.title}`} onPress={onPlay} style={styles.resultMain}>
        <Artwork track={track} colors={colors} size={48} radius={13} />
        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{track.title}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>{track.source === 'remote' ? `云端 · ${track.cloudMatch?.provider || 'unknown'}${track.streamUri ? '' : ' · 需解析'}` : '本地'} · {formatTrackMeta(track)}</Text>
          <StatusBadge label={track.source === 'remote' ? '云端' : '本地'} tone={track.source === 'remote' ? 'info' : 'success'} colors={colors} />
          {downloadTask?.error ? <Text style={[styles.error, { color: colors.danger }]} numberOfLines={1}>{downloadTask.error}</Text> : null}
        </View>
      </Pressable>
      <View style={styles.actions}>
        <IconButton label="下首播放" text={playerGlyphs.next} colors={colors} onPress={onPlayNext} />
        <DownloadButton label={downloadButton.label} text={downloadButton.text} colors={colors} disabled={downloadButton.disabled} busy={downloadButton.busy} onPress={onDownload} />
      </View>
    </View>
  );
}

function ActionButton({ label, colors, muted, disabled, busy, onPress }: { label: string; colors: AppColorScheme; muted?: boolean; disabled?: boolean; busy?: boolean; onPress: () => void }) {
  const textColor = { color: muted ? colors.text : '#ffffff' };
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress} style={[styles.button, { backgroundColor: muted ? colors.surfaceStrong : colors.primary, borderColor: colors.border }, disabled ? styles.disabled : null]}>
      <View style={styles.buttonContent}>
        {busy ? <ActivityIndicator color="#ffffff" size="small" /> : null}
        <Text style={[styles.buttonText, textColor]}>{label}</Text>
      </View>
    </Pressable>
  );
}

function IconButton({ label, text, colors, disabled, busy, onPress }: { label: string; text: string; colors: AppColorScheme; disabled?: boolean; busy?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress} hitSlop={6} style={[styles.iconButton, { backgroundColor: colors.surfaceStrong, borderColor: colors.border }, disabled ? styles.disabled : null]}>
      <Text style={[styles.iconText, { color: colors.text }]}>{text}</Text>
    </Pressable>
  );
}

function DownloadButton({ label, text, colors, disabled, busy, onPress }: { label: string; text: string; colors: AppColorScheme; disabled?: boolean; busy?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress} hitSlop={6} style={[styles.downloadButton, { backgroundColor: colors.surfaceStrong, borderColor: colors.border }, disabled ? styles.disabled : null]}>
      {busy ? <ActivityIndicator color={colors.text} size="small" /> : null}
      <Text style={[styles.downloadText, { color: colors.text }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 16 },
  headerContent: { gap: 14, padding: 16 },
  searchCard: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inputWrap: { alignItems: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, paddingRight: 12 },
  input: { flex: 1, fontSize: 15, paddingHorizontal: 15, paddingVertical: 10 },
  clearButton: { paddingHorizontal: 4, paddingVertical: 6 },
  clearText: { fontSize: 13, fontWeight: '800' },
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
  buttonContent: { alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'center' },
  buttonText: { fontSize: 13, fontWeight: '900' },
  iconButton: { alignItems: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, height: 40, justifyContent: 'center', width: 40 },
  iconText: { fontSize: 13, fontWeight: '900' },
  downloadButton: { alignItems: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 4, minHeight: 40, minWidth: 54, justifyContent: 'center', paddingHorizontal: 10 },
  downloadText: { fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Artwork } from '../components/Artwork';
import { InfoCard } from '../components/InfoCard';
import { InlineNotice, StatusBadge } from '../components/SettingsControls';
import { ScreenHeader } from '../components/ScreenHeader';
import { Icon, iconNames } from '../constants/icons';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import type { Track } from '../models/Track';
import { usePlayer } from '../state/PlayerProvider';
import { useCollection } from '../state/CollectionProvider';
import { useSettings } from '../state/SettingsProvider';
import type { AppColorScheme } from '../theme/colors';
import { formatDuration } from '../utils/format';
import { formatTrackMeta, getTrackAlbumName, getTrackArtistName } from '../utils/library';

type SortMode = 'dateModified' | 'title' | 'artist' | 'album' | 'duration';

const sortOptions: { label: string; value: SortMode }[] = [
  { label: '最近', value: 'dateModified' },
  { label: '标题', value: 'title' },
  { label: '艺术家', value: 'artist' },
  { label: '专辑', value: 'album' },
  { label: '时长', value: 'duration' },
];

export function LibraryScreen({ colors, onOpenSearch, onOpenTrackInfo, onOpenArtist, onOpenAlbum }: { colors: AppColorScheme; onOpenSearch?: () => void; onOpenTrackInfo?: (track: Track) => void; onOpenArtist?: (artist: string) => void; onOpenAlbum?: (album: string) => void }) {
  const {
    permissionStatus,
    tracks,
    isScanning,
    error,
    lastScannedAt,
    requestPermissionAndScan,
    refresh,
  } = useLocalMusicLibrary();
  const player = usePlayer();
  const collection = useCollection();
  const { settings, updateSettings } = useSettings();
  const [query, setQuery] = useState('');
  const [actionTrack, setActionTrack] = useState<Track>();
  const sortMode = settings.librarySort as SortMode;
  const lastScannedText = lastScannedAt ? lastScannedAt.toLocaleString() : '尚未扫描';

  const visibleTracks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = normalizedQuery
      ? tracks.filter(track => [track.title, track.artist, track.album]
          .filter(Boolean)
          .some(value => value?.toLocaleLowerCase().includes(normalizedQuery)))
      : tracks;

    return [...filtered].sort((a, b) => compareTracks(a, b, sortMode));
  }, [query, sortMode, tracks]);

  const changeSortMode = (mode: SortMode) => {
    updateSettings(current => ({ ...current, librarySort: mode })).catch(() => undefined);
  };

  const addToPlaylist = (track: Track) => {
    const target = collection.userPlaylists[0];
    const action = target ? Promise.resolve(target) : collection.createPlaylist('默认歌单');
    action.then(playlist => collection.addToPlaylist(playlist.id, [track.id])).catch(() => undefined);
  };

  const runTrackAction = (action: (track: Track) => void) => {
    if (actionTrack) {
      action(actionTrack);
    }
    setActionTrack(undefined);
  };

  const header = (
    <View style={styles.headerContent}>
      <ScreenHeader
        title="曲库"
        subtitle="扫描 Android 本机音乐，像音乐 App 一样浏览、搜索和播放。"
        colors={colors}
      />
      {renderStatusCards({
        colors,
        permissionStatus,
        tracksCount: tracks.length,
        visibleCount: visibleTracks.length,
        isScanning,
        error,
        settings,
        lastScannedText,
        hasQuery: query.trim().length > 0,
        requestPermissionAndScan,
        refresh,
      })}
      {permissionStatus === 'granted' ? (
        <View style={[styles.toolsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.searchRow}>
            <TextInput
              placeholder="搜索歌曲 / 艺人 / 专辑"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              style={[styles.searchInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            {onOpenSearch ? <ActionButton label="云搜" colors={colors} onPress={onOpenSearch} /> : null}
          </View>
          <View style={styles.sortRow}>
            {sortOptions.map(option => {
              const selected = sortMode === option.value;
              const textColor = { color: selected ? '#ffffff' : colors.text };
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => changeSortMode(option.value)}
                  style={[
                    styles.sortButton,
                    {
                      backgroundColor: selected ? colors.primary : colors.surfaceStrong,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.sortText, textColor]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <FlatList
        data={permissionStatus === 'granted' && !error ? visibleTracks : []}
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={permissionStatus === 'granted' && !isScanning && !error ? (
          <View style={styles.emptyWrap}>
            <InfoCard
              title={tracks.length === 0 ? '未发现本地音乐' : '搜索无结果'}
              body={tracks.length === 0 ? emptyLibraryMessage(settings) : '请换一个关键词或清空搜索条件。'}
              colors={colors}
            />
          </View>
        ) : null}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isScanning} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
        renderItem={({ item, index }) => (
          <TrackRow
            item={item}
            colors={colors}
            active={player.currentTrack?.id === item.id}
            liked={collection.isLiked(item.id)}
            onPress={() => player.playQueue(visibleTracks, index)}
            onMore={() => setActionTrack(item)}
            onToggleLiked={() => collection.toggleLiked(item.id)}
          />
        )}
      />
      <Modal visible={Boolean(actionTrack)} transparent animationType="fade" onRequestClose={() => setActionTrack(undefined)}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityRole="button" accessibilityLabel="关闭更多操作" style={styles.modalBackdrop} onPress={() => setActionTrack(undefined)} />
          <View style={[styles.actionSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>{actionTrack?.title}</Text>
            <Text style={[styles.sheetMeta, { color: colors.textMuted }]} numberOfLines={1}>{actionTrack ? formatTrackMeta(actionTrack) : ''}</Text>
            <View style={styles.sheetGrid}>
              <SheetButton iconName={iconNames.skipNext} label="下首播放" colors={colors} onPress={() => runTrackAction(track => player.playNext(track))} />
              <SheetButton iconName={iconNames.queueMusic} label="加入队列" colors={colors} onPress={() => runTrackAction(track => player.addToQueue(track))} />
              <SheetButton iconName={iconNames.plus} label="加入歌单" colors={colors} onPress={() => runTrackAction(addToPlaylist)} />
              <SheetButton iconName={iconNames.info} label="歌曲信息" colors={colors} onPress={() => runTrackAction(track => onOpenTrackInfo?.(track))} />
              <SheetButton iconName={iconNames.musicNote} label="查看艺人" colors={colors} onPress={() => runTrackAction(track => onOpenArtist?.(getTrackArtistName(track)))} />
              <SheetButton iconName={iconNames.coverArt} label="查看专辑" colors={colors} onPress={() => runTrackAction(track => onOpenAlbum?.(getTrackAlbumName(track)))} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function renderStatusCards({
  colors,
  permissionStatus,
  tracksCount,
  visibleCount,
  isScanning,
  error,
  settings,
  lastScannedText,
  hasQuery,
  requestPermissionAndScan,
  refresh,
}: {
  colors: AppColorScheme;
  permissionStatus: string;
  tracksCount: number;
  visibleCount: number;
  isScanning: boolean;
  error?: string;
  settings: ReturnType<typeof useSettings>['settings'];
  lastScannedText: string;
  hasQuery: boolean;
  requestPermissionAndScan: () => Promise<void>;
  refresh: () => Promise<void>;
}) {
  if (permissionStatus === 'checking') {
    return <InfoCard title="正在检查权限" body="正在检查本地音乐读取权限。" colors={colors} />;
  }
  if (permissionStatus === 'unavailable') {
    return <InfoCard title="当前平台不可用" body="本地 MediaStore 扫描仅支持 Android 平台。" colors={colors} />;
  }
  if (permissionStatus === 'denied' || permissionStatus === 'blocked') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>需要本地音乐权限</Text>
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>授权后可扫描本机音频文件并展示到曲库页。</Text>
        <ActionButton label="授权并扫描" colors={colors} onPress={requestPermissionAndScan} />
      </View>
    );
  }
  if (permissionStatus !== 'granted') {
    return null;
  }
  return (
    <View style={[styles.overviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.overviewTop}>
        <View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>本地音乐</Text>
          <Text style={[styles.cardBody, { color: colors.textMuted }]}>上次扫描：{lastScannedText}</Text>
        </View>
        <ActionButton label={isScanning ? '扫描中' : '刷新'} colors={colors} disabled={isScanning} onPress={refresh} />
      </View>
      <View style={styles.statsRow}>
        <Stat label="歌曲" value={tracksCount} colors={colors} />
        <Stat label={hasQuery ? '搜索结果' : '当前显示'} value={visibleCount} colors={colors} />
      </View>
      <View style={styles.badgeRow}>
        <StatusBadge label={`过滤 < ${Math.round(settings.minAudioDurationMs / 1000)} 秒`} tone="info" colors={colors} />
        {settings.libraryExcludeNonMusicByName ? <StatusBadge label="已过滤录音/语音" tone="info" colors={colors} /> : null}
        {settings.libraryExcludeNonMusicByName ? <StatusBadge label="已过滤铃声/通知音" tone="info" colors={colors} /> : null}
        {settings.libraryCustomExcludeKeywords.trim() ? <StatusBadge label="自定义关键词过滤" tone="info" colors={colors} /> : null}
      </View>
      {isScanning ? (
        <View style={styles.scanningRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.statusText, { color: colors.textMuted }]}>正在扫描本地音乐...</Text>
        </View>
      ) : null}
      {error ? <Text style={[styles.cardBody, { color: colors.danger }]}>扫描失败：{error}</Text> : null}
      <InlineNotice tone="info" message={scanRuleMessage(settings)} colors={colors} />
    </View>
  );
}

function compareTracks(a: Track, b: Track, mode: SortMode): number {
  if (mode === 'duration') {
    return (b.durationSeconds || 0) - (a.durationSeconds || 0);
  }
  if (mode === 'dateModified') {
    return (b.dateModified || 0) - (a.dateModified || 0);
  }
  return String(a[mode] || '').localeCompare(String(b[mode] || ''), 'zh-Hans');
}

function scanRuleMessage(settings: ReturnType<typeof useSettings>['settings']): string {
  const rules = [`过滤小于 ${Math.round(settings.minAudioDurationMs / 1000)} 秒的音频`];
  if (settings.libraryExcludeNonMusicByName) {
    rules.push('排除明显录音、语音、铃声、通知音等非音乐文件');
  }
  if (settings.libraryCustomExcludeKeywords.trim()) {
    rules.push('应用自定义排除关键词');
  }
  return `扫描规则：${rules.join('，')}。`;
}

function emptyLibraryMessage(settings: ReturnType<typeof useSettings>['settings']): string {
  const filterText = settings.libraryExcludeNonMusicByName ? '已自动过滤录音、语音、铃声、通知音等非音乐音频；' : '';
  const customText = settings.libraryCustomExcludeKeywords.trim() ? '已应用自定义排除关键词；' : '';
  return `没有发现符合音乐规则的文件。${filterText}${customText}如果短音乐未出现，可到"我的 > 曲库扫描"调整过滤规则后重新扫描。`;
}

function TrackRow({ item, colors, active, liked, onPress, onMore, onToggleLiked }: { item: Track; colors: AppColorScheme; active: boolean; liked: boolean; onPress: () => void; onMore: () => void; onToggleLiked: () => void }) {
  return (
    <View style={[styles.trackRow, { backgroundColor: active ? colors.primarySoft : colors.surface, borderColor: active ? colors.primary : colors.border }]}>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.trackOpenArea}>
        <Artwork track={item} colors={colors} size={48} radius={13} />
        <View style={styles.trackMain}>
          <Text style={[styles.trackTitle, { color: active ? colors.primary : colors.text }]} numberOfLines={1}>{item.title}</Text>
          <Text style={[styles.trackMeta, { color: colors.textMuted }]} numberOfLines={1}>{formatTrackMeta(item)}</Text>
        </View>
      </Pressable>
      <Text style={[styles.duration, { color: colors.textMuted }]}>{formatDuration(item.durationSeconds)}</Text>
      <View style={styles.trackActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={liked ? '取消喜欢' : '喜欢歌曲'} onPress={onToggleLiked} style={[styles.iconButton, { backgroundColor: liked ? colors.primarySoft : colors.surfaceStrong, borderColor: colors.border }]}>
          {liked
            ? <Icon name={iconNames.heart} size={18} color={colors.danger} />
            : <Icon name={iconNames.heartOutline} size={18} color={colors.textMuted} />}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="更多操作" onPress={onMore} style={[styles.iconButton, { backgroundColor: colors.surfaceStrong, borderColor: colors.border }]}>
          <Icon name={iconNames.dotsHorizontal} size={18} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

function Stat({ label, value, colors }: { label: string; value: number; colors: AppColorScheme }) {
  return (
    <View style={[styles.statBox, { backgroundColor: colors.surfaceStrong }]}>
      <Text style={[styles.statValue, { color: colors.primary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function ActionButton({ label, colors, disabled, onPress }: { label: string; colors: AppColorScheme; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, { backgroundColor: colors.primary }, disabled ? styles.buttonDisabled : null]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function SheetButton({ iconName, label, colors, onPress }: { iconName: string; label: string; colors: AppColorScheme; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.sheetButton, { backgroundColor: colors.surfaceStrong, borderColor: colors.border }]}>
      <View style={styles.sheetButtonInner}>
        <Icon name={iconName} size={16} color={colors.text} />
        <Text style={[styles.sheetButtonText, { color: colors.text }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 16 },
  headerContent: { gap: 14, padding: 16 },
  emptyWrap: { paddingHorizontal: 16 },
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 16 },
  overviewCard: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, gap: 12, padding: 16 },
  overviewTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  cardBody: { fontSize: 13, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 10 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statBox: { borderRadius: 16, flex: 1, padding: 12 },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 2 },
  button: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 15, paddingVertical: 9 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  scanningRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 2 },
  statusText: { fontSize: 13 },
  toolsCard: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, gap: 12, padding: 12 },
  searchRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  searchInput: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, flex: 1, fontSize: 15, paddingHorizontal: 15, paddingVertical: 10 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sortButton: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 7 },
  sortText: { fontSize: 12, fontWeight: '800' },
  trackRow: { alignItems: 'center', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 9, marginHorizontal: 16, marginBottom: 9, padding: 10 },
  trackOpenArea: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 11, minWidth: 0 },
  trackMain: { flex: 1, gap: 4, minWidth: 0 },
  trackTitle: { fontSize: 16, fontWeight: '700' },
  trackMeta: { fontSize: 12, fontWeight: '400' },
  trackActions: { flexDirection: 'row', gap: 6 },
  iconButton: { alignItems: 'center', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, height: 34, justifyContent: 'center', width: 34 },
  duration: { fontSize: 12, minWidth: 38, textAlign: 'right' },
  modalRoot: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  modalBackdrop: { backgroundColor: 'rgba(0, 0, 0, 0.38)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  actionSheet: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, gap: 8, padding: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  sheetMeta: { fontSize: 13 },
  sheetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 8 },
  sheetButton: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  sheetButtonInner: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  sheetButtonText: { fontSize: 13, fontWeight: '700' },
});

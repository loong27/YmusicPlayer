import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Artwork } from '../components/Artwork';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import type { Track } from '../models/Track';
import { usePlayer } from '../state/PlayerProvider';
import { useCollection } from '../state/CollectionProvider';
import { useSettings } from '../state/SettingsProvider';
import type { AppColorScheme } from '../theme/colors';
import { formatDuration } from '../utils/format';

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

  const header = (
    <View style={styles.headerContent}>
      <ScreenHeader
        title="曲库"
        subtitle="扫描 Android 本机音乐，支持搜索、排序和点击播放。"
        colors={colors}
      />
      {renderStatusCards({
        colors,
        permissionStatus,
        tracksCount: tracks.length,
        visibleCount: visibleTracks.length,
        isScanning,
        error,
        lastScannedText,
        hasQuery: query.trim().length > 0,
        requestPermissionAndScan,
        refresh,
      })}
      {permissionStatus === 'granted' ? (
        <View style={[styles.toolsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {onOpenSearch ? <ActionButton label="打开搜索" colors={colors} onPress={onOpenSearch} /> : null}
          <TextInput
            placeholder="搜索标题、艺术家或专辑"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            style={[styles.searchInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <View style={styles.sortRow}>
            {sortOptions.map(option => {
              const selected = sortMode === option.value;
              const sortTextColor = { color: selected ? '#ffffff' : colors.text };
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  onPress={() => changeSortMode(option.value)}
                  style={[
                    styles.sortButton,
                    {
                      backgroundColor: selected ? colors.primary : colors.surfaceStrong,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.sortText, sortTextColor]}>
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
    <FlatList
      data={permissionStatus === 'granted' && !isScanning && !error ? visibleTracks : []}
      keyExtractor={item => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={permissionStatus === 'granted' && !isScanning && !error ? (
        <View style={styles.emptyWrap}>
          <InfoCard
            title={tracks.length === 0 ? '未发现本地音乐' : '搜索无结果'}
            body={tracks.length === 0 ? '系统 MediaStore 当前没有可展示的音乐文件。' : '请换一个关键词或清空搜索条件。'}
            colors={colors}
          />
        </View>
      ) : null}
      contentContainerStyle={styles.listContent}
      renderItem={({ item, index }) => (
        <TrackRow
          item={item}
          colors={colors}
          active={player.currentTrack?.id === item.id}
          liked={collection.isLiked(item.id)}
          onPress={() => player.playQueue(visibleTracks, index)}
          onPlayNext={() => player.playNext(item)}
          onAddToQueue={() => player.addToQueue(item)}
          onAddToPlaylist={() => {
            const target = collection.userPlaylists[0];
            const action = target ? Promise.resolve(target) : collection.createPlaylist('默认歌单');
            action.then(playlist => collection.addToPlaylist(playlist.id, [item.id])).catch(() => undefined);
          }}
          onOpenInfo={() => onOpenTrackInfo?.(item)}
          onOpenArtist={() => onOpenArtist?.(item.artist || '未知艺术家')}
          onOpenAlbum={() => onOpenAlbum?.(item.album || '未知专辑')}
          onToggleLiked={() => collection.toggleLiked(item.id)}
        />
      )}
    />
  );
}

function renderStatusCards({
  colors,
  permissionStatus,
  tracksCount,
  visibleCount,
  isScanning,
  error,
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
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>本地扫描</Text>
      <Text style={[styles.cardBody, { color: colors.textMuted }]}>已发现 {tracksCount} 首歌曲{hasQuery ? `，当前显示 ${visibleCount} 首` : ''}。上次扫描：{lastScannedText}。</Text>
      <ActionButton label={isScanning ? '扫描中' : '刷新'} colors={colors} disabled={isScanning} onPress={refresh} />
      {isScanning ? (
        <View style={styles.scanningRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.statusText, { color: colors.textMuted }]}>正在扫描本地音乐...</Text>
        </View>
      ) : null}
      {error ? (
        <Text style={[styles.cardBody, { color: colors.danger }]}>扫描失败：{error}</Text>
      ) : null}
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

function TrackRow({
  item,
  colors,
  active,
  liked,
  onPress,
  onPlayNext,
  onAddToQueue,
  onAddToPlaylist,
  onOpenInfo,
  onOpenArtist,
  onOpenAlbum,
  onToggleLiked,
}: {
  item: Track;
  colors: AppColorScheme;
  active: boolean;
  liked: boolean;
  onPress: () => void;
  onPlayNext: () => void;
  onAddToQueue: () => void;
  onAddToPlaylist: () => void;
  onOpenInfo: () => void;
  onOpenArtist: () => void;
  onOpenAlbum: () => void;
  onToggleLiked: () => void;
}) {
  const rowColors = { borderBottomColor: colors.border, backgroundColor: active ? colors.primarySoft : 'transparent' };
  const titleColor = { color: active ? colors.primary : colors.text };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.trackRow,
        rowColors,
      ]}
    >
      <Artwork track={item} colors={colors} size={44} radius={12} />
      <View style={styles.trackMain}>
        <Text style={[styles.trackTitle, titleColor]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.trackMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {item.artist} · {item.album || '未知专辑'}
        </Text>
      </View>
      <View style={styles.trackActions}>
        <Pressable accessibilityRole="button" onPress={onToggleLiked} style={[styles.likeButton, { borderColor: colors.border }]}>
          <Text style={[styles.likeText, { color: liked ? colors.danger : colors.textMuted }]}>{liked ? '已喜欢' : '喜欢'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onPlayNext} style={[styles.likeButton, { borderColor: colors.border }]}>
          <Text style={[styles.likeText, { color: colors.text }]}>下首</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onAddToQueue} style={[styles.likeButton, { borderColor: colors.border }]}>
          <Text style={[styles.likeText, { color: colors.text }]}>队列</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onAddToPlaylist} style={[styles.likeButton, { borderColor: colors.border }]}>
          <Text style={[styles.likeText, { color: colors.text }]}>歌单</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onOpenInfo} style={[styles.likeButton, { borderColor: colors.border }]}>
          <Text style={[styles.likeText, { color: colors.text }]}>信息</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onOpenArtist} style={[styles.likeButton, { borderColor: colors.border }]}>
          <Text style={[styles.likeText, { color: colors.text }]}>艺人</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onOpenAlbum} style={[styles.likeButton, { borderColor: colors.border }]}>
          <Text style={[styles.likeText, { color: colors.text }]}>专辑</Text>
        </Pressable>
      </View>
      <Text style={[styles.duration, { color: colors.textMuted }]}>{formatDuration(item.durationSeconds)}</Text>
    </Pressable>
  );
}

function ActionButton({ label, colors, disabled, onPress }: { label: string; colors: AppColorScheme; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: colors.primary }, disabled ? styles.buttonDisabled : null]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 16 },
  headerContent: { gap: 14, padding: 16 },
  emptyWrap: { paddingHorizontal: 16 },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardBody: { fontSize: 13, lineHeight: 20 },
  button: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  scanningRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 2 },
  statusText: { fontSize: 13 },
  toolsCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 12, padding: 12 },
  searchInput: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, fontSize: 15, paddingHorizontal: 14, paddingVertical: 10 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sortButton: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 7 },
  sortText: { fontSize: 12, fontWeight: '700' },
  trackRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 13 },
  trackMain: { flex: 1, gap: 4 },
  trackTitle: { fontSize: 16, fontWeight: '700' },
  trackMeta: { fontSize: 12 },
  trackActions: { alignItems: 'flex-end', gap: 5 },
  likeButton: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 5 },
  likeText: { fontSize: 12, fontWeight: '700' },
  duration: { fontSize: 12 },
});

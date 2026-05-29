import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import type { Track } from '../models/Track';
import type { AppColorScheme } from '../theme/colors';
import { formatDuration } from '../utils/format';

const previewLimit = 200;

export function LibraryScreen({ colors }: { colors: AppColorScheme }) {
  const {
    permissionStatus,
    tracks,
    isScanning,
    error,
    lastScannedAt,
    requestPermissionAndScan,
    refresh,
  } = useLocalMusicLibrary();
  const visibleTracks = tracks.slice(0, previewLimit);
  const lastScannedText = lastScannedAt
    ? lastScannedAt.toLocaleString()
    : '尚未扫描';

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="曲库"
        subtitle="扫描 Android 本机音频，展示本地曲库。首阶段先展示前 200 首，后续再接入搜索、分组与页面级虚拟列表。"
        colors={colors}
      />
      <View style={styles.content}>
        {permissionStatus === 'checking' ? (
          <InfoCard
            title="正在检查权限"
            body="正在检查本地音乐读取权限。"
            colors={colors}
          />
        ) : null}

        {permissionStatus === 'unavailable' ? (
          <InfoCard
            title="当前平台不可用"
            body="本地 MediaStore 扫描仅支持 Android 平台。"
            colors={colors}
          />
        ) : null}

        {permissionStatus === 'denied' ? (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              需要本地音乐权限
            </Text>
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>
              授权后可扫描本机音频文件并展示到曲库页。
            </Text>
            <ActionButton
              label="授权并扫描"
              colors={colors}
              onPress={requestPermissionAndScan}
            />
          </View>
        ) : null}

        {permissionStatus === 'blocked' ? (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              权限已被系统阻止
            </Text>
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>
              请前往系统设置开启音乐和音频权限，然后返回刷新曲库。
            </Text>
            <ActionButton
              label="打开系统设置"
              colors={colors}
              onPress={() => {
                Linking.openSettings().catch(() => undefined);
              }}
            />
          </View>
        ) : null}

        {permissionStatus === 'granted' ? (
          <>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                本地扫描
              </Text>
              <Text style={[styles.cardBody, { color: colors.textMuted }]}>
                已发现 {tracks.length} 首歌曲。上次扫描：{lastScannedText}
                。首阶段列表仅展示前 {previewLimit} 首。
              </Text>
              <ActionButton
                label={isScanning ? '扫描中' : '刷新'}
                colors={colors}
                disabled={isScanning}
                onPress={refresh}
              />
            </View>

            {isScanning ? (
              <View style={styles.scanningRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.statusText, { color: colors.textMuted }]}>
                  正在扫描本地音乐...
                </Text>
              </View>
            ) : null}

            {error ? (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.cardTitle, { color: colors.danger }]}>
                  扫描失败
                </Text>
                <Text style={[styles.cardBody, { color: colors.textMuted }]}>
                  {error}
                </Text>
                <ActionButton label="重试" colors={colors} onPress={refresh} />
              </View>
            ) : null}

            {!isScanning && !error && tracks.length === 0 ? (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  未发现本地音乐
                </Text>
                <Text style={[styles.cardBody, { color: colors.textMuted }]}>
                  系统 MediaStore 当前没有可展示的音乐文件。
                </Text>
                <ActionButton label="刷新" colors={colors} onPress={refresh} />
              </View>
            ) : null}

            {visibleTracks.length > 0 ? (
              <FlatList
                data={visibleTracks}
                keyExtractor={item => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <TrackRow item={item} colors={colors} />
                )}
              />
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

function TrackRow({ item, colors }: { item: Track; colors: AppColorScheme }) {
  return (
    <View style={[styles.trackRow, { borderBottomColor: colors.border }]}>
      <View style={styles.trackMain}>
        <Text
          style={[styles.trackTitle, { color: colors.text }]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        <Text
          style={[styles.trackMeta, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {item.artist} · {item.album || '未知专辑'}
        </Text>
      </View>
      <Text style={[styles.duration, { color: colors.textMuted }]}>
        {formatDuration(item.durationSeconds)}
      </Text>
    </View>
  );
}

function ActionButton({
  label,
  colors,
  disabled,
  onPress,
}: {
  label: string;
  colors: AppColorScheme;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: colors.primary },
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 14, padding: 16 },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardBody: { fontSize: 13, lineHeight: 20 },
  button: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  scanningRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  statusText: { fontSize: 13 },
  trackRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  trackMain: { flex: 1, gap: 4 },
  trackTitle: { fontSize: 16, fontWeight: '700' },
  trackMeta: { fontSize: 12 },
  duration: { fontSize: 12 },
});

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import {
  getAppVersion,
  getAudioPermissionStatus,
  getNotificationPermissionStatus,
  openAndroidAppSettings,
  requestAudioPermission,
  requestNotificationPermission,
  type AndroidPermissionStatus,
} from '../services/androidPermissions';
import { useCollection } from '../state/CollectionProvider';
import { useSettings } from '../state/SettingsProvider';
import type { AppColorScheme } from '../theme/colors';

export function ProfileScreen({ colors, onOpenPlaylists }: { colors: AppColorScheme; onOpenPlaylists?: () => void }) {
  const [audioStatus, setAudioStatus] = useState<AndroidPermissionStatus>('denied');
  const [notificationStatus, setNotificationStatus] = useState<AndroidPermissionStatus>('denied');
  const { settings, updateSettings } = useSettings();
  const collection = useCollection();
  const library = useLocalMusicLibrary({ autoScanOnMount: false });

  const refreshPermissions = () => {
    getAudioPermissionStatus().then(setAudioStatus).catch(() => setAudioStatus('denied'));
    getNotificationPermissionStatus().then(setNotificationStatus).catch(() => setNotificationStatus('denied'));
  };

  useEffect(() => {
    refreshPermissions();
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="我的" subtitle="管理本地音乐、歌单、播放和推荐设置。" colors={colors} />

      <View style={[styles.userCard, { backgroundColor: colors.primary, borderColor: colors.border }]}>
        <Text style={styles.userLabel}>我的音乐</Text>
        <Text style={styles.userTitle}>本地音乐收藏者</Text>
        <View style={styles.statsRow}>
          <Stat label="本地歌曲" value={library.tracks.length} light />
          <Stat label="喜欢" value={collection.likedTrackIds.length} light />
          <Stat label="歌单" value={collection.userPlaylists.length} light />
          <Stat label="最近" value={collection.playHistory.length} light />
        </View>
      </View>

      <Section title="权限" colors={colors}>
        <InfoCard
          title="权限状态"
          body={`音频权限：${permissionText(audioStatus)}\n通知权限：${permissionText(notificationStatus)}\n拒绝通知权限不影响播放，只会缺少通知栏/锁屏控制。`}
          colors={colors}
        />
        <View style={styles.row}>
          <ActionButton label="请求音频权限" colors={colors} onPress={() => requestAudioPermission().then(setAudioStatus)} />
          <ActionButton label="请求通知权限" colors={colors} onPress={() => requestNotificationPermission().then(setNotificationStatus)} />
          <ActionButton label="系统设置" colors={colors} muted onPress={openAndroidAppSettings} />
        </View>
      </Section>

      <Section title="曲库扫描" colors={colors}>
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>最短音频过滤：{Math.round(settings.minAudioDurationMs / 1000)} 秒，用于减少铃声/通知音混入。</Text>
        <View style={styles.row}>
          {[15_000, 30_000, 60_000].map(value => (
            <ActionButton
              key={value}
              label={`${Math.round(value / 1000)} 秒`}
              colors={colors}
              muted={settings.minAudioDurationMs !== value}
              onPress={() => updateSettings({ ...settings, minAudioDurationMs: value })}
            />
          ))}
        </View>
        {onOpenPlaylists ? <ActionButton label="管理歌单" colors={colors} onPress={onOpenPlaylists} /> : null}
      </Section>

      <Section title="播放" colors={colors}>
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>启动时恢复上次队列：{settings.restoreQueueOnLaunch ? '开启' : '关闭'}。恢复后不会自动播放。</Text>
        <ActionButton label={settings.restoreQueueOnLaunch ? '关闭恢复队列' : '开启恢复队列'} colors={colors} onPress={() => updateSettings({ ...settings, restoreQueueOnLaunch: !settings.restoreQueueOnLaunch })} />
      </Section>

      <Section title="云端搜索" colors={colors}>
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>启用后 Search 页会请求 baseUrl/search?q=关键词。不要把密钥写进仓库。</Text>
        <TextInput placeholder="云搜索 baseUrl" placeholderTextColor={colors.textMuted} value={settings.cloudBaseUrl} onChangeText={value => updateSettings({ ...settings, cloudBaseUrl: value })} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
        <ActionButton label={settings.cloudEnabled ? '关闭云搜索' : '开启云搜索'} colors={colors} onPress={() => updateSettings({ ...settings, cloudEnabled: !settings.cloudEnabled })} />
      </Section>

      <Section title="AI 推荐" colors={colors}>
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>启用后只发送匿名偏好摘要，不发送本地路径、content URI 或完整歌词。</Text>
        <TextInput placeholder="AI endpoint" placeholderTextColor={colors.textMuted} value={settings.aiBaseUrl} onChangeText={value => updateSettings({ ...settings, aiBaseUrl: value })} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
        <TextInput placeholder="模型" placeholderTextColor={colors.textMuted} value={settings.aiModel} onChangeText={value => updateSettings({ ...settings, aiModel: value })} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
        <TextInput placeholder="API Key（仅本机存储）" placeholderTextColor={colors.textMuted} value={settings.aiApiKey} onChangeText={value => updateSettings({ ...settings, aiApiKey: value })} secureTextEntry style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
        <ActionButton label={settings.aiEnabled ? '关闭 AI 推荐' : '开启 AI 推荐'} colors={colors} onPress={() => updateSettings({ ...settings, aiEnabled: !settings.aiEnabled })} />
      </Section>

      <Section title="关于" colors={colors}>
        <InfoCard title="App 版本" body={getAppVersion()} colors={colors} />
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>云端音乐搜索、下载管理、AI 推荐、歌词、歌单编辑和均衡器按移动端体验持续完善。</Text>
      </Section>
    </ScrollView>
  );
}

function permissionText(status: AndroidPermissionStatus): string {
  if (status === 'granted') {
    return '已授权';
  }
  if (status === 'blocked') {
    return '已阻止';
  }
  if (status === 'unavailable') {
    return '不可用';
  }
  return '未授权';
}

function Section({ title, colors, children }: { title: string; colors: AppColorScheme; children: React.ReactNode }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Stat({ label, value, light }: { label: string; value: number; light?: boolean }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, light ? styles.lightText : null]}>{value}</Text>
      <Text style={[styles.statLabel, light ? styles.lightMuted : null]}>{label}</Text>
    </View>
  );
}

function ActionButton({ label, colors, muted, onPress }: { label: string; colors: AppColorScheme; muted?: boolean; onPress: () => void }) {
  const buttonColors = { backgroundColor: muted ? colors.surfaceStrong : colors.primary, borderColor: colors.border };
  const textColors = { color: muted ? colors.text : '#ffffff' };

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, buttonColors]}>
      <Text style={[styles.buttonText, textColors]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 14, padding: 16, paddingBottom: 24 },
  userCard: { borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, gap: 13, padding: 20 },
  userLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '800' },
  userTitle: { color: '#ffffff', fontSize: 26, fontWeight: '900' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, gap: 2 },
  statValue: { color: '#ffffff', fontSize: 20, fontWeight: '900' },
  statLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  lightText: { color: '#ffffff' },
  lightMuted: { color: 'rgba(255,255,255,0.75)' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 16 },
  cardTitle: { fontSize: 17, fontWeight: '900' },
  cardBody: { fontSize: 13, lineHeight: 20 },
  button: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 9 },
  buttonText: { fontSize: 13, fontWeight: '800' },
  input: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, fontSize: 14, paddingHorizontal: 12, paddingVertical: 9 },
});

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import type { AudioQuality, CloudProvider } from '../models/Track';
import {
  getAppVersion,
  getAudioPermissionStatus,
  getBatteryOptimizationStatus,
  getNotificationPermissionStatus,
  openAndroidAppSettings,
  requestAudioPermission,
  requestIgnoreBatteryOptimizations,
  requestNotificationPermission,
  type AndroidPermissionStatus,
  type BatteryOptimizationStatus,
} from '../services/androidPermissions';
import { searchCloudTracks } from '../services/cloudMusic';
import { useCollection } from '../state/CollectionProvider';
import { usePlayer } from '../state/PlayerProvider';
import { useSettings } from '../state/SettingsProvider';
import type { AppColorScheme } from '../theme/colors';
import { getErrorMessage } from '../utils/errors';

const qualityOptions: AudioQuality[] = ['MP3_128', 'MP3_320', 'FLAC', 'ATMOS', 'ATMOS2'];
const providerOptions: CloudProvider[] = ['netease', 'qqmusic', 'kugou'];

export function ProfileScreen({ colors, onOpenPlaylists }: { colors: AppColorScheme; onOpenPlaylists?: () => void }) {
  const [audioStatus, setAudioStatus] = useState<AndroidPermissionStatus>('denied');
  const [notificationStatus, setNotificationStatus] = useState<AndroidPermissionStatus>('denied');
  const [batteryStatus, setBatteryStatus] = useState<BatteryOptimizationStatus>({ status: 'unknown', isIgnoringBatteryOptimizations: false });
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [inlineError, setInlineError] = useState<string>();
  const [testResult, setTestResult] = useState<string>();
  const { settings, updateSettings, lastError } = useSettings();
  const collection = useCollection();
  const player = usePlayer();
  const library = useLocalMusicLibrary({ autoScanOnMount: false });

  const refreshPermissions = () => {
    getAudioPermissionStatus().then(setAudioStatus).catch(() => setAudioStatus('denied'));
    getNotificationPermissionStatus().then(setNotificationStatus).catch(() => setNotificationStatus('denied'));
    getBatteryOptimizationStatus().then(setBatteryStatus).catch(() => setBatteryStatus({ status: 'unknown', isIgnoringBatteryOptimizations: false }));
  };

  useEffect(() => {
    refreshPermissions();
  }, []);

  const save = (patch: Partial<typeof settings>) => {
    updateSettings(current => ({ ...current, ...patch })).catch(error => setInlineError(getErrorMessage(error, '保存设置失败')));
  };

  const runCloudTest = async () => {
    setInlineError(undefined);
    setTestResult(undefined);
    try {
      const tracks = await searchCloudTracks('test', settings, { pageSize: 1 });
      setTestResult(`连接成功，返回 ${tracks.length} 条结果`);
    } catch (error) {
      setInlineError(getErrorMessage(error, '测试连接失败'));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="我的" subtitle="管理本地音乐、歌单、播放、保活、云端和推荐设置。" colors={colors} />

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

      <InlineError message={inlineError || lastError} colors={colors} />

      <Section title="权限与保活" colors={colors}>
        <InfoCard
          title="权限状态"
          body={`音频权限：${permissionText(audioStatus)}\n通知权限：${permissionText(notificationStatus)}\n电池优化：${batteryText(batteryStatus)}\n前台媒体服务 + MediaSession + WakeLock 可提升后台播放稳定性，但不同厂商仍可能需要手动允许自启动/后台运行。`}
          colors={colors}
        />
        <View style={styles.row}>
          <ActionButton label="请求音频权限" colors={colors} onPress={() => requestAudioPermission().then(setAudioStatus).catch(error => setInlineError(getErrorMessage(error, '请求音频权限失败')))} />
          <ActionButton label="请求通知权限" colors={colors} onPress={() => requestNotificationPermission().then(setNotificationStatus).catch(error => setInlineError(getErrorMessage(error, '请求通知权限失败')))} />
          <ActionButton label="电池优化设置" colors={colors} onPress={() => requestIgnoreBatteryOptimizations().then(setBatteryStatus).catch(error => setInlineError(getErrorMessage(error, '打开电池优化设置失败')))} />
          <ActionButton label="系统设置" colors={colors} muted onPress={openAndroidAppSettings} />
        </View>
        <Toggle label="后台保活提示" value={settings.androidShowBatteryOptimizationHint} colors={colors} onChange={value => save({ androidShowBatteryOptimizationHint: value })} />
        <Toggle label="保持播放服务" value={settings.androidKeepAliveEnabled} colors={colors} onChange={value => save({ androidKeepAliveEnabled: value })} />
      </Section>

      <Section title="曲库扫描" colors={colors}>
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>最短音频过滤：{Math.round(settings.minAudioDurationMs / 1000)} 秒，用于减少铃声/通知音混入。</Text>
        <View style={styles.row}>
          {[15_000, 30_000, 60_000].map(value => (
            <ActionButton key={value} label={`${Math.round(value / 1000)} 秒`} colors={colors} muted={settings.minAudioDurationMs !== value} onPress={() => save({ minAudioDurationMs: value })} />
          ))}
        </View>
        <View style={styles.row}>
          {['dateModified', 'title', 'artist', 'album'].map(value => (
            <ActionButton key={value} label={sortLabel(value)} colors={colors} muted={settings.librarySort !== value} onPress={() => save({ librarySort: value })} />
          ))}
        </View>
        {onOpenPlaylists ? <ActionButton label="管理歌单" colors={colors} onPress={onOpenPlaylists} /> : null}
      </Section>

      <Section title="播放" colors={colors}>
        <Toggle label="启动时恢复上次队列" value={settings.restoreQueueOnLaunch} colors={colors} onChange={value => save({ restoreQueueOnLaunch: value })} />
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>恢复队列后不会自动播放；后台播放依赖媒体前台服务和系统省电策略。</Text>
      </Section>

      <Section title="云端搜索" colors={colors}>
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>密钥仅保存在本机普通存储并脱敏显示，不要使用高权限密钥。</Text>
        <Toggle label="启用云搜索" value={settings.cloudEnabled} colors={colors} onChange={value => save({ cloudEnabled: value })} />
        <SettingsInput label="Base URL" value={settings.cloudBaseUrl} colors={colors} onChangeText={value => save({ cloudBaseUrl: value })} placeholder="https://example.com" />
        <SecretInput label="API Key" value={settings.cloudApiKey} visible={Boolean(visibleSecrets.cloud)} colors={colors} onToggle={() => setVisibleSecrets(value => ({ ...value, cloud: !value.cloud }))} onClear={() => save({ cloudApiKey: '' })} onChangeText={value => save({ cloudApiKey: value })} />
        <SettingsInput label="Auth Header" value={settings.cloudAuthHeader} colors={colors} onChangeText={value => save({ cloudAuthHeader: value })} placeholder="Authorization" />
        <SettingsInput label="Auth Scheme" value={settings.cloudAuthScheme} colors={colors} onChangeText={value => save({ cloudAuthScheme: value })} placeholder="Bearer，可留空" />
        <ChipRow label="Provider" values={providerOptions} selected={settings.cloudActiveProvider} colors={colors} onSelect={value => save({ cloudActiveProvider: value })} />
        <ChipRow label="默认音质" values={qualityOptions} selected={settings.cloudDefaultQuality} colors={colors} onSelect={value => save({ cloudDefaultQuality: value })} />
        <NumberChips label="Page Size" values={[10, 20, 30, 50]} selected={settings.cloudPageSize} colors={colors} onSelect={value => save({ cloudPageSize: value })} />
        <NumberChips label="Timeout" values={[8000, 15000, 30000, 60000]} formatter={value => `${Math.round(value / 1000)}s`} selected={settings.cloudTimeoutMs} colors={colors} onSelect={value => save({ cloudTimeoutMs: value })} />
        <View style={styles.row}><ActionButton label="测试连接" colors={colors} onPress={runCloudTest} /></View>
        {testResult ? <Text style={[styles.success, { color: colors.primary }]}>{testResult}</Text> : null}
      </Section>

      <Section title="下载" colors={colors}>
        <ChipRow label="默认音质" values={qualityOptions} selected={settings.downloadQuality} colors={colors} onSelect={value => save({ downloadQuality: value })} />
        <NumberChips label="最大并发" values={[1]} selected={settings.downloadMaxConcurrentTasks} colors={colors} onSelect={value => save({ downloadMaxConcurrentTasks: value })} />
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>当前 Native 下载器暂按单任务执行，多并发配置已限制为 1。</Text>
        <Toggle label="下载完成后自动导入" value={settings.downloadAutoImportAfterDownload} colors={colors} onChange={value => save({ downloadAutoImportAfterDownload: value })} />
        <Toggle label="自动下载歌词" value={settings.downloadAutoDownloadLyric} colors={colors} onChange={value => save({ downloadAutoDownloadLyric: value })} />
        <Toggle label="音质失败自动降级" value={settings.downloadAutoQualityFallback} colors={colors} onChange={value => save({ downloadAutoQualityFallback: value })} />
      </Section>

      <Section title="AI 推荐" colors={colors}>
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>启用后只发送匿名偏好摘要，不发送本地路径、content URI 或完整歌词。</Text>
        <Toggle label="启用 AI 推荐" value={settings.aiEnabled} colors={colors} onChange={value => save({ aiEnabled: value })} />
        <SettingsInput label="Endpoint" value={settings.aiBaseUrl} colors={colors} onChangeText={value => save({ aiBaseUrl: value })} placeholder="AI endpoint" />
        <SettingsInput label="模型" value={settings.aiModel} colors={colors} onChangeText={value => save({ aiModel: value })} placeholder="model" />
        <SecretInput label="API Key" value={settings.aiApiKey} visible={Boolean(visibleSecrets.ai)} colors={colors} onToggle={() => setVisibleSecrets(value => ({ ...value, ai: !value.ai }))} onClear={() => save({ aiApiKey: '' })} onChangeText={value => save({ aiApiKey: value })} />
        <NumberChips label="Temperature" values={[0.2, 0.7, 1, 1.5]} selected={settings.aiTemperature} colors={colors} onSelect={value => save({ aiTemperature: value })} />
        <NumberChips label="Max Tokens" values={[400, 800, 1200, 2000]} selected={settings.aiMaxTokens} colors={colors} onSelect={value => save({ aiMaxTokens: value })} />
        <NumberChips label="Timeout" values={[10000, 30000, 60000]} formatter={value => `${Math.round(value / 1000)}s`} selected={settings.aiTimeoutMs} colors={colors} onSelect={value => save({ aiTimeoutMs: value })} />
        <Toggle label="包含歌词片段" value={settings.aiIncludeLyricSnippets} colors={colors} onChange={value => save({ aiIncludeLyricSnippets: value })} />
      </Section>

      <Section title="关于与诊断" colors={colors}>
        <InfoCard title="App 版本" body={getAppVersion()} colors={colors} />
        <InfoCard
          title="播放诊断"
          body={`状态：${player.playbackState}\n最近事件：${player.lastDiagnostic?.type || '暂无'}\n通知权限：${permissionText(notificationStatus)}\n电池优化：${batteryText(batteryStatus)}\n云密钥：${settings.cloudApiKey ? '已配置' : '未配置'} · AI 密钥：${settings.aiApiKey ? '已配置' : '未配置'}`}
          colors={colors}
        />
      </Section>
    </ScrollView>
  );
}

function permissionText(status: AndroidPermissionStatus): string {
  if (status === 'granted') return '已授权';
  if (status === 'blocked') return '已阻止';
  if (status === 'unavailable') return '不可用';
  return '未授权';
}

function batteryText(status: BatteryOptimizationStatus): string {
  if (status.status === 'ignored') return '已忽略';
  if (status.status === 'not_ignored') return '未忽略';
  if (status.status === 'unavailable') return '不可用';
  return '未知';
}

function sortLabel(value: string): string {
  return value === 'dateModified' ? '最近修改' : value === 'title' ? '标题' : value === 'artist' ? '艺术家' : '专辑';
}

function Section({ title, colors, children }: { title: string; colors: AppColorScheme; children: React.ReactNode }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function SettingsInput({ label, value, placeholder, colors, secure, onChangeText }: { label: string; value: string; placeholder?: string; colors: AppColorScheme; secure?: boolean; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput placeholder={placeholder || label} placeholderTextColor={colors.textMuted} value={value} onChangeText={onChangeText} secureTextEntry={secure} autoCapitalize="none" style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
    </View>
  );
}

function SecretInput({ label, value, visible, colors, onToggle, onClear, onChangeText }: { label: string; value: string; visible: boolean; colors: AppColorScheme; onToggle: () => void; onClear: () => void; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.field}>
      <SettingsInput label={label} value={value} colors={colors} secure={!visible} onChangeText={onChangeText} placeholder="仅本机普通存储" />
      <View style={styles.row}>
        <ActionButton label={visible ? '隐藏' : value ? '显示' : '未配置'} colors={colors} muted onPress={onToggle} />
        <ActionButton label="清空" colors={colors} muted onPress={onClear} />
      </View>
    </View>
  );
}

function Toggle({ label, value, colors, onChange }: { label: string; value: boolean; colors: AppColorScheme; onChange: (value: boolean) => void }) {
  return <ActionButton label={`${label}：${value ? '开' : '关'}`} colors={colors} muted={!value} onPress={() => onChange(!value)} />;
}

function ChipRow<T extends string>({ label, values, selected, colors, onSelect }: { label: string; values: T[]; selected: T; colors: AppColorScheme; onSelect: (value: T) => void }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.row}>{values.map(value => <ActionButton key={value} label={value} colors={colors} muted={selected !== value} onPress={() => onSelect(value)} />)}</View>
    </View>
  );
}

function NumberChips({ label, values, selected, formatter, colors, onSelect }: { label: string; values: number[]; selected: number; formatter?: (value: number) => string; colors: AppColorScheme; onSelect: (value: number) => void }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.row}>{values.map(value => <ActionButton key={value} label={formatter ? formatter(value) : String(value)} colors={colors} muted={selected !== value} onPress={() => onSelect(value)} />)}</View>
    </View>
  );
}

function InlineError({ message, colors }: { message?: string; colors: AppColorScheme }) {
  return message ? <Text style={[styles.error, { color: colors.danger }]}>{message}</Text> : null;
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
  const textColor = { color: muted ? colors.text : '#ffffff' };
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, { backgroundColor: muted ? colors.surfaceStrong : colors.primary, borderColor: colors.border }]}>
      <Text style={[styles.buttonText, textColor]}>{label}</Text>
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
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '800' },
  button: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 9 },
  buttonText: { fontSize: 13, fontWeight: '800' },
  input: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, fontSize: 14, paddingHorizontal: 12, paddingVertical: 9 },
  error: { fontSize: 13, fontWeight: '700', lineHeight: 19 },
  success: { fontSize: 13, fontWeight: '800' },
});

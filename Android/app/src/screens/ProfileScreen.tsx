import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { ActionButton, ChipSelector, CollapsibleSection, controlStyles, InlineNotice, NumberChips, SectionCard, SettingInput, StatusBadge, ToggleButton } from '../components/SettingsControls';
import { useLocalMusicLibrary } from '../hooks/useLocalMusicLibrary';
import type { PlayerDiagnostic } from '../models/Player';
import type { AudioQuality, CloudProvider } from '../models/Track';
import {
  getAppVersion,
  getAudioPermissionStatus,
  getBatteryOptimizationStatus,
  getCrashLogs,
  clearCrashLogs,
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
  const [cloudTestQuery, setCloudTestQuery] = useState('test');
  const [settingsImportText, setSettingsImportText] = useState('');
  const [crashLogText, setCrashLogText] = useState<string>();
  const { settings, updateSettings, lastError } = useSettings();
  const collection = useCollection();
  const player = usePlayer();
  const library = useLocalMusicLibrary({ autoScanOnMount: false });
  const mountedRef = useRef(true);
  const cloudTestRequestRef = useRef(0);
  const lastScannedText = library.lastScannedAt ? library.lastScannedAt.toLocaleString() : '尚未扫描';

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cloudTestRequestRef.current += 1;
    };
  }, []);

  const refreshPermissions = () => {
    getAudioPermissionStatus().then(value => mountedRef.current && setAudioStatus(value)).catch(() => mountedRef.current && setAudioStatus('denied'));
    getNotificationPermissionStatus().then(value => mountedRef.current && setNotificationStatus(value)).catch(() => mountedRef.current && setNotificationStatus('denied'));
    getBatteryOptimizationStatus().then(value => mountedRef.current && setBatteryStatus(value)).catch(() => mountedRef.current && setBatteryStatus({ status: 'unknown', isIgnoringBatteryOptimizations: false }));
  };

  useEffect(() => {
    refreshPermissions();
  }, []);

  const save = (patch: Partial<typeof settings>) => {
    updateSettings(current => ({ ...current, ...patch })).catch(error => setInlineError(getErrorMessage(error, '保存设置失败')));
  };

  const runCloudTest = async () => {
    const requestId = cloudTestRequestRef.current + 1;
    cloudTestRequestRef.current = requestId;
    setInlineError(undefined);
    setTestResult(undefined);
    try {
      const startedAt = Date.now();
      const query = cloudTestQuery.trim() || 'test';
      const tracks = await searchCloudTracks(query, settings, { pageSize: 1 });
      const elapsedMs = Date.now() - startedAt;
      if (mountedRef.current && requestId === cloudTestRequestRef.current) {
        setTestResult(`连接成功，关键词 ${query} 返回 ${tracks.length} 条结果 · ${elapsedMs}ms · ${settings.cloudActiveProvider}/${settings.cloudDefaultQuality}`);
      }
    } catch (error) {
      if (mountedRef.current && requestId === cloudTestRequestRef.current) {
        setInlineError(getErrorMessage(error, '测试连接失败'));
      }
    }
  };

  const shareDiagnostics = () => {
    Share.share({ message: buildDiagnosticSummary({ audioStatus, notificationStatus, batteryStatus, settings, player }) }).catch(error => setInlineError(getErrorMessage(error, '分享诊断失败')));
  };

  const exportSettings = () => {
    const payload = JSON.stringify({ type: 'ymusic-settings', version: 1, settings }, null, 2);
    Share.share({ message: payload }).catch(error => setInlineError(getErrorMessage(error, '导出设置失败')));
  };

  const loadCrashLogs = () => {
    getCrashLogs().then(logs => mountedRef.current && setCrashLogText(logs)).catch(error => setInlineError(getErrorMessage(error, '读取崩溃日志失败')));
  };

  const shareCrashLogs = () => {
    if (!crashLogText || crashLogText === '暂无崩溃日志') {
      loadCrashLogs();
      return;
    }
    Share.share({ message: crashLogText }).catch(error => setInlineError(getErrorMessage(error, '分享崩溃日志失败')));
  };

  const doClearCrashLogs = () => {
    clearCrashLogs().then(() => { if (mountedRef.current) setCrashLogText(undefined); }).catch(error => setInlineError(getErrorMessage(error, '清除崩溃日志失败')));
  };

  const importSettings = () => {
    try {
      const payload = JSON.parse(settingsImportText.trim()) as { settings?: Partial<typeof settings> } | Partial<typeof settings>;
      if (!isPlainObject(payload)) {
        throw new Error('导入内容必须是对象');
      }
      const imported = 'settings' in payload ? payload.settings : payload;
      if (!isPlainObject(imported)) {
        throw new Error('settings 字段必须是对象');
      }
      updateSettings(current => ({ ...current, ...imported })).then(() => {
        setSettingsImportText('');
        setInlineError(undefined);
      }).catch(error => setInlineError(getErrorMessage(error, '导入设置失败')));
    } catch (error) {
      setInlineError(getErrorMessage(error, '导入设置 JSON 格式不正确'));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="我的" subtitle="常用设置优先，高级云端、AI 与诊断按需展开。" colors={colors} />

      <View style={[styles.userCard, { backgroundColor: colors.primary, borderColor: colors.border }]}>
        <Text style={styles.userLabel}>我的音乐</Text>
        <Text style={styles.userTitle}>本地音乐收藏者</Text>
        <View style={styles.statsRow}>
          <Stat label="本地歌曲" value={library.tracks.length} light />
          <Stat label="喜欢" value={collection.likedTrackIds.length} light />
          <Stat label="歌单" value={collection.userPlaylists.length} light />
          <Stat label="最近" value={collection.playHistory.length} light />
        </View>
        <View style={styles.heroActions}>{onOpenPlaylists ? <ActionButton label="管理歌单" colors={colors} muted onPress={onOpenPlaylists} /> : null}</View>
      </View>

      <InlineNotice tone="error" message={inlineError || lastError} colors={colors} />

      <SectionCard title="权限与后台播放" summary={keepAliveSummary(notificationStatus, batteryStatus)} colors={colors}>
        <View style={styles.badgeRow}>
          <StatusBadge label={`音频 ${permissionText(audioStatus)}`} tone={audioStatus === 'granted' ? 'success' : 'warning'} colors={colors} />
          <StatusBadge label={`通知 ${permissionText(notificationStatus)}`} tone={notificationStatus === 'granted' ? 'success' : 'warning'} colors={colors} />
          <StatusBadge label={`电池 ${batteryText(batteryStatus)}`} tone={batteryStatus.status === 'ignored' ? 'success' : 'warning'} colors={colors} />
        </View>
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>前台媒体服务 + MediaSession + WakeLock 可提升后台播放稳定性；不同厂商仍可能需要允许自启动/后台运行。</Text>
        <View style={styles.row}>
          <ActionButton label="请求音频权限" colors={colors} onPress={() => requestAudioPermission().then(setAudioStatus).catch(error => setInlineError(getErrorMessage(error, '请求音频权限失败')))} />
          <ActionButton label="请求通知权限" colors={colors} onPress={() => requestNotificationPermission().then(setNotificationStatus).catch(error => setInlineError(getErrorMessage(error, '请求通知权限失败')))} />
          <ActionButton label="允许后台播放" colors={colors} onPress={() => requestIgnoreBatteryOptimizations().then(setBatteryStatus).catch(error => setInlineError(getErrorMessage(error, '打开电池优化设置失败')))} />
          <ActionButton label="打开系统设置" colors={colors} muted onPress={openAndroidAppSettings} />
        </View>
        <ToggleButton label="后台保活提示" value={settings.androidShowBatteryOptimizationHint} colors={colors} onChange={value => save({ androidShowBatteryOptimizationHint: value })} />
        <ToggleButton label="保持播放服务" value={settings.androidKeepAliveEnabled} colors={colors} onChange={value => save({ androidKeepAliveEnabled: value })} />
      </SectionCard>

      <SectionCard title="曲库扫描" summary={`${library.tracks.length} 首 · 上次扫描 ${lastScannedText}`} colors={colors}>
        <InlineNotice tone="info" message={settings.libraryExcludeNonMusicByName ? '已自动排除明显录音、语音、铃声、通知音等非音乐文件。' : '已关闭内置非音乐命名过滤，仅保留时长和自定义关键词过滤。'} colors={colors} />
        <ToggleButton label="内置非音乐命名过滤" value={settings.libraryExcludeNonMusicByName} colors={colors} onChange={value => save({ libraryExcludeNonMusicByName: value })} />
        <SettingInput label="自定义排除关键词" value={settings.libraryCustomExcludeKeywords} colors={colors} onChangeText={value => save({ libraryCustomExcludeKeywords: value })} placeholder="逗号分隔，如：播客,临时,会议" />
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>最短音频过滤：{Math.round(settings.minAudioDurationMs / 1000)} 秒。若部分短音乐未出现，可降低此阈值后重新扫描。</Text>
        <View style={styles.row}>{[15_000, 30_000, 60_000].map(value => <ActionButton key={value} label={`${Math.round(value / 1000)} 秒`} colors={colors} muted={settings.minAudioDurationMs !== value} onPress={() => save({ minAudioDurationMs: value })} />)}</View>
        <View style={styles.row}>{['dateModified', 'title', 'artist', 'album'].map(value => <ActionButton key={value} label={sortLabel(value)} colors={colors} muted={settings.librarySort !== value} onPress={() => save({ librarySort: value })} />)}</View>
        <View style={styles.row}>
          <ActionButton label={library.isScanning ? '扫描中' : '重新扫描'} colors={colors} disabled={library.isScanning} onPress={() => library.refresh().catch(error => setInlineError(getErrorMessage(error, '扫描失败')))} />
        </View>
      </SectionCard>

      <SectionCard title="播放设置" summary={settings.restoreQueueOnLaunch ? '启动恢复队列' : '启动不恢复队列'} colors={colors}>
        <ToggleButton label="启动时恢复上次队列" value={settings.restoreQueueOnLaunch} colors={colors} onChange={value => save({ restoreQueueOnLaunch: value })} />
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>恢复队列后不会自动播放；播放错误时可在诊断区查看最近事件。</Text>
      </SectionCard>

      <SectionCard title="通知与播放舒适性" summary={comfortSummary(settings)} colors={colors}>
        <InlineNotice tone="info" message="系统通知栏、锁屏、蓝牙耳机和车机控制通过 MediaSession 同步；音频焦点和蓝牙重连策略会记录到诊断历史。" colors={colors} />
        <ToggleButton label="短暂抢占时压低音量" value={settings.audioFocusDuckOnTransient} colors={colors} onChange={value => save({ audioFocusDuckOnTransient: value })} />
        <ToggleButton label="长期抢占时暂停" value={settings.audioFocusPauseOnLoss} colors={colors} onChange={value => save({ audioFocusPauseOnLoss: value })} />
        <ToggleButton label="焦点恢复后继续播放" value={settings.audioFocusResumeAfterGain} colors={colors} onChange={value => save({ audioFocusResumeAfterGain: value })} />
        <ToggleButton label="蓝牙重连后自动继续" value={settings.bluetoothAutoResumeOnReconnect} colors={colors} onChange={value => save({ bluetoothAutoResumeOnReconnect: value })} />
        <NumberChips label="重连恢复窗口" values={[60_000, 300_000, 600_000]} formatter={value => `${Math.round(value / 60_000)} 分钟`} selected={settings.bluetoothAutoResumeWindowMs} colors={colors} onSelect={value => save({ bluetoothAutoResumeWindowMs: value })} />
      </SectionCard>

      <SectionCard title="下载设置" summary={`${settings.downloadQuality} · 单任务下载`} colors={colors}>
        <ChipSelector label="默认音质" values={qualityOptions} selected={settings.downloadQuality} colors={colors} onSelect={value => save({ downloadQuality: value })} />
        <NumberChips label="最大并发" values={[1]} selected={settings.downloadMaxConcurrentTasks} colors={colors} onSelect={value => save({ downloadMaxConcurrentTasks: value })} />
        <InlineNotice tone="info" message="当前 Native 下载器暂按单任务执行，多并发配置已限制为 1。" colors={colors} />
        <ToggleButton label="下载完成后自动导入" value={settings.downloadAutoImportAfterDownload} colors={colors} onChange={value => save({ downloadAutoImportAfterDownload: value })} />
        <ToggleButton label="自动下载歌词" value={settings.downloadAutoDownloadLyric} colors={colors} onChange={value => save({ downloadAutoDownloadLyric: value })} />
        <ToggleButton label="音质失败自动降级" value={settings.downloadAutoQualityFallback} colors={colors} onChange={value => save({ downloadAutoQualityFallback: value })} />
      </SectionCard>

      <CollapsibleSection title="云端搜索" summary={cloudSummary(settings)} colors={colors} defaultOpen={false}>
        <InlineNotice tone="warning" message="密钥仅保存在本机普通存储并脱敏显示，不要使用高权限密钥。" colors={colors} />
        <ToggleButton label="启用云搜索" value={settings.cloudEnabled} colors={colors} onChange={value => save({ cloudEnabled: value })} />
        <SettingInput label="Base URL" value={settings.cloudBaseUrl} colors={colors} onChangeText={value => save({ cloudBaseUrl: value })} placeholder="https://example.com" keyboardType="url" />
        <SecretInput label="API Key" value={settings.cloudApiKey} visible={Boolean(visibleSecrets.cloud)} colors={colors} onToggle={() => setVisibleSecrets(value => ({ ...value, cloud: !value.cloud }))} onClear={() => save({ cloudApiKey: '' })} onChangeText={value => save({ cloudApiKey: value })} />
        <SettingInput label="Auth Header" value={settings.cloudAuthHeader} colors={colors} onChangeText={value => save({ cloudAuthHeader: value })} placeholder="Authorization" />
        <SettingInput label="Auth Scheme" value={settings.cloudAuthScheme} colors={colors} onChangeText={value => save({ cloudAuthScheme: value })} placeholder="Bearer，可留空" />
        <ChipSelector label="Provider" values={providerOptions} selected={settings.cloudActiveProvider} colors={colors} onSelect={value => save({ cloudActiveProvider: value })} />
        <ChipSelector label="默认音质" values={qualityOptions} selected={settings.cloudDefaultQuality} colors={colors} onSelect={value => save({ cloudDefaultQuality: value })} />
        <NumberChips label="Page Size" values={[10, 20, 30, 50]} selected={settings.cloudPageSize} colors={colors} onSelect={value => save({ cloudPageSize: value })} />
        <NumberChips label="Timeout" values={[8000, 15000, 30000, 60000]} formatter={value => `${Math.round(value / 1000)}s`} selected={settings.cloudTimeoutMs} colors={colors} onSelect={value => save({ cloudTimeoutMs: value })} />
        <InfoCard title="接口约定" body={'GET /search?q=关键词&provider=netease&quality=MP3_320&limit=20\nGET /tracks/{remoteId}/url?provider=netease&quality=MP3_320'} colors={colors} />
        <SettingInput label="调试关键词" value={cloudTestQuery} colors={colors} onChangeText={setCloudTestQuery} placeholder="test" />
        <InlineNotice tone="info" message={`调试请求会携带当前 Header/Scheme、Provider、音质、Page Size 与 ${Math.round(settings.cloudTimeoutMs / 1000)}s 超时配置。`} colors={colors} />
        <View style={styles.row}><ActionButton label="测试云搜索连接" colors={colors} onPress={runCloudTest} /></View>
        <InlineNotice tone="success" message={testResult} colors={colors} />
      </CollapsibleSection>

      <CollapsibleSection title="AI 推荐" summary={aiSummary(settings)} colors={colors} defaultOpen={false}>
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>启用后只发送匿名偏好摘要，不发送本地路径、content URI 或完整歌词。</Text>
        <ToggleButton label="启用 AI 推荐" value={settings.aiEnabled} colors={colors} onChange={value => save({ aiEnabled: value })} />
        <SettingInput label="Endpoint" value={settings.aiBaseUrl} colors={colors} onChangeText={value => save({ aiBaseUrl: value })} placeholder="AI endpoint" keyboardType="url" />
        <SettingInput label="模型" value={settings.aiModel} colors={colors} onChangeText={value => save({ aiModel: value })} placeholder="model" />
        <SecretInput label="API Key" value={settings.aiApiKey} visible={Boolean(visibleSecrets.ai)} colors={colors} onToggle={() => setVisibleSecrets(value => ({ ...value, ai: !value.ai }))} onClear={() => save({ aiApiKey: '' })} onChangeText={value => save({ aiApiKey: value })} />
        <NumberChips label="Temperature" values={[0.2, 0.7, 1, 1.5]} selected={settings.aiTemperature} colors={colors} onSelect={value => save({ aiTemperature: value })} />
        <NumberChips label="Max Tokens" values={[400, 800, 1200, 2000]} selected={settings.aiMaxTokens} colors={colors} onSelect={value => save({ aiMaxTokens: value })} />
        <NumberChips label="Timeout" values={[10000, 30000, 60000]} formatter={value => `${Math.round(value / 1000)}s`} selected={settings.aiTimeoutMs} colors={colors} onSelect={value => save({ aiTimeoutMs: value })} />
        <ToggleButton label="包含歌词片段" value={settings.aiIncludeLyricSnippets} colors={colors} onChange={value => save({ aiIncludeLyricSnippets: value })} />
      </CollapsibleSection>

      <CollapsibleSection title="诊断与关于" summary={`${player.playbackState} · ${player.lastDiagnostic?.type || '暂无事件'}`} colors={colors} defaultOpen={false}>
        <InfoCard title="App 版本" body={getAppVersion()} colors={colors} />
        <InfoCard title="播放诊断" body={buildDiagnosticSummary({ audioStatus, notificationStatus, batteryStatus, settings, player })} colors={colors} />
        {player.diagnosticHistory.length > 0 ? (
          <View style={styles.historyList}>
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>最近诊断事件</Text>
            {player.diagnosticHistory.slice(0, 5).map((event, index) => <InfoCard key={`${event.type}-${index}`} title={event.type} body={formatDiagnostic(event)} colors={colors} />)}
          </View>
        ) : <InlineNotice tone="info" message="暂无播放诊断历史。" colors={colors} />}
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>崩溃日志自动记录 Java/Kotlin 层未捕获异常，app 重启后可查看与导出。</Text>
        {crashLogText ? (
          <InfoCard title="崩溃日志" body={crashLogText.length > 8000 ? crashLogText.slice(0, 8000) + '\n...(已截断，请导出查看完整日志)' : crashLogText} colors={colors} />
        ) : (
          <InlineNotice tone="info" message="点击「查看崩溃日志」加载最近崩溃记录。" colors={colors} />
        )}
        <View style={styles.row}>
          <ActionButton label="查看崩溃日志" colors={colors} onPress={loadCrashLogs} />
          <ActionButton label="导出崩溃日志" colors={colors} muted onPress={shareCrashLogs} />
          <ActionButton label="清除日志" colors={colors} muted onPress={doClearCrashLogs} />
        </View>
        <SettingInput label="导入设置 JSON" value={settingsImportText} colors={colors} onChangeText={setSettingsImportText} placeholder="粘贴从导出设置得到的 JSON" multiline numberOfLines={5} />
        <InlineNotice tone="warning" message="导入会覆盖同名配置项；密钥也会随导出的 JSON 一起分享，请只发给可信设备。" colors={colors} />
        <View style={styles.row}>
          <ActionButton label="分享诊断摘要" colors={colors} onPress={shareDiagnostics} />
          <ActionButton label="导出设置" colors={colors} muted onPress={exportSettings} />
          <ActionButton label="导入设置" colors={colors} muted disabled={!settingsImportText.trim()} onPress={importSettings} />
        </View>
      </CollapsibleSection>
    </ScrollView>
  );
}

function SecretInput({ label, value, visible, colors, onToggle, onClear, onChangeText }: { label: string; value: string; visible: boolean; colors: AppColorScheme; onToggle: () => void; onClear: () => void; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.field}>
      <SettingInput label={label} value={value} colors={colors} secure={!visible} onChangeText={onChangeText} placeholder="仅本机普通存储" />
      <View style={styles.row}>
        <ActionButton label={visible ? '隐藏' : value ? '显示' : '未配置'} colors={colors} muted onPress={onToggle} />
        <ActionButton label="清空" colors={colors} muted onPress={onClear} />
      </View>
    </View>
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

function keepAliveSummary(notificationStatus: AndroidPermissionStatus, batteryStatus: BatteryOptimizationStatus): string {
  return `通知${permissionText(notificationStatus)} · 电池优化${batteryText(batteryStatus)}`;
}

function sortLabel(value: string): string {
  return value === 'dateModified' ? '最近修改' : value === 'title' ? '标题' : value === 'artist' ? '艺术家' : '专辑';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloudSummary(settings: ReturnType<typeof useSettings>['settings']) {
  if (!settings.cloudEnabled) return '未启用';
  if (!settings.cloudBaseUrl.trim()) return '缺少 Base URL';
  return `${settings.cloudActiveProvider} · ${settings.cloudApiKey ? '已配置鉴权' : '无鉴权'}`;
}

function aiSummary(settings: ReturnType<typeof useSettings>['settings']) {
  if (!settings.aiEnabled) return '未启用';
  if (!settings.aiBaseUrl.trim() || !settings.aiModel.trim()) return '配置不完整';
  return `${settings.aiModel} · ${settings.aiApiKey ? '已配置密钥' : '缺少密钥'}`;
}

function comfortSummary(settings: ReturnType<typeof useSettings>['settings']) {
  const focus = settings.audioFocusDuckOnTransient ? '抢占压低' : settings.audioFocusPauseOnLoss ? '抢占暂停' : '抢占不处理';
  const bluetooth = settings.bluetoothAutoResumeOnReconnect ? `蓝牙 ${Math.round(settings.bluetoothAutoResumeWindowMs / 60_000)} 分钟内恢复` : '蓝牙不自动恢复';
  return `${focus} · ${bluetooth}`;
}

function buildDiagnosticSummary({ audioStatus, notificationStatus, batteryStatus, settings, player }: { audioStatus: AndroidPermissionStatus; notificationStatus: AndroidPermissionStatus; batteryStatus: BatteryOptimizationStatus; settings: ReturnType<typeof useSettings>['settings']; player: ReturnType<typeof usePlayer> }) {
  return [
    `播放状态：${player.playbackState}`,
    `最近事件：${player.lastDiagnostic?.type || '暂无'}`,
    `当前队列：${player.queue.length} 首`,
    `通知权限：${permissionText(notificationStatus)}`,
    `音频权限：${permissionText(audioStatus)}`,
    `电池优化：${batteryText(batteryStatus)}`,
    `云搜索：${cloudSummary(settings)}`,
    `播放舒适性：${comfortSummary(settings)}`,
    `AI：${aiSummary(settings)}`,
    `云密钥：${settings.cloudApiKey ? '已配置' : '未配置'} · AI 密钥：${settings.aiApiKey ? '已配置' : '未配置'}`,
  ].join('\n');
}

function formatDiagnostic(event: PlayerDiagnostic): string {
  return [
    event.message ? `消息：${event.message}` : undefined,
    event.playbackState ? `播放状态：${event.playbackState}` : undefined,
    event.nativePlaybackState ? `Native：${event.nativePlaybackState}` : undefined,
    typeof event.currentIndex === 'number' ? `队列位置：${event.currentIndex}` : undefined,
    typeof event.positionMs === 'number' ? `进度：${Math.round(event.positionMs / 1000)}s` : undefined,
    typeof event.durationMs === 'number' ? `时长：${Math.round(event.durationMs / 1000)}s` : undefined,
    event.errorCodeName ? `错误码：${event.errorCodeName}` : undefined,
    event.audioFocusChange ? `音频焦点：${event.audioFocusChange}` : undefined,
    event.audioRouteEvent ? `音频路由：${event.audioRouteEvent}` : undefined,
    event.routeType ? `路由类型：${event.routeType}` : undefined,
    event.mediaSessionController ? `控制来源：${event.mediaSessionController}` : undefined,
    event.command ? `控制命令：${event.command}` : undefined,
    event.reason ? `原因：${event.reason}` : undefined,
    event.exception ? `异常：${event.exception}` : undefined,
  ].filter(Boolean).join('\n') || '无附加信息';
}

function Stat({ label, value, light }: { label: string; value: number; light?: boolean }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, light ? styles.lightText : null]}>{value}</Text>
      <Text style={[styles.statLabel, light ? styles.lightMuted : null]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 14, padding: 16, paddingBottom: 24 },
  userCard: { borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, gap: 13, padding: 20 },
  userLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '800' },
  userTitle: { color: '#ffffff', fontSize: 26, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox: { flex: 1, gap: 2 },
  statValue: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  statLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  lightText: { color: '#ffffff' },
  lightMuted: { color: 'rgba(255,255,255,0.75)' },
  row: controlStyles.row,
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardBody: controlStyles.cardBody,
  field: controlStyles.field,
  historyList: { gap: 8 },
});

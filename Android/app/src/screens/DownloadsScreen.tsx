import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { Icon, iconNames } from '../constants/icons';
import { useDownloads } from '../state/DownloadProvider';
import type { AppColorScheme } from '../theme/colors';

export function DownloadsScreen({ colors }: { colors: AppColorScheme }) {
  const downloads = useDownloads();
  const activeTasks = downloads.tasks.filter(task => task.status !== 'canceled');
  const completedCount = activeTasks.filter(task => task.status === 'completed').length;
  const failedCount = activeTasks.filter(task => task.status === 'failed').length;
  const runningCount = activeTasks.filter(task => task.status === 'queued' || task.status === 'downloading').length;

  const header = useMemo(() => (
    <View style={styles.headerContent}>
      <ScreenHeader title="下载" subtitle="查看下载队列、进度和失败任务。" colors={colors} />
      <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.heroTitle, { color: colors.text }]}>离线音乐</Text>
        <Text style={[styles.heroText, { color: colors.textMuted }]}>任务 {activeTasks.length} 个 · 进行中 {runningCount} 个 · 已完成 {completedCount} 个 · 失败 {failedCount} 个</Text>
        <Text style={[styles.heroNote, { color: colors.textMuted }]}>真实网络下载由原生服务承载；当前页面用于展示任务状态和控制队列。</Text>
        <View style={styles.row}>
          {failedCount > 0 ? <ActionButton label="重试全部失败" icon={iconNames.refresh} colors={colors} onPress={downloads.retryFailed} /> : null}
          {completedCount > 0 ? <ActionButton label="清理已完成" icon={iconNames.success} colors={colors} muted onPress={downloads.clearCompleted} /> : null}
          {failedCount > 0 ? <ActionButton label="清理失败任务" icon={iconNames.delete} colors={colors} muted onPress={downloads.clearFailed} /> : null}
        </View>
      </View>
    </View>
  ), [activeTasks.length, colors, completedCount, downloads.clearCompleted, downloads.clearFailed, downloads.retryFailed, failedCount, runningCount]);

  return (
    <FlatList
      data={activeTasks}
      keyExtractor={item => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={(
        <View style={styles.emptyWrap}>
          <InfoCard title="暂无下载任务" body="在云搜索或推荐结果中选择下载后会出现在这里。" colors={colors} />
        </View>
      )}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={[styles.task, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.taskHeader}>
            <StatusIcon status={item.status} colors={colors} />
            <View style={styles.taskInfo}>
              <Text style={[styles.taskTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
              <Text style={[styles.taskMeta, { color: colors.textMuted }]} numberOfLines={1}>{item.artist || '未知艺术家'} · {item.quality} · {statusText(item.status)}</Text>
            </View>
            <Text style={[styles.percent, { color: colors.primary }]}>{Math.round(item.progress * 100)}%</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceStrong }]}>
            <View style={[styles.progressFill, { backgroundColor: progressColor(item.status, colors), width: `${Math.max(0, Math.min(100, item.progress * 100))}%` }]} />
          </View>
          {item.error ? <Text style={[styles.taskMeta, { color: colors.danger }]}>{item.error}</Text> : null}
          <View style={styles.row}>
            {item.status === 'paused' ? <ActionButton label="继续" icon={iconNames.play} colors={colors} onPress={() => downloads.resume(item.id)} /> : null}
            {item.status === 'queued' || item.status === 'downloading' ? <ActionButton label="暂停" icon={iconNames.pause} colors={colors} onPress={() => downloads.pause(item.id)} /> : null}
            {item.status === 'failed' ? <ActionButton label="重试" icon={iconNames.refresh} colors={colors} onPress={() => downloads.retry(item.id)} /> : null}
            {item.status !== 'completed' ? <ActionButton label="取消" icon={iconNames.cancel} colors={colors} onPress={() => downloads.cancel(item.id)} muted /> : null}
          </View>
        </View>
      )}
    />
  );
}

function statusText(status: string) {
  return ({ queued: '排队中', downloading: '下载中', paused: '已暂停', completed: '已完成', failed: '失败', canceled: '已取消' } as Record<string, string>)[status] || status;
}

function progressColor(status: string, colors: AppColorScheme) {
  if (status === 'failed') {
    return colors.danger;
  }
  if (status === 'completed') {
    return colors.success;
  }
  return colors.primary;
}

function StatusIcon({ status, colors }: { status: string; colors: AppColorScheme }) {
  if (status === 'downloading' || status === 'queued') {
    return <Icon name={iconNames.loading} size={16} color={colors.primary} />;
  }
  if (status === 'completed') {
    return <Icon name={iconNames.success} size={16} color={colors.success} />;
  }
  if (status === 'failed') {
    return <Icon name={iconNames.error} size={16} color={colors.danger} />;
  }
  return null;
}

function ActionButton({ label, colors, muted, icon, onPress }: { label: string; colors: AppColorScheme; muted?: boolean; icon?: string; onPress: () => void }) {
  const textColor = { color: muted ? colors.text : '#ffffff' };
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, { backgroundColor: muted ? colors.surfaceStrong : colors.primary, borderColor: colors.border }]}>
      <View style={styles.buttonContent}>
        {icon ? <Icon name={icon} size={14} color={muted ? colors.text : '#ffffff'} /> : null}
        <Text style={[styles.buttonText, textColor]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 16 },
  headerContent: { gap: 14, padding: 16 },
  emptyWrap: { paddingHorizontal: 16 },
  hero: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, gap: 7, padding: 16 },
  heroTitle: { fontSize: 20, fontWeight: '700' },
  heroText: { fontSize: 13, lineHeight: 20 },
  heroNote: { fontSize: 12, lineHeight: 18 },
  task: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 10, marginHorizontal: 16, marginBottom: 10, padding: 14 },
  taskHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  taskInfo: { flex: 1, gap: 4, minWidth: 0 },
  taskTitle: { fontSize: 16, fontWeight: '700' },
  taskMeta: { fontSize: 12, lineHeight: 18 },
  percent: { fontSize: 14, fontWeight: '700' },
  progressTrack: { borderRadius: 999, height: 5, overflow: 'hidden' },
  progressFill: { borderRadius: 999, height: 5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 7 },
  buttonContent: { alignItems: 'center', flexDirection: 'row', gap: 5, justifyContent: 'center' },
  buttonText: { fontSize: 12, fontWeight: '700' },
});

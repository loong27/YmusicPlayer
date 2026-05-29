import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useDownloads } from '../state/DownloadProvider';
import type { AppColorScheme } from '../theme/colors';

export function DownloadsScreen({ colors }: { colors: AppColorScheme }) {
  const downloads = useDownloads();
  const activeTasks = downloads.tasks.filter(task => task.status !== 'canceled');

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="下载"
        subtitle="下载队列、暂停/继续/取消/重试状态已持久化；原生后台下载服务接口已预留。"
        colors={colors}
      />
      <View style={styles.content}>
        <InfoCard title="下载策略" body="当前实现稳定任务队列和状态流转；真实网络下载会通过后续原生 MusicDownloadService 承载，避免密钥和来源逻辑硬编码。" colors={colors} />
        <FlatList
          data={activeTasks}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          ListEmptyComponent={<InfoCard title="暂无下载任务" body="在云搜索或推荐结果中选择下载后会出现在这里。" colors={colors} />}
          renderItem={({ item }) => (
            <View style={[styles.task, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.taskTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.taskMeta, { color: colors.textMuted }]}>{item.artist} · {item.quality} · {statusText(item.status)} · {Math.round(item.progress * 100)}%</Text>
              {item.error ? <Text style={[styles.taskMeta, { color: colors.danger }]}>{item.error}</Text> : null}
              <View style={styles.row}>
                {item.status === 'paused' ? <ActionButton label="继续" colors={colors} onPress={() => downloads.resume(item.id)} /> : <ActionButton label="暂停" colors={colors} onPress={() => downloads.pause(item.id)} />}
                {item.status === 'failed' ? <ActionButton label="重试" colors={colors} onPress={() => downloads.retry(item.id)} /> : null}
                <ActionButton label="取消" colors={colors} onPress={() => downloads.cancel(item.id)} muted />
              </View>
            </View>
          )}
        />
      </View>
    </View>
  );
}

function statusText(status: string) {
  return ({ queued: '排队中', downloading: '下载中', paused: '已暂停', completed: '已完成', failed: '失败', canceled: '已取消' } as Record<string, string>)[status] || status;
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
  content: { gap: 14, padding: 16 },
  task: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 8, padding: 16 },
  taskTitle: { fontSize: 16, fontWeight: '700' },
  taskMeta: { fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 7 },
  buttonText: { fontSize: 12, fontWeight: '700' },
});

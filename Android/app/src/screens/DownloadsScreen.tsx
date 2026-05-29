import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { sampleDownloadTasks } from '../data/placeholders';
import type { AppColorScheme } from '../theme/colors';

export function DownloadsScreen({ colors }: { colors: AppColorScheme }) {
  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="下载"
        subtitle="后续使用 Android 前台服务承载下载队列，支持通知栏进度、暂停、继续、失败重试。"
        colors={colors}
      />
      <View style={styles.content}>
        <InfoCard title="下载策略" body="初版优先实现稳定单连接下载，分段下载和断点续传放到后续阶段增强。" colors={colors} />
        <FlatList
          data={sampleDownloadTasks}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={[styles.task, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.taskTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.taskMeta, { color: colors.textMuted }]}>{item.artist} · {item.quality} · {item.status}</Text>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 14, padding: 16 },
  task: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 6, padding: 16 },
  taskTitle: { fontSize: 16, fontWeight: '700' },
  taskMeta: { fontSize: 13 },
});

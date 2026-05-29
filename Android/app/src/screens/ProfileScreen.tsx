import React from 'react';
import { StyleSheet, View } from 'react-native';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import type { AppColorScheme } from '../theme/colors';

export function ProfileScreen({ colors }: { colors: AppColorScheme }) {
  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="我的"
        subtitle="歌单、云音乐配置、AI 模型配置、下载设置、主题和数据清理后续集中放在这里。"
        colors={colors}
      />
      <View style={styles.content}>
        <InfoCard title="云音乐" body="配置 API Base URL、API Key、默认来源、启用来源和搜索模式。" colors={colors} />
        <InfoCard title="AI 推荐模型" body="支持 OpenAI-compatible 与 Anthropic-compatible 配置，API Key 后续使用安全存储。" colors={colors} />
        <InfoCard title="播放与权限" body="后续接入媒体权限、通知权限、后台播放服务和 MediaSession。" colors={colors} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 14, padding: 16 },
});

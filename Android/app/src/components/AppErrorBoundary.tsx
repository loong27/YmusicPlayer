import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { darkColors } from '../theme/colors';
import { getErrorMessage } from '../utils/errors';

type State = { error?: Error };

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    const colors = darkColors;
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>页面渲染失败</Text>
          <Text style={[styles.body, { color: colors.textMuted }]} numberOfLines={4}>{getErrorMessage(this.state.error, '未知错误')}</Text>
          <Pressable accessibilityRole="button" onPress={() => this.setState({ error: undefined })} style={[styles.button, { backgroundColor: colors.primary }]}>
            <Text style={styles.buttonText}>重试渲染</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 20 },
  card: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, gap: 12, padding: 18, width: '100%' },
  title: { fontSize: 20, fontWeight: '900' },
  body: { fontSize: 14, lineHeight: 21 },
  button: { alignItems: 'center', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
});

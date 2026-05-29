import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AppColorScheme } from '../theme/colors';

export type ScreenHeaderProps = {
  title: string;
  subtitle: string;
  colors: AppColorScheme;
};

export function ScreenHeader({ title, subtitle, colors }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
});

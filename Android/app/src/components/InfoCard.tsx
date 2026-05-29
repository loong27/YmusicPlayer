import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AppColorScheme } from '../theme/colors';

export type InfoCardProps = {
  title: string;
  body: string;
  colors: AppColorScheme;
};

export function InfoCard({ title, body, colors }: InfoCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
  },
});

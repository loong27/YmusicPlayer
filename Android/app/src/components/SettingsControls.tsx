import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AppColorScheme } from '../theme/colors';

export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

export function SectionCard({ title, summary, colors, children }: { title: string; summary?: string; colors: AppColorScheme; children: React.ReactNode }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        {summary ? <Text style={[styles.summary, { color: colors.textMuted }]}>{summary}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function CollapsibleSection({ title, summary, colors, defaultOpen = false, children }: { title: string; summary?: string; colors: AppColorScheme; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)} style={styles.collapsibleHeader}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
          {summary ? <Text style={[styles.summary, { color: colors.textMuted }]}>{summary}</Text> : null}
        </View>
        <Text style={[styles.chevron, { color: colors.textMuted }]}>{open ? '收起' : '展开'}</Text>
      </Pressable>
      {open ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}

export function InlineNotice({ tone = 'info', message, colors }: { tone?: NoticeTone; message?: string; colors: AppColorScheme }) {
  if (!message) {
    return null;
  }
  const toneColor = getToneColor(tone, colors);
  return (
    <View style={[styles.notice, { backgroundColor: `${toneColor}22`, borderColor: toneColor }]}>
      <Text style={[styles.noticeText, { color: toneColor }]}>{message}</Text>
    </View>
  );
}

export function StatusBadge({ label, tone = 'info', colors }: { label: string; tone?: NoticeTone; colors: AppColorScheme }) {
  const toneColor = getToneColor(tone, colors);
  return (
    <View style={[styles.badge, { backgroundColor: `${toneColor}20`, borderColor: toneColor }]}>
      <Text style={[styles.badgeText, { color: toneColor }]}>{label}</Text>
    </View>
  );
}

export function ActionButton({ label, colors, muted, disabled, onPress }: { label: string; colors: AppColorScheme; muted?: boolean; disabled?: boolean; onPress: () => void }) {
  const textColor = { color: muted ? colors.text : '#ffffff' };
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, { backgroundColor: muted ? colors.surfaceStrong : colors.primary, borderColor: colors.border }, disabled ? styles.disabled : null]}>
      <Text style={[styles.buttonText, textColor]}>{label}</Text>
    </Pressable>
  );
}

export function SettingInput({ label, value, placeholder, colors, secure, keyboardType, multiline, numberOfLines, onChangeText }: { label: string; value: string; placeholder?: string; colors: AppColorScheme; secure?: boolean; keyboardType?: 'default' | 'numeric' | 'url'; multiline?: boolean; numberOfLines?: number; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput placeholder={placeholder || label} placeholderTextColor={colors.textMuted} value={value} onChangeText={onChangeText} secureTextEntry={secure} autoCapitalize="none" keyboardType={keyboardType} multiline={multiline} numberOfLines={numberOfLines} textAlignVertical={multiline ? 'top' : 'center'} style={[styles.input, multiline ? styles.multilineInput : null, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
    </View>
  );
}

export function ToggleButton({ label, value, colors, onChange }: { label: string; value: boolean; colors: AppColorScheme; onChange: (value: boolean) => void }) {
  return <ActionButton label={`${label}：${value ? '开' : '关'}`} colors={colors} muted={!value} onPress={() => onChange(!value)} />;
}

export function ChipSelector<T extends string>({ label, values, selected, colors, onSelect }: { label: string; values: T[]; selected: T; colors: AppColorScheme; onSelect: (value: T) => void }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.row}>{values.map(value => <ActionButton key={value} label={value} colors={colors} muted={selected !== value} onPress={() => onSelect(value)} />)}</View>
    </View>
  );
}

export function NumberChips({ label, values, selected, formatter, colors, onSelect }: { label: string; values: number[]; selected: number; formatter?: (value: number) => string; colors: AppColorScheme; onSelect: (value: number) => void }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.row}>{values.map(value => <ActionButton key={value} label={formatter ? formatter(value) : String(value)} colors={colors} muted={selected !== value} onPress={() => onSelect(value)} />)}</View>
    </View>
  );
}

export const controlStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { gap: 6 },
  cardBody: { fontSize: 13, lineHeight: 20 },
});

function getToneColor(tone: NoticeTone, colors: AppColorScheme) {
  if (tone === 'success') {
    return colors.success;
  }
  if (tone === 'warning') {
    return '#f59e0b';
  }
  if (tone === 'error') {
    return colors.danger;
  }
  return colors.primary;
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 16 },
  sectionHeader: { flex: 1, gap: 4, minWidth: 0 },
  collapsibleHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  collapsibleBody: { gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  summary: { fontSize: 12, lineHeight: 18 },
  chevron: { fontSize: 12, fontWeight: '700' },
  notice: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10 },
  noticeText: { fontSize: 13, fontWeight: '800', lineHeight: 19 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  button: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 9 },
  buttonText: { fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '800' },
  input: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, fontSize: 14, paddingHorizontal: 12, paddingVertical: 9 },
  multilineInput: { minHeight: 108 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});

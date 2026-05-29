import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppColorScheme } from '../theme/colors';
import type { TabId, TabItem } from '../navigation/tabs';

export type TabBarProps = {
  tabs: TabItem[];
  activeTab: TabId;
  colors: AppColorScheme;
  onTabPress: (tab: TabId) => void;
};

export function TabBar({ tabs, activeTab, colors, onTabPress }: TabBarProps) {
  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {tabs.map(tab => {
        const active = tab.id === activeTab;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.item, active && { backgroundColor: colors.primarySoft }]}
            onPress={() => onTabPress(tab.id)}>
            <Text style={[styles.label, { color: active ? colors.primary : colors.textMuted }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  item: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});

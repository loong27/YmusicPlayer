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
        const iconBubbleColor = { backgroundColor: active ? colors.primarySoft : 'transparent' };
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            style={styles.item}
            onPress={() => onTabPress(tab.id)}>
            <View style={[styles.iconBubble, iconBubbleColor]}>
              <Text style={[styles.icon, { color: active ? colors.primary : colors.textMuted }]}>{tab.icon}</Text>
            </View>
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
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
  },
  item: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 50,
  },
  iconBubble: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    minWidth: 42,
    paddingHorizontal: 10,
  },
  icon: {
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
});

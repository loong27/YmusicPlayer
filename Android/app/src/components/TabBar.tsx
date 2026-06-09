import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../constants/icons';
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
        const iconColor = active ? colors.primary : colors.textMuted;
        const labelColor = active ? colors.primary : colors.textMuted;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            style={styles.item}
            onPress={() => onTabPress(tab.id)}>
            <Icon name={tab.icon} size={22} color={iconColor} />
            <Text style={[styles.label, { color: labelColor }]}>{tab.label}</Text>
            {active && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
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
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
  dot: {
    borderRadius: 2,
    height: 4,
    marginTop: 1,
    width: 4,
  },
});

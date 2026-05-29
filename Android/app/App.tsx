import React, { useMemo, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBar } from './src/components/TabBar';
import { tabs, type TabId } from './src/navigation/tabs';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { DownloadsScreen } from './src/screens/DownloadsScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { darkColors, lightColors } from './src/theme/colors';

function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const isDarkMode = useColorScheme() === 'dark';
  const colors = useMemo(() => (isDarkMode ? darkColors : lightColors), [isDarkMode]);
  const [activeTab, setActiveTab] = useState<TabId>('library');
  const safeAreaInsets = useSafeAreaInsets();

  const screen = (() => {
    switch (activeTab) {
      case 'discover':
        return <DiscoverScreen colors={colors} />;
      case 'downloads':
        return <DownloadsScreen colors={colors} />;
      case 'profile':
        return <ProfileScreen colors={colors} />;
      case 'library':
      default:
        return <LibraryScreen colors={colors} />;
    }
  })();

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.content}>
        {screen}
      </ScrollView>
      <View style={{ paddingBottom: safeAreaInsets.bottom }}>
        <TabBar tabs={tabs} activeTab={activeTab} colors={colors} onTabPress={setActiveTab} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});

export default App;

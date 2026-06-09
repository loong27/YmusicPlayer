import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from './src/components/MiniPlayer';
import { AlbumDetailScreen, ArtistDetailScreen } from './src/screens/ArtistAlbumDetailScreen';
import { TabBar } from './src/components/TabBar';
import type { Track } from './src/models/Track';
import { tabs, type TabId } from './src/navigation/tabs';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { DownloadsScreen } from './src/screens/DownloadsScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { NowPlayingScreen } from './src/screens/NowPlayingScreen';
import { PlaylistDetailScreen } from './src/screens/PlaylistDetailScreen';
import { PlaylistsScreen } from './src/screens/PlaylistsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { QueueScreen } from './src/screens/QueueScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { TrackInfoScreen } from './src/screens/TrackInfoScreen';
import { CollectionProvider, useCollection } from './src/state/CollectionProvider';
import { DownloadProvider } from './src/state/DownloadProvider';
import { PlayerProvider } from './src/state/PlayerProvider';
import { SettingsProvider } from './src/state/SettingsProvider';
import { darkColors, lightColors } from './src/theme/colors';

function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <CollectionProvider>
          <DownloadProvider>
            <PlayerProvider>
              <AppContent />
            </PlayerProvider>
          </DownloadProvider>
        </CollectionProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

type StackScreen =
  | { name: 'nowPlaying' }
  | { name: 'queue' }
  | { name: 'search' }
  | { name: 'playlists' }
  | { name: 'trackInfo'; track: Track }
  | { name: 'artistDetail'; artist: string }
  | { name: 'albumDetail'; album: string }
  | { name: 'playlistDetail'; playlistId: string };

function AppContent() {
  const isDarkMode = useColorScheme() === 'dark';
  const colors = useMemo(() => (isDarkMode ? darkColors : lightColors), [isDarkMode]);
  const [activeTab, setActiveTab] = useState<TabId>('library');
  const [stack, setStack] = useState<StackScreen[]>([]);
  const collection = useCollection();
  const safeAreaInsets = useSafeAreaInsets();
  const topScreen = stack[stack.length - 1];
  const goBack = () => setStack(previous => previous.slice(0, -1));
  const push = (screen: StackScreen) => setStack(previous => [...previous, screen]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length === 0) {
        return false;
      }
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [stack.length]);

  const screen = topScreen ? (() => {
    if (topScreen.name === 'nowPlaying') {
      return <NowPlayingScreen colors={colors} onOpenQueue={() => push({ name: 'queue' })} />;
    }
    if (topScreen.name === 'queue') {
      return <QueueScreen colors={colors} onBack={goBack} />;
    }
    if (topScreen.name === 'search') {
      return <SearchScreen colors={colors} onBack={goBack} />;
    }
    if (topScreen.name === 'playlists') {
      return <PlaylistsScreen colors={colors} onBack={goBack} onOpenPlaylist={playlistId => push({ name: 'playlistDetail', playlistId })} />;
    }
    if (topScreen.name === 'trackInfo') {
      return <TrackInfoScreen track={topScreen.track} colors={colors} />;
    }
    if (topScreen.name === 'artistDetail') {
      return <ArtistDetailScreen artist={topScreen.artist} colors={colors} onBack={goBack} />;
    }
    if (topScreen.name === 'albumDetail') {
      return <AlbumDetailScreen album={topScreen.album} colors={colors} onBack={goBack} />;
    }
    const playlist = collection.playlists.find(item => item.id === topScreen.playlistId);
    return playlist ? <PlaylistDetailScreen playlist={playlist} colors={colors} onBack={goBack} /> : <QueueScreen colors={colors} onBack={goBack} />;
  })() : (() => {
    switch (activeTab) {
      case 'discover':
        return <DiscoverScreen colors={colors} />;
      case 'downloads':
        return <DownloadsScreen colors={colors} />;
      case 'profile':
        return <ProfileScreen colors={colors} onOpenPlaylists={() => push({ name: 'playlists' })} />;
      case 'library':
      default:
        return <LibraryScreen colors={colors} onOpenSearch={() => push({ name: 'search' })} onOpenTrackInfo={track => push({ name: 'trackInfo', track })} onOpenArtist={artist => push({ name: 'artistDetail', artist })} onOpenAlbum={album => push({ name: 'albumDetail', album })} />;
    }
  })();

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.content}>{screen}</View>
      <View style={{ backgroundColor: colors.background, paddingBottom: safeAreaInsets.bottom }}>
        <MiniPlayer colors={colors} onOpen={() => push({ name: 'nowPlaying' })} />
        <TabBar
          tabs={tabs}
          activeTab={activeTab}
          colors={colors}
          onTabPress={tab => {
            setStack([]);
            setActiveTab(tab);
          }}
        />
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

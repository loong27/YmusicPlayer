import React from 'react';
import { Image, StyleSheet, View, type DimensionValue } from 'react-native';
import type { Track } from '../models/Track';
import type { AppColorScheme } from '../theme/colors';

const defaultCover = require('../assets/default-cover.png');

export function Artwork({ track, colors, size, radius = 14 }: { track?: Track; colors: AppColorScheme; size: DimensionValue; radius?: number }) {
  const style = { width: size, height: size, borderRadius: radius, backgroundColor: colors.primarySoft, borderColor: colors.border };
  if (track?.artworkUri) {
    return <Image source={{ uri: track.artworkUri }} style={[styles.artwork, style]} />;
  }
  return (
    <View style={[styles.placeholder, style]}>
      <Image source={defaultCover} style={styles.defaultCover} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  artwork: { borderWidth: StyleSheet.hairlineWidth },
  placeholder: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', overflow: 'hidden' },
  defaultCover: { width: '100%', height: '100%' },
});

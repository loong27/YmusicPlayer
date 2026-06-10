import React, { useState } from 'react';
import { Image, StyleSheet, View, type DimensionValue } from 'react-native';
import type { Track } from '../models/Track';
import type { AppColorScheme } from '../theme/colors';

const defaultCover = require('../assets/default-cover.png');

export function Artwork({ track, colors, size, radius = 14 }: { track?: Track; colors: AppColorScheme; size: DimensionValue; radius?: number }) {
  const style = { width: size, height: size, borderRadius: radius, backgroundColor: colors.primarySoft, borderColor: colors.border };
  const [useDefault, setUseDefault] = useState(false);

  if (track?.artworkUri && !useDefault) {
    return <Image source={{ uri: track.artworkUri }} style={[styles.artwork, style]} onError={() => setUseDefault(true)} />;
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

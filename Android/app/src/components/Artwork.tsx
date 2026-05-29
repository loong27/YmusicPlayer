import React from 'react';
import { Image, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import type { Track } from '../models/Track';
import type { AppColorScheme } from '../theme/colors';

export function Artwork({ track, colors, size, radius = 14 }: { track?: Track; colors: AppColorScheme; size: DimensionValue; radius?: number }) {
  const style = { width: size, height: size, borderRadius: radius, backgroundColor: colors.primarySoft, borderColor: colors.border };
  if (track?.artworkUri) {
    return <Image source={{ uri: track.artworkUri }} style={[styles.artwork, style]} />;
  }
  return (
    <View style={[styles.placeholder, style]}>
      <Text style={[styles.text, { color: colors.primary }]}>{track?.title?.slice(0, 1).toUpperCase() || 'Y'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  artwork: { borderWidth: StyleSheet.hairlineWidth },
  placeholder: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  text: { fontSize: 18, fontWeight: '800' },
});

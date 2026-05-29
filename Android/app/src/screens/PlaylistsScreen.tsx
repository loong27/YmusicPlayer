import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useCollection } from '../state/CollectionProvider';
import type { AppColorScheme } from '../theme/colors';

export function PlaylistsScreen({ colors, onBack, onOpenPlaylist }: { colors: AppColorScheme; onBack: () => void; onOpenPlaylist: (playlistId: string) => void }) {
  const collection = useCollection();
  const [name, setName] = useState('');

  const create = () => {
    collection.createPlaylist(name).then(playlist => {
      setName('');
      onOpenPlaylist(playlist.id);
    }).catch(() => undefined);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="歌单" subtitle="管理我喜欢、最近播放和自定义歌单。" colors={colors} />
      <View style={styles.content}>
        <View style={styles.row}>
          <ActionButton label="返回" colors={colors} onPress={onBack} />
        </View>
        <View style={[styles.createCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput placeholder="新建歌单名称" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
          <ActionButton label="新建" colors={colors} onPress={create} />
        </View>
        <FlatList
          data={collection.playlists}
          keyExtractor={item => item.id}
          ListEmptyComponent={<InfoCard title="暂无歌单" body="创建歌单或喜欢歌曲后会在这里展示。" colors={colors} />}
          renderItem={({ item }) => (
            <View style={[styles.playlist, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable accessibilityRole="button" onPress={() => onOpenPlaylist(item.id)} style={styles.playlistMain}>
                <Text style={[styles.title, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>{item.fixed ? '固定歌单' : '自定义歌单'} · {item.trackIds.length} 首</Text>
              </Pressable>
              {!item.fixed ? <ActionButton label="删除" colors={colors} muted onPress={() => collection.deletePlaylist(item.id)} /> : null}
            </View>
          )}
        />
      </View>
    </View>
  );
}

function ActionButton({ label, colors, muted, onPress }: { label: string; colors: AppColorScheme; muted?: boolean; onPress: () => void }) {
  const textColor = { color: muted ? colors.text : '#ffffff' };
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, { backgroundColor: muted ? colors.surfaceStrong : colors.primary, borderColor: colors.border }]}><Text style={[styles.buttonText, textColor]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, gap: 12, padding: 16 },
  row: { flexDirection: 'row', gap: 8 },
  createCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 12 },
  input: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, fontSize: 15, paddingHorizontal: 14, paddingVertical: 10 },
  playlist: { alignItems: 'center', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, marginBottom: 10, padding: 14 },
  playlistMain: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '800' },
  meta: { fontSize: 12 },
  button: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 8 },
  buttonText: { fontSize: 13, fontWeight: '800' },
});

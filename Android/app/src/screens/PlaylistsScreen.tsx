import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { InfoCard } from '../components/InfoCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { useCollection } from '../state/CollectionProvider';
import type { AppColorScheme } from '../theme/colors';

export function PlaylistsScreen({ colors, onBack, onOpenPlaylist }: { colors: AppColorScheme; onBack: () => void; onOpenPlaylist: (playlistId: string) => void }) {
  const collection = useCollection();
  const [name, setName] = useState('');
  const trimmedName = name.trim();

  const create = () => {
    if (!trimmedName) {
      return;
    }
    collection.createPlaylist(trimmedName).then(playlist => {
      setName('');
      onOpenPlaylist(playlist.id);
    }).catch(() => undefined);
  };

  const confirmDelete = (playlistId: string, playlistName: string) => {
    Alert.alert('删除歌单', `确定删除「${playlistName}」吗？歌单内歌曲不会从本地删除。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => collection.deletePlaylist(playlistId).catch(() => undefined) },
    ]);
  };

  const header = (
    <View style={styles.headerContent}>
      <ScreenHeader title="歌单" subtitle="管理我喜欢、最近播放和自定义歌单。" colors={colors} />
      <View style={[styles.createCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>创建新歌单</Text>
        <TextInput
          placeholder="输入歌单名称"
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
          value={name}
          onChangeText={setName}
          onSubmitEditing={create}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        />
        <View style={styles.row}>
          <ActionButton label="返回" colors={colors} muted onPress={onBack} />
          <ActionButton label="新建歌单" colors={colors} disabled={!trimmedName} onPress={create} />
        </View>
      </View>
    </View>
  );

  return (
    <FlatList
      data={collection.playlists}
      keyExtractor={item => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={(
        <View style={styles.emptyWrap}>
          <InfoCard title="暂无歌单" body="创建歌单或喜欢歌曲后会在这里展示。" colors={colors} />
        </View>
      )}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <View style={[styles.playlist, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`打开歌单 ${item.name}`} onPress={() => onOpenPlaylist(item.id)} style={styles.playlistMain}>
            <View style={[styles.cover, { backgroundColor: item.fixed ? colors.primarySoft : colors.surfaceStrong, borderColor: colors.border }]}>
              <Text style={[styles.coverText, { color: item.fixed ? colors.primary : colors.text }]}>{item.fixed ? '♡' : '♪'}</Text>
            </View>
            <View style={styles.playlistInfo}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>{item.fixed ? '固定歌单' : '自定义歌单'} · {item.trackIds.length} 首</Text>
            </View>
          </Pressable>
          {!item.fixed ? <ActionButton label="删除" colors={colors} muted onPress={() => confirmDelete(item.id, item.name)} /> : null}
        </View>
      )}
    />
  );
}

function ActionButton({ label, colors, muted, disabled, onPress }: { label: string; colors: AppColorScheme; muted?: boolean; disabled?: boolean; onPress: () => void }) {
  const textColor = { color: muted ? colors.text : '#ffffff' };
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, { backgroundColor: muted ? colors.surfaceStrong : colors.primary, borderColor: colors.border }, disabled ? styles.disabled : null]}>
      <Text style={[styles.buttonText, textColor]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 16 },
  headerContent: { gap: 14, padding: 16 },
  emptyWrap: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  createCard: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 14 },
  cardTitle: { fontSize: 17, fontWeight: '900' },
  input: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, fontSize: 15, paddingHorizontal: 15, paddingVertical: 10 },
  playlist: { alignItems: 'center', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 10, padding: 10 },
  playlistMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 11, minWidth: 0 },
  cover: { alignItems: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, height: 48, justifyContent: 'center', width: 48 },
  coverText: { fontSize: 20, fontWeight: '900' },
  playlistInfo: { flex: 1, gap: 4, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '900' },
  meta: { fontSize: 12 },
  button: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 8 },
  buttonText: { fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});

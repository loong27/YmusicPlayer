import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Playlist } from '../models/Playlist';
import { loadLikedTrackIds, loadPlayHistory, loadPlaylists, saveLikedTrackIds, savePlayHistory, savePlaylists, type PlayHistoryItem } from '../services/storage';

type CollectionContextValue = {
  likedTrackIds: string[];
  likedTrackIdSet: Set<string>;
  playlists: Playlist[];
  userPlaylists: Playlist[];
  playHistory: PlayHistoryItem[];
  isLiked: (trackId: string) => boolean;
  toggleLiked: (trackId: string) => Promise<void>;
  createPlaylist: (name: string) => Promise<Playlist>;
  renamePlaylist: (playlistId: string, name: string) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  addToPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  removeFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  recordPlay: (item: PlayHistoryItem) => Promise<void>;
};

const CollectionContext = createContext<CollectionContextValue | undefined>(undefined);

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const [likedTrackIds, setLikedTrackIds] = useState<string[]>([]);
  const [userPlaylists, setUserPlaylists] = useState<Playlist[]>([]);
  const [playHistory, setPlayHistory] = useState<PlayHistoryItem[]>([]);

  useEffect(() => {
    Promise.all([loadLikedTrackIds(), loadPlaylists(), loadPlayHistory()])
      .then(([liked, storedPlaylists, history]) => {
        setLikedTrackIds(liked);
        setUserPlaylists(storedPlaylists.filter(item => !item.fixed));
        setPlayHistory(history);
      })
      .catch(() => undefined);
  }, []);

  const likedTrackIdSet = useMemo(() => new Set(likedTrackIds), [likedTrackIds]);
  const playlists = useMemo<Playlist[]>(() => {
    const now = new Date().toISOString();
    const recentTrackIds = playHistory.map(item => item.trackId).filter((id, index, list) => list.indexOf(id) === index);
    return [
      { id: 'fixed-liked', name: '我喜欢', fixed: true, trackIds: likedTrackIds, createdAt: now, updatedAt: now },
      { id: 'fixed-recent', name: '最近播放', fixed: true, trackIds: recentTrackIds, createdAt: now, updatedAt: now },
      ...userPlaylists,
    ];
  }, [likedTrackIds, playHistory, userPlaylists]);

  const persistUserPlaylists = useCallback(async (next: Playlist[]) => {
    setUserPlaylists(next);
    await savePlaylists(next);
  }, []);

  const toggleLiked = useCallback(async (trackId: string) => {
    const next = likedTrackIdSet.has(trackId)
      ? likedTrackIds.filter(id => id !== trackId)
      : [...likedTrackIds, trackId];
    setLikedTrackIds(next);
    await saveLikedTrackIds(next);
  }, [likedTrackIdSet, likedTrackIds]);

  const createPlaylist = useCallback(async (name: string) => {
    const now = new Date().toISOString();
    const playlist = { id: `playlist-${Date.now()}`, name: name.trim() || '新建歌单', trackIds: [], createdAt: now, updatedAt: now };
    await persistUserPlaylists([...userPlaylists, playlist]);
    return playlist;
  }, [persistUserPlaylists, userPlaylists]);

  const renamePlaylist = useCallback(async (playlistId: string, name: string) => {
    const now = new Date().toISOString();
    await persistUserPlaylists(userPlaylists.map(item => item.id === playlistId ? { ...item, name: name.trim() || item.name, updatedAt: now } : item));
  }, [persistUserPlaylists, userPlaylists]);

  const deletePlaylist = useCallback(async (playlistId: string) => {
    await persistUserPlaylists(userPlaylists.filter(item => item.id !== playlistId));
  }, [persistUserPlaylists, userPlaylists]);

  const addToPlaylist = useCallback(async (playlistId: string, trackIds: string[]) => {
    if (playlistId === 'fixed-liked') {
      const next = [...new Set([...likedTrackIds, ...trackIds])];
      setLikedTrackIds(next);
      await saveLikedTrackIds(next);
      return;
    }
    if (playlistId === 'fixed-recent') {
      return;
    }
    const now = new Date().toISOString();
    await persistUserPlaylists(userPlaylists.map(item => item.id === playlistId
      ? { ...item, trackIds: [...new Set([...item.trackIds, ...trackIds])], updatedAt: now }
      : item));
  }, [likedTrackIds, persistUserPlaylists, userPlaylists]);

  const removeFromPlaylist = useCallback(async (playlistId: string, trackId: string) => {
    if (playlistId === 'fixed-liked') {
      const next = likedTrackIds.filter(id => id !== trackId);
      setLikedTrackIds(next);
      await saveLikedTrackIds(next);
      return;
    }
    if (playlistId === 'fixed-recent') {
      return;
    }
    const now = new Date().toISOString();
    await persistUserPlaylists(userPlaylists.map(item => item.id === playlistId
      ? { ...item, trackIds: item.trackIds.filter(id => id !== trackId), updatedAt: now }
      : item));
  }, [likedTrackIds, persistUserPlaylists, userPlaylists]);

  const recordPlay = useCallback(async (item: PlayHistoryItem) => {
    const next = [item, ...playHistory].slice(0, 500);
    setPlayHistory(next);
    await savePlayHistory(next);
  }, [playHistory]);

  const value = useMemo<CollectionContextValue>(() => ({
    likedTrackIds,
    likedTrackIdSet,
    playlists,
    userPlaylists,
    playHistory,
    isLiked: (trackId: string) => likedTrackIdSet.has(trackId),
    toggleLiked,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    recordPlay,
  }), [addToPlaylist, createPlaylist, deletePlaylist, likedTrackIdSet, likedTrackIds, playHistory, playlists, recordPlay, removeFromPlaylist, renamePlaylist, toggleLiked, userPlaylists]);

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection(): CollectionContextValue {
  const value = useContext(CollectionContext);
  if (!value) {
    throw new Error('useCollection must be used inside CollectionProvider');
  }
  return value;
}

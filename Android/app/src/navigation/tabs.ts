export type TabId = 'library' | 'discover' | 'downloads' | 'profile';

export type TabItem = {
  id: TabId;
  label: string;
  icon: string;
};

export const tabs: TabItem[] = [
  { id: 'library', label: '曲库', icon: '♫' },
  { id: 'discover', label: '发现', icon: '◎' },
  { id: 'downloads', label: '下载', icon: '⇩' },
  { id: 'profile', label: '我的', icon: '♡' },
];

export type TabId = 'library' | 'discover' | 'downloads' | 'profile';

export type TabItem = {
  id: TabId;
  label: string;
};

export const tabs: TabItem[] = [
  { id: 'library', label: '曲库' },
  { id: 'discover', label: '发现' },
  { id: 'downloads', label: '下载' },
  { id: 'profile', label: '我的' },
];

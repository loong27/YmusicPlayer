import { iconNames } from '../constants/icons';

export type TabId = 'library' | 'discover' | 'downloads' | 'profile';

export type TabItem = {
  id: TabId;
  label: string;
  icon: string;
};

export const tabs: TabItem[] = [
  { id: 'library', label: '曲库', icon: iconNames.tabLibrary },
  { id: 'discover', label: '发现', icon: iconNames.tabDiscover },
  { id: 'downloads', label: '下载', icon: iconNames.tabDownloads },
  { id: 'profile', label: '我的', icon: iconNames.tabProfile },
];

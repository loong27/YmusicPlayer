import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
export { MaterialCommunityIcons };

export const Icon = MaterialCommunityIcons;

export const iconNames = {
  // Transport controls
  play: 'play',
  pause: 'pause',
  skipNext: 'skip-next',
  skipPrevious: 'skip-previous',
  fastForward: 'fast-forward',
  rewind: 'rewind',

  // Repeat / Shuffle
  repeat: 'repeat',
  repeatOff: 'repeat-off',
  repeatOnce: 'repeat-once',
  shuffle: 'shuffle',
  shuffleDisabled: 'shuffle-disabled',

  // Actions
  heart: 'heart',
  heartOutline: 'heart-outline',
  dotsHorizontal: 'dots-horizontal',
  dotsVertical: 'dots-vertical',
  chevronUp: 'chevron-up',
  chevronDown: 'chevron-down',
  chevronLeft: 'chevron-left',
  chevronRight: 'chevron-right',
  close: 'close',
  shareVariant: 'share-variant',
  delete: 'delete-outline',
  plus: 'plus',
 minus: 'minus',

  // Tabs
  tabLibrary: 'music-note',
  tabDiscover: 'compass-outline',
  tabDownloads: 'download',
  tabProfile: 'account-circle-outline',

  // Player
  queueMusic: 'playlist-music',
  lyrics: 'script-text-outline',
  coverArt: 'image-outline',
  musicNote: 'music-note',

  // Status
  loading: 'loading',
  error: 'alert-circle-outline',
  success: 'check-circle-outline',
  info: 'information-outline',
  warning: 'alert-outline',

  // Download
  download: 'download',
  downloadOutline: 'download-outline',
  cloudDownload: 'cloud-download-outline',
  cancel: 'cancel',
  pauseCircle: 'pause-circle-outline',
  playCircle: 'play-circle-outline',
  refresh: 'refresh',

  // Search
  search: 'magnify',
  clear: 'close-circle',

  // Settings
  cog: 'cog-outline',
  shield: 'shield-check-outline',
  bell: 'bell-outline',
  bluetooth: 'bluetooth',
  battery: 'battery-outline',

  // Navigation
  arrowLeft: 'arrow-left',
  home: 'home-outline',
} as const;

export type IconName = (typeof iconNames)[keyof typeof iconNames];

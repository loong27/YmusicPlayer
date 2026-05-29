import { Linking, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { Permission } from 'react-native';

export type AndroidPermissionStatus =
  | 'unavailable'
  | 'granted'
  | 'denied'
  | 'blocked';

const readMediaAudioPermission = ((
  PermissionsAndroid.PERMISSIONS as Record<string, string>
).READ_MEDIA_AUDIO || 'android.permission.READ_MEDIA_AUDIO') as Permission;

const postNotificationsPermission = ((
  PermissionsAndroid.PERMISSIONS as Record<string, string>
).POST_NOTIFICATIONS || 'android.permission.POST_NOTIFICATIONS') as Permission;

function getAudioPermission(): Permission {
  return Number(Platform.Version) >= 33
    ? readMediaAudioPermission
    : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
}

export async function getAudioPermissionStatus(): Promise<AndroidPermissionStatus> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }
  if (Number(Platform.Version) < 23) {
    return 'granted';
  }
  return (await PermissionsAndroid.check(getAudioPermission())) ? 'granted' : 'denied';
}

export async function requestAudioPermission(): Promise<AndroidPermissionStatus> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }
  if (Number(Platform.Version) < 23) {
    return 'granted';
  }

  const result = await PermissionsAndroid.request(getAudioPermission(), {
    title: '本地音乐权限',
    message: 'YMusicPlayer 需要读取本机音频文件，用于扫描并展示本地曲库。',
    buttonPositive: '允许',
    buttonNegative: '拒绝',
  });

  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return 'granted';
  }
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    return 'blocked';
  }
  return 'denied';
}

export async function getNotificationPermissionStatus(): Promise<AndroidPermissionStatus> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }
  if (Number(Platform.Version) < 33) {
    return 'granted';
  }
  return (await PermissionsAndroid.check(postNotificationsPermission))
    ? 'granted'
    : 'denied';
}

export async function requestNotificationPermission(): Promise<AndroidPermissionStatus> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }
  if (Number(Platform.Version) < 33) {
    return 'granted';
  }

  const result = await PermissionsAndroid.request(postNotificationsPermission, {
    title: '通知权限',
    message: '允许后可在通知栏和锁屏控制播放。拒绝后仍可正常播放音乐。',
    buttonPositive: '允许',
    buttonNegative: '暂不允许',
  });

  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return 'granted';
  }
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    return 'blocked';
  }
  return 'denied';
}

export function openAndroidAppSettings() {
  return Linking.openSettings().catch(() => undefined);
}

export function getAppVersion(): string {
  return NativeModules.PlatformConstants?.reactNativeVersion
    ? `RN ${NativeModules.PlatformConstants.reactNativeVersion.major}.${NativeModules.PlatformConstants.reactNativeVersion.minor}.${NativeModules.PlatformConstants.reactNativeVersion.patch}`
    : '未知';
}

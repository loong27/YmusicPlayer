export type AppColorScheme = {
  background: string;
  surface: string;
  surfaceStrong: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primarySoft: string;
  danger: string;
  success: string;
};

export const lightColors: AppColorScheme = {
  background: '#eef8ff',
  surface: '#ffffff',
  surfaceStrong: '#e3f4ff',
  text: 'rgba(9, 24, 42, 0.9)',
  textMuted: 'rgba(9, 24, 42, 0.58)',
  border: 'rgba(0, 145, 214, 0.12)',
  primary: '#00a8ff',
  primarySoft: 'rgba(0, 168, 255, 0.14)',
  danger: '#ef4444',
  success: '#10b981',
};

export const darkColors: AppColorScheme = {
  background: '#071521',
  surface: '#0f2535',
  surfaceStrong: '#16384f',
  text: 'rgba(242, 250, 255, 0.94)',
  textMuted: 'rgba(242, 250, 255, 0.62)',
  border: 'rgba(125, 218, 255, 0.16)',
  primary: '#25d1ff',
  primarySoft: 'rgba(37, 209, 255, 0.18)',
  danger: '#f87171',
  success: '#34d399',
};

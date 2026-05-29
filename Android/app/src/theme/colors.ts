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
  background: '#f4f6fb',
  surface: '#ffffff',
  surfaceStrong: '#eef2f8',
  text: 'rgba(0, 0, 0, 0.86)',
  textMuted: 'rgba(0, 0, 0, 0.58)',
  border: 'rgba(0, 0, 0, 0.08)',
  primary: '#007aff',
  primarySoft: 'rgba(0, 122, 255, 0.12)',
  danger: '#ef4444',
  success: '#10b981',
};

export const darkColors: AppColorScheme = {
  background: '#101218',
  surface: '#1d2026',
  surfaceStrong: '#282d36',
  text: 'rgba(255, 255, 255, 0.9)',
  textMuted: 'rgba(255, 255, 255, 0.64)',
  border: 'rgba(255, 255, 255, 0.12)',
  primary: '#8ec1ff',
  primarySoft: 'rgba(0, 122, 255, 0.22)',
  danger: '#f87171',
  success: '#34d399',
};

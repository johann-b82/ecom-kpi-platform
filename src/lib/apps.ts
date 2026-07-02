export type AppKey = 'dashboard' | 'brickpm';

export interface AppDef {
  key: AppKey;
  label: string;
}

export const APPS: AppDef[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'brickpm', label: 'BrickPM' },
];

export const APP_KEYS: AppKey[] = APPS.map((a) => a.key);

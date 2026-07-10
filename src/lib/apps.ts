export type AppKey = 'dashboard' | 'brickpm';

export interface AppDef {
  key: AppKey;
  label: string;
  abbr: string;
  href: string;
}

export const APPS: AppDef[] = [
  { key: 'dashboard', label: 'Dashboard', abbr: 'DB', href: '/dashboard' },
  { key: 'brickpm', label: 'BrickPM', abbr: 'BP', href: '/brickpm' },
];

export const APP_KEYS: AppKey[] = APPS.map((a) => a.key);

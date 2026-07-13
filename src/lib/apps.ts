export type AppKey = 'dashboard' | 'brickpm' | 'kontakte' | 'katalog' | 'hilfe';

export interface AppDef {
  key: AppKey;
  label: string;
  abbr: string;
  href: string;
}

export const APPS: AppDef[] = [
  { key: 'dashboard', label: 'Dashboard', abbr: 'DB', href: '/dashboard' },
  { key: 'brickpm', label: 'BrickPM', abbr: 'BP', href: '/brickpm' },
  { key: 'kontakte', label: 'Kontakte', abbr: 'KO', href: '/kontakte' },
  { key: 'katalog', label: 'Katalog', abbr: 'KA', href: '/katalog' },
  { key: 'hilfe', label: 'Hilfe', abbr: 'HI', href: '/hilfe' },
];

export const APP_KEYS: AppKey[] = APPS.map((a) => a.key);

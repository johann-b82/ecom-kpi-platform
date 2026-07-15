// AppKey ist der Authz-Schlüssel je Modul; APPS ist die Rail-/Launchpad-Registry.
export type AppKey = 'brickpm' | 'kontakte' | 'katalog' | 'hilfe' | 'verkauf' | 'verfuegbarkeit' | 'finanzen';

export interface AppDef {
  key: AppKey;
  label: string;
  abbr: string;
  href: string;
}

export const APPS: AppDef[] = [
  { key: 'brickpm', label: 'BrickPM', abbr: 'BP', href: '/brickpm' },
  { key: 'kontakte', label: 'Kontakte', abbr: 'KO', href: '/kontakte' },
  { key: 'katalog', label: 'Katalog', abbr: 'KA', href: '/katalog' },
  { key: 'verkauf', label: 'Verkauf', abbr: 'VK', href: '/verkauf' },
  { key: 'verfuegbarkeit', label: 'Verfügbarkeit', abbr: 'VF', href: '/verfuegbarkeit' },
  { key: 'finanzen', label: 'Finanzen', abbr: 'FI', href: '/finanzen' },
  { key: 'hilfe', label: 'Hilfe', abbr: 'HI', href: '/hilfe' },
];

export const APP_KEYS: AppKey[] = APPS.map((a) => a.key);

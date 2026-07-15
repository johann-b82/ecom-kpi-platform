// AppKey ist der Authz-Schlüssel je Modul; APPS ist die Rail-/Launchpad-Registry.
export type AppKey = 'brickpm' | 'kontakte' | 'katalog' | 'hilfe' | 'verkauf' | 'verfuegbarkeit' | 'finanzen';

// group ordnet die Apps in Rail/Launchpad: die Wertschöpfungskette
// (Verfügbarkeit → Verkauf → Finanzen) getrennt von den zentralen Funktionen.
export type AppGroup = 'kette' | 'zentral';

export interface AppDef {
  key: AppKey;
  label: string;
  abbr: string;
  href: string;
  group: AppGroup;
}

export const APPS: AppDef[] = [
  // Wertschöpfungskette (physischer Fluss: Bestand → Verkauf → Zahlung)
  { key: 'verfuegbarkeit', label: 'Verfügbarkeit', abbr: 'VF', href: '/verfuegbarkeit', group: 'kette' },
  { key: 'verkauf', label: 'Verkauf', abbr: 'VK', href: '/verkauf', group: 'kette' },
  { key: 'finanzen', label: 'Finanzen', abbr: 'FI', href: '/finanzen', group: 'kette' },
  // Zentrale Funktionen (Stammdaten, Werkzeuge, Hilfe)
  { key: 'katalog', label: 'Katalog', abbr: 'KA', href: '/katalog', group: 'zentral' },
  { key: 'kontakte', label: 'Kontakte', abbr: 'KO', href: '/kontakte', group: 'zentral' },
  { key: 'brickpm', label: 'BrickPM', abbr: 'BP', href: '/brickpm', group: 'zentral' },
  { key: 'hilfe', label: 'Hilfe', abbr: 'HI', href: '/hilfe', group: 'zentral' },
];

export const APP_KEYS: AppKey[] = APPS.map((a) => a.key);

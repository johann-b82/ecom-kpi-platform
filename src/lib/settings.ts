import { pool } from './db';

export interface Branding {
  title: string;
  tagline: string;
  logo: string | null; // data URL, or null → fall back to the default logo
  color: string;       // accent color (hex), e.g. #D9004C
}

export const BRANDING_DEFAULTS: Branding = {
  title: 'Unified Data Platform',
  tagline: 'Own the core',
  logo: null,
  color: '#D9004C',
};

const HEX = /^#[0-9a-fA-F]{6}$/;

// Darken a #rrggbb color (used to derive the brand hover shade).
export function darken(hex: string, factor = 0.18): string {
  if (!HEX.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - factor));
  return '#' + [ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Read the branding settings. Falls back to defaults on any error (e.g. the
// app_settings table not migrated yet) so the header never breaks.
export async function getBranding(): Promise<Branding> {
  try {
    const res = await pool.query(
      "SELECT key, value FROM app_settings WHERE key IN ('brand_title', 'brand_tagline', 'brand_logo', 'brand_color')",
    );
    const map = new Map<string, string>(res.rows.map((r) => [r.key as string, r.value as string]));
    const color = map.get('brand_color')?.trim() ?? '';
    return {
      title: map.get('brand_title')?.trim() || BRANDING_DEFAULTS.title,
      tagline: map.get('brand_tagline')?.trim() || BRANDING_DEFAULTS.tagline,
      logo: map.get('brand_logo')?.trim() || null,
      color: HEX.test(color) ? color : BRANDING_DEFAULTS.color,
    };
  } catch {
    return BRANDING_DEFAULTS;
  }
}

export async function setBranding(b: Partial<Branding>): Promise<void> {
  const entries: [string, string][] = [];
  if (b.title !== undefined) entries.push(['brand_title', b.title]);
  if (b.tagline !== undefined) entries.push(['brand_tagline', b.tagline]);
  if (b.logo !== undefined) entries.push(['brand_logo', b.logo ?? '']);
  if (b.color !== undefined) entries.push(['brand_color', b.color]);
  for (const [key, value] of entries) {
    await pool.query(
      `INSERT INTO app_settings(key, value, updated_at) VALUES($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
      [key, value],
    );
  }
}

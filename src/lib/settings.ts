import { pool } from './db';

export interface Branding {
  title: string;
  tagline: string;
  logo: string | null; // data URL, or null → fall back to the default logo
}

export const BRANDING_DEFAULTS: Branding = {
  title: 'Unified Data Platform',
  tagline: 'Own the core',
  logo: null,
};

// Read the branding settings. Falls back to defaults on any error (e.g. the
// app_settings table not migrated yet) so the header never breaks.
export async function getBranding(): Promise<Branding> {
  try {
    const res = await pool.query(
      "SELECT key, value FROM app_settings WHERE key IN ('brand_title', 'brand_tagline', 'brand_logo')",
    );
    const map = new Map<string, string>(res.rows.map((r) => [r.key as string, r.value as string]));
    return {
      title: map.get('brand_title')?.trim() || BRANDING_DEFAULTS.title,
      tagline: map.get('brand_tagline')?.trim() || BRANDING_DEFAULTS.tagline,
      logo: map.get('brand_logo')?.trim() || null,
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
  for (const [key, value] of entries) {
    await pool.query(
      `INSERT INTO app_settings(key, value, updated_at) VALUES($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
      [key, value],
    );
  }
}

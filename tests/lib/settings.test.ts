import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { pool } from '@/lib/db';
import { getBranding, setBranding, darken, BRANDING_DEFAULTS } from '@/lib/settings';

afterAll(async () => { await pool.end(); });
beforeEach(async () => { await pool.query('DELETE FROM app_settings'); });

describe('branding settings (integration, benötigt DB)', () => {
  it('liefert Defaults, wenn nichts gesetzt ist', async () => {
    expect(await getBranding()).toEqual(BRANDING_DEFAULTS);
  });

  it('speichert + liest Werte (Round-Trip)', async () => {
    await setBranding({ title: 'Acme', tagline: 'Do it', logo: 'data:image/png;base64,AAA', color: '#123456' });
    expect(await getBranding()).toEqual({ title: 'Acme', tagline: 'Do it', logo: 'data:image/png;base64,AAA', color: '#123456' });
  });

  it('leeres Logo fällt auf null (Default) zurück', async () => {
    await setBranding({ logo: '' });
    expect((await getBranding()).logo).toBeNull();
  });

  it('ungültige Farbe fällt auf den Default zurück', async () => {
    await setBranding({ color: 'nope' });
    expect((await getBranding()).color).toBe(BRANDING_DEFAULTS.color);
  });

  it('darken erzeugt eine dunklere Stufe', () => {
    expect(darken('#ffffff', 0.5)).toBe('#808080');
    expect(darken('#D9004C')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

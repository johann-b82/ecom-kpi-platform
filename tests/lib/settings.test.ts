import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { pool } from '@/lib/db';
import { getBranding, setBranding, BRANDING_DEFAULTS } from '@/lib/settings';

afterAll(async () => { await pool.end(); });
beforeEach(async () => { await pool.query('DELETE FROM app_settings'); });

describe('branding settings (integration, benötigt DB)', () => {
  it('liefert Defaults, wenn nichts gesetzt ist', async () => {
    expect(await getBranding()).toEqual(BRANDING_DEFAULTS);
  });

  it('speichert + liest Werte (Round-Trip)', async () => {
    await setBranding({ title: 'Acme', tagline: 'Do it', logo: 'data:image/png;base64,AAA' });
    expect(await getBranding()).toEqual({ title: 'Acme', tagline: 'Do it', logo: 'data:image/png;base64,AAA' });
  });

  it('leeres Logo fällt auf null (Default) zurück', async () => {
    await setBranding({ logo: '' });
    expect((await getBranding()).logo).toBeNull();
  });
});

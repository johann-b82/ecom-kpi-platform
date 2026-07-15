import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { listAllConnections } from '@/lib/integrations';

beforeAll(async () => { await seedKontakte(); await seedKatalog(); });
afterAll(async () => { await pool.end(); });

describe('listAllConnections', () => {
  it('liefert Verbindungen mehrerer Apps, sortiert nach app,label', async () => {
    const all = await listAllConnections();
    const apps = new Set(all.map((c) => c.app));
    expect(apps.has('kontakte')).toBe(true);
    expect(apps.has('katalog')).toBe(true);
    const sorted = [...all].sort((a, b) => a.app.localeCompare(b.app) || a.label.localeCompare(b.label));
    expect(all.map((c) => c.id)).toEqual(sorted.map((c) => c.id));
  });
});

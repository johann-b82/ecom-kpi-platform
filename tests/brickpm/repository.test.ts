import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getCockpit, listProducts } from '@/brickpm/repository';
import { seedBrickpm } from '../../scripts/seed-brickpm';
import { pool } from '@/lib/db';

beforeAll(async () => { await seedBrickpm(); });
afterAll(async () => { await pool.end(); });

describe('BrickPM repository (integration, benötigt DB)', () => {
  it('listProducts returns 13 mapped products (camelCase)', async () => {
    const ps = await listProducts();
    expect(ps).toHaveLength(13);
    const p1 = ps.find((p) => p.id === 'P001')!;
    expect(p1).toMatchObject({ minStock: 50, tMgn: 0.5, validTo: null, succ: 'P010' });
  });
  it('getCockpit returns stats + notification lists', async () => {
    const c = await getCockpit();
    expect(c.stats.produkte).toBe(13);
    expect(c.stats.offeneNotifs).toBeGreaterThan(0);
    expect(c.heuteWichtig.length).toBeGreaterThan(0);
    expect(c.heuteWichtig.every((n) => n.status === 'offen')).toBe(true);
  });
});

import { describe, it, expect, afterAll } from 'vitest';
import { seedBrickpm } from '../../scripts/seed-brickpm';
import { pool } from '@/lib/db';

afterAll(async () => { await pool.end(); });

describe('seedBrickpm (integration, benötigt DB)', () => {
  it('inserts all rows and is idempotent', async () => {
    await seedBrickpm();
    await seedBrickpm(); // second run must not error or duplicate
    const p = await pool.query('SELECT count(*)::int n FROM bpm_products');
    const n = await pool.query('SELECT count(*)::int n FROM bpm_notifications');
    expect(p.rows[0].n).toBe(13);
    expect(n.rows[0].n).toBe(9);
    const p1 = await pool.query(`SELECT cost, stock, succ, valid_to FROM bpm_products WHERE id = 'P001'`);
    expect(p1.rows[0]).toMatchObject({ cost: 112.48, stock: 38, succ: 'P010', valid_to: null });
  });
});

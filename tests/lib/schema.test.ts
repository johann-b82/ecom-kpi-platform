import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';

describe('schema (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('alle kanonischen Tabellen existieren und sind abfragbar', async () => {
    for (const table of ['daily_metrics', 'orders', 'customers', 'ad_spend', 'subscribers']) {
      const res = await pool.query(`SELECT count(*)::int AS c FROM ${table}`);
      expect(res.rows[0].c).toBeGreaterThanOrEqual(0);
    }
  });
});

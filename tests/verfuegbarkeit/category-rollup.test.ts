import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../../src/lib/db';
import { categoryRollup } from '../../src/verfuegbarkeit/history';

afterAll(async () => { await pool.end(); });

describe('categoryRollup', () => {
  it('liefert je Kategorie konsistente Aggregate', async () => {
    const rows = await categoryRollup();
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) {
      expect(typeof r.category).toBe('string');
      expect(r.variantCount).toBeGreaterThan(0);
      expect(r.gesamtbestand).toBeGreaterThanOrEqual(0);
      expect(r.anzahlUnterMeldebestand).toBeGreaterThanOrEqual(0);
      expect(r.anzahlKritisch).toBeLessThanOrEqual(r.variantCount);
    }
  });
});

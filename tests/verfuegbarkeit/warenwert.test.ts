import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../../src/lib/db';
import { warenwertKpi, warenwertSeries } from '../../src/verfuegbarkeit/history';

afterAll(async () => { await pool.end(); });

describe('warenwertKpi', () => {
  it('entspricht Σ(on_hand × COALESCE(EK,0))', async () => {
    const kpi = await warenwertKpi();
    const ref = await pool.query<{ w: number }>(
      `SELECT COALESCE(SUM(s.quantity_on_hand * COALESCE(v.purchase_price,0)),0)::float8 AS w
         FROM stock_levels s JOIN product_variants v ON v.id = s.variant_id`);
    expect(kpi.warenwert).toBeCloseTo(Number(ref.rows[0].w), 2);
    expect(typeof kpi.ekUnvollstaendig).toBe('boolean');
  });
});

describe('warenwertSeries', () => {
  it('liefert eine sortierte Datum→Wert-Reihe', async () => {
    const series = await warenwertSeries({ start: '2000-01-01', end: '2999-12-31' });
    expect(Array.isArray(series)).toBe(true);
    for (const p of series) {
      expect(typeof p.date).toBe('string');
      expect(typeof p.value).toBe('number');
    }
    const dates = series.map((p) => p.date);
    expect([...dates]).toEqual([...dates].sort());
  });
});

import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../../src/lib/db';
import { stockSeries, salesSeries, getVariantForecastInput } from '../../src/verfuegbarkeit/history';

afterAll(async () => { await pool.end(); });

describe('history queries', () => {
  it('stockSeries liefert eine sortierte Datum→Menge-Reihe', async () => {
    const v = await pool.query(`SELECT variant_id FROM stock_snapshots LIMIT 1`);
    if (v.rows.length === 0) return; // keine Snapshots vorhanden → nichts zu prüfen
    const series = await stockSeries(v.rows[0].variant_id, 365);
    expect(Array.isArray(series)).toBe(true);
    for (const p of series) {
      expect(typeof p.date).toBe('string');
      expect(typeof p.value).toBe('number');
    }
    const dates = series.map((p) => p.date);
    expect([...dates]).toEqual([...dates].sort());
  });

  it('salesSeries + getVariantForecastInput geben Zahlen zurück', async () => {
    const v = await pool.query(`SELECT id FROM product_variants LIMIT 1`);
    const id = v.rows[0].id;
    const sales = await salesSeries(id, 90);
    expect(Array.isArray(sales)).toBe(true);
    const fi = await getVariantForecastInput(id);
    if (fi) {
      expect(typeof fi.onHand).toBe('number');
      expect(typeof fi.unitsInWindow).toBe('number');
      expect(typeof fi.reorderPoint).toBe('number');
    }
  });
});

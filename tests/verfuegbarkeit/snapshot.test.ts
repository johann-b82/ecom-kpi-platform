import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../../src/lib/db';
import { writeDailySnapshot } from '../../src/verfuegbarkeit/snapshot';

const TODAY = '2026-07-17';
let variantId: string;
let whId: string;

beforeAll(async () => {
  // Nutze eine vorhandene Variante ohne bestehende stock_levels-Zeilen (die
  // Seed-Daten geben manchen Varianten bewusst Bestand in mehreren Lagern
  // für die Mehrlager-Story — das würde die Einzelzeilen-Assertions unten
  // mehrdeutig machen).
  const wh = await pool.query(`SELECT id FROM warehouses WHERE is_default LIMIT 1`);
  whId = wh.rows[0].id;
  const v = await pool.query(
    `SELECT id FROM product_variants pv
      WHERE NOT EXISTS (SELECT 1 FROM stock_levels sl WHERE sl.variant_id = pv.id)
      LIMIT 1`);
  variantId = v.rows[0].id;
  await pool.query(
    `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_on_hand, quantity_reserved)
     VALUES ($1, $2, 42, 3)
     ON CONFLICT (variant_id, warehouse_id) DO UPDATE SET quantity_on_hand = 42, quantity_reserved = 3`,
    [variantId, whId]);
  await pool.query(`DELETE FROM stock_snapshots WHERE snapshot_date = $1`, [TODAY]);
});

afterAll(async () => {
  await pool.query(`DELETE FROM stock_snapshots WHERE snapshot_date = $1`, [TODAY]);
  // Zeile aus stock_levels wieder entfernen — die Variante hatte vorher
  // bewusst keinen Bestand (s.o.), damit der Test bei Wiederholung
  // reproduzierbar dieselbe „bestandslose" Variante findet.
  await pool.query(`DELETE FROM stock_levels WHERE variant_id = $1 AND warehouse_id = $2`, [variantId, whId]);
  await pool.end();
});

describe('writeDailySnapshot', () => {
  it('schreibt genau einen Satz pro Variante/Lager/Tag und ist idempotent', async () => {
    const first = await writeDailySnapshot(pool, TODAY);
    expect(first).toBeGreaterThan(0);
    const second = await writeDailySnapshot(pool, TODAY);
    expect(second).toBe(0); // ON CONFLICT DO NOTHING
    const row = await pool.query(
      `SELECT quantity_on_hand, quantity_reserved FROM stock_snapshots
        WHERE variant_id = $1 AND snapshot_date = $2`, [variantId, TODAY]);
    expect(row.rows[0]).toMatchObject({ quantity_on_hand: 42, quantity_reserved: 3 });
    const cnt = await pool.query(
      `SELECT count(*)::int AS n FROM stock_snapshots WHERE variant_id = $1 AND snapshot_date = $2`,
      [variantId, TODAY]);
    expect(cnt.rows[0].n).toBe(1);
  });
});

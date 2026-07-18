import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../../src/lib/db';

afterAll(async () => { await pool.end(); });

describe('stock_snapshots schema', () => {
  it('existiert mit PK (variant_id, warehouse_id, snapshot_date)', async () => {
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'stock_snapshots' ORDER BY column_name`);
    const names = cols.rows.map((r: { column_name: string }) => r.column_name);
    expect(names).toEqual(
      ['quantity_on_hand', 'quantity_reserved', 'snapshot_date', 'variant_id', 'warehouse_id']);
    const pk = await pool.query(
      `SELECT a.attname FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'stock_snapshots'::regclass AND i.indisprimary
        ORDER BY a.attname`);
    expect(pk.rows.map((r: { attname: string }) => r.attname)).toEqual(
      ['snapshot_date', 'variant_id', 'warehouse_id']);
  });
});

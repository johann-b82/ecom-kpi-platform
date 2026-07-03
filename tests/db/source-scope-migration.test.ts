import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { pool } from '@/lib/db';

const schema = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8');

describe('source-scope migration (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  beforeEach(async () => {
    // simulate the LEGACY shape + a WooCommerce watermark
    await pool.query('DROP TABLE IF EXISTS orders CASCADE; DROP TABLE IF EXISTS customers CASCADE;');
    await pool.query(`CREATE TABLE orders (order_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL,
      date DATE NOT NULL, revenue DOUBLE PRECISION NOT NULL, is_first_order BOOLEAN NOT NULL);`);
    await pool.query(`CREATE TABLE customers (customer_id TEXT PRIMARY KEY, first_order_date DATE NOT NULL,
      last_order_date DATE NOT NULL, orders_count INTEGER NOT NULL, total_revenue DOUBLE PRECISION NOT NULL);`);
    await pool.query(`INSERT INTO orders VALUES ('legacy1','c1','2026-01-01',10,true);`);
    await pool.query(`INSERT INTO app_settings(key, value) VALUES ('woocommerce_orders_synced_at','x')
      ON CONFLICT (key) DO UPDATE SET value = excluded.value;`);
  });

  it('migriert die Legacy-Tabellen auf das source-scoped Schema und löscht die WooCommerce-Watermarks', async () => {
    await pool.query(schema); // applying schema.sql runs the guard + recreates
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='orders'`,
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names).toContain('source');
    expect(names).toContain('source_id');
    expect(names).toContain('customer_uid');
    expect(names).not.toContain('order_id');
    const cnt = await pool.query('SELECT count(*)::int AS n FROM orders');
    expect(cnt.rows[0].n).toBe(0); // legacy row dropped, cache empty until resync
    const wm = await pool.query("SELECT count(*)::int AS n FROM app_settings WHERE key LIKE 'woocommerce_orders%'");
    expect(wm.rows[0].n).toBe(0);
  });
});

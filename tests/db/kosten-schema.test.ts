import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import { createOrder } from '@/verkauf/repository';

const MUELLER = 'c1c1c1c1-0000-4000-8000-000000000001';
const PL_HANDEL = 'a1a1a1a1-0000-4000-8000-000000000001';
let orderId: string;

beforeAll(async () => {
  await seedKontakte();
  await seedKatalog();
  await seedVerfuegbarkeit();
  const variant = await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku = $1', ['SJ-BLAU']);
  const o = await createOrder({
    contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
    lines: [{ variantId: variant.rows[0].id, quantity: 1, unitPrice: 10 }],
  });
  orderId = o.id;
});

afterAll(async () => {
  await pool.query('DELETE FROM order_costs WHERE order_id = $1', [orderId]);
  await pool.query('DELETE FROM sales_orders WHERE id = $1', [orderId]);
  await pool.end();
});

describe('kosten schema', () => {
  it('order_costs akzeptiert eine gültige Zeile und liest amount als numeric zurück', async () => {
    const ins = await pool.query(
      `INSERT INTO order_costs (order_id, type, amount, source)
       VALUES ($1,'wareneinsatz',-12.50,'berechnet') RETURNING id, amount::float8 AS amount`,
      [orderId]);
    expect(Number(ins.rows[0].amount)).toBe(-12.5);
    await pool.query('DELETE FROM order_costs WHERE id = $1', [ins.rows[0].id]);
  });

  it('order_costs.type lehnt einen unbekannten Wert ab', async () => {
    await expect(pool.query(
      `INSERT INTO order_costs (order_id, type, amount, source) VALUES ($1,'quatsch',1,'manuell')`,
      [orderId])).rejects.toThrow();
  });

  it('channel_costs akzeptiert eine periodische Werbezeile', async () => {
    const ins = await pool.query(
      `INSERT INTO channel_costs (channel, type, period_start, period_end, amount, source)
       VALUES ('shop','werbung','2026-01-01','2026-01-31',1100,'manuell') RETURNING id`);
    expect(ins.rows[0].id).toBeTruthy();
    await pool.query('DELETE FROM channel_costs WHERE id = $1', [ins.rows[0].id]);
  });
});

import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';

afterAll(async () => { await pool.end(); });

describe('kosten schema', () => {
  it('order_costs akzeptiert eine gültige Zeile und liest amount als numeric zurück', async () => {
    // ein bestehender Beleg aus dem Seed genügt als FK-Ziel
    const o = await pool.query<{ id: string }>('SELECT id FROM sales_orders LIMIT 1');
    const orderId = o.rows[0].id;
    const ins = await pool.query(
      `INSERT INTO order_costs (order_id, type, amount, source)
       VALUES ($1,'wareneinsatz',-12.50,'berechnet') RETURNING id, amount::float8 AS amount`,
      [orderId]);
    expect(Number(ins.rows[0].amount)).toBe(-12.5);
    await pool.query('DELETE FROM order_costs WHERE id = $1', [ins.rows[0].id]);
  });

  it('order_costs.type lehnt einen unbekannten Wert ab', async () => {
    const o = await pool.query<{ id: string }>('SELECT id FROM sales_orders LIMIT 1');
    await expect(pool.query(
      `INSERT INTO order_costs (order_id, type, amount, source) VALUES ($1,'quatsch',1,'manuell')`,
      [o.rows[0].id])).rejects.toThrow();
  });

  it('channel_costs akzeptiert eine periodische Werbezeile', async () => {
    const ins = await pool.query(
      `INSERT INTO channel_costs (channel, type, period_start, period_end, amount, source)
       VALUES ('shop','werbung','2026-01-01','2026-01-31',1100,'manuell') RETURNING id`);
    expect(ins.rows[0].id).toBeTruthy();
    await pool.query('DELETE FROM channel_costs WHERE id = $1', [ins.rows[0].id]);
  });
});

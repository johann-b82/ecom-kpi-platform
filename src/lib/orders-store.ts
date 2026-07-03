import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import type { Order } from '@/lib/types';

const CHUNK = 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertOrders(client: PoolClient, source: string, orders: Order[]): Promise<void> {
  for (const part of chunk(orders, CHUNK)) {
    const values: unknown[] = [source]; // $1, reused as the source for every row
    const rows = part.map((o, i) => {
      const b = 1 + i * 4;
      values.push(o.orderId, `${source}:${o.customerId}`, o.date, o.revenue);
      return `($1,$${b + 1},$${b + 2},$${b + 3},$${b + 4},false)`;
    });
    await client.query(
      `INSERT INTO orders(source, source_id, customer_uid, date, revenue, is_first_order) VALUES ${rows.join(',')}
       ON CONFLICT (source, source_id) DO UPDATE SET
         customer_uid = excluded.customer_uid, date = excluded.date, revenue = excluded.revenue`,
      values,
    );
  }
}

// Recompute is_first_order (earliest order per source-scoped customer) and rebuild
// customers from the whole orders table. Shared by fullReplace and applyDelta.
async function deriveAggregates(client: PoolClient): Promise<void> {
  await client.query(`
    UPDATE orders o SET is_first_order = (r.rn = 1)
    FROM (SELECT source, source_id,
            ROW_NUMBER() OVER (PARTITION BY customer_uid ORDER BY date, source_id) AS rn
          FROM orders) r
    WHERE o.source = r.source AND o.source_id = r.source_id`);
  await client.query('DELETE FROM customers');
  await client.query(`
    INSERT INTO customers(uid, source, first_order_date, last_order_date, orders_count, total_revenue)
    SELECT customer_uid, source, MIN(date), MAX(date), COUNT(*), ROUND(SUM(revenue)::numeric, 2)
    FROM orders GROUP BY customer_uid, source`);
}

export async function fullReplace(source: string, orders: Order[]): Promise<void> {
  if (orders.length === 0) {
    throw new Error(`${source} sync: 0 orders fetched — aborting without deleting.`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM orders WHERE source = $1', [source]);
    await insertOrders(client, source, orders);
    await deriveAggregates(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function applyDelta(source: string, upserts: Order[], deleteIds: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (upserts.length > 0) await insertOrders(client, source, upserts);
    for (const part of chunk(deleteIds, CHUNK)) {
      await client.query('DELETE FROM orders WHERE source = $1 AND source_id = ANY($2)', [source, part]);
    }
    await deriveAggregates(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

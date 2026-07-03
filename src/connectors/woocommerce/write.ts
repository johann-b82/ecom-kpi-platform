import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import type { Order } from '@/lib/types';

const CHUNK = 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertOrders(client: PoolClient, orders: Order[]): Promise<void> {
  for (const part of chunk(orders, CHUNK)) {
    const values: unknown[] = [];
    const rows = part.map((o, i) => {
      const b = i * 4;
      values.push(o.orderId, o.customerId, o.date, o.revenue);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},false)`;
    });
    await client.query(
      `INSERT INTO orders(order_id, customer_id, date, revenue, is_first_order) VALUES ${rows.join(',')}
       ON CONFLICT (order_id) DO UPDATE SET
         customer_id = excluded.customer_id, date = excluded.date, revenue = excluded.revenue`,
      values,
    );
  }
}

async function deleteOrders(client: PoolClient, ids: string[]): Promise<void> {
  for (const part of chunk(ids, CHUNK)) {
    await client.query('DELETE FROM orders WHERE order_id = ANY($1)', [part]);
  }
}

// Recompute is_first_order (earliest order per customer) and rebuild customers
// from the orders table. Shared by fullReplace and applyDelta.
async function deriveAggregates(client: PoolClient): Promise<void> {
  await client.query(`
    UPDATE orders o SET is_first_order = (r.rn = 1)
    FROM (SELECT order_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY date, order_id) AS rn FROM orders) r
    WHERE o.order_id = r.order_id`);
  await client.query('DELETE FROM customers');
  await client.query(`
    INSERT INTO customers(customer_id, first_order_date, last_order_date, orders_count, total_revenue)
    SELECT customer_id, MIN(date), MAX(date), COUNT(*), ROUND(SUM(revenue)::numeric, 2)
    FROM orders GROUP BY customer_id`);
}

export async function fullReplace(orders: Order[]): Promise<void> {
  if (orders.length === 0) {
    throw new Error('WooCommerce sync: 0 orders fetched — aborting without truncating.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE orders, customers');
    await insertOrders(client, orders);
    await deriveAggregates(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function applyDelta(upserts: Order[], deleteIds: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (upserts.length > 0) await insertOrders(client, upserts);
    if (deleteIds.length > 0) await deleteOrders(client, deleteIds);
    await deriveAggregates(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import type { CanonicalDataset, Customer, Order } from '@/lib/types';

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
      const b = i * 5;
      values.push(o.orderId, o.customerId, o.date, o.revenue, o.isFirstOrder);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
    });
    await client.query(
      `INSERT INTO orders(order_id, customer_id, date, revenue, is_first_order) VALUES ${rows.join(',')}`,
      values,
    );
  }
}

async function insertCustomers(client: PoolClient, customers: Customer[]): Promise<void> {
  for (const part of chunk(customers, CHUNK)) {
    const values: unknown[] = [];
    const rows = part.map((c, i) => {
      const b = i * 5;
      values.push(c.customerId, c.firstOrderDate, c.lastOrderDate, c.ordersCount, c.totalRevenue);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
    });
    await client.query(
      `INSERT INTO customers(customer_id, first_order_date, last_order_date, orders_count, total_revenue) VALUES ${rows.join(',')}`,
      values,
    );
  }
}

export async function writeOrdersAndCustomers(data: CanonicalDataset): Promise<void> {
  if (data.orders.length === 0) {
    throw new Error('Shopware sync: 0 orders fetched — aborting without truncating.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE orders, customers');
    await insertOrders(client, data.orders);
    await insertCustomers(client, data.customers);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

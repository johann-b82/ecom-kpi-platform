import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import { pgSupabase } from '../helpers/pg-supabase';

describe('loadDataset source-scoped mapping (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => {
    await pool.query('DELETE FROM orders; DELETE FROM customers;');
    await pool.query(`INSERT INTO orders(source, source_id, customer_uid, date, revenue, is_first_order)
      VALUES ('woocommerce','1','woocommerce:5','2026-05-01',100,true);`);
    await pool.query(`INSERT INTO customers(uid, source, first_order_date, last_order_date, orders_count, total_revenue)
      VALUES ('woocommerce:5','woocommerce','2026-05-01','2026-05-01',1,100);`);
  });

  it('mappt die source-scoped Spalten auf die Domain-Felder', async () => {
    const ds = await loadDataset(pgSupabase());
    expect(ds.orders[0]).toMatchObject({ orderId: '1', customerId: 'woocommerce:5', revenue: 100, isFirstOrder: true });
    expect(ds.customers[0]).toMatchObject({ customerId: 'woocommerce:5', ordersCount: 1 });
  });
});

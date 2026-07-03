import { describe, it, expect, afterAll } from 'vitest';
import { writeOrdersAndCustomers } from '@/connectors/woocommerce/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import { pgSupabase } from '../../helpers/pg-supabase';
import type { CanonicalDataset } from '@/lib/types';

const sample: CanonicalDataset = {
  dailyMetrics: [], adSpend: [], subscribers: [],
  orders: [
    { orderId: 'w1', customerId: '11', date: '2026-05-01', revenue: 100, isFirstOrder: true },
    { orderId: 'w2', customerId: '11', date: '2026-05-02', revenue: 50, isFirstOrder: false },
  ],
  customers: [
    { customerId: '11', firstOrderDate: '2026-05-01', lastOrderDate: '2026-05-02', ordersCount: 2, totalRevenue: 150 },
  ],
};

describe('writeOrdersAndCustomers (WooCommerce, integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('ersetzt orders + customers per TRUNCATE und Insert', async () => {
    await writeOrdersAndCustomers(sample);
    const after = await loadDataset(pgSupabase());
    expect(after.orders.map((o) => o.orderId).sort()).toEqual(['w1', 'w2']);
    expect(after.customers.map((c) => c.customerId)).toEqual(['11']);
    expect(after.customers[0].totalRevenue).toBeCloseTo(150);
  });

  it('bricht bei 0 Orders ab, ohne zu truncaten', async () => {
    await expect(writeOrdersAndCustomers({ ...sample, orders: [] }))
      .rejects.toThrow(/0 orders/i);
    const after = await loadDataset(pgSupabase());
    expect(after.orders.length).toBeGreaterThan(0);
  });
});

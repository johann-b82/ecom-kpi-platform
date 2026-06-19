import { describe, it, expect, afterAll } from 'vitest';
import { writeOrdersAndCustomers } from '@/connectors/shopware/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import type { CanonicalDataset } from '@/lib/types';

const sample: CanonicalDataset = {
  dailyMetrics: [], adSpend: [], subscribers: [],
  orders: [
    { orderId: 'sw1', customerId: 'k1', date: '2026-05-01', revenue: 120, isFirstOrder: true },
    { orderId: 'sw2', customerId: 'k1', date: '2026-05-20', revenue: 80, isFirstOrder: false },
  ],
  customers: [
    { customerId: 'k1', firstOrderDate: '2026-05-01', lastOrderDate: '2026-05-20', ordersCount: 2, totalRevenue: 200 },
  ],
};

describe('writeOrdersAndCustomers (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('ersetzt orders+customers transaktional, lässt ad_spend unberührt', async () => {
    const before = await loadDataset();
    const adSpendBefore = before.adSpend.length;
    await writeOrdersAndCustomers(sample);
    const after = await loadDataset();
    expect(after.orders.map((o) => o.orderId).sort()).toEqual(['sw1', 'sw2']);
    expect(after.customers).toHaveLength(1);
    expect(after.customers[0].totalRevenue).toBeCloseTo(200);
    expect(after.adSpend.length).toBe(adSpendBefore); // andere Quellen unangetastet
  });

  it('bricht bei 0 Orders ab, ohne zu truncaten', async () => {
    await expect(writeOrdersAndCustomers({ ...sample, orders: [] }))
      .rejects.toThrow(/0 orders/i);
    const after = await loadDataset();
    expect(after.orders.length).toBeGreaterThan(0); // vorheriger Stand erhalten
  });
});

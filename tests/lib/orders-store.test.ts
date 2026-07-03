import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { fullReplace, applyDelta } from '@/lib/orders-store';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import { pgSupabase } from '../helpers/pg-supabase';
import type { Order } from '@/lib/types';

const woo: Order[] = [
  { orderId: '1', customerId: '11', date: '2026-05-01', revenue: 100, isFirstOrder: false },
  { orderId: '2', customerId: '11', date: '2026-05-02', revenue: 50, isFirstOrder: false },
];
const shop: Order[] = [
  { orderId: 'A', customerId: '11', date: '2026-05-03', revenue: 30, isFirstOrder: false },
];

describe('orders-store (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => { await pool.query('DELETE FROM orders; DELETE FROM customers;'); });

  it('fullReplace stampt source und leitet customers + is_first_order source-scoped ab', async () => {
    await fullReplace('woocommerce', woo);
    const ds = await loadDataset(pgSupabase());
    expect(ds.orders.map((o) => o.customerId).sort()).toEqual(['woocommerce:11', 'woocommerce:11']);
    const c = ds.customers.find((x) => x.customerId === 'woocommerce:11')!;
    expect(c).toMatchObject({ ordersCount: 2, firstOrderDate: '2026-05-01', lastOrderDate: '2026-05-02' });
    expect(c.totalRevenue).toBeCloseTo(150);
    expect(ds.orders.filter((o) => o.isFirstOrder).length).toBe(1);
  });

  it('zwei Quellen koexistieren — fullReplace der einen lässt die andere unberührt', async () => {
    await fullReplace('woocommerce', woo);
    await fullReplace('shopware', shop);
    const ds = await loadDataset(pgSupabase());
    expect(ds.customers.map((c) => c.customerId).sort()).toEqual(['shopware:11', 'woocommerce:11']);
    await fullReplace('woocommerce', woo);
    const ds2 = await loadDataset(pgSupabase());
    expect(ds2.customers.some((c) => c.customerId === 'shopware:11')).toBe(true);
  });

  it('fullReplace bricht bei 0 Orders ab, ohne die Quelle zu löschen', async () => {
    await fullReplace('woocommerce', woo);
    await expect(fullReplace('woocommerce', [])).rejects.toThrow(/0 orders/i);
    expect((await loadDataset(pgSupabase())).orders.length).toBe(2);
  });

  it('applyDelta upsertet/löscht nur innerhalb seiner Quelle', async () => {
    await fullReplace('woocommerce', woo);
    await fullReplace('shopware', shop);
    await applyDelta('woocommerce',
      [{ orderId: '2', customerId: '11', date: '2026-05-02', revenue: 999, isFirstOrder: false }],
      ['1']);
    const ds = await loadDataset(pgSupabase());
    expect(ds.orders.find((o) => o.orderId === '2' && o.customerId === 'woocommerce:11')!.revenue).toBeCloseTo(999);
    expect(ds.orders.some((o) => o.orderId === '1')).toBe(false);
    expect(ds.orders.some((o) => o.customerId === 'shopware:11')).toBe(true);
  });

  it('applyDelta ist idempotent', async () => {
    await fullReplace('woocommerce', woo);
    const d: Order[] = [{ orderId: '3', customerId: '11', date: '2026-05-04', revenue: 20, isFirstOrder: false }];
    await applyDelta('woocommerce', d, []);
    await applyDelta('woocommerce', d, []);
    const ds = await loadDataset(pgSupabase());
    expect(ds.orders.filter((o) => o.orderId === '3').length).toBe(1);
  });
});

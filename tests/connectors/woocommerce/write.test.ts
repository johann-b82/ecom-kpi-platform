import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { fullReplace, applyDelta } from '@/connectors/woocommerce/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import { pgSupabase } from '../../helpers/pg-supabase';
import type { Order } from '@/lib/types';

const base: Order[] = [
  { orderId: 'w1', customerId: '11', date: '2026-05-01', revenue: 100, isFirstOrder: false },
  { orderId: 'w2', customerId: '11', date: '2026-05-02', revenue: 50, isFirstOrder: false },
  { orderId: 'w3', customerId: '22', date: '2026-05-03', revenue: 30, isFirstOrder: false },
];

describe('WooCommerce write (integration, benötigt laufende DB)', () => {
  beforeEach(async () => { await fullReplace(base); });
  afterAll(async () => { await pool.end(); });

  it('fullReplace baut orders + customers + is_first_order auf', async () => {
    const after = await loadDataset(pgSupabase());
    expect(after.orders.map((o) => o.orderId).sort()).toEqual(['w1', 'w2', 'w3']);
    const c11 = after.customers.find((c) => c.customerId === '11')!;
    expect(c11).toMatchObject({ ordersCount: 2, firstOrderDate: '2026-05-01', lastOrderDate: '2026-05-02' });
    expect(c11.totalRevenue).toBeCloseTo(150);
    // exactly one first order per customer, at the earliest date
    const firsts = after.orders.filter((o) => o.isFirstOrder).map((o) => o.orderId).sort();
    expect(firsts).toEqual(['w1', 'w3']);
  });

  it('fullReplace bricht bei 0 Orders ab, ohne zu truncaten', async () => {
    await expect(fullReplace([])).rejects.toThrow(/0 orders/i);
    expect((await loadDataset(pgSupabase())).orders.length).toBe(3);
  });

  it('applyDelta upsertet neue/geänderte Orders und rechnet Aggregate neu', async () => {
    await applyDelta(
      [{ orderId: 'w2', customerId: '11', date: '2026-05-02', revenue: 999, isFirstOrder: false },  // update
       { orderId: 'w4', customerId: '22', date: '2026-05-04', revenue: 20, isFirstOrder: false }],   // insert
      [],
    );
    const after = await loadDataset(pgSupabase());
    expect(after.orders.find((o) => o.orderId === 'w2')!.revenue).toBeCloseTo(999);
    expect(after.customers.find((c) => c.customerId === '22')!.ordersCount).toBe(2);
  });

  it('applyDelta löscht Orders in deleteIds (aus dem Revenue-Set gefallen)', async () => {
    await applyDelta([], ['w2']);
    const after = await loadDataset(pgSupabase());
    expect(after.orders.map((o) => o.orderId).sort()).toEqual(['w1', 'w3']);
    expect(after.customers.find((c) => c.customerId === '11')!.ordersCount).toBe(1);
  });

  it('applyDelta ist idempotent', async () => {
    const delta: Order[] = [{ orderId: 'w4', customerId: '22', date: '2026-05-04', revenue: 20, isFirstOrder: false }];
    await applyDelta(delta, []);
    await applyDelta(delta, []);
    const after = await loadDataset(pgSupabase());
    expect(after.orders.filter((o) => o.orderId === 'w4').length).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { normalizeOrders } from '@/connectors/woocommerce/connector';
import type { WooOrder } from '@/connectors/woocommerce/types';

const raw: WooOrder[] = [
  { id: 1, status: 'completed', date_created: '2026-01-05T10:00:00', total: '100.00', customer_id: 11 },
  { id: 2, status: 'processing', date_created: '2026-02-10T10:00:00', total: '200.00', customer_id: 11 },
  { id: 3, status: 'completed', date_created: '2026-01-20T10:00:00', total: '50.00', customer_id: 22 },
  { id: 4, status: 'cancelled', date_created: '2026-03-01T10:00:00', total: '999.00', customer_id: 22 },
  { id: 5, status: 'refunded', date_created: '2026-03-02T10:00:00', total: '999.00', customer_id: 22 },
];

describe('normalizeOrders (WooCommerce)', () => {
  it('behält nur completed+processing, nutzt Brutto-total', () => {
    const ds = normalizeOrders(raw);
    expect(ds.orders).toHaveLength(3); // #4 cancelled, #5 refunded ausgeschlossen
    expect(ds.orders.find((o) => o.orderId === '1')!.revenue).toBe(100);
    expect(ds.orders.find((o) => o.orderId === '1')!.date).toBe('2026-01-05');
    expect(ds.orders.some((o) => o.orderId === '4')).toBe(false);
    expect(ds.orders.some((o) => o.orderId === '5')).toBe(false);
  });
  it('flaggt die früheste Bestellung je Kunde als isFirstOrder', () => {
    const ds = normalizeOrders(raw);
    expect(ds.orders.find((o) => o.orderId === '1')!.isFirstOrder).toBe(true);
    expect(ds.orders.find((o) => o.orderId === '2')!.isFirstOrder).toBe(false);
    expect(ds.orders.find((o) => o.orderId === '3')!.isFirstOrder).toBe(true);
  });
  it('leitet konsistente Kunden-Aggregate ab und füllt nur orders+customers', () => {
    const ds = normalizeOrders(raw);
    const c = ds.customers.find((x) => x.customerId === '11')!;
    expect(c.ordersCount).toBe(2);
    expect(c.totalRevenue).toBeCloseTo(300);
    expect(c.firstOrderDate).toBe('2026-01-05');
    expect(c.lastOrderDate).toBe('2026-02-10');
    expect(ds.dailyMetrics).toHaveLength(0);
    expect(ds.adSpend).toHaveLength(0);
    expect(ds.subscribers).toHaveLength(0);
  });
  it('schlüsselt Gäste (customer_id 0) über die Billing-E-Mail', () => {
    const guests: WooOrder[] = [
      { id: 9, status: 'completed', date_created: '2026-01-01T00:00:00', total: '30.00', customer_id: 0, billing: { email: 'Gast@Example.com' } },
      { id: 10, status: 'completed', date_created: '2026-04-01T00:00:00', total: '40.00', customer_id: 0, billing: { email: 'gast@example.com' } },
    ];
    const ds = normalizeOrders(guests);
    expect(ds.customers).toHaveLength(1); // gleiche E-Mail (case-insensitiv) → ein Kunde
    expect(ds.customers[0].customerId).toBe('guest:gast@example.com');
    expect(ds.customers[0].ordersCount).toBe(2);
  });
  it('nutzt order-id als Gast-Fallback ohne Billing-E-Mail', () => {
    const ds = normalizeOrders([
      { id: 77, status: 'processing', date_created: '2026-01-01T00:00:00', total: '10.00', customer_id: 0 },
    ]);
    expect(ds.orders[0].customerId).toBe('guest:order-77');
  });
});

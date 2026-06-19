import { describe, it, expect } from 'vitest';
import { normalizeOrders } from '@/connectors/shopware/connector';
import type { ShopwareOrder } from '@/connectors/shopware/types';

const raw: ShopwareOrder[] = [
  { id: 'o1', orderDateTime: '2026-01-05T10:00:00.000+00:00', amountTotal: 100, stateMachineState: { technicalName: 'open' }, orderCustomer: { customerId: 'c1', id: 'oc1' } },
  { id: 'o2', orderDateTime: '2026-02-10T10:00:00.000+00:00', amountTotal: 200, stateMachineState: { technicalName: 'completed' }, orderCustomer: { customerId: 'c1', id: 'oc2' } },
  { id: 'o3', orderDateTime: '2026-01-20T10:00:00.000+00:00', amountTotal: 50, stateMachineState: { technicalName: 'open' }, orderCustomer: { customerId: 'c2', id: 'oc3' } },
  { id: 'o4', orderDateTime: '2026-03-01T10:00:00.000+00:00', amountTotal: 999, stateMachineState: { technicalName: 'cancelled' }, orderCustomer: { customerId: 'c2', id: 'oc4' } },
];

describe('normalizeOrders', () => {
  it('mappt Orders, schließt Stornos aus, nutzt Brutto-Betrag', () => {
    const ds = normalizeOrders(raw);
    expect(ds.orders).toHaveLength(3); // o4 (cancelled) ausgeschlossen
    expect(ds.orders.find((o) => o.orderId === 'o1')!.revenue).toBe(100);
    expect(ds.orders.find((o) => o.orderId === 'o1')!.date).toBe('2026-01-05');
    expect(ds.orders.some((o) => o.orderId === 'o4')).toBe(false);
  });
  it('flaggt die früheste Bestellung je Kunde als isFirstOrder', () => {
    const ds = normalizeOrders(raw);
    expect(ds.orders.find((o) => o.orderId === 'o1')!.isFirstOrder).toBe(true);
    expect(ds.orders.find((o) => o.orderId === 'o2')!.isFirstOrder).toBe(false);
    expect(ds.orders.find((o) => o.orderId === 'o3')!.isFirstOrder).toBe(true); // c2 frühste (o4 raus)
  });
  it('leitet konsistente Kunden-Aggregate ab und füllt nur orders+customers', () => {
    const ds = normalizeOrders(raw);
    const c1 = ds.customers.find((c) => c.customerId === 'c1')!;
    expect(c1.ordersCount).toBe(2);
    expect(c1.totalRevenue).toBeCloseTo(300);
    expect(c1.firstOrderDate).toBe('2026-01-05');
    expect(c1.lastOrderDate).toBe('2026-02-10');
    expect(ds.dailyMetrics).toHaveLength(0);
    expect(ds.adSpend).toHaveLength(0);
    expect(ds.subscribers).toHaveLength(0);
  });
  it('nutzt orderCustomer.id als Fallback bei fehlender customerId (Gast)', () => {
    const guest: ShopwareOrder[] = [
      { id: 'g1', orderDateTime: '2026-01-01T00:00:00.000+00:00', amountTotal: 30, stateMachineState: { technicalName: 'open' }, orderCustomer: { customerId: null, id: 'guest-oc' } },
    ];
    const ds = normalizeOrders(guest);
    expect(ds.orders[0].customerId).toBe('guest-oc');
  });
});

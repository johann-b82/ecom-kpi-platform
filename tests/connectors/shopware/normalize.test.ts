import { describe, it, expect } from 'vitest';
import { normalizeOrders } from '@/connectors/shopware/connector';
import type { ShopwareOrder } from '@/connectors/shopware/types';

const raw: ShopwareOrder[] = [
  { id: 'o1', orderDateTime: '2026-01-05T10:00:00.000+00:00', amountTotal: 100, stateMachineState: { technicalName: 'open' }, orderCustomer: { customerId: 'c1', id: 'oc1' } },
  { id: 'o2', orderDateTime: '2026-02-10T10:00:00.000+00:00', amountTotal: 200, stateMachineState: { technicalName: 'completed' }, orderCustomer: { customerId: 'c1', id: 'oc2' } },
  { id: 'o4', orderDateTime: '2026-03-01T10:00:00.000+00:00', amountTotal: 999, stateMachineState: { technicalName: 'cancelled' }, orderCustomer: { customerId: 'c2', id: 'oc4' } },
];

describe('normalizeOrders (Shopware)', () => {
  it('gibt Order-Rows zurück (Stornos ausgeschlossen), ohne JS-Aggregation', () => {
    const rows = normalizeOrders(raw);
    expect(rows.map((r) => r.orderId)).toEqual(['o1', 'o2']); // o4 (cancelled) raus
    expect(rows[0]).toMatchObject({ orderId: 'o1', customerId: 'c1', date: '2026-01-05', revenue: 100, isFirstOrder: false });
  });

  it('nutzt orderCustomer.id als Fallback bei fehlender customerId (Gast)', () => {
    const rows = normalizeOrders([
      { id: 'g1', orderDateTime: '2026-01-01T00:00:00.000+00:00', amountTotal: 30, stateMachineState: { technicalName: 'open' }, orderCustomer: { customerId: null, id: 'guest-oc' } },
    ]);
    expect(rows[0].customerId).toBe('guest-oc');
  });
});

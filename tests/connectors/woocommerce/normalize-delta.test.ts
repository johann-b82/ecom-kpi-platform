import { describe, it, expect } from 'vitest';
import { normalizeDelta } from '@/connectors/woocommerce/connector';
import type { WooOrder } from '@/connectors/woocommerce/types';

function o(id: number, status: string, customer_id = 0, total = '10.00', email?: string): WooOrder {
  return { id, status, date_created: '2026-05-01T00:00:00', total, customer_id, billing: email ? { email } : undefined };
}

describe('normalizeDelta', () => {
  it('mappt Revenue-Orders (completed/processing) nach upserts', () => {
    const { upserts, deleteIds } = normalizeDelta([o(1, 'completed', 5, '100.00'), o(2, 'processing', 6, '50.00')]);
    expect(upserts.map((u) => u.orderId)).toEqual(['1', '2']);
    expect(upserts[0]).toMatchObject({ orderId: '1', customerId: '5', date: '2026-05-01', revenue: 100, isFirstOrder: false });
    expect(deleteIds).toEqual([]);
  });

  it('sammelt Nicht-Revenue-Orders (refunded/cancelled/trash) in deleteIds', () => {
    const { upserts, deleteIds } = normalizeDelta([o(3, 'refunded'), o(4, 'cancelled'), o(5, 'trash')]);
    expect(upserts).toEqual([]);
    expect(deleteIds).toEqual(['3', '4', '5']);
  });

  it('keyt Gäste (customer_id 0) per billing-email, sonst per order-id', () => {
    const { upserts } = normalizeDelta([o(6, 'completed', 0, '10.00', 'A@x.de'), o(7, 'completed', 0, '10.00')]);
    expect(upserts[0].customerId).toBe('guest:a@x.de');
    expect(upserts[1].customerId).toBe('guest:order-7');
  });
});

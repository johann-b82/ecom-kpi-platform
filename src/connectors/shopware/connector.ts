import type { Order } from '@/lib/types';
import type { ShopwareOrder } from './types';

// Revenue rows only (cancelled excluded). customers + is_first_order are derived
// downstream in SQL (orders-store), so this no longer aggregates.
export function normalizeOrders(rawOrders: ShopwareOrder[]): Order[] {
  return rawOrders
    .filter((o) => o.stateMachineState?.technicalName !== 'cancelled')
    .map((o) => ({
      orderId: o.id,
      customerId: o.orderCustomer?.customerId ?? o.orderCustomer?.id ?? 'unknown',
      date: o.orderDateTime.slice(0, 10),
      revenue: o.amountTotal,
      isFirstOrder: false,
    }));
}

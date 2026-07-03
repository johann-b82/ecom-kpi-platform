import type { Order } from '@/lib/types';
import type { WooOrder } from './types';

// Only paid/fulfilled orders count as revenue.
const REVENUE_STATUSES = new Set(['completed', 'processing']);

function customerKey(o: WooOrder): string {
  // Registered customers key by customer_id; guests (customer_id 0) key by
  // billing email so their orders don't collapse into one pseudo-customer.
  if (o.customer_id > 0) return String(o.customer_id);
  return o.billing?.email ? `guest:${o.billing.email.toLowerCase()}` : `guest:order-${o.id}`;
}

// Partitions fetched orders into revenue rows to upsert and non-revenue ids to
// delete. customers + is_first_order are derived downstream in SQL, so this no
// longer aggregates.
export function normalizeDelta(rawOrders: WooOrder[]): { upserts: Order[]; deleteIds: string[] } {
  const upserts: Order[] = [];
  const deleteIds: string[] = [];
  for (const o of rawOrders) {
    if (REVENUE_STATUSES.has(o.status)) {
      upserts.push({
        orderId: String(o.id),
        customerId: customerKey(o),
        date: o.date_created.slice(0, 10),
        revenue: Number(o.total),
        isFirstOrder: false,
      });
    } else {
      deleteIds.push(String(o.id));
    }
  }
  return { upserts, deleteIds };
}

import type { CanonicalDataset, Customer, Order } from '@/lib/types';
import type { WooOrder } from './types';

// Only paid/fulfilled orders count as revenue.
const REVENUE_STATUSES = new Set(['completed', 'processing']);

export function normalizeOrders(rawOrders: WooOrder[]): CanonicalDataset {
  const orders: Order[] = rawOrders
    .filter((o) => REVENUE_STATUSES.has(o.status))
    .map((o) => ({
      orderId: String(o.id),
      // Registered customers key by customer_id; guests (customer_id 0) key by
      // billing email so their orders don't collapse into one pseudo-customer.
      customerId: o.customer_id > 0
        ? String(o.customer_id)
        : o.billing?.email
          ? `guest:${o.billing.email.toLowerCase()}`
          : `guest:order-${o.id}`,
      date: o.date_created.slice(0, 10),
      revenue: Number(o.total),
      isFirstOrder: false,
    }));

  // isFirstOrder = früheste Order je Kunde (genau eine)
  const earliest = new Map<string, string>();
  for (const o of orders) {
    const cur = earliest.get(o.customerId);
    if (!cur || o.date < cur) earliest.set(o.customerId, o.date);
  }
  const flagged = new Set<string>();
  for (const o of orders) {
    if (!flagged.has(o.customerId) && o.date === earliest.get(o.customerId)) {
      o.isFirstOrder = true;
      flagged.add(o.customerId);
    }
  }

  // Kunden aus Orders ableiten
  const byCustomer = new Map<string, Order[]>();
  for (const o of orders) {
    const arr = byCustomer.get(o.customerId) ?? [];
    arr.push(o);
    byCustomer.set(o.customerId, arr);
  }
  const customers: Customer[] = [...byCustomer.entries()].map(([customerId, custOrders]) => {
    const dates = custOrders.map((o) => o.date).sort();
    return {
      customerId,
      firstOrderDate: dates[0],
      lastOrderDate: dates[dates.length - 1],
      ordersCount: custOrders.length,
      totalRevenue: Math.round(custOrders.reduce((s, o) => s + o.revenue, 0) * 100) / 100,
    };
  });

  return { dailyMetrics: [], orders, customers, adSpend: [], subscribers: [] };
}

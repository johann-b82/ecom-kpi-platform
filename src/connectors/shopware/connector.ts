import type { CanonicalDataset, Customer, Order } from '@/lib/types';
import type { ShopwareOrder } from './types';

export function normalizeOrders(rawOrders: ShopwareOrder[]): CanonicalDataset {
  const orders: Order[] = rawOrders
    .filter((o) => o.stateMachineState?.technicalName !== 'cancelled')
    .map((o) => ({
      orderId: o.id,
      customerId: o.orderCustomer?.customerId ?? o.orderCustomer?.id ?? 'unknown',
      date: o.orderDateTime.slice(0, 10),
      revenue: o.amountTotal,
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

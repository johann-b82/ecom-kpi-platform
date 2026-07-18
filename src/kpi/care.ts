import type { CanonicalDataset, DateRange, SalesFacts } from '@/lib/types';
import type { Kpi } from './types';
import { inRange, kpi } from './helpers';
import { daysBetween } from '@/lib/dates';

export function careKpis(data: CanonicalDataset, range: DateRange, facts?: SalesFacts): Kpi[] {
  const { orders, customers, subscribers } = data;

  const activeIds = new Set(orders.filter((o) => inRange(o.date, range)).map((o) => o.customerId));
  const active = customers.filter((c) => activeIds.has(c.customerId));
  const hasActive = active.length > 0;

  // Wiederkaufrate und CLV aus den echten Belegen (WooCommerce), sobald `facts`
  // übergeben wird; sonst aus den Analytics-Kundendaten.
  const repeatRate = facts ? facts.repeatRate
    : (hasActive ? active.filter((c) => c.ordersCount >= 2).length / active.length : null);

  const clv = facts ? facts.clv
    : (hasActive ? active.reduce((s, c) => s + c.totalRevenue, 0) / active.length : null);

  const multi = active.filter((c) => c.ordersCount >= 2);
  const interval = multi.length
    ? multi.reduce((s, c) => s + daysBetween(c.firstOrderDate, c.lastOrderDate) / (c.ordersCount - 1), 0) / multi.length
    : null;

  const priorIds = new Set(orders.filter((o) => o.date < range.start).map((o) => o.customerId));
  const retained = [...priorIds].filter((id) => activeIds.has(id)).length;
  const retention = priorIds.size ? retained / priorIds.size : null;
  const churn = retention === null ? null : 1 - retention;

  const npsRows = subscribers.filter((s) => inRange(s.date, range) && s.npsScore !== null);
  const nps = npsRows.length
    ? npsRows.reduce((s, r) => s + (r.npsScore as number), 0) / npsRows.length : null;

  return [
    kpi('repeat_rate', 'Wiederkaufrate / Repeat Rate', 'care', repeatRate, 'percent'),
    kpi('clv', 'Customer Lifetime Value (CLV)', 'care', clv, 'currency'),
    kpi('repurchase_interval', 'Wiederkaufintervall (Tage)', 'care', interval, 'number'),
    kpi('nps', 'NPS / Zufriedenheit', 'care', nps, 'number'),
    kpi('retention', 'Retention Rate', 'care', retention, 'percent'),
    kpi('churn', 'Churn Rate', 'care', churn, 'percent'),
  ];
}

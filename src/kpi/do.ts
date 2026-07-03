import type { CanonicalDataset, DateRange } from '@/lib/types';
import type { Kpi } from './types';
import { inRange, metricSum, metricPresent, ratio, kpi } from './helpers';

export function doKpis(data: CanonicalDataset, range: DateRange): Kpi[] {
  const orders = data.orders.filter((o) => inRange(o.date, range));
  const orderCount = orders.length;
  const newCustomers = orders.filter((o) => o.isFirstOrder).length;

  const sessions = metricSum(data.dailyMetrics, 'sessions', range);
  const checkouts = metricSum(data.dailyMetrics, 'checkouts_started', range);
  // Conversion Rate, Umsatz and AOV are sourced from GA4 (ecommercePurchases /
  // purchaseRevenue), independent of the orders table.
  const ga4Purchases = metricSum(data.dailyMetrics, 'ecommerce_purchases', range);
  const ga4Revenue = metricSum(data.dailyMetrics, 'purchase_revenue', range);
  const hasGa4Revenue = metricPresent(data.dailyMetrics, 'purchase_revenue', range);

  const ads = data.adSpend.filter((a) => inRange(a.date, range));
  const hasAds = ads.length > 0;
  const spend = ads.reduce((s, a) => s + a.spend, 0);
  const convValue = ads.reduce((s, a) => s + a.convValue, 0);

  return [
    kpi('conversion_rate', 'Conversion Rate', 'do', ratio(ga4Purchases, sessions), 'percent'),
    kpi('aov', 'Warenkorbwert (AOV)', 'do', ratio(ga4Revenue, ga4Purchases), 'currency'),
    kpi('revenue', 'Umsatz / Revenue', 'do', hasGa4Revenue ? ga4Revenue : null, 'currency'),
    kpi('roas', 'ROAS', 'do', hasAds ? ratio(convValue, spend) : null, 'ratio'),
    kpi('cac', 'CAC', 'do', hasAds ? ratio(spend, newCustomers) : null, 'currency'),
    kpi('cart_abandonment', 'Warenkorbabbruchrate', 'do',
      checkouts > 0 ? 1 - orderCount / checkouts : null, 'percent'),
  ];
}

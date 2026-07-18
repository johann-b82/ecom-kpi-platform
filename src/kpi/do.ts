import type { CanonicalDataset, DateRange, SalesFacts } from '@/lib/types';
import type { Kpi } from './types';
import { inRange, metricSum, metricPresent, ratio, kpi } from './helpers';

export function doKpis(data: CanonicalDataset, range: DateRange, facts?: SalesFacts): Kpi[] {
  const sessions = metricSum(data.dailyMetrics, 'sessions', range);
  const checkouts = metricSum(data.dailyMetrics, 'checkouts_started', range);
  // Umsatz, Käufe und Warenkorbwert stammen aus den echten Belegen (WooCommerce),
  // sobald `facts` übergeben wird; sonst Fallback auf die GA4-Schätzwerte
  // (ecommercePurchases / purchaseRevenue). Sessions/Checkouts bleiben GA4 —
  // sie sind Traffic-, keine Bestellzahlen. ROAS nutzt weiter den Ad-Plattform-Wert.
  const ga4Purchases = metricSum(data.dailyMetrics, 'ecommerce_purchases', range);
  const ga4Revenue = metricSum(data.dailyMetrics, 'purchase_revenue', range);
  const hasGa4Revenue = metricPresent(data.dailyMetrics, 'purchase_revenue', range);

  const purchases = facts ? facts.purchases : ga4Purchases;
  const revenue = facts ? facts.revenue : (hasGa4Revenue ? ga4Revenue : null);
  const aov = facts ? facts.aov : ratio(ga4Revenue, ga4Purchases);

  const ads = data.adSpend.filter((a) => inRange(a.date, range));
  const hasAds = ads.length > 0;
  const spend = ads.reduce((s, a) => s + a.spend, 0);
  const convValue = ads.reduce((s, a) => s + a.convValue, 0);

  return [
    kpi('conversion_rate', 'Conversion Rate', 'do', ratio(purchases, sessions), 'percent'),
    kpi('aov', 'Warenkorbwert (AOV)', 'do', aov, 'currency'),
    kpi('revenue', 'Umsatz / Revenue', 'do', revenue, 'currency'),
    kpi('roas', 'ROAS', 'do', hasAds ? ratio(convValue, spend) : null, 'ratio'),
    kpi('cac', 'CAC', 'do', hasAds ? ratio(spend, purchases) : null, 'currency'),
    kpi('cart_abandonment', 'Warenkorbabbruchrate', 'do',
      checkouts > 0 ? Math.max(0, 1 - purchases / checkouts) : null, 'percent'),
  ];
}

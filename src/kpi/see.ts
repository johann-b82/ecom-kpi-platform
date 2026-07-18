import type { CanonicalDataset, DateRange, SalesFacts } from '@/lib/types';
import type { Kpi } from './types';
import { inRange, metricSum, metricPresent, ratio, kpi } from './helpers';

// SEE nutzt keine Bestellzahlen; `_facts` nur für die einheitliche Phasen-Signatur.
export function seeKpis(data: CanonicalDataset, range: DateRange, _facts?: SalesFacts): Kpi[] {
  const ads = data.adSpend.filter((a) => inRange(a.date, range));
  const hasAds = ads.length > 0;
  const impressions = ads.reduce((s, a) => s + a.impressions, 0);
  const spend = ads.reduce((s, a) => s + a.spend, 0);
  const cpm = ratio(spend, impressions);

  return [
    kpi('impressions', 'Impressions / Reichweite', 'see', hasAds ? impressions : null, 'number'),
    kpi('video_views', 'Video Views', 'see',
      metricPresent(data.dailyMetrics, 'video_views', range) ? metricSum(data.dailyMetrics, 'video_views', range) : null, 'number'),
    kpi('cpm', 'CPM', 'see', cpm === null ? null : cpm * 1000, 'currency'),
    kpi('traffic', 'Website-Traffic (gesamt)', 'see',
      metricPresent(data.dailyMetrics, 'sessions', range) ? metricSum(data.dailyMetrics, 'sessions', range) : null, 'number'),
    kpi('ad_recall', 'Ad Recall / Brand Awareness', 'see', null, 'percent'), // keine Quelle in V1
  ];
}

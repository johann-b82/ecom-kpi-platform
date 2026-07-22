import type { AdSpend, CanonicalDataset } from '@/lib/types';
import type { AmazonAdsReportRow } from './types';

export function normalizeReport(rows: AmazonAdsReportRow[]): CanonicalDataset {
  const byDate = new Map<string, AdSpend>();
  for (const row of rows) {
    const acc = byDate.get(row.date) ?? {
      date: row.date, platform: 'amazon_ads', spend: 0, impressions: 0, clicks: 0, conversions: 0, convValue: 0,
    };
    acc.spend += Number(row.cost ?? 0);
    acc.impressions += Number(row.impressions ?? 0);
    acc.clicks += Number(row.clicks ?? 0);
    acc.conversions += Number(row.purchases14d ?? 0);
    acc.convValue += Number(row.sales14d ?? 0);
    byDate.set(row.date, acc);
  }
  const adSpend = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { dailyMetrics: [], orders: [], customers: [], adSpend, subscribers: [] };
}

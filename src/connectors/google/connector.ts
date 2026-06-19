import type { AdSpend, CanonicalDataset, DailyMetric } from '@/lib/types';
import type { GoogleAdsRow } from './types';

function n(v: string | number | undefined): number {
  return v === undefined ? 0 : Number(v);
}

export function normalizeRows(rows: GoogleAdsRow[]): CanonicalDataset {
  const adSpend: AdSpend[] = [];
  const dailyMetrics: DailyMetric[] = [];

  for (const row of rows) {
    const date = row.segments.date;
    const m = row.metrics;
    adSpend.push({
      date,
      platform: 'google_ads',
      spend: n(m.costMicros) / 1_000_000,
      impressions: n(m.impressions),
      clicks: n(m.clicks),
      conversions: n(m.conversions),
      convValue: n(m.conversionsValue),
    });
    dailyMetrics.push({
      date,
      source: 'google_ads',
      channel: 'default',
      metricKey: 'video_views',
      value: n(m.videoViews),
    });
  }

  return { dailyMetrics, orders: [], customers: [], adSpend, subscribers: [] };
}

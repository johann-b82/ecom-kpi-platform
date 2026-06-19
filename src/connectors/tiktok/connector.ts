import type { AdSpend, CanonicalDataset, DailyMetric } from '@/lib/types';
import type { TikTokReportRow } from './types';

function num(metrics: Record<string, string>, key: string): number {
  return metrics[key] !== undefined ? Number(metrics[key]) : 0;
}

export function normalizeReport(
  rows: TikTokReportRow[],
  opts: { valueMetric?: string; videoMetric?: string } = {},
): CanonicalDataset {
  const valueMetric = opts.valueMetric ?? 'total_complete_payment';
  const videoMetric = opts.videoMetric ?? 'video_play_actions';
  const adSpend: AdSpend[] = [];
  const dailyMetrics: DailyMetric[] = [];

  for (const row of rows) {
    const date = row.dimensions.stat_time_day.slice(0, 10);
    adSpend.push({
      date,
      platform: 'tiktok_ads',
      spend: num(row.metrics, 'spend'),
      impressions: num(row.metrics, 'impressions'),
      clicks: num(row.metrics, 'clicks'),
      conversions: num(row.metrics, 'conversion'),
      convValue: num(row.metrics, valueMetric),
    });
    dailyMetrics.push({
      date,
      source: 'tiktok_ads',
      channel: 'default',
      metricKey: 'video_views',
      value: num(row.metrics, videoMetric),
    });
  }

  return { dailyMetrics, orders: [], customers: [], adSpend, subscribers: [] };
}

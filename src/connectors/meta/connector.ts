import type { AdSpend, CanonicalDataset, DailyMetric } from '@/lib/types';
import type { MetaAction, MetaInsightRow } from './types';

function actionValue(actions: MetaAction[] | undefined, type: string): number {
  const a = actions?.find((x) => x.action_type === type);
  return a ? Number(a.value) : 0;
}

export function normalizeInsights(
  rows: MetaInsightRow[],
  opts: { purchaseActionType?: string } = {},
): CanonicalDataset {
  const purchaseType = opts.purchaseActionType ?? 'purchase';
  const adSpend: AdSpend[] = [];
  const dailyMetrics: DailyMetric[] = [];

  for (const row of rows) {
    const date = row.date_start;
    adSpend.push({
      date,
      platform: 'meta_ads',
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      conversions: actionValue(row.actions, purchaseType),
      convValue: actionValue(row.action_values, purchaseType),
    });
    dailyMetrics.push({
      date,
      source: 'meta_ads',
      channel: 'default',
      metricKey: 'video_views',
      value: actionValue(row.actions, 'video_view'),
    });
  }

  return { dailyMetrics, orders: [], customers: [], adSpend, subscribers: [] };
}

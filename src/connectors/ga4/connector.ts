import type { CanonicalDataset, DailyMetric } from '@/lib/types';
import type { Ga4Report } from './types';

function ga4Date(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export function normalizeReport(report: Ga4Report): CanonicalDataset {
  const headers = (report.metricHeaders ?? []).map((h) => h.name);
  const dailyMetrics: DailyMetric[] = [];

  for (const row of report.rows ?? []) {
    const rawDate = row.dimensionValues?.[0]?.value;
    if (!rawDate) continue;
    const date = ga4Date(rawDate);
    const num = (name: string): number => {
      const i = headers.indexOf(name);
      return i < 0 ? 0 : Number(row.metricValues[i]?.value ?? 0);
    };
    const sessions = num('sessions');
    const totalUsers = num('totalUsers');
    const derived: Record<string, number> = {
      sessions,
      pageviews: num('screenPageViews'),
      total_users: totalUsers,
      returning_users: Math.max(0, totalUsers - num('newUsers')),
      bounced_sessions: Math.max(0, sessions - num('engagedSessions')),
      add_to_carts: num('addToCarts'),
      checkouts_started: num('checkouts'),
    };
    for (const [metricKey, value] of Object.entries(derived)) {
      dailyMetrics.push({ date, source: 'ga4', channel: 'default', metricKey, value });
    }
  }

  return { dailyMetrics, orders: [], customers: [], adSpend: [], subscribers: [] };
}

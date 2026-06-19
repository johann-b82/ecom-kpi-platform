import { describe, it, expect } from 'vitest';
import { thinkKpis } from '@/kpi/think';
import type { CanonicalDataset, DailyMetric } from '@/lib/types';

const range = { start: '2026-01-01', end: '2026-01-01' };
const m = (metricKey: string, value: number): DailyMetric =>
  ({ date: '2026-01-01', source: 'ga4', channel: 'default', metricKey, value });

describe('thinkKpis', () => {
  it('berechnet Quoten aus GA4-Metriken und Anmeldungen', () => {
    const data: CanonicalDataset = {
      dailyMetrics: [m('sessions', 1000), m('pageviews', 3000), m('bounced_sessions', 400),
        m('returning_users', 250), m('total_users', 1000), m('add_to_carts', 120)],
      orders: [], customers: [], adSpend: [],
      subscribers: [{ date: '2026-01-01', source: 'klaviyo', signups: 42, unsubscribes: 3, npsScore: null }],
    };
    const by = (k: string) => thinkKpis(data, range).find((x) => x.key === k)!;
    expect(by('sessions').value).toBe(1000);
    expect(by('pages_per_session').value).toBeCloseTo(3.0);
    expect(by('bounce_rate').value).toBeCloseTo(0.4);
    expect(by('returning_visitors').value).toBeCloseTo(0.25);
    expect(by('atc_rate').value).toBeCloseTo(0.12);
    expect(by('newsletter_signups').value).toBe(42);
  });
});

import { describe, it, expect } from 'vitest';
import { seeKpis } from '@/kpi/see';
import type { CanonicalDataset } from '@/lib/types';

const range = { start: '2026-01-01', end: '2026-01-02' };
const empty: CanonicalDataset = { dailyMetrics: [], orders: [], customers: [], adSpend: [], subscribers: [] };

describe('seeKpis', () => {
  it('berechnet CPM und Reichweite aus ad_spend', () => {
    const data: CanonicalDataset = {
      ...empty,
      adSpend: [
        { date: '2026-01-01', platform: 'meta_ads', spend: 100, impressions: 50_000, clicks: 0, conversions: 0, convValue: 0 },
        { date: '2026-01-02', platform: 'google_ads', spend: 100, impressions: 50_000, clicks: 0, conversions: 0, convValue: 0 },
      ],
      dailyMetrics: [
        { date: '2026-01-01', source: 'ga4', channel: 'default', metricKey: 'sessions', value: 800 },
        { date: '2026-01-01', source: 'meta_ads', channel: 'default', metricKey: 'video_views', value: 1200 },
      ],
    };
    const kpis = seeKpis(data, range);
    const by = (k: string) => kpis.find((x) => x.key === k)!;
    expect(by('impressions').value).toBe(100_000);
    expect(by('cpm').value).toBeCloseTo(2.0); // 200 / 100000 * 1000
    expect(by('traffic').value).toBe(800);
    expect(by('video_views').value).toBe(1200);
  });
  it('markiert KPIs ohne Quelle als nicht verfügbar', () => {
    const kpis = seeKpis(empty, range);
    expect(kpis.find((x) => x.key === 'ad_recall')!.available).toBe(false);
    expect(kpis.find((x) => x.key === 'impressions')!.available).toBe(false);
  });
});

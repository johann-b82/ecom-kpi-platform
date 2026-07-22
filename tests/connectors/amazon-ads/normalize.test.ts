import { describe, it, expect } from 'vitest';
import { normalizeReport } from '@/connectors/amazon-ads/connector';

describe('normalizeReport', () => {
  it('sums campaign rows per date into one amazon_ads ad_spend row', () => {
    const data = normalizeReport([
      { date: '2026-07-02', cost: 5, impressions: 50, clicks: 2, purchases14d: 1, sales14d: 20 },
      { date: '2026-07-01', cost: 10.5, impressions: 100, clicks: 4, purchases14d: 2, sales14d: 80 },
      { date: '2026-07-01', cost: 2.5, impressions: 30, clicks: 1, purchases14d: 0, sales14d: 0 },
    ]);
    expect(data.adSpend).toEqual([
      { date: '2026-07-01', platform: 'amazon_ads', spend: 13, impressions: 130, clicks: 5, conversions: 2, convValue: 80 },
      { date: '2026-07-02', platform: 'amazon_ads', spend: 5, impressions: 50, clicks: 2, conversions: 1, convValue: 20 },
    ]);
    expect(data.dailyMetrics).toEqual([]);
    expect(data.orders).toEqual([]);
  });
});

import { describe, it, expect, afterAll } from 'vitest';
import { writeTikTokAds } from '@/connectors/tiktok/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import type { CanonicalDataset } from '@/lib/types';

const sample: CanonicalDataset = {
  orders: [], customers: [], subscribers: [],
  adSpend: [
    { date: '2026-05-01', platform: 'tiktok_ads', spend: 40, impressions: 9000, clicks: 110, conversions: 2, convValue: 180 },
    { date: '2026-05-02', platform: 'tiktok_ads', spend: 55, impressions: 11000, clicks: 130, conversions: 3, convValue: 240 },
  ],
  dailyMetrics: [
    { date: '2026-05-01', source: 'tiktok_ads', channel: 'default', metricKey: 'video_views', value: 700 },
    { date: '2026-05-02', source: 'tiktok_ads', channel: 'default', metricKey: 'video_views', value: 750 },
  ],
};

describe('writeTikTokAds (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('ersetzt nur TikTok-Quellen, lässt andere Plattformen/Quellen unberührt', async () => {
    const before = await loadDataset();
    const otherAds = before.adSpend.filter((a) => a.platform !== 'tiktok_ads').length;
    const otherDm = before.dailyMetrics.filter((m) => m.source !== 'tiktok_ads').length;
    const ordersBefore = before.orders.length;

    await writeTikTokAds(sample);
    const after = await loadDataset();

    const ttAds = after.adSpend.filter((a) => a.platform === 'tiktok_ads');
    const ttVv = after.dailyMetrics.filter((m) => m.source === 'tiktok_ads');
    expect(ttAds.map((a) => a.date).sort()).toEqual(['2026-05-01', '2026-05-02']);
    expect(ttVv.map((m) => m.value).sort((x, y) => x - y)).toEqual([700, 750]);
    expect(after.adSpend.filter((a) => a.platform !== 'tiktok_ads').length).toBe(otherAds);
    expect(after.dailyMetrics.filter((m) => m.source !== 'tiktok_ads').length).toBe(otherDm);
    expect(after.orders.length).toBe(ordersBefore);
  });

  it('bricht bei 0 ad_spend-Zeilen ab, ohne zu löschen', async () => {
    await expect(writeTikTokAds({ ...sample, adSpend: [] }))
      .rejects.toThrow(/0 ad_spend rows/i);
    const after = await loadDataset();
    expect(after.adSpend.filter((a) => a.platform === 'tiktok_ads').length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, afterAll } from 'vitest';
import { writeGoogleAds } from '@/connectors/google/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import { pgSupabase } from '../../helpers/pg-supabase';
import type { CanonicalDataset } from '@/lib/types';

const sample: CanonicalDataset = {
  orders: [], customers: [], subscribers: [],
  adSpend: [
    { date: '2026-05-01', platform: 'google_ads', spend: 70, impressions: 13000, clicks: 150, conversions: 5, convValue: 500 },
    { date: '2026-05-02', platform: 'google_ads', spend: 85, impressions: 15000, clicks: 170, conversions: 6, convValue: 610 },
  ],
  dailyMetrics: [
    { date: '2026-05-01', source: 'google_ads', channel: 'default', metricKey: 'video_views', value: 600 },
    { date: '2026-05-02', source: 'google_ads', channel: 'default', metricKey: 'video_views', value: 650 },
  ],
};

describe('writeGoogleAds (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('ersetzt nur Google-Quellen, lässt andere Plattformen/Quellen unberührt', async () => {
    const before = await loadDataset(pgSupabase());
    const otherAds = before.adSpend.filter((a) => a.platform !== 'google_ads').length;
    const otherDm = before.dailyMetrics.filter((m) => m.source !== 'google_ads').length;
    const ordersBefore = before.orders.length;

    await writeGoogleAds(sample);
    const after = await loadDataset(pgSupabase());

    const gAds = after.adSpend.filter((a) => a.platform === 'google_ads');
    const gVv = after.dailyMetrics.filter((m) => m.source === 'google_ads');
    expect(gAds.map((a) => a.date).sort()).toEqual(['2026-05-01', '2026-05-02']);
    expect(gVv.map((m) => m.value).sort((x, y) => x - y)).toEqual([600, 650]);
    expect(after.adSpend.filter((a) => a.platform !== 'google_ads').length).toBe(otherAds);
    expect(after.dailyMetrics.filter((m) => m.source !== 'google_ads').length).toBe(otherDm);
    expect(after.orders.length).toBe(ordersBefore);
  });

  it('bricht bei 0 ad_spend-Zeilen ab, ohne zu löschen', async () => {
    await expect(writeGoogleAds({ ...sample, adSpend: [] }))
      .rejects.toThrow(/0 ad_spend rows/i);
    const after = await loadDataset(pgSupabase());
    expect(after.adSpend.filter((a) => a.platform === 'google_ads').length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, afterAll } from 'vitest';
import { writeMetaAds } from '@/connectors/meta/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import { pgSupabase } from '../../helpers/pg-supabase';
import type { CanonicalDataset } from '@/lib/types';

const sample: CanonicalDataset = {
  orders: [], customers: [], subscribers: [],
  adSpend: [
    { date: '2026-05-01', platform: 'meta_ads', spend: 50, impressions: 10000, clicks: 120, conversions: 3, convValue: 300 },
    { date: '2026-05-02', platform: 'meta_ads', spend: 60, impressions: 12000, clicks: 140, conversions: 4, convValue: 420 },
  ],
  dailyMetrics: [
    { date: '2026-05-01', source: 'meta_ads', channel: 'default', metricKey: 'video_views', value: 800 },
    { date: '2026-05-02', source: 'meta_ads', channel: 'default', metricKey: 'video_views', value: 900 },
  ],
};

describe('writeMetaAds (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('ersetzt nur Meta-Quellen, lässt andere Plattformen/Quellen unberührt', async () => {
    const before = await loadDataset(pgSupabase());
    const otherAds = before.adSpend.filter((a) => a.platform !== 'meta_ads').length;
    const otherDm = before.dailyMetrics.filter((m) => m.source !== 'meta_ads').length;
    const ordersBefore = before.orders.length;

    await writeMetaAds(sample);
    const after = await loadDataset(pgSupabase());

    const metaAds = after.adSpend.filter((a) => a.platform === 'meta_ads');
    const metaVv = after.dailyMetrics.filter((m) => m.source === 'meta_ads');
    expect(metaAds.map((a) => a.date).sort()).toEqual(['2026-05-01', '2026-05-02']);
    expect(metaVv.map((m) => m.value).sort((x, y) => x - y)).toEqual([800, 900]);
    expect(after.adSpend.filter((a) => a.platform !== 'meta_ads').length).toBe(otherAds);
    expect(after.dailyMetrics.filter((m) => m.source !== 'meta_ads').length).toBe(otherDm);
    expect(after.orders.length).toBe(ordersBefore);
  });

  it('bricht bei 0 ad_spend-Zeilen ab, ohne zu löschen', async () => {
    await expect(writeMetaAds({ ...sample, adSpend: [] }))
      .rejects.toThrow(/0 ad_spend rows/i);
    const after = await loadDataset(pgSupabase());
    expect(after.adSpend.filter((a) => a.platform === 'meta_ads').length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { writeAmazonAds } from '@/connectors/amazon-ads/write';
import type { CanonicalDataset } from '@/lib/types';

const row = { date: '2026-07-01', platform: 'amazon_ads', spend: 13, impressions: 130, clicks: 5, conversions: 2, convValue: 80 };
const dataset: CanonicalDataset = { dailyMetrics: [], orders: [], customers: [], adSpend: [row], subscribers: [] };

describe('writeAmazonAds (integration, benötigt laufende DB)', () => {
  beforeEach(async () => {
    await pool.query(`DELETE FROM ad_spend WHERE platform = 'amazon_ads'`);
    await pool.query(`DELETE FROM ad_spend WHERE platform = 'meta_ads' AND date = '2026-07-01' AND spend = 1`);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM ad_spend WHERE platform = 'amazon_ads'`);
    await pool.query(`DELETE FROM ad_spend WHERE platform = 'meta_ads' AND date = '2026-07-01' AND spend = 1`);
    await pool.end();
  });

  it('ersetzt nur amazon_ads-Zeilen, lässt andere Plattformen unberührt', async () => {
    await pool.query(
      `INSERT INTO ad_spend(date, platform, spend, impressions, clicks, conversions, conv_value)
       VALUES ('2026-07-01', 'meta_ads', 1, 1, 1, 1, 1), ('2026-06-30', 'amazon_ads', 99, 9, 9, 9, 9)`,
    );
    await writeAmazonAds(dataset);
    const amazon = await pool.query(`SELECT date::text, spend::float FROM ad_spend WHERE platform = 'amazon_ads'`);
    expect(amazon.rows).toEqual([{ date: '2026-07-01', spend: 13 }]);
    const meta = await pool.query(
      `SELECT count(*)::int AS n FROM ad_spend WHERE platform = 'meta_ads' AND date = '2026-07-01' AND spend = 1`,
    );
    expect(meta.rows[0].n).toBe(1);
  });

  it('bricht bei leerem Datensatz ab, ohne zu löschen', async () => {
    await pool.query(
      `INSERT INTO ad_spend(date, platform, spend, impressions, clicks, conversions, conv_value)
       VALUES ('2026-06-30', 'amazon_ads', 99, 9, 9, 9, 9)`,
    );
    await expect(writeAmazonAds({ ...dataset, adSpend: [] })).rejects.toThrow(/0 ad_spend/);
    const r = await pool.query(`SELECT count(*)::int AS n FROM ad_spend WHERE platform = 'amazon_ads'`);
    expect(r.rows[0].n).toBe(1);
  });
});

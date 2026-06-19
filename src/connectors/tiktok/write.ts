import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import type { AdSpend, CanonicalDataset, DailyMetric } from '@/lib/types';

const CHUNK = 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertAdSpend(client: PoolClient, rows: AdSpend[]): Promise<void> {
  for (const part of chunk(rows, CHUNK)) {
    const values: unknown[] = [];
    const tuples = part.map((a, i) => {
      const b = i * 7;
      values.push(a.date, a.platform, a.spend, a.impressions, a.clicks, a.conversions, a.convValue);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
    });
    await client.query(
      `INSERT INTO ad_spend(date, platform, spend, impressions, clicks, conversions, conv_value) VALUES ${tuples.join(',')}`,
      values,
    );
  }
}

async function insertDailyMetrics(client: PoolClient, rows: DailyMetric[]): Promise<void> {
  for (const part of chunk(rows, CHUNK)) {
    const values: unknown[] = [];
    const tuples = part.map((m, i) => {
      const b = i * 5;
      values.push(m.date, m.source, m.channel, m.metricKey, m.value);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
    });
    await client.query(
      `INSERT INTO daily_metrics(date, source, channel, metric_key, value) VALUES ${tuples.join(',')}`,
      values,
    );
  }
}

export async function writeTikTokAds(data: CanonicalDataset): Promise<void> {
  if (data.adSpend.length === 0) {
    throw new Error('TikTok sync: 0 ad_spend rows — aborting without deleting.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ad_spend WHERE platform = 'tiktok_ads'`);
    await client.query(`DELETE FROM daily_metrics WHERE source = 'tiktok_ads'`);
    await insertAdSpend(client, data.adSpend);
    if (data.dailyMetrics.length > 0) await insertDailyMetrics(client, data.dailyMetrics);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

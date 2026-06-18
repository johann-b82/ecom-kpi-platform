import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import type { CanonicalDataset, DailyMetric } from '@/lib/types';

const CHUNK = 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertMetrics(client: PoolClient, metrics: DailyMetric[]): Promise<void> {
  for (const part of chunk(metrics, CHUNK)) {
    const values: unknown[] = [];
    const rows = part.map((m, i) => {
      const b = i * 5;
      values.push(m.date, m.source, m.channel, m.metricKey, m.value);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
    });
    await client.query(
      `INSERT INTO daily_metrics(date, source, channel, metric_key, value) VALUES ${rows.join(',')}`,
      values,
    );
  }
}

export async function writeGa4Metrics(data: CanonicalDataset): Promise<void> {
  if (data.dailyMetrics.length === 0) {
    throw new Error('GA4 sync: 0 metric rows — aborting without deleting.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM daily_metrics WHERE source = 'ga4'`);
    await insertMetrics(client, data.dailyMetrics);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

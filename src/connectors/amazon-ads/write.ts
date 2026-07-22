import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import type { AdSpend, CanonicalDataset } from '@/lib/types';

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

export async function writeAmazonAds(data: CanonicalDataset): Promise<void> {
  if (data.adSpend.length === 0) {
    throw new Error('Amazon Ads sync: 0 ad_spend rows — aborting without deleting.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ad_spend WHERE platform = 'amazon_ads'`);
    await insertAdSpend(client, data.adSpend);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

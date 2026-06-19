import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import type { CanonicalDataset, Subscriber } from '@/lib/types';

const CHUNK = 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertSubscribers(client: PoolClient, subs: Subscriber[]): Promise<void> {
  for (const part of chunk(subs, CHUNK)) {
    const values: unknown[] = [];
    const rows = part.map((s, i) => {
      const b = i * 5;
      values.push(s.date, s.source, s.signups, s.unsubscribes, s.npsScore);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
    });
    await client.query(
      `INSERT INTO subscribers(date, source, signups, unsubscribes, nps_score) VALUES ${rows.join(',')}`,
      values,
    );
  }
}

export async function writeKlaviyoSubscribers(data: CanonicalDataset): Promise<void> {
  if (data.subscribers.length === 0) {
    throw new Error('Klaviyo sync: 0 subscriber rows — aborting without deleting.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM subscribers WHERE source = 'klaviyo'`);
    await insertSubscribers(client, data.subscribers);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

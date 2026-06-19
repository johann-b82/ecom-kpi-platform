import { describe, it, expect, afterAll } from 'vitest';
import { writeGa4Metrics } from '@/connectors/ga4/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import { pgSupabase } from '../../helpers/pg-supabase';
import type { CanonicalDataset } from '@/lib/types';

const sample: CanonicalDataset = {
  orders: [], customers: [], adSpend: [], subscribers: [],
  dailyMetrics: [
    { date: '2026-05-01', source: 'ga4', channel: 'default', metricKey: 'sessions', value: 111 },
    { date: '2026-05-01', source: 'ga4', channel: 'default', metricKey: 'pageviews', value: 333 },
  ],
};

describe('writeGa4Metrics (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('ersetzt nur ga4-Zeilen, lässt orders und andere Quellen unberührt', async () => {
    const before = await loadDataset(pgSupabase());
    const ordersBefore = before.orders.length;
    const nonGa4Before = before.dailyMetrics.filter((m) => m.source !== 'ga4').length;
    await writeGa4Metrics(sample);
    const after = await loadDataset(pgSupabase());
    const ga4 = after.dailyMetrics.filter((m) => m.source === 'ga4');
    expect(ga4.map((m) => m.metricKey).sort()).toEqual(['pageviews', 'sessions']);
    expect(after.dailyMetrics.filter((m) => m.source !== 'ga4').length).toBe(nonGa4Before);
    expect(after.orders.length).toBe(ordersBefore);
  });

  it('bricht bei 0 Zeilen ab, ohne ga4-Daten zu löschen', async () => {
    await expect(writeGa4Metrics({ ...sample, dailyMetrics: [] }))
      .rejects.toThrow(/0 metric rows/i);
    const after = await loadDataset(pgSupabase());
    expect(after.dailyMetrics.filter((m) => m.source === 'ga4').length).toBeGreaterThan(0);
  });
});

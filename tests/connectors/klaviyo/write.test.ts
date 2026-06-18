import { describe, it, expect, afterAll } from 'vitest';
import { writeKlaviyoSubscribers } from '@/connectors/klaviyo/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import type { CanonicalDataset } from '@/lib/types';

const sample: CanonicalDataset = {
  dailyMetrics: [], orders: [], customers: [], adSpend: [],
  subscribers: [
    { date: '2026-05-01', source: 'klaviyo', signups: 7, unsubscribes: 1, npsScore: null },
    { date: '2026-05-02', source: 'klaviyo', signups: 4, unsubscribes: 0, npsScore: null },
  ],
};

describe('writeKlaviyoSubscribers (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('ersetzt klaviyo-Subscribers, lässt orders und daily_metrics unberührt', async () => {
    const before = await loadDataset();
    const ordersBefore = before.orders.length;
    const dmBefore = before.dailyMetrics.length;
    await writeKlaviyoSubscribers(sample);
    const after = await loadDataset();
    const klaviyo = after.subscribers.filter((s) => s.source === 'klaviyo');
    expect(klaviyo.map((s) => s.date).sort()).toEqual(['2026-05-01', '2026-05-02']);
    expect(klaviyo.every((s) => s.npsScore === null)).toBe(true);
    expect(after.orders.length).toBe(ordersBefore);
    expect(after.dailyMetrics.length).toBe(dmBefore);
  });

  it('bricht bei 0 Zeilen ab, ohne klaviyo-Daten zu löschen', async () => {
    await expect(writeKlaviyoSubscribers({ ...sample, subscribers: [] }))
      .rejects.toThrow(/0 subscriber rows/i);
    const after = await loadDataset();
    expect(after.subscribers.filter((s) => s.source === 'klaviyo').length).toBeGreaterThan(0);
  });
});

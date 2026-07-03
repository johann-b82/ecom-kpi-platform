import { describe, it, expect, afterAll } from 'vitest';
import { writeMailchimpSubscribers } from '@/connectors/mailchimp/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import { pgSupabase } from '../../helpers/pg-supabase';
import type { CanonicalDataset } from '@/lib/types';

const sample: CanonicalDataset = {
  dailyMetrics: [], orders: [], customers: [], adSpend: [],
  subscribers: [
    { date: '2026-05-01', source: 'mailchimp', signups: 7, unsubscribes: 1, npsScore: null },
    { date: '2026-05-02', source: 'mailchimp', signups: 4, unsubscribes: 0, npsScore: null },
  ],
};

describe('writeMailchimpSubscribers (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('ersetzt mailchimp-Subscribers, lässt orders und daily_metrics unberührt', async () => {
    const before = await loadDataset(pgSupabase());
    const ordersBefore = before.orders.length;
    const dmBefore = before.dailyMetrics.length;
    await writeMailchimpSubscribers(sample);
    const after = await loadDataset(pgSupabase());
    const mailchimp = after.subscribers.filter((s) => s.source === 'mailchimp');
    expect(mailchimp.map((s) => s.date).sort()).toEqual(['2026-05-01', '2026-05-02']);
    expect(mailchimp.every((s) => s.npsScore === null)).toBe(true);
    expect(after.orders.length).toBe(ordersBefore);
    expect(after.dailyMetrics.length).toBe(dmBefore);
  });

  it('bricht bei 0 Zeilen ab, ohne mailchimp-Daten zu löschen', async () => {
    await expect(writeMailchimpSubscribers({ ...sample, subscribers: [] }))
      .rejects.toThrow(/0 subscriber rows/i);
    const after = await loadDataset(pgSupabase());
    expect(after.subscribers.filter((s) => s.source === 'mailchimp').length).toBeGreaterThan(0);
  });
});

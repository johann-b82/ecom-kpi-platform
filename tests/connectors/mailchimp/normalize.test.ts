import { describe, it, expect } from 'vitest';
import { normalizeActivity } from '@/connectors/mailchimp/connector';
import type { MailchimpActivityDay } from '@/connectors/mailchimp/types';

const activity: MailchimpActivityDay[] = [
  { day: '2026-01-02', subs: 20, unsubs: 2 },
  { day: '2026-01-01', subs: 10, unsubs: 0 },
  { day: '2026-01-03', subs: 0, unsubs: 3 },
];

function row(ds: ReturnType<typeof normalizeActivity>, date: string) {
  return ds.subscribers.find((s) => s.date === date)!;
}

describe('normalizeActivity', () => {
  it('sortiert nach Datum und mappt subs/unsubs', () => {
    const ds = normalizeActivity(activity);
    expect(ds.subscribers.map((s) => s.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(row(ds, '2026-01-01')).toMatchObject({ signups: 10, unsubscribes: 0 });
    expect(row(ds, '2026-01-02')).toMatchObject({ signups: 20, unsubscribes: 2 });
    expect(row(ds, '2026-01-03')).toMatchObject({ signups: 0, unsubscribes: 3 });
  });
  it('setzt source mailchimp, npsScore null, Werte numerisch', () => {
    const ds = normalizeActivity(activity);
    expect(ds.subscribers.every((s) => s.source === 'mailchimp' && s.npsScore === null)).toBe(true);
    expect(ds.subscribers.every((s) => typeof s.signups === 'number' && typeof s.unsubscribes === 'number')).toBe(true);
  });
  it('konvertiert String-Zähler zu Zahlen und überspringt Tage ohne day', () => {
    const ds = normalizeActivity([
      { day: '2026-02-01', subs: '7' as unknown as number, unsubs: '1' as unknown as number },
      { day: '', subs: 5, unsubs: 5 },
    ]);
    expect(ds.subscribers).toHaveLength(1);
    expect(row(ds, '2026-02-01')).toMatchObject({ signups: 7, unsubscribes: 1 });
  });
  it('befüllt nur subscribers', () => {
    const ds = normalizeActivity(activity);
    expect(ds.dailyMetrics).toHaveLength(0);
    expect(ds.orders).toHaveLength(0);
    expect(ds.customers).toHaveLength(0);
    expect(ds.adSpend).toHaveLength(0);
  });
  it('ist robust gegen leere activity', () => {
    expect(normalizeActivity([]).subscribers).toHaveLength(0);
  });
});

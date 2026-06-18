import { describe, it, expect } from 'vitest';
import { normalizeAggregates } from '@/connectors/klaviyo/connector';
import type { KlaviyoAggregateAttributes } from '@/connectors/klaviyo/types';

const signups: KlaviyoAggregateAttributes = {
  dates: ['2026-01-01T00:00:00+01:00', '2026-01-02T00:00:00+01:00'],
  data: [{ measurements: { count: [10, 20] } }],
};
const unsubs: KlaviyoAggregateAttributes = {
  dates: ['2026-01-02T00:00:00+01:00', '2026-01-03T00:00:00+01:00'],
  data: [{ measurements: { count: [2, 3] } }],
};

function row(ds: ReturnType<typeof normalizeAggregates>, date: string) {
  return ds.subscribers.find((s) => s.date === date)!;
}

describe('normalizeAggregates', () => {
  it('vereinigt beide Datumslisten, fehlender Tag → 0', () => {
    const ds = normalizeAggregates(signups, unsubs);
    expect(ds.subscribers.map((s) => s.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(row(ds, '2026-01-01')).toMatchObject({ signups: 10, unsubscribes: 0 });
    expect(row(ds, '2026-01-02')).toMatchObject({ signups: 20, unsubscribes: 2 });
    expect(row(ds, '2026-01-03')).toMatchObject({ signups: 0, unsubscribes: 3 });
  });
  it('setzt source klaviyo, npsScore null, Werte numerisch', () => {
    const ds = normalizeAggregates(signups, unsubs);
    expect(ds.subscribers.every((s) => s.source === 'klaviyo' && s.npsScore === null)).toBe(true);
    expect(ds.subscribers.every((s) => typeof s.signups === 'number' && typeof s.unsubscribes === 'number')).toBe(true);
  });
  it('befüllt nur subscribers', () => {
    const ds = normalizeAggregates(signups, unsubs);
    expect(ds.dailyMetrics).toHaveLength(0);
    expect(ds.orders).toHaveLength(0);
    expect(ds.customers).toHaveLength(0);
    expect(ds.adSpend).toHaveLength(0);
  });
  it('ist robust gegen leere measurements', () => {
    const empty: KlaviyoAggregateAttributes = { dates: [], data: [] };
    expect(normalizeAggregates(empty, empty).subscribers).toHaveLength(0);
  });
});

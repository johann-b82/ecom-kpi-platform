import { describe, it, expect } from 'vitest';
import { computeKpis, previousRange, withDelta } from '@/kpi/index';
import type { CanonicalDataset } from '@/lib/types';
import type { Kpi } from '@/kpi/types';

describe('aggregator', () => {
  it('previousRange liefert gleich lange Vorperiode', () => {
    expect(previousRange({ start: '2026-01-08', end: '2026-01-14' }))
      .toEqual({ start: '2026-01-01', end: '2026-01-07' });
  });

  it('withDelta berechnet prozentuale Veränderung', () => {
    const cur: Kpi[] = [{ key: 'revenue', label: 'U', phase: 'do', value: 120, unit: 'currency', available: true, deltaPct: null }];
    const prev: Kpi[] = [{ key: 'revenue', label: 'U', phase: 'do', value: 100, unit: 'currency', available: true, deltaPct: null }];
    expect(withDelta(cur, prev)[0].deltaPct).toBeCloseTo(20);
  });

  it('computeKpis liefert vier Phasen in Reihenfolge', () => {
    const empty: CanonicalDataset = { dailyMetrics: [], orders: [], customers: [], adSpend: [], subscribers: [] };
    const phases = computeKpis(empty, { start: '2026-01-08', end: '2026-01-14' });
    expect(phases.map((p) => p.phase)).toEqual(['see', 'think', 'do', 'care']);
    expect(phases[0].title).toBe('SEE');
  });
});

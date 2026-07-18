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

  it('reicht WooCommerce-Facts an DO/CARE durch und rechnet Delta gegen Vorperioden-Facts', () => {
    const empty: CanonicalDataset = { dailyMetrics: [], orders: [], customers: [], adSpend: [], subscribers: [] };
    const phases = computeKpis(empty, { start: '2026-01-08', end: '2026-01-14' }, {
      current: { revenue: 120, purchases: 12, aov: 10, clv: 300, repeatRate: 0.5 },
      previous: { revenue: 100, purchases: 10, aov: 8, clv: 200, repeatRate: 0.4 },
    });
    const revenue = phases.find((p) => p.phase === 'do')!.kpis.find((k) => k.key === 'revenue')!;
    expect(revenue.value).toBe(120);
    expect(revenue.deltaPct).toBeCloseTo(20); // (120-100)/100
    const clv = phases.find((p) => p.phase === 'care')!.kpis.find((k) => k.key === 'clv')!;
    expect(clv.value).toBe(300);
    expect(clv.deltaPct).toBeCloseTo(50); // (300-200)/200
  });
});

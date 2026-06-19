import { describe, it, expect } from 'vitest';
import { computeKpis } from '@/kpi/index';
import { KPI_HELP } from '@/kpi/help';
import type { CanonicalDataset } from '@/lib/types';

const EMPTY: CanonicalDataset = {
  dailyMetrics: [], orders: [], customers: [], adSpend: [], subscribers: [],
};

describe('KPI_HELP', () => {
  it('provides a non-empty formula + source for every KPI the engine emits', () => {
    const keys = computeKpis(EMPTY, { start: '2026-01-01', end: '2026-01-30' })
      .flatMap((p) => p.kpis.map((k) => k.key));
    for (const key of keys) {
      expect(KPI_HELP[key], `missing help for "${key}"`).toBeDefined();
      expect(KPI_HELP[key].formula.length).toBeGreaterThan(0);
      expect(KPI_HELP[key].source.length).toBeGreaterThan(0);
    }
  });
});

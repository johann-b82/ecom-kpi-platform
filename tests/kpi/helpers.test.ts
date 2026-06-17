import { describe, it, expect } from 'vitest';
import { inRange, metricSum, metricPresent, ratio, kpi } from '@/kpi/helpers';
import type { DailyMetric } from '@/lib/types';

const range = { start: '2026-01-01', end: '2026-01-07' };
const m = (date: string, metricKey: string, value: number): DailyMetric =>
  ({ date, source: 'ga4', channel: 'default', metricKey, value });

describe('kpi helpers', () => {
  it('inRange ist inklusiv an beiden Enden', () => {
    expect(inRange('2026-01-01', range)).toBe(true);
    expect(inRange('2026-01-07', range)).toBe(true);
    expect(inRange('2025-12-31', range)).toBe(false);
  });
  it('metricSum summiert nur passenden key im Zeitraum', () => {
    const data = [m('2026-01-02', 'sessions', 10), m('2026-01-03', 'sessions', 5), m('2026-01-09', 'sessions', 99)];
    expect(metricSum(data, 'sessions', range)).toBe(15);
  });
  it('metricPresent erkennt Vorhandensein im Zeitraum', () => {
    expect(metricPresent([m('2026-01-02', 'sessions', 0)], 'sessions', range)).toBe(true);
    expect(metricPresent([], 'sessions', range)).toBe(false);
  });
  it('ratio gibt null bei Nenner 0', () => {
    expect(ratio(4, 2)).toBe(2);
    expect(ratio(4, 0)).toBeNull();
  });
  it('kpi markiert null-Werte als nicht verfügbar', () => {
    expect(kpi('x', 'X', 'see', null, 'number').available).toBe(false);
    expect(kpi('x', 'X', 'see', 5, 'number').available).toBe(true);
  });
});

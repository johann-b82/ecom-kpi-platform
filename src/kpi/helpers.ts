import type { DailyMetric, DateRange } from '@/lib/types';
import type { Kpi, KpiUnit, Phase } from './types';

export function inRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

export function metricSum(metrics: DailyMetric[], key: string, range: DateRange): number {
  return metrics
    .filter((m) => m.metricKey === key && inRange(m.date, range))
    .reduce((acc, m) => acc + m.value, 0);
}

export function metricPresent(metrics: DailyMetric[], key: string, range: DateRange): boolean {
  return metrics.some((m) => m.metricKey === key && inRange(m.date, range));
}

export function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export function kpi(
  key: string, label: string, phase: Phase, value: number | null, unit: KpiUnit,
): Kpi {
  const available = value !== null && Number.isFinite(value);
  return { key, label, phase, value: available ? value : null, unit, available, deltaPct: null };
}

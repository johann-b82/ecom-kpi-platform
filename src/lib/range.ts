import type { DateRange } from './types';
import { addDays } from './dates';

// Zeitraum-Filter, geteilt von Dashboard, Kanal-Ansicht & Co. 'all' spannt ab
// Systemanfang, damit auch historische WooCommerce-Belege sichtbar werden.
export const RANGE_OPTIONS = [
  { key: '7', label: '7 Tage' },
  { key: '30', label: '30 Tage' },
  { key: '90', label: '90 Tage' },
  { key: '365', label: 'Jahr' },
  { key: 'all', label: 'Komplett' },
] as const;

export type RangeKey = (typeof RANGE_OPTIONS)[number]['key'];

const KEYS = RANGE_OPTIONS.map((o) => o.key) as readonly string[];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function resolveRange(
  param: string | undefined,
  end: string,
  custom?: { start?: string; end?: string },
): { key: RangeKey | 'custom'; range: DateRange } {
  const cs = custom?.start;
  const ce = custom?.end;
  if (cs && ce && ISO.test(cs) && ISO.test(ce) && cs <= ce) {
    return { key: 'custom', range: { start: cs, end: ce } };
  }
  const key = (param && KEYS.includes(param) ? param : '30') as RangeKey;
  const start = key === 'all' ? '2000-01-01' : addDays(end, -(Number(key) - 1));
  return { key, range: { start, end } };
}

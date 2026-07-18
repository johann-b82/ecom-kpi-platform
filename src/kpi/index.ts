import type { CanonicalDataset, DateRange, SalesFacts } from '@/lib/types';
import type { Kpi, PhaseKpis } from './types';
import { addDays, daysBetween } from '@/lib/dates';
import { seeKpis } from './see';
import { thinkKpis } from './think';
import { doKpis } from './do';
import { careKpis } from './care';

const PHASES = [
  { phase: 'see', title: 'SEE', subtitle: 'Awareness', fn: seeKpis },
  { phase: 'think', title: 'THINK', subtitle: 'Consideration', fn: thinkKpis },
  { phase: 'do', title: 'DO', subtitle: 'Conversion', fn: doKpis },
  { phase: 'care', title: 'CARE', subtitle: 'Loyalty', fn: careKpis },
] as const;

export function previousRange(range: DateRange): DateRange {
  const len = daysBetween(range.start, range.end) + 1;
  const prevEnd = addDays(range.start, -1);
  return { start: addDays(prevEnd, -(len - 1)), end: prevEnd };
}

export function withDelta(current: Kpi[], previous: Kpi[]): Kpi[] {
  const prevByKey = new Map(previous.map((k) => [k.key, k]));
  return current.map((c) => {
    const p = prevByKey.get(c.key);
    const deltaPct =
      c.available && p?.available && p.value
        ? ((c.value! - p.value) / p.value) * 100
        : null;
    return { ...c, deltaPct };
  });
}

export function computeKpis(
  data: CanonicalDataset, range: DateRange,
  facts?: { current?: SalesFacts; previous?: SalesFacts },
): PhaseKpis[] {
  const prev = previousRange(range);
  return PHASES.map((p) => ({
    phase: p.phase,
    title: p.title,
    subtitle: p.subtitle,
    kpis: withDelta(p.fn(data, range, facts?.current), p.fn(data, prev, facts?.previous)),
  }));
}

export type { Kpi, PhaseKpis } from './types';

export const PHASE_META = {
  see:   { title: 'SEE',   subtitle: 'Awareness',     leadMetric: 'sessions' },
  think: { title: 'THINK', subtitle: 'Consideration', leadMetric: 'sessions' },
  do:    { title: 'DO',    subtitle: 'Conversion',    leadMetric: 'checkouts_started' },
  care:  { title: 'CARE',  subtitle: 'Loyalty',       leadMetric: 'sessions' },
} as const;

export type PhaseKey = keyof typeof PHASE_META;

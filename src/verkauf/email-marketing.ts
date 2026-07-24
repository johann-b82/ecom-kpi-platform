import type { Subscriber, DateRange } from '@/lib/types';
import { inRange } from '@/kpi/helpers';
import { pickBucket, bucketSum } from '@/lib/series';

export interface EmailMarketingPoint {
  date: string;
  signups: number;
  unsubscribes: number;
  netto: number;
}

export interface EmailMarketingData {
  totals: { signups: number; unsubscribes: number; netto: number };
  series: EmailMarketingPoint[];
}

// Bündelt die vorhandenen subscribers-Zeilen (alle Quellen) je Zeit-Bucket und
// berechnet Netto = Anmeldungen − Abmeldungen. Bewusst DB-frei und rein.
export function aggregateSubscribers(rows: Subscriber[], range: DateRange): EmailMarketingData {
  const inr = rows.filter((r) => inRange(r.date, range));
  const signups = inr.reduce((s, r) => s + r.signups, 0);
  const unsubscribes = inr.reduce((s, r) => s + r.unsubscribes, 0);

  const bucket = pickBucket(range);
  const signupSeries = bucketSum(inr.map((r) => ({ date: r.date, value: r.signups })), bucket);
  const unsubSeries = bucketSum(inr.map((r) => ({ date: r.date, value: r.unsubscribes })), bucket);

  const byDate = new Map<string, EmailMarketingPoint>();
  for (const p of signupSeries) {
    byDate.set(p.date, { date: p.date, signups: p.value, unsubscribes: 0, netto: p.value });
  }
  for (const p of unsubSeries) {
    const cur = byDate.get(p.date) ?? { date: p.date, signups: 0, unsubscribes: 0, netto: 0 };
    cur.unsubscribes = p.value;
    cur.netto = cur.signups - p.value;
    byDate.set(p.date, cur);
  }
  const series = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  return { totals: { signups, unsubscribes, netto: signups - unsubscribes }, series };
}

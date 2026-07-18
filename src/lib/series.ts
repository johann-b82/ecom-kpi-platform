import type { SeriesPoint } from '@/verfuegbarkeit/types';
import { daysBetween } from '@/lib/dates';

export type Bucket = 'day' | 'week' | 'month';

// Bündelung nach Zeitraumlänge: kurze Zeiträume täglich, mittlere wöchentlich,
// lange monatlich — hält die x-Achse lesbar.
export function pickBucket(range: { start: string; end: string }): Bucket {
  const span = daysBetween(range.start, range.end);
  if (span <= 92) return 'day';
  if (span <= 400) return 'week';
  return 'month';
}

function bucketKey(date: string, bucket: Bucket): string {
  if (bucket === 'day') return date;
  if (bucket === 'month') return date.slice(0, 8) + '01';
  const d = new Date(date + 'T00:00:00Z');       // Woche → Montag der ISO-Woche
  const dow = (d.getUTCDay() + 6) % 7;            // Mo=0 … So=6
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function bucketSum(points: SeriesPoint[], bucket: Bucket): SeriesPoint[] {
  const acc = new Map<string, number>();
  for (const p of points) {
    const k = bucketKey(p.date, bucket);
    acc.set(k, (acc.get(k) ?? 0) + p.value);
  }
  return [...acc.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

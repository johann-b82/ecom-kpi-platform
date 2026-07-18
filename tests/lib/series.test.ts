import { describe, it, expect } from 'vitest';
import { pickBucket, bucketSum, bucketLast } from '@/lib/series';

describe('pickBucket', () => {
  it('wählt day/week/month nach Spannweite', () => {
    expect(pickBucket({ start: '2026-06-01', end: '2026-07-01' })).toBe('day');
    expect(pickBucket({ start: '2026-01-01', end: '2026-06-01' })).toBe('week');
    expect(pickBucket({ start: '2024-01-01', end: '2026-01-01' })).toBe('month');
  });
});

describe('bucketSum', () => {
  const pts = [
    { date: '2026-06-01', value: 2 }, // Montag
    { date: '2026-06-03', value: 3 }, // Mittwoch (gleiche Woche)
    { date: '2026-06-08', value: 5 }, // Montag darauf
  ];

  it('day: unverändert, chronologisch', () => {
    expect(bucketSum(pts, 'day')).toEqual(pts);
  });

  it('week: summiert je Montag der ISO-Woche', () => {
    expect(bucketSum(pts, 'week')).toEqual([
      { date: '2026-06-01', value: 5 },
      { date: '2026-06-08', value: 5 },
    ]);
  });

  it('month: summiert je Monatserster', () => {
    expect(bucketSum([{ date: '2026-06-30', value: 1 }, { date: '2026-07-02', value: 4 }], 'month')).toEqual([
      { date: '2026-06-01', value: 1 },
      { date: '2026-07-01', value: 4 },
    ]);
  });
});

describe('bucketLast', () => {
  const pts = [
    { date: '2026-06-01', value: 100 }, // Montag
    { date: '2026-06-03', value: 120 }, // Mittwoch (gleiche Woche) → jüngster der Woche
    { date: '2026-06-08', value: 90 },  // Montag darauf
  ];
  it('day: unverändert', () => {
    expect(bucketLast(pts, 'day')).toEqual(pts);
  });
  it('week: letzter Wert je ISO-Woche (Montag als Schlüssel)', () => {
    expect(bucketLast(pts, 'week')).toEqual([
      { date: '2026-06-01', value: 120 },
      { date: '2026-06-08', value: 90 },
    ]);
  });
  it('month: letzter Wert je Monat (Monatserster als Schlüssel)', () => {
    expect(bucketLast([{ date: '2026-06-10', value: 5 }, { date: '2026-06-30', value: 8 }], 'month')).toEqual([
      { date: '2026-06-01', value: 8 },
    ]);
  });
  it('leere Eingabe → leer', () => {
    expect(bucketLast([], 'week')).toEqual([]);
  });
});

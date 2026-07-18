import { describe, it, expect } from 'vitest';
import { pickBucket, bucketSum } from '@/lib/series';

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

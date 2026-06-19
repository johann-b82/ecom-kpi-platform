import { describe, it, expect } from 'vitest';
import { addDays, daysBetween } from '@/lib/dates';

describe('dates', () => {
  it('addDays addiert und subtrahiert über Monatsgrenzen', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('daysBetween zählt inklusive Differenz in Tagen', () => {
    expect(daysBetween('2026-01-01', '2026-01-08')).toBe(7);
  });
});

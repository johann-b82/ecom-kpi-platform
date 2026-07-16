import { describe, it, expect } from 'vitest';
import { compareValues } from '@/lib/client-sort';

describe('compareValues', () => {
  it('vergleicht Zahlen numerisch', () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues(10, 2)).toBeGreaterThan(0);
    expect(compareValues(5, 5)).toBe(0);
  });
  it('vergleicht Strings alphabetisch (de, case-insensitiv über localeCompare)', () => {
    expect(compareValues('Apfel', 'Birne')).toBeLessThan(0);
    expect(compareValues('birne', 'Apfel')).toBeGreaterThan(0);
  });
  it('sortiert null/undefined immer ans Ende', () => {
    expect(compareValues(null, 5)).toBeGreaterThan(0);
    expect(compareValues(5, null)).toBeLessThan(0);
    expect(compareValues(null, null)).toBe(0);
    expect(compareValues(undefined, 'x')).toBeGreaterThan(0);
  });
});

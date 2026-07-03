import { describe, it, expect } from 'vitest';
import { num, eur, pct, BRAND, CATEGORICAL } from '@/components/charts/chart-style';

describe('chart-style formatters', () => {
  it('formats numbers, euros, percents in de-DE', () => {
    expect(num(1234)).toBe('1.234');
    expect(eur(1234)).toBe('1.234 €');
    expect(pct(12.5)).toBe('12,5 %');
  });
  it('exposes the brand color and a categorical palette', () => {
    expect(BRAND).toBe('var(--brand)');
    expect(CATEGORICAL[0]).toBe('var(--brand)');
    expect(CATEGORICAL.length).toBeGreaterThanOrEqual(5);
  });
});

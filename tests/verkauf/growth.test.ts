import { describe, it, expect } from 'vitest';
import { revenueGrowth, formatGrowth, monthToDateRanges } from '@/verkauf/growth';

describe('revenueGrowth', () => {
  it('positives Wachstum', () => { expect(revenueGrowth(110, 100)).toBeCloseTo(10, 6); });
  it('negatives Wachstum', () => { expect(revenueGrowth(90, 100)).toBeCloseTo(-10, 6); });
  it('Gleichstand ist 0', () => { expect(revenueGrowth(100, 100)).toBe(0); });
  it('Vorperiode 0 ⇒ null (unbestimmt)', () => { expect(revenueGrowth(50, 0)).toBeNull(); });
});

describe('formatGrowth', () => {
  it('null ⇒ Gedankenstrich', () => { expect(formatGrowth(null)).toBe('–'); });
  it('positiv mit Pluszeichen', () => { expect(formatGrowth(13.6)).toBe('+13,6 %'); });
  it('negativ mit echtem Minus', () => { expect(formatGrowth(-4.2)).toBe('−4,2 %'); });
});

describe('monthToDateRanges', () => {
  it('Monatsmitte: gleiche Tagesspanne im Vormonat', () => {
    expect(monthToDateRanges('2026-07-19')).toEqual({
      current: { start: '2026-07-01', end: '2026-07-19' },
      previous: { start: '2026-06-01', end: '2026-06-19' },
    });
  });
  it('klemmt den Tag auf das Vormonatsende (31. März ⇒ 28. Feb)', () => {
    expect(monthToDateRanges('2026-03-31')).toEqual({
      current: { start: '2026-03-01', end: '2026-03-31' },
      previous: { start: '2026-02-01', end: '2026-02-28' },
    });
  });
  it('Jahreswechsel: Januar ⇒ Dezember Vorjahr', () => {
    expect(monthToDateRanges('2026-01-15')).toEqual({
      current: { start: '2026-01-01', end: '2026-01-15' },
      previous: { start: '2025-12-01', end: '2025-12-15' },
    });
  });
});

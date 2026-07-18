import { describe, it, expect } from 'vitest';
import { eur } from '@/verkauf/format';

describe('eur', () => {
  it('formatiert netto in de-DE mit Euro', () => {
    expect(eur(1234.5)).toBe('1.234,50 €');
    expect(eur(0)).toBe('0,00 €');
    expect(eur(-16.9)).toBe('-16,90 €');
  });
});

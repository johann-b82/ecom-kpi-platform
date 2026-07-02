import { describe, it, expect } from 'vitest';
import { eur, pct, deviation, STATUS_TONE } from '@/brickpm/format';

describe('eur', () => {
  it('formats with German comma and euro sign', () => {
    expect(eur(112.48)).toBe('112,48 €');
  });
});

describe('pct', () => {
  it('formats a ratio as a German-comma percentage', () => {
    expect(pct(0.333)).toBe('33,3 %');
  });
});

describe('deviation', () => {
  it('computes (own - comp) / comp', () => {
    expect(deviation(249.95, 234.95)).toBeCloseTo(0.0638, 4);
  });

  it('returns 0 when comp is 0', () => {
    expect(deviation(10, 0)).toBe(0);
  });
});

describe('STATUS_TONE', () => {
  it('maps known statuses to tones', () => {
    expect(STATUS_TONE.kritisch).toBe('red');
    expect(STATUS_TONE.erledigt).toBe('green');
    expect(STATUS_TONE.mittel).toBe('neutral');
  });
});

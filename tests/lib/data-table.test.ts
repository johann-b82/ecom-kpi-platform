import { describe, it, expect } from 'vitest';
import { matchesText, inNumberRange } from '@/lib/data-table';

describe('matchesText', () => {
  it('matcht case-insensitiv als Teilstring', () => {
    expect(matchesText('Müller GmbH', 'müller')).toBe(true);
    expect(matchesText('Müller GmbH', 'GMBH')).toBe(true);
    expect(matchesText('Müller GmbH', 'xyz')).toBe(false);
  });
  it('leerer Query matcht alles', () => {
    expect(matchesText('irgendwas', '   ')).toBe(true);
  });
});

describe('inNumberRange', () => {
  it('respektiert inklusive Grenzen', () => {
    expect(inNumberRange(5, 1, 10)).toBe(true);
    expect(inNumberRange(1, 1, 10)).toBe(true);
    expect(inNumberRange(10, 1, 10)).toBe(true);
    expect(inNumberRange(0, 1, 10)).toBe(false);
    expect(inNumberRange(11, 1, 10)).toBe(false);
  });
  it('offene Grenzen', () => {
    expect(inNumberRange(100, 5, undefined)).toBe(true);
    expect(inNumberRange(2, undefined, 5)).toBe(true);
    expect(inNumberRange(2, undefined, undefined)).toBe(true);
  });
});

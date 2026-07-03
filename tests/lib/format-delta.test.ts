import { describe, it, expect } from 'vitest';
import { formatDelta } from '@/lib/format';

describe('formatDelta', () => {
  it('gibt den Betrag ohne Pfeil/Vorzeichen zurück', () => {
    expect(formatDelta(2)).toBe('2,0 %');
    expect(formatDelta(-5)).toBe('5,0 %');
  });
  it('gibt null zurück, wenn deltaPct null ist', () => {
    expect(formatDelta(null)).toBeNull();
  });
});

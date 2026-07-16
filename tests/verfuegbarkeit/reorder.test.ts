import { describe, it, expect } from 'vitest';
import { reorderBufferUnits } from '@/verfuegbarkeit/reorder';

describe('reorderBufferUnits', () => {
  it('rechnet den Absatz des Fensters auf 4 Wochen hoch (aufgerundet)', () => {
    // 84 Stück in 84 Tagen → 4 Wochen (28 T.) Puffer = 28
    expect(reorderBufferUnits(84, 84)).toBe(28);
    // 9 Stück in 84 Tagen → 9*28/84 = 3
    expect(reorderBufferUnits(9, 84)).toBe(3);
    // rundet auf: 10*28/84 = 3.33 → 4
    expect(reorderBufferUnits(10, 84)).toBe(4);
  });
  it('erlaubt eine andere Wochenzahl', () => {
    expect(reorderBufferUnits(84, 84, 2)).toBe(14);
  });
  it('liefert 0 ohne Absatz oder ohne Fenster', () => {
    expect(reorderBufferUnits(0, 84)).toBe(0);
    expect(reorderBufferUnits(100, 0)).toBe(0);
    expect(reorderBufferUnits(-5, 84)).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { resolveRange } from '@/lib/range';

describe('resolveRange', () => {
  const END = '2026-07-18';

  it('nutzt den benutzerdefinierten Bereich, wenn start und end gültig sind', () => {
    const r = resolveRange('30', END, { start: '2026-01-01', end: '2026-03-31' });
    expect(r.key).toBe('custom');
    expect(r.range).toEqual({ start: '2026-01-01', end: '2026-03-31' });
  });

  it('fällt auf days zurück, wenn nur ein Custom-Ende gesetzt ist', () => {
    const r = resolveRange('7', END, { end: '2026-03-31' });
    expect(r.key).toBe('7');
    expect(r.range).toEqual({ start: '2026-07-12', end: END });
  });

  it('ignoriert ungültige (invertierte) Custom-Bereiche', () => {
    const r = resolveRange('30', END, { start: '2026-03-31', end: '2026-01-01' });
    expect(r.key).toBe('30');
  });

  it('ignoriert nicht-ISO Custom-Werte', () => {
    const r = resolveRange('30', END, { start: '01.01.2026', end: '2026-03-31' });
    expect(r.key).toBe('30');
  });

  it('verhält sich ohne custom wie zuvor (Default 30)', () => {
    expect(resolveRange(undefined, END).range).toEqual({ start: '2026-06-19', end: END });
    expect(resolveRange('all', END).range.start).toBe('2000-01-01');
  });
});

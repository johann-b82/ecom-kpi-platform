import { describe, it, expect } from 'vitest';
import { beadsFromStages } from '@/verkauf/faden';

describe('beadsFromStages', () => {
  it('füllt nur vorhandene Stufen, Rest offen, keine Retoure', () => {
    const b = beadsFromStages(['bestellt']);
    expect(b.map((x) => x.stage)).toEqual(['bestellt', 'kommissioniert', 'rechnung_gestellt', 'bezahlt']);
    expect(b.map((x) => x.filled)).toEqual([true, false, false, false]);
  });
  it('hängt eine gefüllte retoure-Perle an, wenn ein Retoure-Event existiert', () => {
    const b = beadsFromStages(['bestellt', 'kommissioniert', 'rechnung_gestellt', 'bezahlt', 'retoure']);
    expect(b).toHaveLength(5);
    expect(b[4]).toEqual({ stage: 'retoure', filled: true });
    expect(b.every((x) => x.filled)).toBe(true);
  });
});

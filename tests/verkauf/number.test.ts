import { describe, it, expect } from 'vitest';
import { nextOrderNumber } from '@/verkauf/number';

describe('nextOrderNumber', () => {
  it('startet bei A-<jahr>-0001', () => {
    expect(nextOrderNumber([], 2026)).toBe('A-2026-0001');
  });
  it('inkrementiert über bestehende Nummern desselben Jahres', () => {
    expect(nextOrderNumber(['A-2026-0001', 'A-2026-0007'], 2026)).toBe('A-2026-0008');
  });
  it('ignoriert Fremdformate und andere Jahre', () => {
    expect(nextOrderNumber(['B-2026-0009', 'A-2025-0005', 'kaputt'], 2026)).toBe('A-2026-0001');
  });
});

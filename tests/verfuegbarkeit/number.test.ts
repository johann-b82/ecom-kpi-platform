import { describe, it, expect } from 'vitest';
import { nextPurchaseOrderNumber } from '@/verfuegbarkeit/number';

describe('nextPurchaseOrderNumber', () => {
  it('startet bei B-<jahr>-0001', () => {
    expect(nextPurchaseOrderNumber([], 2026)).toBe('B-2026-0001');
  });
  it('zählt den höchsten Treffer des Jahres hoch, ignoriert Fremdformate/andere Jahre', () => {
    expect(nextPurchaseOrderNumber(['B-2026-0001', 'B-2026-0007', 'A-2026-0003', 'B-2025-0099'], 2026)).toBe('B-2026-0008');
  });
});

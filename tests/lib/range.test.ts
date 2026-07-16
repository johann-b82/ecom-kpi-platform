import { describe, it, expect } from 'vitest';
import { resolveRange, RANGE_OPTIONS } from '@/lib/range';

const end = '2026-07-16';

describe('resolveRange', () => {
  it('bietet 7/30/90/Jahr/Komplett an', () => {
    expect(RANGE_OPTIONS.map((o) => o.key)).toEqual(['7', '30', '90', '365', 'all']);
  });
  it('rechnet Tages-Fenster inklusive Endtag', () => {
    expect(resolveRange('7', end).range).toEqual({ start: '2026-07-10', end });
    expect(resolveRange('90', end).range.start).toBe('2026-04-18');
  });
  it('Jahr = 365 Tage', () => {
    expect(resolveRange('365', end).range.start).toBe('2025-07-17');
  });
  it('Komplett spannt ab Systemanfang', () => {
    const r = resolveRange('all', end);
    expect(r.key).toBe('all');
    expect(r.range).toEqual({ start: '2000-01-01', end });
  });
  it('faellt bei unbekanntem/leerem Wert auf 30 Tage zurueck', () => {
    expect(resolveRange(undefined, end).key).toBe('30');
    expect(resolveRange('999', end).key).toBe('30');
  });
});

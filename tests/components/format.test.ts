import { describe, it, expect } from 'vitest';
import { formatValue } from '@/lib/format';
import type { Kpi } from '@/kpi/types';

const base: Kpi = { key: 'x', label: 'X', phase: 'do', value: 0, unit: 'number', available: true, deltaPct: null };

describe('formatValue', () => {
  it('formatiert Währung, Prozent, Ratio und N/A', () => {
    expect(formatValue({ ...base, unit: 'currency', value: 1234.5 })).toContain('€');
    expect(formatValue({ ...base, unit: 'percent', value: 0.1234 })).toBe('12,3 %');
    expect(formatValue({ ...base, unit: 'ratio', value: 4.2 })).toBe('4,2×');
    expect(formatValue({ ...base, available: false, value: null })).toBe('N/A');
  });
});

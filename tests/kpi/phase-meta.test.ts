import { describe, it, expect } from 'vitest';
import { PHASE_META } from '@/kpi/index';

describe('PHASE_META', () => {
  it('enthält Titel und Leitmetrik je Phase', () => {
    expect(PHASE_META.do.title).toBe('DO');
    expect(PHASE_META.see.leadMetric).toBe('sessions');
  });
});

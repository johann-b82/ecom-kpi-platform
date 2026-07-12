import { describe, it, expect } from 'vitest';
import { margin } from '@/katalog/margin';

describe('margin', () => {
  it('computes absolute and percent margin on VK', () => {
    expect(margin(10, 25)).toEqual({ absolute: 15, pct: 60 });
  });
  it('guards VK=0', () => {
    expect(margin(10, 0)).toEqual({ absolute: -10, pct: 0 });
  });
});
